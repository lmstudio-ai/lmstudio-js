import { type BufferedEvent, makePromise, type SimpleLogger } from "@lmstudio/lms-common";
import {
  authPacketSchema,
  type BackendInterface,
  type WsAuthenticationResult,
  type WsMessageEvent,
} from "@lmstudio/lms-communication";
import { type IncomingMessage, type Server } from "http";
import { type WebSocket } from "ws";
import { type Authenticator, type Context, type ContextCreator } from "./Authenticator.js";
import { ServerPort } from "./ServerPort.js";
import { WsServer } from "./WsServer.js";
import { WsServerTransport } from "./WsServerTransport.js";

/**
 * Owning a ClientHolder means owning a reference to the client. If a client is no longer needed,
 * the ClientHolder#drop method must be called.
 */
export interface ClientHolder {
  drop(): void;
  leak(): void;
}

interface AuthenticationServerConstructorOpts<TContext extends Context> {
  backendInterface: BackendInterface<TContext>;
  authenticator: Authenticator<TContext>;
  server: Server;
  pathName: string;
  guardConnection?: (request: IncomingMessage) => Promise<void>;
  parentLogger?: SimpleLogger;
  authenticationTimeoutMs?: number;
}

/**
 * A WebSocket server that also does authentication.
 *
 * The context is provided by the authenticator.
 */
export class AuthenticatedWsServer<TContext extends Context> extends WsServer<TContext> {
  protected override readonly logger: SimpleLogger = this.logger.subclass("AuthenticatedWsServer");
  private readonly authenticator: Authenticator<TContext>;
  private readonly timeoutMs: number;
  public constructor({
    backendInterface,
    authenticator,
    server,
    pathName,
    guardConnection,
    parentLogger,
    authenticationTimeoutMs: timeoutMs,
  }: AuthenticationServerConstructorOpts<TContext>) {
    super({ backendInterface, server, pathName, guardConnection, parentLogger });
    this.authenticator = authenticator;
    this.timeoutMs = timeoutMs ?? 10_000;
  }
  private authenticateConnection(ws: WebSocket): Promise<{
    holder: ClientHolder;
    contextCreator: ContextCreator<TContext>;
    authenticationRevokedEvent: BufferedEvent<void>;
  }> {
    const { promise, resolve, reject } = makePromise<{
      holder: ClientHolder;
      contextCreator: ContextCreator<TContext>;
      authenticationRevokedEvent: BufferedEvent<void>;
    }>();
    const onMessage = (event: WsMessageEvent) => {
      let message;
      try {
        message = JSON.parse(event.data.toString("utf8"));
      } catch (error) {
        this.logger.warn(
          `Received invalid JSON message from client while authenticating:`,
          event.data,
        );
        return;
      }
      let parsed;
      try {
        parsed = authPacketSchema.parse(message);
      } catch (error) {
        this.logger.warn("Received invalid message from client while authenticating:", message);
        return;
      }
      this.authenticator
        .authenticate(parsed)
        .then(result => {
          stopAuthentication();
          return result;
        })
        .then(resolve, reject);
    };
    const onError = (error: any) => {
      failAuthentication(error);
    };
    const onClose = () => {
      failAuthentication(new Error("Connection closed before authentication completed"));
    };
    const onTimeout = () => {
      failAuthentication(new Error("Authentication timed out"));
    };
    ws.addEventListener("message", onMessage);
    ws.addEventListener("error", onError);
    ws.addEventListener("close", onClose);
    const timeoutTimeout = setTimeout(onTimeout, this.timeoutMs);

    let authenticationStopped = false;

    /**
     * Removes all the listeners and stops the timeout.
     */
    function stopAuthentication() {
      if (authenticationStopped) {
        return;
      }
      authenticationStopped = true;
      ws.removeEventListener("message", onMessage);
      ws.removeEventListener("error", onError);
      ws.removeEventListener("close", onClose);
      clearTimeout(timeoutTimeout);
    }
    function failAuthentication(error: any) {
      stopAuthentication();
      reject(error);
    }
    return promise;
  }
  protected onConnection(ws: WebSocket) {
    this.authenticateConnection(ws)
      .then(({ holder, contextCreator, authenticationRevokedEvent }) => {
        ws.send(JSON.stringify({ success: true } satisfies WsAuthenticationResult));
        const serverPort = new ServerPort(
          this.backendInterface,
          contextCreator,
          WsServerTransport.createFactory(ws),
        );
        serverPort.closeEvent.subscribe(() => {
          holder.drop();
        });
        authenticationRevokedEvent.subscribeOnce(() => {
          this.logger.debug("Terminating connection because authentication was revoked");
          try {
            ws.close();
          } catch (error) {
            // Ignore
          }
        });
      })
      .catch(error => {
        this.logger.warn("Failed to authenticate client:", error);
        try {
          ws.send(
            JSON.stringify({
              success: false,
              error: error.message,
            } satisfies WsAuthenticationResult),
          );
        } catch (error) {
          // Ignore
        }
        try {
          ws.close();
        } catch (error) {
          // Ignore
        }
      });
  }
}
