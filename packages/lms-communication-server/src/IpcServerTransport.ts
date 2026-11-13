import { SimpleLogger, type LoggerInterface } from "@lmstudio/lms-common";
import type {
  ClientToServerMessage,
  PDSFrame,
  ServerToClientMessage,
  ServerTransportFactory,
} from "@lmstudio/lms-communication";
import { isPDSFrame, ServerTransport, toCloneablePDSFrame } from "@lmstudio/lms-communication";
import { type MessagePortMain } from "./electronTypes";

/**
 * Serves one renderer over an Electron MessagePort. The renderer ships with the app, so parallel
 * data streams are always on. Frames travel as plain objects next to messages.
 */
export class IpcServerTransport extends ServerTransport {
  protected readonly logger: SimpleLogger;
  private closed = false;
  public constructor(
    private readonly electronPort: MessagePortMain,
    private readonly receivedMessage: (message: ClientToServerMessage) => void,
    private readonly errored: (error: any) => void,
    receivedPDSFrame: (frame: PDSFrame) => void,
    parentLogger?: LoggerInterface,
  ) {
    super({ sendPDSFrame: frame => electronPort.postMessage(toCloneablePDSFrame(frame)) });
    this.logger = new SimpleLogger("IpcServerTransport", parentLogger);
    this.electronPort.on("message", event => {
      if (isPDSFrame(event.data)) {
        receivedPDSFrame(event.data);
        return;
      }
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
    return (receivedMessage, errored, parentLogger, receivedPDSFrame) =>
      new IpcServerTransport(
        electronPort,
        receivedMessage,
        errored,
        receivedPDSFrame,
        parentLogger,
      );
  }
  public override sendViaTransport(message: ServerToClientMessage) {
    this.electronPort!.postMessage(message);
  }
}
