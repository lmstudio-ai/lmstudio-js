import { getCurrentStack, type Validator } from "@lmstudio/lms-common";
import {
  type KVConfig,
  type LLMPredictionFragmentInputOpts,
  llmPredictionFragmentInputOptsSchema,
  type LLMTool,
  type ToolCallRequest,
  toolCallRequestSchema,
} from "@lmstudio/lms-shared-types";
import { z } from "zod";
import { type LMStudioClient } from "../../LMStudioClient.js";
import { BaseController } from "./BaseController.js";

export interface GeneratorConnector {
  fragmentGenerated: (content: string, opts: LLMPredictionFragmentInputOpts) => void;
  toolCallGenerationStarted: (toolCallId: string | undefined) => void;
  toolCallGenerationNameReceived: (toolName: string) => void;
  toolCallGenerationArgumentFragmentGenerated: (content: string) => void;
  toolCallGenerationEnded: (toolCallRequest: ToolCallRequest) => void;
  toolCallGenerationFailed: (error: Error) => void;
}

/**
 * Controller for a generator.
 *
 * @public
 * @experimental [EXP-PLUGIN-CORE] Plugin support is still in development. This may change in the
 * future without warning.
 */
export class GeneratorController extends BaseController {
  /**
   * @internal Do not construct this class yourself.
   */
  public constructor(
    client: LMStudioClient,
    pluginConfig: KVConfig,
    globalPluginConfig: KVConfig,
    workingDirectoryPath: string | null,
    abortSignal: AbortSignal,
    private readonly toolDefinitions: Array<LLMTool>,
    private readonly connector: GeneratorConnector,
    private readonly validator: Validator,
  ) {
    super(client, abortSignal, pluginConfig, globalPluginConfig, workingDirectoryPath);
  }

  /**
   * Get the definitions of the tools available for this generation.
   */
  public getToolDefinitions(): Array<LLMTool> {
    return this.toolDefinitions;
  }

  /**
   * Use this function to report a text fragment has been generated.
   *
   * @param content - The content that has been generated.
   * @param opts - Additional info about the generated content, such as how many tokens it contains.
   *   See {@link LLMPredictionFragmentInputOpts} for more info. All the fields are optional.
   */
  public fragmentGenerated(content: string, opts: LLMPredictionFragmentInputOpts = {}) {
    const stack = getCurrentStack(1);
    [content, opts] = this.validator.validateMethodParamsOrThrow(
      "GeneratorController",
      "fragmentGenerated",
      ["content", "opts"],
      [z.string(), llmPredictionFragmentInputOptsSchema],
      [content, opts],
      stack,
    );
    this.connector.fragmentGenerated(content, opts);
  }

  /**
   * Use this function to report that a tool call generation has started. Each
   * `toolCallGenerationStarted` must be paired up with a `toolCallGenerationEnded` call for
   * successfully generated tool calls, or a `toolCallGenerationFailed` call for
   * failed tool calls.
   */
  public toolCallGenerationStarted({
    toolCallId,
  }: {
    /**
     * The LLM specific call id of the tool call.
     */
    toolCallId?: string;
  } = {}) {
    this.connector.toolCallGenerationStarted(toolCallId);
  }

  /**
   * Use this function to report that the name of the tool call has been generated. This function
   * should only be called once for each `toolCallGenerationStarted`.
   *
   * @param toolName - The name of the tool that has been generated.
   */
  public toolCallGenerationNameReceived(toolName: string) {
    const stack = getCurrentStack(1);
    toolName = this.validator.validateMethodParamOrThrow(
      "GeneratorController",
      "toolCallGenerationNameReceived",
      "toolName",
      z.string(),
      toolName,
      stack,
    );
    this.connector.toolCallGenerationNameReceived(toolName);
  }

  /**
   * Use this function to report that a new argument fragment has been generated for the tool call.
   * This function can be called multiple times for each `toolCallGenerationStarted`.
   *
   * @param content - The new fragment that has been generated for the tool call.
   */
  public toolCallGenerationArgumentFragmentGenerated(content: string) {
    const stack = getCurrentStack(1);
    content = this.validator.validateMethodParamOrThrow(
      "GeneratorController",
      "toolCallGenerationArgumentFragmentGenerated",
      "content",
      z.string(),
      content,
      stack,
    );
    this.connector.toolCallGenerationArgumentFragmentGenerated(content);
  }

  /**
   * Use this function to report that a tool call generation has successfully ended. This function
   * should only be called after a `toolCallGenerationStarted` call.
   */
  public toolCallGenerationEnded(toolCallRequest: ToolCallRequest) {
    const stack = getCurrentStack(1);
    toolCallRequest = this.validator.validateMethodParamOrThrow(
      "GeneratorController",
      "toolCallGenerationEnded",
      "toolCallRequest",
      toolCallRequestSchema,
      toolCallRequest,
      stack,
    );
    this.connector.toolCallGenerationEnded(toolCallRequest);
  }

  /**
   * Use this function to report that a tool call generation has failed. This function should only
   * be called after a `toolCallGenerationStarted` call.
   *
   * @param error - The error that occurred during the tool call generation.
   */
  public toolCallGenerationFailed(error: Error) {
    const stack = getCurrentStack(1);
    error = this.validator.validateMethodParamOrThrow(
      "GeneratorController",
      "toolCallGenerationFailed",
      "error",
      z.instanceof(Error),
      error,
      stack,
    );
    this.connector.toolCallGenerationFailed(error);
  }
}
