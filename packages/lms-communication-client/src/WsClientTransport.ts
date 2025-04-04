import { SimpleLogger, type LoggerInterface } from "@lmstudio/lms-common";
import type {
  ClientToServerMessage,
  ClientTransportFactory,
  ServerToClientMessage,
  WsMessageEvent,
} from "@lmstudio/lms-communication";
import { ClientTransport } from "@lmstudio/lms-communication";
import { WebSocket } from "@lmstudio/lms-isomorphic";

enum WsClientTransportStatus {
  Disconnected = "DISCONNECTED",
  Connecting = "CONNECTING",
  Connected = "CONNECTED",
}

export class WsClientTransport extends ClientTransport {
  protected readonly logger: SimpleLogger;
  protected ws: WebSocket | null = null;
  private queuedMessages: Array<ClientToServerMessage> = [];
  private status = WsClientTransportStatus.Disconnected;
  private resolvedUrl: string | null = null;
  /**
   * Whether the underlying socket should hold the process open.
   */
  private shouldRef = false;
  protected constructor(
    private readonly url: string | Promise<string>,
    private readonly receivedMessage: (message: ServerToClientMessage) => void,
    private readonly errored: (error: any) => void,
    parentLogger?: LoggerInterface,
  ) {
    super();
    this.logger = new SimpleLogger("WsClientTransport", parentLogger);
  }
  public static createWsClientTransportFactory(
    url: string | Promise<string>,
  ): ClientTransportFactory {
    return (receivedMessage, errored, parentLogger) =>
      new WsClientTransport(url, receivedMessage, errored, parentLogger);
  }
  private connect() {
    if (this.status !== WsClientTransportStatus.Disconnected) {
      this.logger.warn("connect() called while not disconnected");
      return;
    }
    this.status = WsClientTransportStatus.Connecting;
    Promise.resolve(this.url).then(url => {
      this.resolvedUrl = url;
      this.ws = new WebSocket(url);
      this.ws.addEventListener("open", this.onWsOpen.bind(this));
      this.ws.addEventListener("error", event => this.onWsError(event.error));
    });
  }
  // private timeOut
  // private setupWebsocketKeepAlive(ws: WebSocket, onTimeout: () => void) {
  //   const socket = (ws as any)._socket as Socket | null | undefined;
  //   if (socket) {
  //     // Exists, use node.js methods
  //     socket.setKeepAlive(true, KEEP_ALIVE_INTERVAL);
  //     socket.setTimeout(KEEP_ALIVE_TIMEOUT, onTimeout);
  //   } else {
  //   }
  // }
  protected onWsOpen() {
    this.ws!.addEventListener("message", this.onWsMessage.bind(this));
    this.status = WsClientTransportStatus.Connected;
    this.queuedMessages.forEach(message => this.sendViaTransport(message));
    this.queuedMessages = [];
    this.updateShouldRef(this.shouldRef);
    // this.setupWebsocketKeepAlive(this.ws!, this.onWsTimeout.bind(this));
  }
  protected onWsMessage(event: WsMessageEvent) {
    if (this.status !== WsClientTransportStatus.Connected) {
      this.logger.warn("Received message while not connected. Message ignored:", event.data);
      return;
    }
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch (error) {
      this.logger.warn("Received invalid JSON message from server:", event.data);
      return;
    }
    let parsed: ServerToClientMessage;
    try {
      parsed = this.parseIncomingMessage(message);
    } catch (error) {
      this.logger.warn("Received invalid message from server:", message);
      return;
    }
    this.receivedMessage(parsed);
  }
  protected onWsError(error: any) {
    if (this.status === WsClientTransportStatus.Disconnected) {
      return;
    }
    this.logger.warn("WebSocket error:", error);
    if (error.code === "ECONNREFUSED") {
      this.logger.warnText`
        WebSocket connection refused. This can happen if the server is not running or the client
        is trying to connect to the wrong path. The server path that this client is
        attempting to connect to is:
        ${this.resolvedUrl ?? "Unknown" /* Should never be Unknown */}.

        Please make sure the following:

          1. LM Studio is running

          2. The API server in LM Studio has started

          3. The client is attempting to connect to the correct path
      `;
    }
    try {
      this.ws?.close();
    } catch (error) {
      // Ignore
    }
    this.status = WsClientTransportStatus.Disconnected;
    this.errored(error);
  }
  protected onWsTimeout() {
    if (this.status === WsClientTransportStatus.Disconnected) {
      return;
    }
    this.logger.warn("Websocket timed out");
    try {
      this.ws?.close();
    } catch (error) {
      // Ignore
    }
    this.status = WsClientTransportStatus.Disconnected;
    this.errored(new Error("WebSocket timed out"));
  }
  public override onHavingNoOpenCommunication() {
    this.updateShouldRef(false);
  }
  public override onHavingOneOrMoreOpenCommunication() {
    this.updateShouldRef(true);
  }
  private updateShouldRef(shouldRef: boolean) {
    this.shouldRef = shouldRef;
    if (this.ws === null) {
      return;
    }
    if (!(this.ws as any)._socket) {
      return;
    }
    if (shouldRef) {
      (this.ws as any)._socket.ref();
    } else {
      (this.ws as any)._socket.unref();
    }
  }
  public override sendViaTransport(message: ClientToServerMessage) {
    if (this.status === WsClientTransportStatus.Connected) {
      this.ws!.send(JSON.stringify(message));
    } else {
      this.queuedMessages.push(message);
      if (this.status === WsClientTransportStatus.Disconnected) {
        this.connect();
      }
    }
  }
}
