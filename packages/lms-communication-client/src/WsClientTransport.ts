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
  private queuedMessages: Array<{
    prepare: () => ClientToServerMessage | null;
    failed: (error: unknown) => void;
  }> = [];
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

  /** Starts a socket connection and keeps events from an old socket out of its replacement. */
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
    Promise.resolve(this.url)
      .then(url => {
        if (this.status !== WsClientTransportStatus.Connecting) {
          return;
        }
        const abortSignal = this.abortSignal;
        if (abortSignal?.aborted === true) {
          throw abortSignal.reason;
        }
        this.resolvedUrl = url;
        const socket = new WebSocket(url);
        this.ws = socket;
        socket.addEventListener("open", () => {
          if (this.ws === socket) {
            this.onWsOpen();
          }
        });
        socket.addEventListener("error", event => {
          if (this.ws === socket) {
            this.onWsError(event.error);
          }
        });
        socket.addEventListener("close", () => {
          if (this.ws === socket) {
            this.onWsError(new Error("WebSocket connection closed"));
          }
        });
        if (abortSignal !== undefined) {
          const abortListener = () => {
            if (this.ws === socket) {
              this.onWsError(abortSignal.reason);
            }
          };
          abortSignal.addEventListener("abort", abortListener, { once: true });
          socket.addEventListener("close", () => {
            abortSignal.removeEventListener("abort", abortListener);
          });
        }
      })
      .catch(error => this.onWsError(error));
  }
  /** Initializes connection state before preparing queued payloads. */
  protected onWsOpen() {
    const socket = this.ws!;
    socket.addEventListener("message", event => {
      if (this.ws === socket) {
        this.onWsMessage(event);
      }
    });
    this.status = WsClientTransportStatus.Connected;
    this.updateShouldRef(this.shouldRef);
    // The owner may initialize its codec here. Recovered signals also use that state.
    this.connected();
    while (this.status === WsClientTransportStatus.Connected && this.queuedMessages.length > 0) {
      const { prepare, failed } = this.queuedMessages.shift()!;
      super.sendDeferred(prepare, failed);
    }
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
  /** Releases the failed connection and settles its queue before another connection can use it. */
  protected onWsError(error: unknown) {
    if (this.status === WsClientTransportStatus.Disconnected) {
      return;
    }
    if (!this.disposed) {
      this.logger.warn("WebSocket error:", error);
      if (error instanceof Error && "code" in error && error.code === "ECONNREFUSED") {
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
    }
    const queued = this.queuedMessages.splice(0);
    const socket = this.ws;
    this.ws = null;
    this.status = WsClientTransportStatus.Disconnected;
    this.resetHandshake();
    try {
      socket?.close();
    } catch {
      // The socket may already be closed.
    }
    // The port must mark signals recoverable before individual send failures remove them.
    this.errored(error);
    for (const message of queued) {
      message.failed(error);
    }
  }
  /** A timeout releases the same pending work as any other connection failure. */
  protected onWsTimeout() {
    this.onWsError(new Error("WebSocket timed out"));
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
  /** Sends a prepared envelope, preserving its position among deferred sends while connecting. */
  public override sendViaTransport(message: ClientToServerMessage) {
    if (this.status === WsClientTransportStatus.Connected) {
      this.ws!.send(JSON.stringify(message));
    } else {
      this.ensureConnectedOrStartConnection();
      this.queuedMessages.push({
        prepare: () => message,
        failed: error => this.logger.warn("Failed to send queued WebSocket message:", error),
      });
    }
  }
  /** Leaves payload preparation until the socket and any authentication are ready. */
  public override sendDeferred(
    prepare: () => ClientToServerMessage | null,
    failed: (error: unknown) => void,
  ): void {
    if (this.status === WsClientTransportStatus.Connected) {
      super.sendDeferred(prepare, failed);
      return;
    }
    try {
      this.ensureConnectedOrStartConnection();
      this.queuedMessages.push({ prepare, failed });
    } catch (error) {
      failed(error);
    }
  }
  /** Lets active communications finish before closing the socket and releasing queued sends. */
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

    this.onWsError(new Error("WebSocket client transport disposed"));
  }
}
