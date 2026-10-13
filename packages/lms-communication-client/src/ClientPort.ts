import { applyPatches, type Patch } from "@lmstudio/immer-with-plugins";
import {
  getCurrentStack,
  LazySignal,
  makePromise,
  OWLSignal,
  SimpleLogger,
  type LoggerInterface,
  type NotAvailable,
  type Setter,
  type WriteTag,
} from "@lmstudio/lms-common";
import {
  Channel,
  PayloadCodec,
  deserialize,
  normalizeCommunicationWarningKind,
  serialize,
  type BackendInterface,
  type ChannelEndpoint,
  type ChannelEndpointsSpecBase,
  type ClientToServerMessage,
  type ClientTransport,
  type ClientTransportFactory,
  type CommunicationWarningKind,
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
  wireValue: unknown;
  receivedPatches: (newValue: any, patches: Array<Patch>, tags: Array<WriteTag>) => void;
  errored: (error: any) => void;
  stack?: string;
  signal: LazySignal<any>;
}

interface OpenWritableSignalSubscription {
  endpoint: WritableSignalEndpoint;
  getValue: () => any;
  wireValue: unknown;
  receivedPatches: (newValue: any, patches: Array<Patch>, tags: Array<WriteTag>) => void;
  firstUpdateReceived: boolean;
  errored: (error: any) => void;
  stack?: string;
  signal: OWLSignal<any>;
}

function defaultErrorDeserializer(
  serialized: SerializedLMSExtendedError,
  directCause: string,
  stack?: string,
): Error {
  return fromSerializedError(serialized, directCause, stack);
}

export interface ClientPortCommunicationWarning {
  direction: "produced" | "received";
  kind: CommunicationWarningKind;
  warning: string;
}

export class ClientPort<
  TRpcEndpoints extends RpcEndpointsSpecBase,
  TChannelEndpoints extends ChannelEndpointsSpecBase,
  TSignalEndpoints extends SignalEndpointsSpecBase,
  TWritableSignalEndpoints extends WritableSignalEndpointsSpecBase,
> {
  private readonly transport: ClientTransport;
  private readonly payloadCodec: PayloadCodec;
  private readonly logger;
  private openChannels = new Map<number, OpenChannel>();
  private ongoingRpcs = new Map<number, OngoingRpc>();
  private openSignalSubscriptions = new Map<number, OpenSignalSubscription>();
  private openWritableSignalSubscriptions = new Map<number, OpenWritableSignalSubscription>();
  private openCommunicationsCount = 0;
  /**
   * Signals that errored due to transport-level issues and can be recovered on reconnection.
   */
  private recoverableSignals = new Set<LazySignal<any>>();
  private recoverableWritableSignals = new Set<OWLSignal<any>>();
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
  private readonly onCommunicationWarning?: (
    communicationWarning: ClientPortCommunicationWarning,
  ) => void;

  /** Creates a port with connection-specific payload handling. */
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
      onCommunicationWarning,
      payloadCodec,
    }: {
      parentLogger?: LoggerInterface;
      payloadCodec?: PayloadCodec;
      errorDeserializer?: (
        serialized: SerializedLMSExtendedError,
        directCause: string,
        stack?: string,
      ) => Error;
      verboseErrorMessage?: boolean;
      onCommunicationWarning?: (communicationWarning: ClientPortCommunicationWarning) => void;
    } = {},
  ) {
    this.logger = new SimpleLogger("ClientPort", parentLogger);
    this.payloadCodec = payloadCodec ?? new PayloadCodec();
    this.errorDeserializer = errorDeserializer ?? defaultErrorDeserializer;
    this.verboseErrorMessage = verboseErrorMessage ?? true;
    this.onCommunicationWarning = onCommunicationWarning;
    this.transport = factory(this.receivedMessage, this.onConnected, this.errored, this.logger);
  }

  private communicationWarning(warning: string, kind: CommunicationWarningKind = "unknown") {
    if (this.producedCommunicationWarningsCount >= 5) {
      return;
    }
    if (this.onCommunicationWarning === undefined) {
      this.logger.warnText`
        Produced communication warning: ${warning}
        
        This is usually caused by communication protocol incompatibility. Please make sure you are
        using the up-to-date versions of the SDK and LM Studio.
      `;
    }
    this.safeSend(
      {
        type: "communicationWarning",
        warning,
        kind,
      },
      "communicationWarning",
    );
    this.reportCommunicationWarning({
      direction: "produced",
      kind,
      warning,
    });
    this.producedCommunicationWarningsCount++;
    if (this.onCommunicationWarning === undefined && this.producedCommunicationWarningsCount >= 5) {
      this.logger.errorText`
        5 communication warnings have been produced. Further warnings will not be printed.
      `;
    }
  }

  private safeSend(message: ClientToServerMessage, reason?: string): void {
    try {
      this.transport.send(message);
    } catch (error) {
      if (reason === undefined) {
        this.logger.error("Error sending client message:", error);
      } else {
        this.logger.error("Error sending client message:", reason, error);
      }
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

  /** Delivers a decoded packet or terminates the channel on conversion failure. */
  private receivedChannelSend(message: ServerToClientMessage & { type: "channelSend" }) {
    const openChannel = this.openChannels.get(message.channelId);
    if (openChannel === undefined) {
      this.communicationWarning(
        `Received channelSend for unknown channel ${message.channelId}`,
        "channelUnknown",
      );
      return;
    }
    const parsed = this.payloadCodec.decode({
      schema: openChannel.endpoint.toClientPacket,
      serialization: openChannel.endpoint.serialization,
      value: message.message,
    });
    if (parsed.success === false) {
      this.failChannel(message.channelId, parsed.error);
      return;
    }
    openChannel.receivedMessage(parsed.data);
  }

  /** Settles a channel's listeners and pending acknowledgements after a local failure. */
  private failChannel(channelId: number, error: unknown): void {
    const channel = this.openChannels.get(channelId);
    if (channel === undefined) {
      return;
    }
    this.openChannels.delete(channelId);
    channel.errored(error);
    this.updateOpenCommunicationsCount();
  }

  private receivedChannelAck(message: ServerToClientMessage & { type: "channelAck" }) {
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

  private receivedChannelClose(message: ServerToClientMessage & { type: "channelClose" }) {
    const openChannel = this.openChannels.get(message.channelId);
    if (openChannel === undefined) {
      this.communicationWarning(
        `Received channelClose for unknown channel, channelId = ${message.channelId}`,
        "channelUnknown",
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
        "channelUnknown",
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

  /** Settles the call even when its result cannot be decoded. */
  private receivedRpcResult(message: ServerToClientMessage & { type: "rpcResult" }) {
    const ongoingRpc = this.ongoingRpcs.get(message.callId);
    if (ongoingRpc === undefined) {
      this.communicationWarning(
        `Received rpcResult for unknown RPC ${message.callId}`,
        "rpcUnknown",
      );
      return;
    }
    const parsed = this.payloadCodec.decode({
      schema: ongoingRpc.endpoint.returns,
      serialization: ongoingRpc.endpoint.serialization,
      value: message.result,
    });
    this.ongoingRpcs.delete(message.callId);
    this.updateOpenCommunicationsCount();
    if (parsed.success === false) {
      ongoingRpc.reject(parsed.error);
    } else {
      ongoingRpc.resolve(parsed.data);
    }
  }

  private receivedRpcError(message: ServerToClientMessage & { type: "rpcError" }) {
    const ongoingRpc = this.ongoingRpcs.get(message.callId);
    if (ongoingRpc === undefined) {
      this.communicationWarning(
        `Received rpcError for unknown rpc, callId = ${message.callId}`,
        "rpcUnknown",
      );
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

  /** Applies patches in their wire representation and publishes matching local patches. */
  private receivedSignalUpdate(
    message: ServerToClientMessage & { type: "signalUpdate" | "writableSignalUpdate" },
  ) {
    const writable = message.type === "writableSignalUpdate";
    const subscription = writable
      ? this.openWritableSignalSubscriptions.get(message.subscribeId)
      : this.openSignalSubscriptions.get(message.subscribeId);
    // Updates can arrive after unsubscribe, especially when React StrictMode resubscribes.
    if (subscription === undefined) {
      return;
    }
    try {
      const { endpoint } = subscription;
      const preservesPatches = this.payloadCodec.preservesPatches(endpoint.signalData);
      const patches = message.patches.map(patch => deserialize(endpoint.serialization, patch));
      const before = preservesPatches ? subscription.getValue() : subscription.wireValue;
      Object.freeze(before);
      const wireValue: unknown = applyPatches(before, patches);
      let value = wireValue;
      if (!endpoint.skipSignalDataValidation || !preservesPatches) {
        const parsed = this.payloadCodec.decode({ schema: endpoint.signalData, value: wireValue });
        if (parsed.success === false) {
          throw parsed.error;
        }
        // Validation-only parsers may clone. Keep the patch result on the ordinary path.
        if (!preservesPatches) {
          value = parsed.data;
        }
      }
      subscription.wireValue = wireValue;
      if ("firstUpdateReceived" in subscription) {
        subscription.firstUpdateReceived = true;
      }
      subscription.receivedPatches(
        value,
        preservesPatches ? patches : [{ op: "replace", path: [], value }],
        message.tags,
      );
    } catch (error) {
      this.failSignalSubscription({ subscribeId: message.subscribeId, writable, error });
    }
  }

  /** Stops a failed subscription so subsequent patches cannot use an invalid base. */
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
    if (subscription === undefined) {
      return;
    }
    subscriptions.delete(subscribeId);
    subscription.errored(error);
    this.safeSend({
      type: writable ? "writableSignalUnsubscribe" : "signalUnsubscribe",
      subscribeId,
    });
    this.updateOpenCommunicationsCount();
  }

  private receivedSignalError(message: ServerToClientMessage & { type: "signalError" }) {
    const openSignalSubscription = this.openSignalSubscriptions.get(message.subscribeId);
    if (openSignalSubscription === undefined) {
      this.communicationWarning(
        `Received signalError for unknown signal, subscribeId = ${message.subscribeId}`,
        "signalUnknown",
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

  private receivedWritableSignalError(
    message: ServerToClientMessage & { type: "writableSignalError" },
  ) {
    const openSignalSubscription = this.openWritableSignalSubscriptions.get(message.subscribeId);
    if (openSignalSubscription === undefined) {
      this.communicationWarning(
        `Received writableSignalError for unknown signal, subscribeId = ${message.subscribeId}`,
        "writableSignalUnknown",
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
    const kind = normalizeCommunicationWarningKind(message.kind);
    if (this.onCommunicationWarning === undefined) {
      this.logger.warnText`
        Received communication warning from the server (${kind}): ${message.warning}
        
        This is usually caused by communication protocol incompatibility. Please make sure you are
        using the up-to-date versions of the SDK and LM Studio.

        Note: This warning was received from the server and is printed on the client for convenience.
      `;
    }
    this.reportCommunicationWarning({
      direction: "received",
      kind,
      warning: message.warning,
    });
  }

  private reportCommunicationWarning(communicationWarning: ClientPortCommunicationWarning): void {
    if (this.onCommunicationWarning === undefined) {
      return;
    }
    try {
      this.onCommunicationWarning(communicationWarning);
    } catch (error) {
      this.logger.error("Error in onCommunicationWarning callback:", error);
    }
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
        this.receivedSignalUpdate(message);
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
  /**
   * Called when the transport connection is established.
   * Triggers recovery for all signals that errored due to transport issues.
   */
  private onConnected = () => {
    for (const signal of this.recoverableSignals) {
      signal.recoverFromError();
    }
    this.recoverableSignals.clear();

    for (const signal of this.recoverableWritableSignals) {
      signal.recoverFromError();
    }
    this.recoverableWritableSignals.clear();
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
    // Track signals for recovery before erroring them
    for (const subscription of this.openSignalSubscriptions.values()) {
      this.recoverableSignals.add(subscription.signal);
      subscription.errored(error);
    }
    this.openSignalSubscriptions.clear();
    for (const subscription of this.openWritableSignalSubscriptions.values()) {
      this.recoverableWritableSignals.add(subscription.signal);
      subscription.errored(error);
    }
    this.openWritableSignalSubscriptions.clear();
    this.updateOpenCommunicationsCount();
  };
  /** Queues a call while leaving peer-dependent encoding to the ready transport. */
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
    const callId = this.nextChannelId++;
    const { promise, resolve, reject } = makePromise<TRpcEndpoints[TEndpointName]["returns"]>();
    this.ongoingRpcs.set(callId, { endpoint, stack: stack ?? getCurrentStack(1), resolve, reject });
    this.updateOpenCommunicationsCount();
    this.transport.sendDeferred(
      () =>
        !this.ongoingRpcs.has(callId)
          ? null
          : {
              type: "rpcCall",
              endpoint: endpointName,
              callId,
              parameter: this.payloadCodec.encode({
                schema: endpoint.parameter,
                serialization: endpoint.serialization,
                value: parameter,
              }),
            },
      error => {
        this.ongoingRpcs.delete(callId);
        this.updateOpenCommunicationsCount();
        reject(error);
      },
    );
    return await promise;
  }

  /** Creates a channel whose creation and packet encoding use the current connection. */
  public createChannel<TEndpointName extends keyof TChannelEndpoints & string>(
    endpointName: TEndpointName,
    param: TChannelEndpoints[TEndpointName]["creationParameter"],
    onMessage?: (message: TChannelEndpoints[TEndpointName]["toClientPacket"]) => void,
    { stack }: { stack?: string } = {},
  ): Channel<
    TChannelEndpoints[TEndpointName]["toClientPacket"],
    TChannelEndpoints[TEndpointName]["toServerPacket"]
  > {
    const endpoint = this.backendInterface.getChannelEndpoint(endpointName);
    if (endpoint === undefined) {
      throw new Error(`No channel endpoint with name ${endpointName}`);
    }
    const creationParameter = endpoint.creationParameter.parse(param);
    const channelId = this.nextChannelId++;
    const openChannel: OpenChannel = {
      endpoint,
      stack: stack ?? getCurrentStack(1),
      ...Channel.create((packet, ackId) => {
        this.transport.sendDeferred(
          () =>
            !this.openChannels.has(channelId)
              ? null
              : {
                  type: "channelSend",
                  channelId,
                  ackId,
                  message: this.payloadCodec.encode({
                    schema: endpoint.toServerPacket,
                    serialization: endpoint.serialization,
                    value: endpoint.toServerPacket.parse(packet),
                  }),
                },
          error => this.failChannel(channelId, error),
        );
      }),
    };
    if (onMessage !== undefined) {
      openChannel.channel.onMessage.subscribe(onMessage);
    }
    this.openChannels.set(channelId, openChannel);
    this.updateOpenCommunicationsCount();
    this.transport.sendDeferred(
      () =>
        !this.openChannels.has(channelId)
          ? null
          : {
              type: "channelCreate",
              endpoint: endpointName,
              channelId,
              creationParameter: this.payloadCodec.encode({
                schema: endpoint.creationParameter,
                serialization: endpoint.serialization,
                value: creationParameter,
              }),
            },
      error => this.failChannel(channelId, error),
    );
    return openChannel.channel;
  }

  /** Re-encodes creation parameters for each subscription, including after reconnect. */
  public createSignal<TEndpointName extends keyof TSignalEndpoints & string>(
    endpointName: TEndpointName,
    param: TSignalEndpoints[TEndpointName]["creationParameter"],
    { stack }: { stack?: string } = {},
  ): LazySignal<TSignalEndpoints[TEndpointName]["signalData"] | NotAvailable> {
    const endpoint = this.backendInterface.getSignalEndpoint(endpointName);
    if (endpoint === undefined) {
      throw new Error(`No signal endpoint with name ${endpointName}`);
    }
    const creationParameter = endpoint.creationParameter.parse(param);
    stack = stack ?? getCurrentStack(1);
    const signal = LazySignal.createWithoutInitialValue<
      TSignalEndpoints[TEndpointName]["signalData"]
    >((setDownstream, errorListener) => {
      const subscribeId = this.nextSubscribeId++;
      this.openSignalSubscriptions.set(subscribeId, {
        endpoint,
        getValue: () => signal.get(),
        wireValue: LazySignal.NOT_AVAILABLE,
        receivedPatches: setDownstream.withValueAndPatches,
        errored: errorListener,
        stack,
        signal,
      });
      this.updateOpenCommunicationsCount();
      this.transport.sendDeferred(
        () =>
          !this.openSignalSubscriptions.has(subscribeId)
            ? null
            : {
                type: "signalSubscribe",
                endpoint: endpointName,
                subscribeId,
                creationParameter: this.payloadCodec.encode({
                  schema: endpoint.creationParameter,
                  serialization: endpoint.serialization,
                  value: creationParameter,
                }),
              },
        error => {
          this.logger.error("Failed to subscribe to signal:", error);
          this.failSignalSubscription({ subscribeId, writable: false, error });
        },
      );
      return () => {
        this.safeSend({ type: "signalUnsubscribe", subscribeId }, "signalUnsubscribe");
        this.openSignalSubscriptions.delete(subscribeId);
        this.recoverableSignals.delete(signal);
        this.updateOpenCommunicationsCount();
      };
    });
    return signal;
  }

  /** Preserves optimistic write tags while converting whole values when patches cannot cross the boundary. */
  public createWritableSignal<TEndpointName extends keyof TWritableSignalEndpoints & string>(
    endpointName: TEndpointName,
    param: TWritableSignalEndpoints[TEndpointName]["creationParameter"],
    { stack }: { stack?: string } = {},
  ): [
    signal: OWLSignal<TWritableSignalEndpoints[TEndpointName]["signalData"] | NotAvailable>,
    setter: Setter<TWritableSignalEndpoints[TEndpointName]["signalData"]>,
  ] {
    const endpoint = this.backendInterface.getWritableSignalEndpoint(endpointName);
    if (endpoint === undefined) {
      throw new Error(`No writable signal endpoint with name ${endpointName}`);
    }
    const creationParameter = endpoint.creationParameter.parse(param);
    stack = stack ?? getCurrentStack(1);
    let currentSubscribeId: number | null = null;
    const [signal, setter] = OWLSignal.createWithoutInitialValue<
      TWritableSignalEndpoints[TEndpointName]["signalData"]
    >(
      (setDownstream, errorListener) => {
        const subscribeId = this.nextWritableSubscribeId++;
        currentSubscribeId = subscribeId;
        this.openWritableSignalSubscriptions.set(subscribeId, {
          endpoint,
          getValue: () => signal.getPessimistic(),
          wireValue: LazySignal.NOT_AVAILABLE,
          receivedPatches: setDownstream.withValueAndPatches,
          firstUpdateReceived: false,
          errored: errorListener,
          stack,
          signal,
        });
        this.updateOpenCommunicationsCount();
        this.transport.sendDeferred(
          () =>
            !this.openWritableSignalSubscriptions.has(subscribeId)
              ? null
              : {
                  type: "writableSignalSubscribe",
                  endpoint: endpointName,
                  subscribeId,
                  creationParameter: this.payloadCodec.encode({
                    schema: endpoint.creationParameter,
                    serialization: endpoint.serialization,
                    value: creationParameter,
                  }),
                },
          error => this.failSignalSubscription({ subscribeId, writable: true, error }),
        );
        return () => {
          currentSubscribeId = null;
          this.safeSend(
            { type: "writableSignalUnsubscribe", subscribeId },
            "writableSignalUnsubscribe",
          );
          this.openWritableSignalSubscriptions.delete(subscribeId);
          this.recoverableWritableSignals.delete(signal);
          this.updateOpenCommunicationsCount();
        };
      },
      (data, patches, tags) => {
        const subscribeId = currentSubscribeId;
        if (
          subscribeId === null ||
          this.openWritableSignalSubscriptions.get(subscribeId)?.firstUpdateReceived !== true
        ) {
          return false;
        }
        this.transport.sendDeferred(
          () => {
            if (!this.openWritableSignalSubscriptions.has(subscribeId)) {
              return null;
            }
            const wirePatches = this.payloadCodec.preservesPatches(endpoint.signalData)
              ? patches
              : [
                  {
                    op: "replace" as const,
                    path: [],
                    value: this.payloadCodec.toWire(endpoint.signalData, data),
                  },
                ];
            return {
              type: "writableSignalUpdate",
              subscribeId,
              tags,
              patches: wirePatches.map(patch => serialize(endpoint.serialization, patch)),
            };
          },
          error => this.failSignalSubscription({ subscribeId, writable: true, error }),
        );
        return true;
      },
    );
    return [signal, setter];
  }

  public ensureConnectedOrStartConnection(): void {
    this.transport.ensureConnectedOrStartConnection();
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
