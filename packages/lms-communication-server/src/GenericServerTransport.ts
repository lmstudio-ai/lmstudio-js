import { SimpleLogger, type BufferedEvent, type LoggerInterface } from "@lmstudio/lms-common";
import type {
  ClientToServerMessage,
  ServerToClientMessage,
  ServerTransportFactory,
  TransportOpts,
} from "@lmstudio/lms-communication";
import { ServerTransport } from "@lmstudio/lms-communication";

/** A single connection backed by caller-owned events. The owner must close it when the port fails. */
export class GenericServerTransport<TMetadata = unknown> extends ServerTransport<TMetadata> {
  protected readonly logger;
  private closed = false;
  /** Validates incoming messages and handshake metadata before delivering them to the port. */
  public constructor(
    onMessage: Pick<BufferedEvent<unknown>, "subscribe">,
    onClose: BufferedEvent<void>,
    private readonly sendMessage: (message: ServerToClientMessage) => void,
    private readonly receivedMessage: (message: ClientToServerMessage) => void,
    private readonly errored: (error: unknown) => void,
    parentLogger?: LoggerInterface,
    opts: TransportOpts<TMetadata> = {},
  ) {
    super(opts);
    this.logger = new SimpleLogger("GenericServerTransport", parentLogger);
    onMessage.subscribe(message => {
      if (this.closed) return;
      let parsed: ClientToServerMessage;
      try {
        parsed = this.parseIncomingMessage(message);
      } catch (error) {
        this.logger.error("Received invalid message from client:", error);
        this.closed = true;
        this.errored(error);
        return;
      }
      this.receivedMessage(parsed);
    });
    onClose.subscribeOnce(() => {
      if (this.closed) {
        return;
      }
      this.closed = true;
      this.errored(new Error("Server closed the connection"));
    });
  }
  /** Supplies connection-specific handshake configuration to the server transport. */
  public static createFactory<TMetadata = unknown>(
    onMessage: Pick<BufferedEvent<unknown>, "subscribe">,
    onClose: BufferedEvent<void>,
    sendMessage: (message: ServerToClientMessage) => void,
    opts: TransportOpts<TMetadata> = {},
  ): ServerTransportFactory {
    return (receivedMessage, errored, parentLogger) =>
      new GenericServerTransport(
        onMessage,
        onClose,
        sendMessage,
        receivedMessage,
        errored,
        parentLogger,
        opts,
      );
  }
  /** Prevents late handlers from sending replies after this connection has failed. */
  public override sendViaTransport(message: ServerToClientMessage) {
    if (this.closed) {
      throw new Error("Cannot send through a closed server transport.");
    }
    this.sendMessage(message);
  }
}
