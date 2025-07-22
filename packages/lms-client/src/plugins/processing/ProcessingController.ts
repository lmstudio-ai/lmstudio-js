import { text } from "@lmstudio/lms-common";
import {
  type KVConfig,
  type LLMPredictionFragment,
  type LLMPredictionFragmentInputOpts,
  type RemotePluginInfo,
  type ToolCallRequest,
  type ToolCallResult,
} from "@lmstudio/lms-shared-types";
import { z } from "zod";
import { type GuardToolCallController } from "../../llm/act.js";
import { type LLM } from "../../llm/LLM.js";
import { type LLMGeneratorHandle } from "../../llm/LLMGeneratorHandle.js";
import { type LMStudioClient } from "../../LMStudioClient.js";
import { type RemoteToolUseSession } from "../ToolUseSession.js";
import { BaseController } from "./BaseController.js";
import {
  LowLevelProcessingController,
  type PredictionProcessContentBlockController,
  type PredictionProcessToolStatusController,
  type ProcessingConnector,
} from "./LowLevelProcessingController.js";

function formatTimeRelative(timeMs: number) {
  // Examples:
  // 3.53 seconds
  // 5 minutes 21 seconds
  // 200 minutes 35 seconds
  const seconds = timeMs / 1000;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds.toFixed(2)} seconds`;
  }
  return `${minutes} minutes ${Math.floor(remainingSeconds)} seconds`;
}

type ProcessingBlockState =
  | {
      type: "none";
    }
  | {
      type: "regular";
      contentBlock: PredictionProcessContentBlockController;
    }
  | {
      type: "reasoningStaged";
      reasoningStartTime: number;
      stagedPrefix: string;
      stagedContent: string;
    }
  | {
      type: "reasoning";
      reasoningStartTime: number;
      contentBlock: PredictionProcessContentBlockController;
    };

/**
 * Options to use for {@link ProcessingController#toolCallRequestNameReceived}.
 *
 * @public
 */
export interface ProcessingToolCallRequestNameReceivedOpts {
  /**
   * The identifier of the plugin that is handling the tool call.
   */
  pluginIdentifier?: string;
}
export const processingToolCallRequestNameReceivedOptsSchema = z.object({
  pluginIdentifier: z.string().optional(),
});

/**
 * Options to use for {@link ProcessingController#toolCallRequestFailure}.
 */
export interface ProcessingToolCallRequestFailureOpts {
  /**
   * If the tool call request failed but still produced a tool call request, pass it here, which
   * will be added to the context.
   */
  toolCallRequest?: ToolCallRequest;
  rawContent?: string;
}
export const processingToolCallRequestFailureOptsSchema = z.object({
  rawContent: z.string().optional(),
});

export class ProcessingController extends BaseController {
  private blockState: ProcessingBlockState = { type: "none" };
  private readonly llctl: LowLevelProcessingController;
  /**
   * Map from tool call ID to the status controller for the tool call.
   */
  private readonly toolCallStatusBlocks = new Map<number, PredictionProcessToolStatusController>();
  /**
   * Map from tool call ID to the content block where the tool call request resides.
   */
  private readonly toolCallContentBlocks = new Map<
    number,
    PredictionProcessContentBlockController
  >();
  /**
   * Map from tool call ID to the plugin identifier that is handling the tool call.
   */
  private readonly toolCallPluginIdentifiers = new Map<number, string>();
  /**
   * Map from tool call ID to the model specific tool call request ID.
   */
  private readonly toolCallRequestIds = new Map<number, string>();
  public constructor(
    client: LMStudioClient,
    pluginConfig: KVConfig,
    globalPluginConfig: KVConfig,
    workingDirectoryPath: string | null,
    private readonly enabledPluginInfos: Array<RemotePluginInfo>,
    /** @internal */
    private readonly connector: ProcessingConnector,
    /** @internal */
    private readonly config: KVConfig,
    /**
     * When getting history, should the latest user input be included in the history?
     *
     * @internal
     */
    private readonly shouldIncludeCurrentInHistory: boolean,
  ) {
    super(client, connector.abortSignal, pluginConfig, globalPluginConfig, workingDirectoryPath);
    this.llctl = new LowLevelProcessingController(
      client,
      pluginConfig,
      globalPluginConfig,
      workingDirectoryPath,
      enabledPluginInfos,
      connector,
      config,
      shouldIncludeCurrentInHistory,
    );
  }

  public async startToolUseSession(): Promise<RemoteToolUseSession> {
    return await this.llctl.startToolUseSession();
  }

  public async pullHistory() {
    return await this.llctl.pullHistory();
  }

  public async tokenSource(): Promise<LLM | LLMGeneratorHandle> {
    return await this.llctl.tokenSource();
  }

  /**
   * Terminates the current block if exists.
   */
  public flushBlock() {
    const blockStateType = this.blockState.type;
    switch (blockStateType) {
      case "none": {
        // No block to flush.
        break;
      }
      case "regular": {
        this.blockState = { type: "none" };
        break;
      }
      case "reasoningStaged": {
        // If we have staged reasoning content, they can safely be dropped.
        this.blockState = { type: "none" };
        break;
      }
      case "reasoning": {
        // If we are in reasoning block, we need to set the "Thought for xxx" status.
        this.blockState.contentBlock.setStyle({
          type: "thinking",
          title: text`
            Thought for ${formatTimeRelative(Date.now() - this.blockState.reasoningStartTime)}
          `,
          ended: true,
        });
        this.blockState = { type: "none" };
        break;
      }
    }
  }

  public addFragment(fragment: LLMPredictionFragment) {
    const reasoningType = fragment.reasoningType;
    switch (reasoningType) {
      case "none": {
        this.addContent(fragment.content, fragment);
        break;
      }
      case "reasoning": {
        this.addReasoningContent(fragment.content, fragment);
        break;
      }
      case "reasoningStartTag": {
        this.addReasoningStartTag(fragment.content, fragment);
        break;
      }
      case "reasoningEndTag": {
        this.addReasoningEndTag(fragment.content, fragment);
        break;
      }
    }
  }

  public addContent(content: string, opts?: LLMPredictionFragmentInputOpts) {
    const blockStateType = this.blockState.type;
    if (blockStateType !== "regular") {
      // If we are not in a regular block. Flush and create a new one.
      this.flushBlock();
      const block = this.llctl.createContentBlock();
      this.blockState = { type: "regular", contentBlock: block };
    }
    this.blockState.contentBlock.appendText(content, {
      fromDraftModel: opts?.containsDrafted,
      tokensCount: opts?.tokenCount,
    });
  }

  public addReasoningContent(content: string, opts?: LLMPredictionFragmentInputOpts) {
    const blockStateType = this.blockState.type;
    if (blockStateType === "none" || blockStateType === "regular") {
      // If we are not in a reasoning block, flush and create a staged one.
      this.flushBlock();
      this.blockState = {
        type: "reasoningStaged",
        reasoningStartTime: Date.now(),
        stagedPrefix: "",
        stagedContent: "", // Content will be inserted later.
      };
    }

    // OK, now if we are not staging, just add the content to the block.
    if (blockStateType === "reasoning") {
      this.blockState.contentBlock.appendText(content, {
        fromDraftModel: opts?.containsDrafted,
        tokensCount: opts?.tokenCount,
      });
    } else {
      // In the other case, we are staging the content.
      this.blockState.stagedContent += content;
      // Now, let's see if we can retire from staging by having non-empty content.
      if (/\S/.test(this.blockState.stagedContent)) {
        const stagedPrefix = this.blockState.stagedPrefix;
        const stagedContent = this.blockState.stagedContent;
        this.blockState = {
          type: "reasoning",
          reasoningStartTime: this.blockState.reasoningStartTime,
          contentBlock: this.llctl.createContentBlock({
            style: { type: "thinking", title: "Thinking..." },
          }),
        };
        if (stagedPrefix !== "") {
          // If we have a staged prefix, we need to set it as the prefix of the content block.
          this.blockState.contentBlock.setPrefix(stagedPrefix);
        }
        this.blockState.contentBlock.appendText(stagedContent);
      }
    }
  }

  public addReasoningStartTag(content: string, _opts?: LLMPredictionFragmentInputOpts) {
    // We are now entering a reasoning block. Regardless of the current state, we always want to
    // flush the current block.
    this.flushBlock();

    // Create a staged reasoning block with set prefix.
    this.blockState = {
      type: "reasoningStaged",
      reasoningStartTime: Date.now(),
      stagedPrefix: content,
      stagedContent: "",
    };
  }

  public addReasoningEndTag(content: string, _opts?: LLMPredictionFragmentInputOpts) {
    const blockStateType = this.blockState.type;
    // The only time reasoning end tag matters is we are already in a non-staged reasoning block.
    if (blockStateType !== "reasoning") {
      this.flushBlock();
      return;
    }
    this.blockState.contentBlock.setSuffix(content);
    this.flushBlock();
  }

  public toolCallRequestStart(callId: number) {
    const block = this.llctl.createToolStatus(callId, { type: "generatingToolCall" });
    this.toolCallStatusBlocks.set(callId, block);
  }

  public toolCallRequestNameReceived(
    callId: number,
    name: string,
    opts: ProcessingToolCallRequestNameReceivedOpts = {},
  ) {
    const statusBlock = this.toolCallStatusBlocks.get(callId);
    if (statusBlock === undefined) {
      this.llctl.debug(`Tool call ${callId} name received, but no status block found.`);
      return;
    }
    statusBlock.setStatus({
      type: "generatingToolCall",
      name,
      pluginIdentifier: opts.pluginIdentifier,
    });
    if (opts.pluginIdentifier !== undefined) {
      this.toolCallPluginIdentifiers.set(callId, opts.pluginIdentifier);
    }
  }

  public toolCallRequestArgumentFragmentGenerated(callId: number, content: string) {
    const statusBlock = this.toolCallStatusBlocks.get(callId);
    if (statusBlock === undefined) {
      this.llctl.debug(
        `Tool call ${callId} argument fragment generated, but no status block found.`,
      );
      return;
    }
    statusBlock.appendArgumentFragment(content);
  }

  public toolCallRequestFailure(
    callId: number,
    error: Error,
    opts: ProcessingToolCallRequestFailureOpts = {},
  ) {
    const statusBlock = this.toolCallStatusBlocks.get(callId);
    if (statusBlock === undefined) {
      this.llctl.debug(`Tool call ${callId} failed, but no status block found.`);
      return;
    }
    statusBlock.setStatus({
      type: "toolCallGenerationFailed",
      error: error.message,
      rawContent: opts.rawContent,
    });
    if (opts.toolCallRequest !== undefined) {
      // If tool call request is provided, add it to context by using the toolCallRequestEnd method
      // directly.
      this.toolCallRequestEnd(callId, opts.toolCallRequest);
    }
  }

  public toolCallRequestEnd(callId: number, toolCallRequest: ToolCallRequest) {
    if (this.blockState.type !== "regular") {
      // If we are not in a regular block, flush and create a new one.
      this.flushBlock();
      const block = this.llctl.createContentBlock();
      this.blockState = { type: "regular", contentBlock: block };
    }
    const toolCallRequestId = toolCallRequest.id ?? String(Math.floor(Math.random() * 1000000));
    this.blockState.contentBlock.appendToolRequest({
      callId,
      toolCallRequestId,
      name: toolCallRequest.name,
      parameters: toolCallRequest.arguments ?? {},
      pluginIdentifier: this.toolCallPluginIdentifiers.get(callId),
    });
    this.toolCallRequestIds.set(callId, toolCallRequestId);
    this.toolCallContentBlocks.set(callId, this.blockState.contentBlock);
  }

  public toolCallRequestQueued(callId: number) {
    const statusBlock = this.toolCallStatusBlocks.get(callId);
    if (statusBlock === undefined) {
      this.llctl.debug(`Tool call ${callId} queued, but no status block found.`);
      return;
    }
    statusBlock.setStatus({ type: "toolCallQueued" });
  }

  public toolCallRequestFinalized(callId: number, toolCallRequest: ToolCallRequest) {
    const contentBlock = this.toolCallContentBlocks.get(callId);
    if (contentBlock === undefined) {
      this.llctl.debug(`Tool call ${callId} finalized, but no content block found.`);
      return;
    }
    const toolCallRequestId = this.toolCallRequestIds.get(callId);
    contentBlock.replaceToolRequest({
      callId,
      toolCallRequestId,
      name: toolCallRequest.name,
      parameters: toolCallRequest.arguments ?? {},
      pluginIdentifier: this.toolCallPluginIdentifiers.get(callId),
    });
    const statusBlock = this.toolCallStatusBlocks.get(callId);
    if (statusBlock === undefined) {
      this.llctl.debug(`Tool call ${callId} finalized, but no status block found.`);
      return;
    }
    statusBlock.setStatus({ type: "callingTool" });
  }

  public toolCallResult(callId: number, toolCallResult: ToolCallResult) {
    this.flushBlock();
    const block = this.llctl.createContentBlock({
      roleOverride: "tool",
    });
    block.appendToolResult({
      callId,
      toolCallRequestId: toolCallResult.toolCallId,
      content: toolCallResult.content,
    });
  }

  public async confirmToolCallRequest(
    callId: number,
    { tool, toolCallRequest, allow, allowAndOverrideParameters, deny }: GuardToolCallController,
  ) {
    const statusBlock = this.toolCallStatusBlocks.get(callId);
    if (statusBlock === undefined) {
      this.llctl.debug(`Tool call ${callId} confirmation requested, but no status block found.`);
      return;
    }
    statusBlock.setStatus({
      type: "confirmingToolCall",
    });
    const confirmResult = await this.llctl.requestConfirmToolCall({
      callId,
      name: tool.name,
      parameters: toolCallRequest.arguments ?? {},
      pluginIdentifier: this.toolCallPluginIdentifiers.get(callId),
    });
    const confirmResultType = confirmResult.type;
    switch (confirmResultType) {
      case "allow": {
        if (confirmResult.toolArgsOverride !== undefined) {
          allowAndOverrideParameters(confirmResult.toolArgsOverride);
        } else {
          allow();
        }
        break;
      }
      case "deny": {
        const denyReason = confirmResult.denyReason ?? "Error: Tool call denied by user.";
        deny(denyReason);
        statusBlock.setStatus({
          type: "toolCallDenied",
          denyReason,
        });
        break;
      }
      default: {
        const exhaustiveCheck: never = confirmResultType;
        throw new Error(`Unexpected confirm result type: ${exhaustiveCheck}`);
      }
    }
  }

  public toolCallSucceeded(callId: number) {
    const statusBlock = this.toolCallStatusBlocks.get(callId);
    if (statusBlock === undefined) {
      this.llctl.debug(`Tool call ${callId} succeeded, but no status block found.`);
      return;
    }
    statusBlock.setStatus({
      type: "toolCallSucceeded",
      timeMs: 1000, // TODO: Fix
    });
  }

  public toolCallFailed(callId: number, error: Error) {
    const statusBlock = this.toolCallStatusBlocks.get(callId);
    if (statusBlock === undefined) {
      this.llctl.debug(`Tool call ${callId} failed, but no status block found.`);
      return;
    }
    statusBlock.setStatus({
      type: "toolCallFailed",
      error: error.message,
    });
  }
}

/**
 * @public
 */
export type PromptPreprocessorController = Omit<
  ProcessingController,
  "createContentBlock" | "setSenderName"
>;

/**
 * @public
 */
export type PredictionLoopHandlerController = Omit<ProcessingController, never>;
