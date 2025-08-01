import { type LoggerInterface, type SimpleLogger } from "@lmstudio/lms-common";
import {
  wsAuthenticationResultSchema,
  type AuthPacket,
  type ClientTransportFactory,
  type ServerToClientMessage,
  type WsMessageEvent,
} from "@lmstudio/lms-communication";
import { WsClientTransport } from "./WsClientTransport.js";

interface AuthenticatedWsClientTransportConstructorOpts {
  parentLogger?: LoggerInterface;
  abortSignal?: AbortSignal;
}

interface Opts {
  url: string | Promise<string>;
  clientIdentifier: string;
  clientPasskey: string;
  abortSignal?: AbortSignal;
}

export class AuthenticatedWsClientTransport extends WsClientTransport {
  protected override readonly logger: SimpleLogger = this.logger.subclass(
    "AuthenticatedWsClientTransport",
  );
  protected constructor(
    url: string | Promise<string>,
    private readonly clientIdentifier: string,
    private readonly clientPasskey: string,
    receivedMessage: (message: ServerToClientMessage) => void,
    errored: (error: any) => void,
    { parentLogger, abortSignal }: AuthenticatedWsClientTransportConstructorOpts = {},
  ) {
    super(url, receivedMessage, errored, { parentLogger, abortSignal });
  }
  public static createAuthenticatedWsClientTransportFactory({
    url,
    clientIdentifier,
    clientPasskey,
    abortSignal,
  }: Opts): ClientTransportFactory {
    return (receivedMessage, errored, parentLogger) =>
      new AuthenticatedWsClientTransport(
        url,
        clientIdentifier,
        clientPasskey,
        receivedMessage,
        errored,
        { parentLogger, abortSignal },
      );
  }
  protected override onWsOpen() {
    this.ws!.send(
      JSON.stringify({
        authVersion: 1,
        clientIdentifier: this.clientIdentifier,
        clientPasskey: this.clientPasskey,
      } satisfies AuthPacket),
    );
    this.ws!.addEventListener(
      "message",
      (event: WsMessageEvent) => {
        try {
          const data = JSON.parse(event.data.toString("utf-8"));
          const result = wsAuthenticationResultSchema.parse(data);
          if (result.success) {
            super.onWsOpen();
          } else {
            this.onWsError(new Error("Failed to authenticate: " + result.error));
          }
        } catch (error: any) {
          this.onWsError(new Error("Failed to parse authentication result: " + error?.message));
        }
      },
      {
        once: true,
      },
    );
  }
}
