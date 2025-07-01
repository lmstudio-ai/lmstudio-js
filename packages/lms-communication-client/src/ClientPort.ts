import { applyPatches, type Patch } from "@lmstudio/immer-with-plugins";
import {
  getCurrentStack,
  LazySignal,
  makePromise,
  OWLSignal,
  SimpleLogger,
  text,
  Validator,
  type LoggerInterface,
  type NotAvailable,
  type Setter,
  type WriteTag,
} from "@lmstudio/lms-common";
import {
  Channel,
  deserialize,
  serialize,
  type BackendInterface,
  type ChannelEndpoint,
  type ChannelEndpointsSpecBase,
  type ClientTransport,
  type ClientTransportFactory,
  type RpcEndpoint,
  type RpcEndpointsSpecBase,
  type ServerToClientMessage,
  type SignalEndpoint,
  type SignalEndpointsSpecBase,
  type WritableSignalEndpoint,
  type WritableSignalEndpointsSpecBase,
} from "@lmstudio/lms-communication";
import { fromSerializedError, type SerializedLMSExtendedError } from "@lmstudio/lms-shared-types";

interface OpenChannel {
  endpoint: ChannelEndpoint;
  stack: string;
  channel: Channel<any, any>;
  receivedAck: (ackId: number) => void;
  receivedMessage: (message: any) => void;
  errored: (error: any) => void;
  closed: () => void;
}

interface OngoingRpc {
  endpoint: RpcEndpoint;
  stack: string;
  resolve: (result: any) => void;
  reject: (error: any) => void;
}

interface OpenSignalSubscription {
  endpoint: SignalEndpoint;
  getValue: () => any;
  receivedPatches: (newValue: any, patches: Array<Patch>, tags: Array<WriteTag>) => void;
  errored: (error: any) => void;
  stack?: string;
}

interface OpenWritableSignalSubscription {
  endpoint: WritableSignalEndpoint;
  getValue: () => any;
  receivedPatches: (newValue: any, patches: Array<Patch>, tags: Array<WriteTag>) => void;
  firstUpdateReceived: boolean;
  errored: (error: any) => void;
  stack?: string;
}

function defaultErrorDeserializer(
  serialized: SerializedLMSExtendedError,
  directCause: string,
  stack?: string,
): Error {
  return fromSerializedError(serialized, directCause, stack);
}

export class ClientPort<
  TRpcEndpoints extends RpcEndpointsSpecBase,
  TChannelEndpoints extends ChannelEndpointsSpecBase,
  TSignalEndpoints extends SignalEndpointsSpecBase,
  TWritableSignalEndpoints extends WritableSignalEndpointsSpecBase,
> {
  private readonly transport: ClientTransport;
  private readonly logger;
  private openChannels = new Map<number, OpenChannel>();
  private ongoingRpcs = new Map<number, OngoingRpc>();
  private openSignalSubscriptions = new Map<number, OpenSignalSubscription>();
  private openWritableSignalSubscriptions = new Map<number, OpenWritableSignalSubscription>();
  private openCommunicationsCount = 0;
  private nextChannelId = 0;
  private nextSubscribeId = 0;
  private nextWritableSubscribeId = 0;
  private producedCommunicationWarningsCount = 0;
  private errorDeserializer: (
    serialized: SerializedLMSExtendedError,
    directCause: string,
    stack?: string,
  ) => Error;
  private verboseErrorMessage: boolean;

  public constructor(
    public readonly backendInterface: BackendInterface<
      unknown,
      TRpcEndpoints,
      TChannelEndpoints,
      TSignalEndpoints,
      TWritableSignalEndpoints
    >,
    factory: ClientTransportFactory,
    {
      parentLogger,
      errorDeserializer,
      verboseErrorMessage,
    }: {
      parentLogger?: LoggerInterface;
      errorDeserializer?: (
        serialized: SerializedLMSExtendedError,
        directCause: string,
        stack?: string,
      ) => Error;
      verboseErrorMessage?: boolean;
    } = {},
  ) {
    this.logger = new SimpleLogger("ClientPort", parentLogger);
    this.errorDeserializer = errorDeserializer ?? defaultErrorDeserializer;
    this.verboseErrorMessage = verboseErrorMessage ?? true;
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

  private updateOpenCommunicationsCount() {
    const previousCount = this.openCommunicationsCount;
    this.openCommunicationsCount =
      this.openChannels.size +
      this.ongoingRpcs.size +
      this.openSignalSubscriptions.size +
      this.openWritableSignalSubscriptions.size;
    if (this.openCommunicationsCount === 0 && previousCount > 0) {
      this.transport.onHavingNoOpenCommunication();
    } else if (this.openCommunicationsCount === 1 && previousCount === 0) {
      this.transport.onHavingOneOrMoreOpenCommunication();
    }
  }

  private receivedChannelSend(message: ServerToClientMessage & { type: "channelSend" }) {
    const openChannel = this.openChannels.get(message.channelId);
    if (openChannel === undefined) {
      this.communicationWarning(
        `Received channelSend for unknown channel, channelId = ${message.channelId}`,
      );
      return;
    }
    const deserializedMessage = deserialize(openChannel.endpoint.serialization, message.message);
    const parsed = openChannel.endpoint.toClientPacket.safeParse(deserializedMessage);
    if (!parsed.success) {
      this.communicationWarning(text`
        Received invalid message for channel: endpointName = ${openChannel.endpoint.name}, message =
        ${deserializedMessage}. Zod error:

        ${Validator.prettyPrintZod("message", parsed.error)}
      `);
      return;
    }
    openChannel.receivedMessage(parsed.data);
  }

  private receivedChannelAck(message: ServerToClientMessage & { type: "channelAck" }) {
    const openChannel = this.openChannels.get(message.channelId);
    if (openChannel === undefined) {
      this.communicationWarning(
        `Received channelAck for unknown channel, channelId = ${message.channelId}`,
      );
      return;
    }
    openChannel.receivedAck(message.ackId);
  }

  private receivedChannelClose(message: ServerToClientMessage & { type: "channelClose" }) {
    const openChannel = this.openChannels.get(message.channelId);
    if (openChannel === undefined) {
      this.communicationWarning(
        `Received channelClose for unknown channel, channelId = ${message.channelId}`,
      );
      return;
    }
    this.openChannels.delete(message.channelId);
    openChannel.closed();
    this.updateOpenCommunicationsCount();
  }

  private receivedChannelError(message: ServerToClientMessage & { type: "channelError" }) {
    const openChannel = this.openChannels.get(message.channelId);
    if (openChannel === undefined) {
      this.communicationWarning(
        `Received channelError for unknown channel, channelId = ${message.channelId}`,
      );
      return;
    }
    this.openChannels.delete(message.channelId);
    const error = this.errorDeserializer(
      message.error,
      "Channel Error",
      this.verboseErrorMessage ? openChannel.stack : undefined,
    );
    openChannel.errored(error);
    this.updateOpenCommunicationsCount();
  }

  private receivedRpcResult(message: ServerToClientMessage & { type: "rpcResult" }) {
    const ongoingRpc = this.ongoingRpcs.get(message.callId);
    if (ongoingRpc === undefined) {
      this.communicationWarning(`Received rpcResult for unknown rpc, callId = ${message.callId}`);
      return;
    }
    const deserializedResult = deserialize(ongoingRpc.endpoint.serialization, message.result);
    const parsed = ongoingRpc.endpoint.returns.safeParse(deserializedResult);
    if (!parsed.success) {
      this.communicationWarning(text`
        Received invalid result for rpc, endpointName = ${ongoingRpc.endpoint.name}, result =
        ${deserializedResult}. Zod error:

        ${Validator.prettyPrintZod("result", parsed.error)}
      `);
      return;
    }
    ongoingRpc.resolve(parsed.data);
    this.ongoingRpcs.delete(message.callId);
    this.updateOpenCommunicationsCount();
  }

  private receivedRpcError(message: ServerToClientMessage & { type: "rpcError" }) {
    const ongoingRpc = this.ongoingRpcs.get(message.callId);
    if (ongoingRpc === undefined) {
      this.communicationWarning(`Received rpcError for unknown rpc, callId = ${message.callId}`);
      return;
    }
    const error = this.errorDeserializer(
      message.error,
      "RPC Error",
      this.verboseErrorMessage ? ongoingRpc.stack : undefined,
    );
    ongoingRpc.reject(error);
    this.ongoingRpcs.delete(message.callId);
    this.updateOpenCommunicationsCount();
  }

  private receivedSignalUpdate(message: ServerToClientMessage & { type: "signalUpdate" }) {
    const openSignalSubscription = this.openSignalSubscriptions.get(message.subscribeId);
    if (openSignalSubscription === undefined) {
      // This is caused by update and unsubscribe event happening at the same time. By the time the
      // update has arrived at the client side, as far as the client is considered, the signal is
      // already unsubscribed. This is a normal behavior and is especially prevalent when React
      // StrictMode is enabled, because components are rendered twice where signals are oftentimes
      // subscribed and then unsubscribed immediately after.
      return;
    }
    const patches = message.patches.map(patch =>
      deserialize(openSignalSubscription.endpoint.serialization, patch),
    );
    const beforeValue = openSignalSubscription.getValue();
    let afterValue: any;
    try {
      afterValue = applyPatches(beforeValue, patches);
    } catch (error) {
      this.communicationWarning(text`
        Failed to apply patches to signal on signalUpdate. subscribeId = ${message.subscribeId}.

        beforeValue = ${JSON.stringify(beforeValue, null, 2)},

        patches = ${JSON.stringify(patches, null, 2)}.

        Error: ${String(error)}
      `);
      return;
    }
    const parseResult = openSignalSubscription.endpoint.signalData.safeParse(afterValue);
    if (!parseResult.success) {
      this.communicationWarning(text`
        Received invalid signal patch data, subscribeId = ${message.subscribeId}

        patches = ${patches},

        beforeValue = ${beforeValue},

        afterValue = ${afterValue}.

        Zod error:

        ${Validator.prettyPrintZod("value", parseResult.error)}
      `);
      return;
    }
    // Don't use the parsed value, as it loses the substructure identities
    openSignalSubscription.receivedPatches(afterValue, patches, message.tags);
  }

  private receivedSignalError(message: ServerToClientMessage & { type: "signalError" }) {
    const openSignalSubscription = this.openSignalSubscriptions.get(message.subscribeId);
    if (openSignalSubscription === undefined) {
      this.communicationWarning(
        `Received signalError for unknown signal, subscribeId = ${message.subscribeId}`,
      );
      return;
    }
    const error = this.errorDeserializer(
      message.error,
      "Signal Error",
      this.verboseErrorMessage ? openSignalSubscription.stack : undefined,
    );
    openSignalSubscription.errored(error);
    this.openSignalSubscriptions.delete(message.subscribeId);
    this.updateOpenCommunicationsCount();
  }

  private receivedWritableSignalUpdate(
    message: ServerToClientMessage & { type: "writableSignalUpdate" },
  ) {
    const openSignalSubscription = this.openWritableSignalSubscriptions.get(message.subscribeId);
    if (openSignalSubscription === undefined) {
      // This is caused by update and unsubscribe event happening at the same time. By the time the
      // update has arrived at the client side, as far as the client is considered, the signal is
      // already unsubscribed. This is a normal behavior and is especially prevalent when React
      // StrictMode is enabled, because components are rendered twice where signals are oftentimes
      // subscribed and then unsubscribed immediately after.
      return;
    }
    const patches = message.patches.map(patch =>
      deserialize(openSignalSubscription.endpoint.serialization, patch),
    );
    const beforeValue = openSignalSubscription.getValue();
    let afterValue: any;
    try {
      afterValue = applyPatches(openSignalSubscription.getValue(), patches);
    } catch (error) {
      this.communicationWarning(text`
        Failed to apply patches to writable signal on writableSignalUpdate. subscribeId =
        ${message.subscribeId}.

        beforeValue = ${JSON.stringify(beforeValue, null, 2)},

        patches = ${JSON.stringify(patches, null, 2)}.

        Error: ${String(error)}
      `);
    }
    const parseResult = openSignalSubscription.endpoint.signalData.safeParse(afterValue);
    if (!parseResult.success) {
      this.communicationWarning(text`
        Received invalid writable signal patch data, subscribeId = ${message.subscribeId}

        patches = ${patches},

        beforeValue = ${beforeValue},

        afterValue = ${afterValue}.

        Zod error:

        ${Validator.prettyPrintZod("value", parseResult.error)}
      `);
      return;
    }
    // Don't use the parsed value, as it loses the substructure identities
    openSignalSubscription.firstUpdateReceived = true;
    openSignalSubscription.receivedPatches(afterValue, patches, message.tags);
  }

  private receivedWritableSignalError(
    message: ServerToClientMessage & { type: "writableSignalError" },
  ) {
    const openSignalSubscription = this.openWritableSignalSubscriptions.get(message.subscribeId);
    if (openSignalSubscription === undefined) {
      this.communicationWarning(
        `Received writableSignalError for unknown signal, subscribeId = ${message.subscribeId}`,
      );
      return;
    }
    const error = this.errorDeserializer(
      message.error,
      "Writable Signal Error",
      this.verboseErrorMessage ? openSignalSubscription.stack : undefined,
    );
    openSignalSubscription.errored(error);
    this.openWritableSignalSubscriptions.delete(message.subscribeId);
    this.updateOpenCommunicationsCount();
  }

  private receivedCommunicationWarning(
    message: ServerToClientMessage & { type: "communicationWarning" },
  ) {
    this.logger.warnText`
      Received communication warning from the server: ${message.warning}
      
      This is usually caused by communication protocol incompatibility. Please make sure you are
      using the up-to-date versions of the SDK and LM Studio.

      Note: This warning was received from the server and is printed on the client for convenience.
    `;
  }

  private receivedKeepAliveAck(_message: ServerToClientMessage & { type: "keepAliveAck" }) {
    // Do nothing
  }

  private receivedMessage = (message: ServerToClientMessage) => {
    switch (message.type) {
      case "channelSend": {
        this.receivedChannelSend(message);
        break;
      }
      case "channelAck": {
        this.receivedChannelAck(message);
        break;
      }
      case "channelClose": {
        this.receivedChannelClose(message);
        break;
      }
      case "channelError": {
        this.receivedChannelError(message);
        break;
      }
      case "rpcResult": {
        this.receivedRpcResult(message);
        break;
      }
      case "rpcError": {
        this.receivedRpcError(message);
        break;
      }
      case "signalUpdate": {
        this.receivedSignalUpdate(message);
        break;
      }
      case "signalError": {
        this.receivedSignalError(message);
        break;
      }
      case "writableSignalUpdate": {
        this.receivedWritableSignalUpdate(message);
        break;
      }
      case "writableSignalError": {
        this.receivedWritableSignalError(message);
        break;
      }
      case "communicationWarning": {
        this.receivedCommunicationWarning(message);
        break;
      }
      case "keepAliveAck": {
        this.receivedKeepAliveAck(message);
        break;
      }
    }
  };
  private errored = (error: any) => {
    for (const openChannel of this.openChannels.values()) {
      openChannel.errored(error);
    }
    this.openChannels.clear();
    for (const ongoingRpc of this.ongoingRpcs.values()) {
      ongoingRpc.reject(error);
    }
    this.ongoingRpcs.clear();
    for (const openSignalSubscription of this.openSignalSubscriptions.values()) {
      openSignalSubscription.errored(error);
    }
    this.openSignalSubscriptions.clear();
    for (const openWritableSignalSubscription of this.openWritableSignalSubscriptions.values()) {
      openWritableSignalSubscription.errored(error);
    }
    this.openWritableSignalSubscriptions.clear();
    this.updateOpenCommunicationsCount();
  };
  public async callRpc<TEndpointName extends keyof TRpcEndpoints & string>(
    endpointName: TEndpointName,
    param: TRpcEndpoints[TEndpointName]["parameter"],
    { stack }: { stack?: string } = {},
  ): Promise<TRpcEndpoints[TEndpointName]["returns"]> {
    const endpoint = this.backendInterface.getRpcEndpoint(endpointName);
    if (endpoint === undefined) {
      throw new Error(`No Rpc endpoint with name ${endpointName}`);
    }
    const parameter = endpoint.parameter.parse(param);
    const serializedParameter = serialize(endpoint.serialization, parameter);

    const callId = this.nextChannelId;
    this.nextChannelId++;

    const { promise, resolve, reject } = makePromise();

    stack = stack ?? getCurrentStack(1);
    this.ongoingRpcs.set(callId, {
      endpoint,
      stack,
      resolve,
      reject,
    });

    this.transport.send({
      type: "rpcCall",
      endpoint: endpointName,
      callId,
      parameter: serializedParameter,
    });

    this.updateOpenCommunicationsCount();

    return await promise;
  }
  public createChannel<TEndpointName extends keyof TChannelEndpoints & string>(
    endpointName: TEndpointName,
    param: TChannelEndpoints[TEndpointName]["creationParameter"],
    onMessage?: (message: TChannelEndpoints[TEndpointName]["toClientPacket"]) => void,
    { stack }: { stack?: string } = {},
  ): Channel<
    TChannelEndpoints[TEndpointName]["toClientPacket"],
    TChannelEndpoints[TEndpointName]["toServerPacket"]
  > {
    const channelEndpoint = this.backendInterface.getChannelEndpoint(endpointName);
    if (channelEndpoint === undefined) {
      throw new Error(`No channel endpoint with name ${endpointName}`);
    }
    const creationParameter = channelEndpoint.creationParameter.parse(param);
    const serializedCreationParameter = serialize(channelEndpoint.serialization, creationParameter);

    const channelId = this.nextChannelId;
    this.nextChannelId++;

    this.transport.send({
      type: "channelCreate",
      endpoint: endpointName,
      channelId,
      creationParameter: serializedCreationParameter,
    });

    stack = stack ?? getCurrentStack(1);

    const openChannel: OpenChannel = {
      endpoint: channelEndpoint,
      stack,
      ...Channel.create(packet => {
        const parsed = channelEndpoint.toServerPacket.parse(packet);
        const serializedMessage = serialize(channelEndpoint.serialization, parsed);
        this.transport.send({
          type: "channelSend",
          channelId,
          message: serializedMessage,
        });
      }),
    };

    if (onMessage !== undefined) {
      openChannel.channel.onMessage.subscribe(onMessage);
    }

    this.openChannels.set(channelId, openChannel);
    this.updateOpenCommunicationsCount();
    return openChannel.channel;
  }
  /**
   * Creates a readonly lazy signal will subscribe to the signal endpoint with the given name.
   */
  public createSignal<TEndpointName extends keyof TSignalEndpoints & string>(
    endpointName: TEndpointName,
    param: TSignalEndpoints[TEndpointName]["creationParameter"],
    { stack }: { stack?: string } = {},
  ): LazySignal<TSignalEndpoints[TEndpointName]["signalData"] | NotAvailable> {
    const signalEndpoint = this.backendInterface.getSignalEndpoint(endpointName);
    if (signalEndpoint === undefined) {
      throw new Error(`No signal endpoint with name ${endpointName}`);
    }
    const creationParameter = signalEndpoint.creationParameter.parse(param);
    const serializedCreationParameter = serialize(signalEndpoint.serialization, creationParameter);

    stack = stack ?? getCurrentStack(1);

    const signal = LazySignal.createWithoutInitialValue((setDownstream, errorListener) => {
      const subscribeId = this.nextSubscribeId;
      this.nextSubscribeId++;
      this.transport.send({
        type: "signalSubscribe",
        endpoint: endpointName,
        subscribeId,
        creationParameter: serializedCreationParameter,
      });
      this.openSignalSubscriptions.set(subscribeId, {
        endpoint: signalEndpoint,
        getValue: () => signal.get(),
        receivedPatches: setDownstream.withValueAndPatches,
        errored: errorListener,
        stack,
      });
      this.updateOpenCommunicationsCount();
      return () => {
        this.transport.send({
          type: "signalUnsubscribe",
          subscribeId,
        });
        this.openSignalSubscriptions.delete(subscribeId);
      };
    });

    return signal;
  }

  public createWritableSignal<TEndpointName extends keyof TWritableSignalEndpoints & string>(
    endpointName: TEndpointName,
    param: TWritableSignalEndpoints[TEndpointName]["creationParameter"],
    { stack }: { stack?: string } = {},
  ): [
    signal: OWLSignal<TWritableSignalEndpoints[TEndpointName]["signalData"] | NotAvailable>,
    setter: Setter<TWritableSignalEndpoints[TEndpointName]["signalData"]>,
  ] {
    const signalEndpoint = this.backendInterface.getWritableSignalEndpoint(endpointName);
    if (signalEndpoint === undefined) {
      throw new Error(`No writable signal endpoint with name ${endpointName}`);
    }
    const creationParameter = signalEndpoint.creationParameter.parse(param);
    const serializedCreationParameter = serialize(signalEndpoint.serialization, creationParameter);

    stack = stack ?? getCurrentStack(1);

    let currentSubscribeId: number | null = null;
    const writeUpstream = (_data: any, patches: Array<Patch>, tags: Array<WriteTag>) => {
      if (currentSubscribeId === null) {
        console.warn("writeUpstream called when not subscribed");
        return false;
      }
      const subscription = this.openWritableSignalSubscriptions.get(currentSubscribeId);
      if (!subscription?.firstUpdateReceived) {
        console.warn("writeUpstream called before the first update is received");
        return false;
      }
      this.transport.send({
        type: "writableSignalUpdate",
        subscribeId: currentSubscribeId as any,
        patches: patches.map(patch => serialize(signalEndpoint.serialization, patch)),
        tags,
      });
      return true;
    };

    const [signal, setter] = OWLSignal.createWithoutInitialValue((setDownstream, errorListener) => {
      const subscribeId = this.nextWritableSubscribeId;
      currentSubscribeId = subscribeId;
      this.nextWritableSubscribeId++;
      this.transport.send({
        type: "writableSignalSubscribe",
        endpoint: endpointName,
        subscribeId,
        creationParameter: serializedCreationParameter,
      });
      this.openWritableSignalSubscriptions.set(subscribeId, {
        endpoint: signalEndpoint,
        getValue: () => signal.getPessimistic(),
        receivedPatches: setDownstream.withValueAndPatches,
        firstUpdateReceived: false,
        errored: errorListener,
        stack,
      });
      this.updateOpenCommunicationsCount();
      return () => {
        currentSubscribeId = null;
        this.transport.send({
          type: "writableSignalUnsubscribe",
          subscribeId,
        });
        this.openWritableSignalSubscriptions.delete(subscribeId);
      };
    }, writeUpstream);
    return [signal, setter];
  }

  public async [Symbol.asyncDispose]() {
    await this.transport[Symbol.asyncDispose]();
  }
}

export type InferClientPort<TBackendInterfaceOrCreator> =
  TBackendInterfaceOrCreator extends BackendInterface<
    infer _TContext,
    infer TRpcEndpoints,
    infer TChannelEndpoints,
    infer TSignalEndpoints,
    infer TWritableSignalEndpoints
  >
    ? ClientPort<TRpcEndpoints, TChannelEndpoints, TSignalEndpoints, TWritableSignalEndpoints>
    : TBackendInterfaceOrCreator extends (
          ...ars: Array<any>
        ) => BackendInterface<
          infer _TContext,
          infer TRpcEndpoints,
          infer TChannelEndpoints,
          infer TSignalEndpoints,
          infer TWritableSignalEndpoints
        >
      ? ClientPort<TRpcEndpoints, TChannelEndpoints, TSignalEndpoints, TWritableSignalEndpoints>
      : never;
