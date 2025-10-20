import {
  getCurrentStack,
  SimpleLogger,
  type LoggerInterface,
  type Validator,
} from "@lmstudio/lms-common";
import { type RuntimePort } from "@lmstudio/lms-external-backend-interfaces";
import {
  type ModelFormatName,
  type RuntimeEngineInfo,
  type RuntimeEngineSpecifier,
  type SelectedRuntimeEngineMap,
} from "@lmstudio/lms-shared-types";
import { RuntimeExtensionsNamespace } from "./RuntimeExtensionsNamespace";

/** @public */
export class RuntimeEngineNamespace {
  /** @internal */
  private readonly logger: SimpleLogger;

  /** @internal */
  public constructor(
    private readonly runtimePort: RuntimePort,
    private readonly validator: Validator,
    parentLogger: LoggerInterface,
  ) {
    this.logger = new SimpleLogger("RuntimeEngine", parentLogger);
  }

  /**
   * List all available runtime engines.
   *
   * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
   * change in the future.
   */
  public async list(): Promise<Array<RuntimeEngineInfo>> {
    const stack = getCurrentStack(1);
    return await this.runtimePort.callRpc("listEngines", undefined, { stack });
  }

  /**
   * Get all runtime engine selections.
   *
   * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
   * change in the future.
   */
  public async getSelections(): Promise<SelectedRuntimeEngineMap> {
    const stack = getCurrentStack(1);
    return await this.runtimePort.callRpc("getEngineSelections", undefined, { stack });
  }

  /**
   * Select a runtime engine for a specific model format.
   *
   * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
   * change in the future.
   */
  public async select(
    engine: RuntimeEngineSpecifier,
    modelFormatName: ModelFormatName,
  ): Promise<void> {
    const stack = getCurrentStack(1);
    await this.runtimePort.callRpc("selectEngine", { engine, modelFormatName }, { stack });
  }

  /**
   * Remove a runtime engine.
   *
   * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
   * change in the future.
   */
  public async remove(engine: RuntimeEngineSpecifier): Promise<void> {
    const stack = getCurrentStack(1);
    await this.runtimePort.callRpc("removeEngine", engine, { stack });
  }
}

/** @public */
export class RuntimeNamespace {
  /** @internal */
  private readonly logger: SimpleLogger;

  /**
   * @public
   *
   * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
   * change in the future.
   */
  public readonly engine: RuntimeEngineNamespace;

  /**
   * @public
   *
   * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
   * change in the future.
   */
  public readonly extensions: RuntimeExtensionsNamespace;

  /** @internal */
  public constructor(
    private readonly runtimePort: RuntimePort,
    private readonly validator: Validator,
    parentLogger: LoggerInterface,
  ) {
    this.logger = new SimpleLogger("Runtime", parentLogger);
    this.engine = new RuntimeEngineNamespace(this.runtimePort, this.validator, parentLogger);
    this.extensions = new RuntimeExtensionsNamespace(
      this.runtimePort,
      this.validator,
      parentLogger,
    );
  }
}
