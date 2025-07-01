import { applyPatches } from "@lmstudio/immer-with-plugins";
import {
  Event,
  isAvailable,
  SimpleLogger,
  text,
  Validator,
  type LoggerInterface,
  type SignalLike,
  type WriteTag,
} from "@lmstudio/lms-common";
import {
  Channel,
  deserialize,
  serialize,
  type BackendInterface,
  type ChannelEndpoint,
  type ChannelEndpointsSpecBase,
  type ClientToServerMessage,
  type RpcEndpointsSpecBase,
  type ServerTransport,
  type ServerTransportFactory,
  type SignalEndpoint,
  type SignalEndpointsSpecBase,
  type WritableSignalEndpoint,
  type WritableSignalEndpointsSpecBase,
} from "@lmstudio/lms-communication";
import { serializeError } from "@lmstudio/lms-shared-types";
import { type Context, type ContextCreator } from "./Authenticator.js";

interface OpenChannel {
  endpoint: ChannelEndpoint;
  channel: Channel<any, any>;
  receivedAck: (ackId: number) => void;
  receivedMessage: (message: any) => void;
  errored: (error: any) => void;
  closed: () => void;
}

interface OpenSignalSubscription {
  endpoint: SignalEndpoint;
  unsubscribe: () => void;
}

interface OpenWritableSignalSubscription {
  endpoint: WritableSignalEndpoint;
  unsubscribe: () => void;
  receivedPatches: (patches: Array<any>, tags: Array<WriteTag>) => void;
}

export class ServerPort<
  TContext,
  TRpcEndpoints extends RpcEndpointsSpecBase,
  TChannelEndpoints extends ChannelEndpointsSpecBase,
  TSignalEndpoints extends SignalEndpointsSpecBase,
  TWritableSignalEndpoints extends WritableSignalEndpointsSpecBase,
> {
  private readonly transport: ServerTransport;
  private readonly logger;
  private readonly openChannels = new Map<number, OpenChannel>();
  private readonly openSignalSubscriptions = new Map<number, OpenSignalSubscription>();
  /**
   * Signal subscriptions that needs to be closed because unsubscribe comes before it is created.
   */
  private readonly signalSubscriptionsToClose = new Set<number>();
  private readonly openWritableSignalSubscriptions = new Map<
    number,
    OpenWritableSignalSubscription
  >();
  /**
   * Writable signal subscriptions that needs to be closed because unsubscribe comes before it is
   * created.
   */
  private readonly writableSignalSubscriptionsToClose = new Set<number>();
  public readonly closeEvent: Event<void>;
  private readonly emitCloseEvent: () => void;
  private producedCommunicationWarningsCount = 0;

  public constructor(
    private readonly backendInterface: BackendInterface<
      TContext,
      TRpcEndpoints,
      TChannelEndpoints,
      TSignalEndpoints,
      TWritableSignalEndpoints
    >,
    private readonly contextCreator: ContextCreator<Context>,
    factory: ServerTransportFactory,
    {
      parentLogger,
    }: {
      parentLogger?: LoggerInterface;
    } = {},
  ) {
    this.logger = new SimpleLogger("ServerPort", parentLogger);
    [this.closeEvent, this.emitCloseEvent] = Event.create();
    this.transport = factory(this.receivedMessage, this.errored, this.logger);
  }

  private communicationWarning(warning: string) {
    if (this.producedCommunicationWarningsCount >= 5) {
      return;
    }
    this.logger.warnText`
      Produced communication warning: ${warning}
      
      This is usually caused by communication protocol incompatibility. Please make sure you are
      using the up-to-date versions of the SDK and LM Studio.
    `;
    this.transport.send({
      type: "communicationWarning",
      warning,
    });
    this.producedCommunicationWarningsCount++;
    if (this.producedCommunicationWarningsCount >= 5) {
      this.logger.errorText`
        5 communication warnings have been produced. Further warnings will not be printed.
      `;
    }
  }

  private receivedChannelCreate(message: ClientToServerMessage & { type: "channelCreate" }) {
    const endpoint = this.backendInterface.getChannelEndpoint(message.endpoint);
    if (endpoint === undefined) {
      this.communicationWarning(
        `Received channelCreate for unknown endpoint, endpoint = ${message.endpoint}`,
      );
      return;
    }
    if (endpoint.handler === null) {
      this.communicationWarning(
        `Received channelCreate for unhandled endpoint, endpoint = ${message.endpoint}`,
      );
      return;
    }
    if (this.openChannels.has(message.channelId)) {
      this.communicationWarning(
        `Received channelCreate for already open channel, channelId = ${message.channelId}`,
      );
      return;
    }
    const deserializedCreationParameter = deserialize(
      endpoint.serialization,
      message.creationParameter,
    );
    const parseResult = endpoint.creationParameter.safeParse(deserializedCreationParameter);
    if (!parseResult.success) {
      this.communicationWarning(text`
        Received invalid creationParameter for channel, endpointName = ${endpoint.name},
        creationParameter = ${deserializedCreationParameter}. Zod error:

        ${Validator.prettyPrintZod("creationParameter", parseResult.error)}
      `);

      return;
    }
    const channelId = message.channelId;
    const openChannel: OpenChannel = {
      endpoint,
      ...Channel.create((message, ackId) => {
        const result = endpoint.toClientPacket.safeParse(message);
        if (!result.success) {
          this.communicationWarning(text`
            Tried to send invalid message for channel, endpointName = ${endpoint.name},
            message = ${message as object}. Zod error:

            ${Validator.prettyPrintZod("message", result.error)}
          `);
          return;
        }
        const serializedMessage = serialize(endpoint.serialization, result.data);
        this.transport.send({
          type: "channelSend",
          channelId,
          message: serializedMessage,
          ackId: ackId,
        });
      }),
    };
    this.openChannels.set(channelId, openChannel);
    const context = this.contextCreator({
      type: "channel",
      endpointName: endpoint.name,
    });

    Promise.resolve(endpoint.handler(context, parseResult.data, openChannel.channel))
      .then(
        () => {
          this.transport.send({
            type: "channelClose",
            channelId: channelId,
          });
          openChannel.closed();
        },
        error => {
          this.transport.send({
            type: "channelError",
            channelId: channelId,
            error: serializeError(error),
          });
          openChannel.errored(error);
          context.logger.error("Error in channel handler:", error);
        },
      )
      .finally(() => {
        this.openChannels.delete(channelId);
      });
  }

  private receivedChannelSend(message: ClientToServerMessage & { type: "channelSend" }) {
    const openChannel = this.openChannels.get(message.channelId);
    if (openChannel === undefined) {
      this.communicationWarning(
        `Received channelSend for unknown channel, channelId = ${message.channelId}`,
      );
      return;
    }
    const deserializedMessage = deserialize(openChannel.endpoint.serialization, message.message);
    const parsed = openChannel.endpoint.toServerPacket.safeParse(deserializedMessage);
    if (!parsed.success) {
      this.communicationWarning(text`
        Received invalid message for channel, endpointName = ${openChannel.endpoint.name},
        message = ${message.message}. Zod error:

        ${Validator.prettyPrintZod("message", parsed.error)}
      `);
      return;
    }
    openChannel.receivedMessage(parsed.data);
  }

  private receivedChannelAck(message: ClientToServerMessage & { type: "channelAck" }) {
    const openChannel = this.openChannels.get(message.channelId);
    if (openChannel === undefined) {
      this.communicationWarning(
        `Received channelAck for unknown channel, channelId = ${message.channelId}`,
      );
      return;
    }
    openChannel.receivedAck(message.ackId);
  }

  private receivedRpcCall(message: ClientToServerMessage & { type: "rpcCall" }) {
    const endpoint = this.backendInterface.getRpcEndpoint(message.endpoint);
    if (endpoint === undefined) {
      this.communicationWarning(
        `Received rpcCall for unknown endpoint, endpoint = ${message.endpoint}`,
      );
      return;
    }
    if (endpoint.handler === null) {
      this.communicationWarning(
        `Received rpcCall for unhandled endpoint, endpoint = ${message.endpoint}`,
      );
      return;
    }
    const deserializedParameter = deserialize(endpoint.serialization, message.parameter);
    const parseResult = endpoint.parameter.safeParse(deserializedParameter);
    if (!parseResult.success) {
      this.communicationWarning(text`
        Received invalid parameter for rpcCall, endpointName = ${endpoint.name},
        parameter = ${message.parameter}. Zod error:

        ${Validator.prettyPrintZod("parameter", parseResult.error)}
      `);
      return;
    }
    const context = this.contextCreator({
      type: "rpc",
      endpointName: endpoint.name,
    });
    const result = endpoint.handler(context, parseResult.data);
    Promise.resolve(result)
      .then(value => {
        this.transport.send({
          type: "rpcResult",
          callId: message.callId,
          result: serialize(endpoint.serialization, value),
        });
      })
      .catch(error => {
        this.transport.send({
          type: "rpcError",
          callId: message.callId,
          error: serializeError(error),
        });
        context.logger.error("Error in RPC handler:", error);
      });
  }

  private receivedSignalSubscribe(message: ClientToServerMessage & { type: "signalSubscribe" }) {
    const endpoint = this.backendInterface.getSignalEndpoint(message.endpoint);
    if (endpoint === undefined) {
      this.communicationWarning(
        `Received signalSubscribe for unknown endpoint, endpoint = ${message.endpoint}`,
      );
      return;
    }
    if (endpoint.handler === null) {
      this.communicationWarning(
        `Received signalSubscribe for unhandled endpoint, endpoint = ${message.endpoint}`,
      );
      return;
    }
    if (this.openSignalSubscriptions.has(message.subscribeId)) {
      this.communicationWarning(text`
        Received signalSubscribe for already open subscription, subscribeId =
        ${message.subscribeId}
      `);
      return;
    }
    const deserializedCreationParameter = deserialize(
      endpoint.serialization,
      message.creationParameter,
    );
    const parseResult = endpoint.creationParameter.safeParse(deserializedCreationParameter);
    if (!parseResult.success) {
      this.communicationWarning(text`
        Received invalid parameter for signalSubscribe, endpointName = ${endpoint.name},
        creationParameter = ${deserializedCreationParameter}. Zod error:

        ${Validator.prettyPrintZod("creationParameter", parseResult.error)}
      `);
      return;
    }
    const context = this.contextCreator({
      type: "signal",
      endpointName: endpoint.name,
    });
    let initialized = false;
    Promise.resolve(endpoint.handler(context, parseResult.data))
      .then((signal: SignalLike<any>) => {
        const openSignalSubscription: OpenSignalSubscription = {
          endpoint,
          unsubscribe: signal.subscribeFull((value, patches, tags) => {
            if (!isAvailable(value)) {
              return;
            }
            if (initialized) {
              this.transport.send({
                type: "signalUpdate",
                subscribeId: message.subscribeId,
                patches: patches.map(patch => serialize(endpoint.serialization, patch)),
                tags,
              });
            } else {
              this.transport.send({
                type: "signalUpdate",
                subscribeId: message.subscribeId,
                patches: [
                  serialize(endpoint.serialization, {
                    op: "replace",
                    path: [],
                    value,
                  }),
                ],
                tags,
              });
              initialized = true;
            }
          }),
        };
        if (this.signalSubscriptionsToClose.has(message.subscribeId)) {
          this.signalSubscriptionsToClose.delete(message.subscribeId);
          openSignalSubscription.unsubscribe();
        } else {
          this.openSignalSubscriptions.set(message.subscribeId, openSignalSubscription);
          const currentValue = signal.get();
          if (isAvailable(currentValue)) {
            this.transport.send({
              type: "signalUpdate",
              subscribeId: message.subscribeId,
              patches: [
                serialize(endpoint.serialization, {
                  op: "replace",
                  path: [],
                  value: signal.get(),
                }),
              ],
              tags: [],
            });
            initialized = true;
          }
        }
      })
      .catch(error => {
        this.transport.send({
          type: "signalError",
          subscribeId: message.subscribeId,
          error: serializeError(error),
        });
        context.logger.error("Error in signal handler:", error);
      });
  }

  private receivedSignalUnsubscribe(
    message: ClientToServerMessage & { type: "signalUnsubscribe" },
  ) {
    const openSignalSubscription = this.openSignalSubscriptions.get(message.subscribeId);
    if (openSignalSubscription === undefined) {
      this.signalSubscriptionsToClose.add(message.subscribeId);
      return;
    }
    openSignalSubscription.unsubscribe();
    this.openSignalSubscriptions.delete(message.subscribeId);
  }

  private receivedWritableSignalSubscribe(
    message: ClientToServerMessage & { type: "writableSignalSubscribe" },
  ) {
    const endpoint = this.backendInterface.getWritableSignalEndpoint(message.endpoint);
    if (endpoint === undefined) {
      this.communicationWarning(
        `Received writableSignalSubscribe for unknown endpoint, endpoint = ${message.endpoint}`,
      );
      return;
    }
    if (endpoint.handler === null) {
      this.communicationWarning(
        `Received writableSignalSubscribe for unhandled endpoint, endpoint = ${message.endpoint}`,
      );
      return;
    }
    if (this.openWritableSignalSubscriptions.has(message.subscribeId)) {
      this.communicationWarning(text`
        Received writableSignalSubscribe for already open subscription, subscribeId =
        ${message.subscribeId}
      `);
      return;
    }
    const deserializedCreationParameter = deserialize(
      endpoint.serialization,
      message.creationParameter,
    );
    const parseResult = endpoint.creationParameter.safeParse(deserializedCreationParameter);
    if (!parseResult.success) {
      this.communicationWarning(text`
        Received invalid parameter for writableSignalSubscribe, endpointName = ${endpoint.name},
        creationParameter = ${deserializedCreationParameter}. Zod error:

        ${Validator.prettyPrintZod("creationParameter", parseResult.error)}
      `);
      return;
    }
    const context = this.contextCreator({
      type: "writableSignal",
      endpointName: endpoint.name,
    });
    let initialized = false;
    Promise.resolve(endpoint.handler(context, parseResult.data))
      .then(([signal, setter]) => {
        const openWritableSignalSubscription: OpenWritableSignalSubscription = {
          endpoint,
          unsubscribe: signal.subscribeFull((value, patches, tags) => {
            if (!isAvailable(value)) {
              return;
            }
            if (initialized) {
              this.transport.send({
                type: "writableSignalUpdate",
                subscribeId: message.subscribeId,
                patches: patches.map(patch => serialize(endpoint.serialization, patch)),
                tags,
              });
            } else {
              this.transport.send({
                type: "writableSignalUpdate",
                subscribeId: message.subscribeId,
                patches: [
                  serialize(endpoint.serialization, {
                    op: "replace",
                    path: [],
                    value,
                  }),
                ],
                tags,
              });
              initialized = true;
            }
          }),
          receivedPatches: (patches, tags) => {
            try {
              const data = signal.get();
              if (!isAvailable(data)) {
                // Backend is not ready, ignore the update and tell the frontend that the
                // optimistic update is completed.
                this.transport.send({
                  type: "writableSignalUpdate",
                  subscribeId: message.subscribeId,
                  patches: [],
                  tags, // Here is where we send the tags back to the client.
                });
                return;
              }
              const deserializedPatches = patches.map(patch =>
                deserialize(endpoint.serialization, patch),
              ) as any;
              const result = applyPatches(data, deserializedPatches);
              const parseResult = endpoint.signalData.safeParse(result);
              if (!parseResult.success) {
                this.communicationWarning(text`
                  Received invalid data for writable signal, endpointName = ${endpoint.name},
                  data = ${result}. Zod error:

                  ${Validator.prettyPrintZod("data", parseResult.error)}
                `);
                return;
              }
              setter.withValueAndPatches(parseResult.data, deserializedPatches, tags);
            } catch (error: any) {
              this.communicationWarning(text`
                Error in receivedPatches for writable signal, endpointName = ${endpoint.name},
                error = ${error.message}
              `);
            }
          },
        };
        if (this.writableSignalSubscriptionsToClose.has(message.subscribeId)) {
          this.writableSignalSubscriptionsToClose.delete(message.subscribeId);
          openWritableSignalSubscription.unsubscribe();
        } else {
          this.openWritableSignalSubscriptions.set(
            message.subscribeId,
            openWritableSignalSubscription,
          );
          const currentValue = signal.get();
          if (isAvailable(currentValue)) {
            this.transport.send({
              type: "writableSignalUpdate",
              subscribeId: message.subscribeId,
              patches: [
                serialize(endpoint.serialization, {
                  op: "replace",
                  path: [],
                  value: signal.get(),
                }),
              ],
              tags: [],
            });
            initialized = true;
          }
        }
      })
      .catch(error => {
        this.transport.send({
          type: "writableSignalError",
          subscribeId: message.subscribeId,
          error: serializeError(error),
        });
        context.logger.error("Error in writable signal handler:", error);
      });
  }

  private receivedWritableSignalUnsubscribe(
    message: ClientToServerMessage & { type: "writableSignalUnsubscribe" },
  ) {
    const openWritableSignalSubscription = this.openWritableSignalSubscriptions.get(
      message.subscribeId,
    );
    if (openWritableSignalSubscription === undefined) {
      this.writableSignalSubscriptionsToClose.add(message.subscribeId);
      return;
    }
    openWritableSignalSubscription.unsubscribe();
    this.openWritableSignalSubscriptions.delete(message.subscribeId);
  }

  private receivedWritableSignalUpdate(
    message: ClientToServerMessage & { type: "writableSignalUpdate" },
  ) {
    const openWritableSignalSubscription = this.openWritableSignalSubscriptions.get(
      message.subscribeId,
    );
    if (openWritableSignalSubscription === undefined) {
      this.communicationWarning(
        `Received writableSignalUpdate for unknown subscription, subscribeId = ${message.subscribeId}`,
      );
      return;
    }
    openWritableSignalSubscription.receivedPatches(message.patches, message.tags);
  }

  private receivedCommunicationWarning(
    message: ClientToServerMessage & { type: "communicationWarning" },
  ) {
    this.logger.warnText`
      Received communication warning from the client: ${message.warning}
      
      This is usually caused by communication protocol incompatibility. Please make sure you are
      using the up-to-date versions of the SDK and LM Studio.

      Note: This warning was produced by the client and is printed on the server for convenience.
    `;
  }

  private receivedKeepAlive(_message: ClientToServerMessage & { type: "keepAlive" }) {
    this.transport.send({
      type: "keepAliveAck",
    });
  }

  private receivedMessage = (message: ClientToServerMessage) => {
    switch (message.type) {
      case "channelCreate": {
        this.receivedChannelCreate(message);
        break;
      }
      case "channelSend": {
        this.receivedChannelSend(message);
        break;
      }
      case "channelAck": {
        this.receivedChannelAck(message);
        break;
      }
      case "rpcCall": {
        this.receivedRpcCall(message);
        break;
      }
      case "signalSubscribe": {
        this.receivedSignalSubscribe(message);
        break;
      }
      case "signalUnsubscribe": {
        this.receivedSignalUnsubscribe(message);
        break;
      }
      case "writableSignalSubscribe": {
        this.receivedWritableSignalSubscribe(message);
        break;
      }
      case "writableSignalUnsubscribe": {
        this.receivedWritableSignalUnsubscribe(message);
        break;
      }
      case "writableSignalUpdate": {
        this.receivedWritableSignalUpdate(message);
        break;
      }
      case "communicationWarning": {
        this.receivedCommunicationWarning(message);
        break;
      }
      case "keepAlive": {
        this.receivedKeepAlive(message);
        break;
      }
    }
  };
  private errored = (error: any) => {
    for (const openChannel of this.openChannels.values()) {
      openChannel.errored(error);
    }
    for (const openSignalSubscription of this.openSignalSubscriptions.values()) {
      openSignalSubscription.unsubscribe();
    }
    for (const openWritableSignalSubscription of this.openWritableSignalSubscriptions.values()) {
      openWritableSignalSubscription.unsubscribe();
    }
    this.emitCloseEvent();
  };

  public async [Symbol.asyncDispose]() {
    await this.transport[Symbol.asyncDispose]();
  }
}
