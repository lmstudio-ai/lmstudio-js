import { SimpleLogger, type BufferedEvent, type LoggerInterface } from "@lmstudio/lms-common";
import type {
  ClientToServerMessage,
  ClientTransportFactory,
  ServerToClientMessage,
  TransportOpts,
} from "@lmstudio/lms-communication";
import { ClientTransport } from "@lmstudio/lms-communication";

export class GenericClientTransport<TMetadata = unknown> extends ClientTransport<TMetadata> {
  protected readonly logger;
  private closed = false;
  /** Validates incoming messages and handshake metadata before delivering them to the port. */
  public constructor(
    onMessage: Pick<BufferedEvent<unknown>, "subscribe">,
    onClose: BufferedEvent<void | (() => Error)>,
    private readonly sendMessage: (message: ClientToServerMessage) => void,
    private readonly receivedMessage: (message: ServerToClientMessage) => void,
    connected: () => void,
    private readonly errored: (error: unknown) => void,
    parentLogger?: LoggerInterface,
    opts: TransportOpts<TMetadata> = {},
  ) {
    super(opts);
    this.logger = new SimpleLogger("GenericClientTransport", parentLogger);
    onMessage.subscribe(message => {
      if (this.closed) return;
      let parsed: ServerToClientMessage;
      try {
        parsed = this.parseIncomingMessage(message);
      } catch (error) {
        this.logger.error("Received invalid message from server:", error);
        this.closed = true;
        this.errored(error);
        return;
      }
      this.receivedMessage(parsed);
    });
    onClose.subscribeOnce(errorFactory => {
      if (this.closed) {
        return;
      }
      this.closed = true;
      this.errored(
        errorFactory !== undefined ? errorFactory() : new Error("Server closed the connection"),
      );
    });
    // GenericClientTransport is always "connected" - call immediately
    connected();
  }
  /** Supplies connection-specific handshake configuration to the client transport. */
  public static createFactory<TMetadata = unknown>(
    onMessage: Pick<BufferedEvent<unknown>, "subscribe">,
    onClose: BufferedEvent<void | (() => Error)>,
    sendMessage: (message: ClientToServerMessage) => void,
    opts: TransportOpts<TMetadata> = {},
  ): ClientTransportFactory {
    return (receivedMessage, connected, errored, parentLogger) =>
      new GenericClientTransport(
        onMessage,
        onClose,
        sendMessage,
        receivedMessage,
        connected,
        errored,
        parentLogger,
        opts,
      );
  }
  public override sendViaTransport(message: ClientToServerMessage) {
    this.sendMessage(message);
  }
}
