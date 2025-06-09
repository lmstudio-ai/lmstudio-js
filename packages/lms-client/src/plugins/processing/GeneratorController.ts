import { getCurrentStack, type Validator } from "@lmstudio/lms-common";
import {
  llmPredictionFragmentInputOptsSchema,
  toolCallRequestSchema,
  type LLMPredictionFragmentInputOpts,
  type ToolCallRequest,
} from "@lmstudio/lms-shared-types";
import { z } from "zod";
import { type LMStudioClient } from "../../LMStudioClient.js";

export interface GeneratorConnector {
  fragmentGenerated: (content: string, opts: LLMPredictionFragmentInputOpts) => void;
  toolCallGenerationStarted: () => void;
  toolCallGenerationNameReceived: (toolName: string) => void;
  toolCallGenerationArgumentFragmentGenerated: (content: string) => void;
  toolCallGenerationEnded: (toolCallRequest: ToolCallRequest) => void;
  toolCallGenerationFailed: (error: Error) => void;
}

export class GeneratorController {
  public constructor(
    public readonly client: LMStudioClient,
    private readonly connector: GeneratorConnector,
    private readonly validator: Validator,
    public readonly abortSignal: AbortSignal,
  ) {}

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
  public toolCallGenerationStarted() {
    this.connector.toolCallGenerationStarted();
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
