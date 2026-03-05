import {
  getCurrentStack,
  SimpleLogger,
  type LoggerInterface,
  type Validator,
} from "@lmstudio/lms-common";
import { type RuntimePort } from "@lmstudio/lms-external-backend-interfaces";
import {
  runtimeHardwareSurveyScopeSchema,
  type ModelFormatName,
  type RuntimeEngineInfo,
  type RuntimeEngineSpecifier,
  type RuntimeHardwareSurveyResult,
  type RuntimeHardwareSurveyScope,
  type SelectedRuntimeEngineMap,
} from "@lmstudio/lms-shared-types";

import { RuntimeExtensionsNamespace } from "./RuntimeExtensionsNamespace";

/**
 * @public
 * @deprecated [DEP-LEGACY-RUNTIME-ENGINE] This API is part of the legacy runtime engine API that
 * was never stablized, but used in the lms-cli. This API will be removed as we move the
 * functionality into `client.runtime.extensions`. You may use this API but expect breakage even
 * during minor updates.
 */
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
   * @deprecated [DEP-LEGACY-RUNTIME-ENGINE] This API is part of the legacy runtime engine API that
   * was never stablized, but used in the lms-cli. This API will be removed as we move the
   * functionality into `client.runtime.extensions`. You may use this API but expect breakage even
   * during minor updates.
   */
  public async list(): Promise<Array<RuntimeEngineInfo>> {
    const stack = getCurrentStack(1);
    return await this.runtimePort.callRpc("listEngines", undefined, { stack });
  }

  /**
   * Get all runtime engine selections.
   *
   * @deprecated [DEP-LEGACY-RUNTIME-ENGINE] This API is part of the legacy runtime engine API that
   * was never stablized, but used in the lms-cli. This API will be removed as we move the
   * functionality into `client.runtime.extensions`. You may use this API but expect breakage even
   * during minor updates.
   */
  public async getSelections(): Promise<SelectedRuntimeEngineMap> {
    const stack = getCurrentStack(1);
    return await this.runtimePort.callRpc("getEngineSelections", undefined, { stack });
  }

  /**
   * Select a runtime engine for a specific model format.
   *
   * @deprecated [DEP-LEGACY-RUNTIME-ENGINE] This API is part of the legacy runtime engine API that
   * was never stablized, but used in the lms-cli. This API will be removed as we move the
   * functionality into `client.runtime.extensions`. You may use this API but expect breakage even
   * during minor updates.
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
   * @deprecated [DEP-LEGACY-RUNTIME-ENGINE] This API is part of the legacy runtime engine API that
   * was never stablized, but used in the lms-cli. This API will be removed as we move the
   * functionality into `client.runtime.extensions`. You may use this API but expect breakage even
   * during minor updates.
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
   * @deprecated [DEP-LEGACY-RUNTIME-ENGINE] This API is part of the legacy runtime engine API that
   * was never stablized, but used in the lms-cli. This API will be removed as we move the
   * functionality into `client.runtime.extensions`. You may use this API but expect breakage even
   * during minor updates.
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

  /**
   * Perform a hardware survey for available runtime engines.
   *
   * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
   * change in the future.
   */
  public async surveyHardware(
    scope?: RuntimeHardwareSurveyScope,
  ): Promise<RuntimeHardwareSurveyResult> {
    const stack = getCurrentStack(1);
    [scope] = this.validator.validateMethodParamsOrThrow(
      "client.runtime",
      "surveyHardware",
      ["scope"],
      [runtimeHardwareSurveyScopeSchema.optional()],
      [scope],
      stack,
    );
    return await this.runtimePort.callRpc("surveyHardware", scope, {
      stack,
    });
  }
}
