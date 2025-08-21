import { SimpleLogger } from "@lmstudio/lms-common";
import type { BackendInterface } from "@lmstudio/lms-communication";
import type { IncomingMessage, Server } from "http";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";

interface WsServerConstructorOpts<TContext> {
  backendInterface: BackendInterface<TContext>;
  server: Server;
  pathName: string;
  /**
   * A function that called upon each connection. Throw an error to reject the connection.
   */
  guardConnection?: (request: IncomingMessage) => Promise<void>;
  parentLogger?: SimpleLogger;
}

export abstract class WsServer<TContext> {
  protected readonly logger: SimpleLogger;
  protected readonly backendInterface: BackendInterface<TContext>;
  private readonly wss: WebSocketServer;
  private guardConnection: ((request: IncomingMessage) => Promise<void>) | undefined;
  public constructor({
    backendInterface,
    server,
    pathName,
    guardConnection,
    parentLogger,
  }: WsServerConstructorOpts<TContext>) {
    this.backendInterface = backendInterface;
    this.guardConnection = guardConnection;
    this.logger = new SimpleLogger("WsServer", parentLogger);
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on("connection", ws => this.onConnection(ws));
    server.on("upgrade", async (request, socket, head) => {
      try {
        if (request.url === undefined) {
          throw new Error("Request URL is undefined");
        }
        const { pathname } = new URL(request.url, `http://${request.headers.host}`);
        if (pathname !== `/${pathName}`) {
          return;
        }
        await this.guardConnection?.(request);
      } catch (error) {
        this.logger.warn("Connection rejected:", error);
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
      socket.on("error", error => {
        this.logger.warn("Socket error:", error);
      });
      this.wss.handleUpgrade(request, socket, head, ws => {
        this.wss.emit("connection", ws, request);
      });
    });
  }
  protected abstract onConnection(ws: WebSocket): void;
}
