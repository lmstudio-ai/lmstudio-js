import { type BufferedEvent, type LoggerInterface } from "@lmstudio/lms-common";
import { type AuthPacket } from "@lmstudio/lms-communication";
import { type ClientHolder } from "./AuthenticatedWsServer.js";

export interface ContextCreatorParams {
  type: "rpc" | "channel" | "signal" | "writableSignal";
  endpointName: string;
}

export interface Context {
  logger: LoggerInterface;
}

export type ContextCreator<TContext extends Context> = (params: ContextCreatorParams) => TContext;

export abstract class Authenticator<TContext extends Context> {
  public abstract authenticate(authPacket: AuthPacket): Promise<{
    holder: ClientHolder;
    contextCreator: ContextCreator<TContext>;
    authenticationRevokedEvent: BufferedEvent<void>;
  }>;
}
