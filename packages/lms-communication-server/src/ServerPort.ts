import { applyPatches, type Patch } from "@lmstudio/immer-with-plugins";
import {
  Event,
  isAvailable,
  SimpleLogger,
  type LoggerInterface,
  type SignalLike,
  type Setter,
  type WriteTag,
} from "@lmstudio/lms-common";
import {
  Channel,
  PayloadCodec,
  deserialize,
  mapPortError,
  normalizeCommunicationWarningKind,
  serialize,
  type BackendInterface,
  type ChannelEndpoint,
  type ChannelEndpointsSpecBase,
  type ClientToServerMessage,
  type CommunicationWarningKind,
  type PortErrorMapper,
  type RpcEndpointsSpecBase,
  type ServerToClientMessage,
  type ServerTransport,
  type ServerTransportFactory,
  type SignalEndpointsSpecBase,
  type WritableSignalEndpointsSpecBase,
} from "@lmstudio/lms-communication";
import { fromSerializedError, serializeError } from "@lmstudio/lms-shared-types";
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
  unsubscribe: () => void;
}

interface OpenWritableSignalSubscription {
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
  private readonly payloadCodec: PayloadCodec;
  private readonly mapError?: PortErrorMapper;
  private closed = false;
  private readonly logger;
  private readonly openChannels = new Map<number, OpenChannel>();
  private readonly openSignalSubscriptions = new Map<number, OpenSignalSubscription>();
  private readonly openWritableSignalSubscriptions = new Map<
    number,
    OpenWritableSignalSubscription
  >();
  public readonly closeEvent: Event<void>;
  private readonly emitCloseEvent: () => void;
  private producedCommunicationWarningsCount = 0;

  /** Creates a port with payload handling and error formatting scoped to this connection. */
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
      payloadCodec,
      mapError,
    }: {
      parentLogger?: LoggerInterface;
      payloadCodec?: PayloadCodec;
      mapError?: PortErrorMapper;
    } = {},
  ) {
    this.logger = new SimpleLogger("ServerPort", parentLogger);
    this.payloadCodec = payloadCodec ?? new PayloadCodec();
    this.mapError = mapError;
    [this.closeEvent, this.emitCloseEvent] = Event.create();
    this.transport = factory(this.receivedMessage, this.errored, this.logger);
  }

  private safeSend(
    message: ServerToClientMessage,
    reason?: string,
    logger: LoggerInterface = this.logger,
  ): void {
    try {
      this.transport.send(message);
    } catch (error) {
      if (reason === undefined) {
        logger.error("Error sending server message:", error);
      } else {
        logger.error("Error sending server message:", reason, error);
      }
    }
  }

  private communicationWarning(warning: string, kind: CommunicationWarningKind = "unknown") {
    if (this.producedCommunicationWarningsCount >= 5) {
      return;
    }
    this.logger.warnText`
      Produced communication warning: ${warning}
      
      This is usually caused by communication protocol incompatibility. Please make sure you are
      using the up-to-date versions of the SDK and LM Studio.
    `;
    this.safeSend(
      {
        type: "communicationWarning",
        warning,
        kind,
      },
      "communicationWarning",
    );
    this.producedCommunicationWarningsCount++;
    if (this.producedCommunicationWarningsCount >= 5) {
      this.logger.errorText`
        5 communication warnings have been produced. Further warnings will not be printed.
      `;
    }
  }

  /** Opens a channel or reports a request-scoped error when its endpoint has no handler. */
  private receivedChannelCreate(message: ClientToServerMessage & { type: "channelCreate" }) {
    const endpoint = this.backendInterface.getChannelEndpoint(message.endpoint);
    if (endpoint === undefined || endpoint.handler === null) {
      const error = new Error(
        `${endpoint === undefined ? "Unknown" : "Unhandled"} channel endpoint '${message.endpoint}'.`,
      );
      this.communicationWarning(
        error.message,
        endpoint === undefined ? "channelEndpointUnknown" : "channelEndpointUnhandled",
      );
      // Error replies must still reach the caller after communication warnings are capped.
      this.safeSend(
        {
          type: "channelError",
          channelId: message.channelId,
          error: serializeError(mapPortError(this.mapError, error, message.endpoint, "channel")),
        },
        "channelError",
      );
      return;
    }
    if (this.openChannels.has(message.channelId)) {
      this.communicationWarning(
        `Received channelCreate for already open channel, channelId = ${message.channelId}`,
        "channelAlreadyOpen",
      );
      return;
    }
    const parseResult = this.payloadCodec.decode({
      schema: endpoint.creationParameter,
      serialization: endpoint.serialization,
      value: message.creationParameter,
    });
    if (parseResult.success === false) {
      this.safeSend({
        type: "channelError",
        channelId: message.channelId,
        error: serializeError(
          mapPortError(this.mapError, parseResult.error, endpoint.name, "channel"),
        ),
      });
      return;
    }

    const channelId = message.channelId;
    const openChannel: OpenChannel = {
      endpoint,
      ...Channel.create((message, ackId) => {
        try {
          if (this.openChannels.get(channelId) !== openChannel) {
            return;
          }
          const value = endpoint.toClientPacket.parse(message);
          this.transport.send({
            type: "channelSend",
            channelId,
            ackId,
            message: this.payloadCodec.encode({
              schema: endpoint.toClientPacket,
              serialization: endpoint.serialization,
              value,
            }),
          });
        } catch (error) {
          this.failChannel(channelId, error);
        }
      }),
    };

    this.openChannels.set(channelId, openChannel);
    const context = this.contextCreator({
      type: "channel",
      endpointName: endpoint.name,
    });

    Promise.resolve()
      .then(() => {
        // Cancellation can arrive before the handler gets its first turn.
        if (this.openChannels.get(channelId) !== openChannel) {
          return;
        }
        return endpoint.handler!(context, parseResult.data, openChannel.channel);
      })
      .then(
        () => {
          if (this.openChannels.get(channelId) !== openChannel) {
            return;
          }
          this.openChannels.delete(channelId);
          this.safeSend(
            {
              type: "channelClose",
              channelId: channelId,
            },
            "channelClose",
            context.logger,
          );
          openChannel.closed();
        },
        error => {
          if (this.openChannels.get(channelId) !== openChannel) {
            return;
          }
          this.failChannel(channelId, error);
          context.logger.error("Error in channel handler:", error);
        },
      )
      .catch(error => {
        context.logger.error("Unhandled error in channel handling:", error);
      });
  }

  /** Validates incoming packets and fails the channel if its payload cannot be represented. */
  private receivedChannelSend(message: ClientToServerMessage & { type: "channelSend" }) {
    const openChannel = this.openChannels.get(message.channelId);
    if (openChannel === undefined) {
      this.communicationWarning(
        `Received channelSend for unknown channel ${message.channelId}`,
        "channelUnknown",
      );
      return;
    }
    const parsed = this.payloadCodec.decode({
      schema: openChannel.endpoint.toServerPacket,
      serialization: openChannel.endpoint.serialization,
      value: message.message,
    });
    if (parsed.success === false) {
      this.failChannel(message.channelId, parsed.error);
      return;
    }
    openChannel.receivedMessage(parsed.data);
  }

  /** Reports a channel-local failure and settles its listeners. */
  private failChannel(channelId: number, error: unknown): void {
    const channel = this.openChannels.get(channelId);
    if (channel === undefined) {
      return;
    }
    error = mapPortError(this.mapError, error, channel.endpoint.name, "channel");
    this.openChannels.delete(channelId);
    channel.errored(error);
    this.safeSend({ type: "channelError", channelId, error: serializeError(error) });
  }

  /** Releases a failed peer's channel so its handler can abort and dispose its resources. */
  private receivedChannelError(message: ClientToServerMessage & { type: "channelError" }) {
    const channel = this.openChannels.get(message.channelId);
    if (channel === undefined) {
      return;
    }
    this.openChannels.delete(message.channelId);
    channel.errored(fromSerializedError(message.error, "Client channel error"));
  }

  private receivedChannelAck(message: ClientToServerMessage & { type: "channelAck" }) {
    const openChannel = this.openChannels.get(message.channelId);
    if (openChannel === undefined) {
      this.communicationWarning(
        `Received channelAck for unknown channel, channelId = ${message.channelId}`,
        "channelUnknown",
      );
      return;
    }
    openChannel.receivedAck(message.ackId);
  }

  /** Settles an RPC with a result or error, including requests for endpoints without handlers. */
  private receivedRpcCall(message: ClientToServerMessage & { type: "rpcCall" }) {
    const endpoint = this.backendInterface.getRpcEndpoint(message.endpoint);
    if (endpoint === undefined || endpoint.handler === null) {
      const error = new Error(
        `${endpoint === undefined ? "Unknown" : "Unhandled"} RPC endpoint '${message.endpoint}'.`,
      );
      this.communicationWarning(
        error.message,
        endpoint === undefined ? "rpcEndpointUnknown" : "rpcEndpointUnhandled",
      );
      this.safeSend(
        {
          type: "rpcError",
          callId: message.callId,
          error: serializeError(mapPortError(this.mapError, error, message.endpoint, "rpc")),
        },
        "rpcError",
      );
      return;
    }
    const parseResult = this.payloadCodec.decode({
      schema: endpoint.parameter,
      serialization: endpoint.serialization,
      value: message.parameter,
    });
    if (parseResult.success === false) {
      this.safeSend({
        type: "rpcError",
        callId: message.callId,
        error: serializeError(mapPortError(this.mapError, parseResult.error, endpoint.name, "rpc")),
      });
      return;
    }

    const context = this.contextCreator({
      type: "rpc",
      endpointName: endpoint.name,
    });

    Promise.resolve()
      .then(() => endpoint.handler!(context, parseResult.data))
      .then(
        value => {
          let serializedResult;
          try {
            serializedResult = this.payloadCodec.encode({
              schema: endpoint.returns,
              serialization: endpoint.serialization,
              value,
            });
          } catch (error) {
            this.safeSend(
              {
                type: "rpcError",
                callId: message.callId,
                error: serializeError(mapPortError(this.mapError, error, endpoint.name, "rpc")),
              },
              "rpcError",
              context.logger,
            );
            context.logger.error("Error serializing RPC result:", error);
            return;
          }
          this.safeSend(
            {
              type: "rpcResult",
              callId: message.callId,
              result: serializedResult,
            },
            "rpcResult",
            context.logger,
          );
        },
        error => {
          this.safeSend(
            {
              type: "rpcError",
              callId: message.callId,
              error: serializeError(mapPortError(this.mapError, error, endpoint.name, "rpc")),
            },
            "rpcError",
            context.logger,
          );
          context.logger.error("Error in RPC handler:", error);
        },
      )
      .catch(error => {
        context.logger.error("Unhandled error in RPC handling:", error);
      });
  }

  /** Owns initial snapshots, conversion, and cleanup for both kinds of signal. */
  private subscribeSignal(
    message: ClientToServerMessage & { type: "signalSubscribe" | "writableSignalSubscribe" },
  ): void {
    const writable = message.type === "writableSignalSubscribe";
    const endpoint = writable
      ? this.backendInterface.getWritableSignalEndpoint(message.endpoint)
      : this.backendInterface.getSignalEndpoint(message.endpoint);
    const subscriptions = writable
      ? this.openWritableSignalSubscriptions
      : this.openSignalSubscriptions;
    // Creation can fail before there is a subscription to hold the endpoint context.
    const fail = (error: unknown) =>
      this.failSignalSubscription({
        subscribeId: message.subscribeId,
        writable,
        error: mapPortError(
          this.mapError,
          error,
          message.endpoint,
          writable ? "writableSignal" : "signal",
        ),
      });
    if (endpoint === undefined || endpoint.handler === null) {
      const error = new Error(
        `${endpoint === undefined ? "Unknown" : "Unhandled"} ${writable ? "writable signal" : "signal"} endpoint '${message.endpoint}'.`,
      );
      this.communicationWarning(
        error.message,
        writable
          ? endpoint === undefined
            ? "writableSignalEndpointUnknown"
            : "writableSignalEndpointUnhandled"
          : endpoint === undefined
            ? "signalEndpointUnknown"
            : "signalEndpointUnhandled",
      );
      fail(error);
      return;
    }
    if (subscriptions.has(message.subscribeId)) {
      fail(new Error(`Subscription ${message.subscribeId} is already open.`));
      return;
    }
    const parsed = this.payloadCodec.decode({
      schema: endpoint.creationParameter,
      serialization: endpoint.serialization,
      value: message.creationParameter,
    });
    if (parsed.success === false) {
      fail(parsed.error);
      return;
    }
    const context = this.contextCreator({
      type: writable ? "writableSignal" : "signal",
      endpointName: endpoint.name,
    });
    let active = true;
    // Register before awaiting the handler so an early unsubscribe can cancel it.
    const pending = {
      unsubscribe: () => {
        active = false;
      },
      receivedPatches: () => {},
    };
    subscriptions.set(message.subscribeId, pending);
    Promise.resolve()
      .then(() => endpoint.handler!(context, parsed.data))
      .then(source => {
        if (this.closed || !active) {
          return;
        }
        const [signal, setter] = writable
          ? (source as readonly [SignalLike<unknown>, Setter<unknown>])
          : ([source as SignalLike<unknown>, null] as const);
        let initialized = false;
        let stop = () => {};
        const publish = (value: unknown, patches: Patch[], tags: WriteTag[]) => {
          if (!active || !isAvailable(value)) {
            return;
          }
          try {
            const wirePatches =
              initialized && this.payloadCodec.preservesPatches(endpoint.signalData)
                ? patches
                : [
                    {
                      op: "replace" as const,
                      path: [],
                      value: this.payloadCodec.toWire(endpoint.signalData, value),
                    },
                  ];
            this.transport.send({
              type: writable ? "writableSignalUpdate" : "signalUpdate",
              subscribeId: message.subscribeId,
              patches: wirePatches.map(patch => serialize(endpoint.serialization, patch)),
              tags,
            });
            initialized = true;
          } catch (error) {
            fail(error);
          }
        };
        const subscription = {
          unsubscribe: () => {
            active = false;
            stop();
          },
          receivedPatches: (patches: unknown[], tags: WriteTag[]) => {
            if (!active || setter === null) {
              return;
            }
            try {
              const current = signal.get();
              if (!isAvailable(current)) {
                this.safeSend({
                  type: "writableSignalUpdate",
                  subscribeId: message.subscribeId,
                  patches: [],
                  tags,
                });
                return;
              }
              const preservesPatches = this.payloadCodec.preservesPatches(endpoint.signalData);
              // A peer's paths address its representation, including any items omitted by conversion.
              const wireBefore = preservesPatches
                ? current
                : this.payloadCodec.toWire(endpoint.signalData, current);
              const decodedPatches = patches.map(patch =>
                deserialize(endpoint.serialization, patch as Parameters<typeof deserialize>[1]),
              ) as Patch[];
              const wireAfter: unknown = applyPatches(
                wireBefore as Parameters<typeof applyPatches>[0],
                decodedPatches,
              );
              const decoded = this.payloadCodec.decode({
                schema: endpoint.signalData,
                value: wireAfter,
              });
              if (decoded.success === false) {
                throw decoded.error;
              }
              if (preservesPatches) {
                // Parsing may clone. The patched value retains references and matches these patches.
                setter.withValueAndPatches(wireAfter, decodedPatches, tags);
              } else {
                setter(decoded.data, tags);
              }
            } catch (error) {
              fail(error);
            }
          },
        };
        subscriptions.set(message.subscribeId, subscription);
        stop = signal.subscribeFull(publish);
        if (!active) {
          stop();
          return;
        }
        if (!initialized) {
          publish(signal.get(), [], []);
        }
      })
      .catch(error => {
        if (active && !this.closed) {
          fail(error);
        }
        context.logger.error("Error in signal handler:", error);
      });
  }

  /** Fails the subscription and releases its source, including failed writes awaiting tags. */
  private failSignalSubscription({
    subscribeId,
    writable,
    error,
  }: {
    subscribeId: number;
    writable: boolean;
    error: unknown;
  }): void {
    const subscriptions = writable
      ? this.openWritableSignalSubscriptions
      : this.openSignalSubscriptions;
    const subscription = subscriptions.get(subscribeId);
    subscriptions.delete(subscribeId);
    subscription?.unsubscribe();
    this.safeSend({
      type: writable ? "writableSignalError" : "signalError",
      subscribeId,
      error: serializeError(error),
    });
  }

  /** Cancels an active readonly subscription or one whose handler has not resolved. */
  private receivedSignalUnsubscribe(
    message: ClientToServerMessage & { type: "signalUnsubscribe" },
  ) {
    const subscription = this.openSignalSubscriptions.get(message.subscribeId);
    if (subscription === undefined) {
      return;
    }
    this.openSignalSubscriptions.delete(message.subscribeId);
    subscription.unsubscribe();
  }

  /** Cancels an active writable subscription or one whose handler has not resolved. */
  private receivedWritableSignalUnsubscribe(
    message: ClientToServerMessage & { type: "writableSignalUnsubscribe" },
  ) {
    const subscription = this.openWritableSignalSubscriptions.get(message.subscribeId);
    if (subscription === undefined) {
      return;
    }
    this.openWritableSignalSubscriptions.delete(message.subscribeId);
    subscription.unsubscribe();
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
        "writableSignalUnknown",
      );
      return;
    }
    openWritableSignalSubscription.receivedPatches(message.patches, message.tags);
  }

  private receivedCommunicationWarning(
    message: ClientToServerMessage & { type: "communicationWarning" },
  ) {
    const kind = normalizeCommunicationWarningKind(message.kind);
    this.logger.warnText`
      Received communication warning from the client (${kind}): ${message.warning}
      
      This is usually caused by communication protocol incompatibility. Please make sure you are
      using the up-to-date versions of the SDK and LM Studio.

      Note: This warning was produced by the client and is printed on the server for convenience.
    `;
  }

  private receivedKeepAlive(_message: ClientToServerMessage & { type: "keepAlive" }) {
    this.safeSend(
      {
        type: "keepAliveAck",
      },
      "keepAliveAck",
    );
  }

  /** Dispatches transport envelopes, including peer failures that bypass payload conversion. */
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
      case "channelError": {
        this.receivedChannelError(message);
        break;
      }
      case "rpcCall": {
        this.receivedRpcCall(message);
        break;
      }
      case "signalSubscribe":
      case "writableSignalSubscribe": {
        this.subscribeSignal(message);
        break;
      }
      case "signalUnsubscribe": {
        this.receivedSignalUnsubscribe(message);
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
  /** Releases subscriptions and prevents late handlers from attaching after disconnect. */
  private errored = (error: unknown) => {
    this.closed = true;
    for (const openChannel of this.openChannels.values()) {
      openChannel.errored(error);
    }
    for (const openSignalSubscription of this.openSignalSubscriptions.values()) {
      openSignalSubscription.unsubscribe();
    }
    for (const openWritableSignalSubscription of this.openWritableSignalSubscriptions.values()) {
      openWritableSignalSubscription.unsubscribe();
    }
    this.openChannels.clear();
    this.openSignalSubscriptions.clear();
    this.openWritableSignalSubscriptions.clear();
    this.emitCloseEvent();
  };

  public async [Symbol.asyncDispose]() {
    await this.transport[Symbol.asyncDispose]();
  }
}
