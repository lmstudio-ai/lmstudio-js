import { SimpleLogger, type LoggerInterface } from "@lmstudio/lms-common";
import type {
  ClientToServerMessage,
  ServerToClientMessage,
  ServerTransportFactory,
} from "@lmstudio/lms-communication";
import { ServerTransport } from "@lmstudio/lms-communication";
import { type MessagePortMain } from "./electronTypes";

export class IpcServerTransport extends ServerTransport {
  protected readonly logger: SimpleLogger;
  private closed = false;
  public constructor(
    private readonly electronPort: MessagePortMain,
    private readonly receivedMessage: (message: ClientToServerMessage) => void,
    private readonly errored: (error: any) => void,
    parentLogger?: LoggerInterface,
  ) {
    super();
    this.logger = new SimpleLogger("IpcServerTransport", parentLogger);
    this.electronPort.on("message", event => {
      let parsed: ClientToServerMessage;
      try {
        parsed = this.parseIncomingMessage(event.data);
      } catch (error) {
        this.logger.warn("Received invalid message from client:", event.data);
        return;
      }
      this.receivedMessage(parsed);
    });
    this.electronPort.start();
    this.electronPort.on("close", () => {
      if (this.closed) {
        return;
      }
      this.closed = true;
      this.errored(new Error("MessagePort closed by the client"));
    });
  }
  public static createFactory(electronPort: MessagePortMain): ServerTransportFactory {
    return (receivedMessage, errored) =>
      new IpcServerTransport(electronPort, receivedMessage, errored);
  }
  public override sendViaTransport(message: ServerToClientMessage) {
    this.electronPort!.postMessage(message);
  }
}
