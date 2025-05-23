import { SimpleLogger } from "@lmstudio/lms-common";
import type { BackendInterface } from "@lmstudio/lms-communication";
import { type Context, type ContextCreator } from "./Authenticator.js";
import { IpcServerTransport } from "./IpcServerTransport.js";
import { ServerPort } from "./ServerPort.js";
import { type IpcMainEvent, type MessagePortMain } from "./electronTypes.js";

export type RegisterIpcListener = (
  channel: string,
  listener: (event: IpcMainEvent, ...args: any[]) => void,
) => void;

export abstract class IpcServer<TContext extends Context> {
  protected readonly logger: SimpleLogger;
  public constructor(
    protected readonly backendInterface: BackendInterface<TContext>,
    registerIpcListener: RegisterIpcListener,
    channel: string,
    parentLogger?: SimpleLogger,
  ) {
    this.logger = new SimpleLogger("IpcServer", parentLogger);
    registerIpcListener(channel, (event, ...args) => this.onConnection(event, ...args));
  }
  protected createServerPort(contextCreator: ContextCreator<TContext>, port: MessagePortMain) {
    return new ServerPort(
      this.backendInterface,
      contextCreator,
      IpcServerTransport.createFactory(port),
    );
  }
  protected abstract onConnection(event: IpcMainEvent, ...args: Array<unknown>): Promise<void>;
}
