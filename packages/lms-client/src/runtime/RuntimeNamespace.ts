import {
  getCurrentStack,
  SimpleLogger,
  type LoggerInterface,
  type Validator,
} from "@lmstudio/lms-common";
import { type RuntimePort } from "@lmstudio/lms-external-backend-interfaces";
import {
  runtimeEngineSpecifierSchema,
  type RuntimeEngineInfo,
  type RuntimeEngineSelectionInfo,
  type RuntimeEngineSpecifier,
} from "@lmstudio/lms-shared-types";

/** @public */
export class RuntimeNamespace {
  /** @internal */
  private readonly logger: SimpleLogger;

  /** @internal */
  public constructor(
    private readonly runtimePort: RuntimePort,
    private readonly validator: Validator,
    parentLogger: LoggerInterface,
  ) {
    this.logger = new SimpleLogger("Runtime", parentLogger);
  }

  /**
   * List all available runtime engines.
   * @public
   */
  public async list(): Promise<Array<RuntimeEngineInfo>> {
    const stack = getCurrentStack(1);
    return await this.runtimePort.callRpc("list", undefined, { stack });
  }

  /**
   * Get all runtime engine selections.
   * @public
   */
  public async getSelections(): Promise<Array<RuntimeEngineSelectionInfo>> {
    const stack = getCurrentStack(1);
    return await this.runtimePort.callRpc("getSelections", undefined, { stack });
  }

  /**
   * Select a runtime engine for a specific model format.
   * @public
   */
  public async select(opts: {
    engine: RuntimeEngineSpecifier;
    modelFormat: string;
  }): Promise<void> {
    const stack = getCurrentStack(1);

    await this.runtimePort.callRpc("select", opts, { stack });
  }

  /**
   * Remove a runtime engine.
   * @public
   */
  public async remove(engine: RuntimeEngineSpecifier): Promise<void> {
    const stack = getCurrentStack(1);

    engine = this.validator.validateMethodParamOrThrow(
      "client.runtime",
      "remove",
      "engine",
      runtimeEngineSpecifierSchema,
      engine,
      stack,
    );

    await this.runtimePort.callRpc("remove", engine, { stack });
  }
}
