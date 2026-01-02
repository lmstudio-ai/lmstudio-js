import { SimpleLogger, type BufferedEvent, type LoggerInterface } from "@lmstudio/lms-common";
import type {
  ClientToServerMessage,
  ClientTransportFactory,
  ServerToClientMessage,
} from "@lmstudio/lms-communication";
import { ClientTransport } from "@lmstudio/lms-communication";

export class GenericClientTransport extends ClientTransport {
  protected readonly logger;
  private closed = false;
  public constructor(
    onMessage: BufferedEvent<ServerToClientMessage>,
    onClose: BufferedEvent<void>,
    private readonly sendMessage: (message: ClientToServerMessage) => void,
    private readonly receivedMessage: (message: ServerToClientMessage) => void,
    connected: () => void,
    private readonly errored: (error: any) => void,
    parentLogger?: LoggerInterface,
  ) {
    super();
    this.logger = new SimpleLogger("GenericClientTransport", parentLogger);
    onMessage.subscribe(message => {
      let parsed: ServerToClientMessage;
      try {
        parsed = this.parseIncomingMessage(message);
      } catch (error) {
        this.logger.warn("Received invalid message from server:", message);
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
    // GenericClientTransport is always "connected" - call immediately
    connected();
  }
  public static createFactory(
    onMessage: BufferedEvent<ServerToClientMessage>,
    onClose: BufferedEvent<void>,
    sendMessage: (message: ClientToServerMessage) => void,
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
      );
  }
  public override sendViaTransport(message: ClientToServerMessage) {
    this.sendMessage(message);
  }
}
