import { BufferedEvent, SimpleLogger, type LoggerInterface } from "@lmstudio/lms-common";
import {
  ClientTransport,
  type BackendInterface,
  type ChannelEndpointsSpecBase,
  type ClientToServerMessage,
  type ClientTransportFactory,
  type RpcEndpointsSpecBase,
  type ServerToClientMessage,
  type SignalEndpointsSpecBase,
  type WritableSignalEndpointsSpecBase,
} from "@lmstudio/lms-communication";
import { ClientPort } from "@lmstudio/lms-communication-client";
import {
  GenericServerTransport,
  ServerPort,
  type Context,
  type ContextCreator,
} from "@lmstudio/lms-communication-server";

/**
 * A controllable client transport that allows simulating disconnect/reconnect events.
 * Unlike GenericClientTransport, this stores the `connected` callback so it can be
 * called again to simulate reconnection.
 */
class ControllableClientTransport extends ClientTransport {
  protected readonly logger;
  private readonly connectedCallback: () => void;
  private readonly erroredCallback: (error: any) => void;
  private isConnected = false;

  public constructor(
    onMessage: BufferedEvent<ServerToClientMessage>,
    private readonly sendMessage: (message: ClientToServerMessage) => void,
    receivedMessage: (message: ServerToClientMessage) => void,
    connected: () => void,
    errored: (error: any) => void,
    parentLogger?: LoggerInterface,
  ) {
    super();
    this.logger = new SimpleLogger("ControllableClientTransport", parentLogger);
    this.connectedCallback = connected;
    this.erroredCallback = errored;

    // Set up message routing
    onMessage.subscribe(message => {
      if (!this.isConnected) {
        // Drop messages when disconnected
        return;
      }
      let parsed: ServerToClientMessage;
      try {
        parsed = this.parseIncomingMessage(message);
      } catch (error) {
        this.logger.warn("Received invalid message from server:", message);
        return;
      }
      receivedMessage(parsed);
    });

    // Start connected
    this.isConnected = true;
    this.connectedCallback();
  }

  /**
   * Simulate a transport error/disconnection.
   * This triggers ClientPort.errored() which tracks signals for recovery.
   */
  public simulateDisconnect(error?: Error): void {
    if (!this.isConnected) {
      return;
    }
    this.isConnected = false;
    this.erroredCallback(error ?? new Error("Simulated transport disconnect"));
  }

  /**
   * Simulate reconnection.
   * This triggers ClientPort.onConnected() which calls recoverFromError() on tracked signals.
   */
  public simulateReconnect(): void {
    if (this.isConnected) {
      return;
    }
    this.isConnected = true;
    this.connectedCallback();
  }

  /**
   * Check if the transport is currently in connected state.
   */
  public getIsConnected(): boolean {
    return this.isConnected;
  }

  protected override sendViaTransport(message: ClientToServerMessage): void {
    if (!this.isConnected) {
      // Drop messages when disconnected
      return;
    }
    this.sendMessage(message);
  }

  public override ensureConnectedOrStartConnection(): void {
    if (!this.isConnected) {
      this.simulateReconnect();
    }
  }
}

export interface ControllableMockedPorts<
  TContext extends Context,
  TRpcEndpoints extends RpcEndpointsSpecBase,
  TChannelEndpoints extends ChannelEndpointsSpecBase,
  TSignalEndpoints extends SignalEndpointsSpecBase,
  TWritableSignalEndpoints extends WritableSignalEndpointsSpecBase,
> {
  clientPort: ClientPort<
    TRpcEndpoints,
    TChannelEndpoints,
    TSignalEndpoints,
    TWritableSignalEndpoints
  >;
  serverPort: ServerPort<
    TContext,
    TRpcEndpoints,
    TChannelEndpoints,
    TSignalEndpoints,
    TWritableSignalEndpoints
  >;
  /**
   * Simulate a transport disconnection on the client side.
   * This triggers ClientPort.errored() which:
   * - Fails all open channels and RPCs
   * - Tracks open signals for recovery
   * - Calls errored() on each signal (which sets hasError = true)
   */
  simulateDisconnect: (error?: Error) => void;
  /**
   * Simulate reconnection on the client side.
   * This triggers ClientPort.onConnected() which:
   * - Calls recoverFromError() on all tracked signals
   * - Signals with active subscribers will resubscribe to the server
   */
  simulateReconnect: () => void;
  /**
   * Check if the transport is currently in connected state.
   */
  isConnected: () => boolean;
}

/**
 * Creates a mocked client/server port pair with controllable transport.
 * This is similar to `createMockedPorts` but allows simulating disconnect/reconnect
 * for testing signal error recovery.
 *
 * The server-side uses a standard GenericServerTransport - we only control the client
 * side. When the client "reconnects", it sends new signalSubscribe messages and the
 * server creates new subscriptions.
 *
 * Note: On disconnect, the server-side subscriptions become orphans (subscribeIds no
 * longer match). This is acceptable for testing purposes.
 */
export function createControllableMockedPorts<
  TContext extends Context,
  TRpcEndpoints extends RpcEndpointsSpecBase,
  TChannelEndpoints extends ChannelEndpointsSpecBase,
  TSignalEndpoints extends SignalEndpointsSpecBase,
  TWritableSignalEndpoints extends WritableSignalEndpointsSpecBase,
>(
  backendInterface: BackendInterface<
    TContext,
    TRpcEndpoints,
    TChannelEndpoints,
    TSignalEndpoints,
    TWritableSignalEndpoints
  >,
  contextCreator: ContextCreator<TContext>,
): ControllableMockedPorts<
  TContext,
  TRpcEndpoints,
  TChannelEndpoints,
  TSignalEndpoints,
  TWritableSignalEndpoints
> {
  // Bidirectional message channels (same as createMockedPorts)
  const [toClientMessageEvent, emitToClientMessageEvent] =
    BufferedEvent.create<ServerToClientMessage>();
  const [toServerMessageEvent, emitToServerMessageEvent] =
    BufferedEvent.create<ClientToServerMessage>();
  // We don't use close events - disconnect is simulated via the controllable transport
  const [_clientCloseEvent] = BufferedEvent.create<void>();
  const [serverCloseEvent] = BufferedEvent.create<void>();

  // Track the controllable transport instance for expose control methods
  let clientTransport: ControllableClientTransport;

  const clientTransportFactory: ClientTransportFactory = (
    receivedMessage,
    connected,
    errored,
    parentLogger,
  ) => {
    clientTransport = new ControllableClientTransport(
      toClientMessageEvent,
      emitToServerMessageEvent,
      receivedMessage,
      connected,
      errored,
      parentLogger,
    );
    return clientTransport;
  };

  // Server uses standard GenericServerTransport
  const serverTransportFactory = GenericServerTransport.createFactory(
    toServerMessageEvent,
    serverCloseEvent,
    emitToClientMessageEvent,
  );

  const logger = new SimpleLogger("ControllableMockedCommunication");

  const serverPort = new ServerPort(backendInterface, contextCreator, serverTransportFactory, {
    parentLogger: logger,
  });
  const clientPort = new ClientPort(backendInterface, clientTransportFactory, {
    parentLogger: logger,
  });

  return {
    clientPort,
    serverPort,
    simulateDisconnect: (error?: Error) => clientTransport.simulateDisconnect(error),
    simulateReconnect: () => clientTransport.simulateReconnect(),
    isConnected: () => clientTransport.getIsConnected(),
  };
}
