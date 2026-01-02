import { makePromise, SimpleLogger, text, type LoggerInterface } from "@lmstudio/lms-common";
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

interface WsClientTransportConstructorOpts {
  parentLogger?: LoggerInterface;
  abortSignal?: AbortSignal;
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
  private resolveDisposed: (() => void) | null = null;
  /**
   * A way for the outside world to "poison the connection".
   */
  private readonly abortSignal?: AbortSignal;
  protected constructor(
    private readonly url: string | Promise<string>,
    private readonly receivedMessage: (message: ServerToClientMessage) => void,
    private readonly connected: () => void,
    private readonly errored: (error: any) => void,
    { abortSignal, parentLogger }: WsClientTransportConstructorOpts = {},
  ) {
    super();
    this.abortSignal = abortSignal;
    this.logger = new SimpleLogger("WsClientTransport", parentLogger);
  }
  public static createWsClientTransportFactory(
    url: string | Promise<string>,
    {
      abortSignal,
    }: {
      /**
       * An abort signal that can be used to force terminate the connection and prevent further
       * connection attempts.
       */
      abortSignal?: AbortSignal;
    } = {},
  ): ClientTransportFactory {
    return (receivedMessage, connected, errored, parentLogger) =>
      new WsClientTransport(url, receivedMessage, connected, errored, {
        abortSignal,
        parentLogger,
      });
  }

  private connect() {
    if (this.status !== WsClientTransportStatus.Disconnected) {
      this.logger.warn("connect() called while not disconnected");
      return;
    }
    if (this.disposed) {
      throw new Error(text`
        Cannot establish WebSocket connection because the transport has been disposed.
      `);
    }
    if (this.abortSignal !== undefined && this.abortSignal.aborted) {
      throw new Error(this.abortSignal.reason);
    }
    this.status = WsClientTransportStatus.Connecting;
    Promise.resolve(this.url).then(url => {
      this.resolvedUrl = url;
      this.ws = new WebSocket(url);
      this.ws.addEventListener("open", this.onWsOpen.bind(this));
      this.ws.addEventListener("error", event => this.onWsError(event.error));
      this.ws.addEventListener("close", () => {
        this.onWsError(new Error("WebSocket connection closed"));
      });

      const abortSignal = this.abortSignal;
      if (abortSignal !== undefined) {
        if (abortSignal.aborted) {
          this.onWsError(abortSignal.reason);
        } else {
          const abortListener = () => {
            this.onWsError(abortSignal.reason);
          };
          abortSignal.addEventListener("abort", abortListener, { once: true });
          this.ws.addEventListener("close", () => {
            abortSignal.removeEventListener("abort", abortListener);
          });
        }
      }
    });
  }
  protected onWsOpen() {
    this.ws!.addEventListener("message", this.onWsMessage.bind(this));
    this.status = WsClientTransportStatus.Connected;
    this.queuedMessages.forEach(message => this.sendViaTransport(message));
    this.queuedMessages = [];
    this.updateShouldRef(this.shouldRef);
    // this.setupWebsocketKeepAlive(this.ws!, this.onWsTimeout.bind(this));
    this.connected();
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
    if (this.disposed) {
      // Suppress errors during intentional disposal
      this.status = WsClientTransportStatus.Disconnected;
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
    if (this.disposed && this.resolveDisposed !== null) {
      // If the transport is disposed, we can resolve the disposed promise to allow the
      // async dispose to complete.
      this.resolveDisposed();
      this.resolveDisposed = null;
    }
  }
  public override onHavingOneOrMoreOpenCommunication() {
    this.updateShouldRef(true);
  }
  public override ensureConnectedOrStartConnection(): void {
    if (this.status === WsClientTransportStatus.Connected) {
      return;
    }
    if (this.status === WsClientTransportStatus.Disconnected) {
      this.connect();
    }
    // If status is Connecting, connection is already in progress
  }
  private updateShouldRef(shouldRef: boolean) {
    this.shouldRef = shouldRef;
    if (!WsClientTransport.supportsRefing()) {
      return;
    }
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
  private static supportsRefing(): boolean {
    if (typeof process === "undefined") {
      return false;
    }
    if (process.versions === undefined) {
      return false;
    }
    if (!("node" in process.versions)) {
      return false;
    }
    return !("bun" in process.versions);
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
  public override async [Symbol.asyncDispose]() {
    await super[Symbol.asyncDispose]();
    // Only wait for communications to close in Node where ref/unref is supported
    // In Bun, we close immediately since we can't keep the socket alive without blocking
    if (this.shouldRef && WsClientTransport.supportsRefing()) {
      // If the connection needs to held up, wait until all communications are terminates
      const { promise: disposedPromise, resolve: resolveDisposed } = makePromise<void>();
      this.resolveDisposed = resolveDisposed;
      await disposedPromise;
    }

    if (this.ws !== null) {
      try {
        this.ws.close();
      } catch (error) {
        // Ignore
      }
      this.ws = null;
    }
    this.errored(new Error("WebSocket client transport disposed"));
    this.status = WsClientTransportStatus.Disconnected;
  }
}
