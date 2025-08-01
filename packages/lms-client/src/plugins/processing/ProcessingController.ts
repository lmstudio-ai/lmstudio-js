import { Cleaner, raceWithAbortSignal, type SimpleLogger } from "@lmstudio/lms-common";
import { type PluginsPort } from "@lmstudio/lms-external-backend-interfaces";
import {
  type ChatMessageRoleData,
  type ContentBlockStyle,
  type KVConfig,
  type KVConfigStack,
  type LLMGenInfo,
  type ProcessingRequest,
  type ProcessingRequestResponse,
  type ProcessingUpdate,
  type RemotePluginInfo,
  type StatusStepState,
  type TokenSourceIdentifier,
  type ToolStatusStepStateStatus,
} from "@lmstudio/lms-shared-types";
import { Chat } from "../../Chat.js";
import { type RetrievalResult, type RetrievalResultEntry } from "../../files/RetrievalResult.js";
import { type LLM } from "../../llm/LLM.js";
import { LLMDynamicHandle } from "../../llm/LLMDynamicHandle.js";
import { type LLMGeneratorHandle } from "../../llm/LLMGeneratorHandle.js";
import { type OngoingPrediction } from "../../llm/OngoingPrediction.js";
import { type PredictionResult } from "../../llm/PredictionResult.js";
import { type LMStudioClient } from "../../LMStudioClient.js";
import { type RemoteToolUseSession } from "../ToolUseSession.js";
import { BaseController } from "./BaseController.js";

function stringifyAny(message: any) {
  switch (typeof message) {
    case "string":
      return message;
    case "number":
      return message.toString();
    case "boolean":
      return message ? "true" : "false";
    case "undefined":
      return "undefined";
    case "object":
      if (message === null) {
        return "null";
      }
      if (message instanceof Error) {
        return message.stack;
      }
      return JSON.stringify(message, null, 2);
    case "bigint":
      return message.toString();
    case "symbol":
      return message.toString();
    case "function":
      return message.toString();
    default:
      return "unknown";
  }
}

function concatenateDebugMessages(...messages: Array<any>) {
  return messages.map(stringifyAny).join(" ");
}

function createId() {
  return `${Date.now()}-${Math.random()}`;
}

export class ProcessingConnector {
  public constructor(
    private readonly pluginsPort: PluginsPort,
    public readonly abortSignal: AbortSignal,
    public readonly processingContextIdentifier: string,
    public readonly token: string,
    private readonly logger: SimpleLogger,
  ) {}
  public handleUpdate(update: ProcessingUpdate) {
    this.pluginsPort
      .callRpc("processingHandleUpdate", {
        pci: this.processingContextIdentifier,
        token: this.token,
        update,
      })
      .catch(error => {
        this.logger.error("Failed to send update", error);
      });
  }
  public async handleRequest(request: ProcessingRequest): Promise<ProcessingRequestResponse> {
    const { response } = await this.pluginsPort.callRpc("processingHandleRequest", {
      pci: this.processingContextIdentifier,
      token: this.token,
      request,
    });
    return response;
  }
  public async pullHistory(includeCurrent: boolean): Promise<Chat> {
    const chatHistoryData = await this.pluginsPort.callRpc("processingPullHistory", {
      pci: this.processingContextIdentifier,
      token: this.token,
      includeCurrent,
    });
    // We know the result of callRpc is immutable, so we can safely pass false as the second
    // argument.
    return Chat.createRaw(chatHistoryData, /* mutable */ false).asMutableCopy();
  }
  public async getOrLoadTokenSource(): Promise<TokenSourceIdentifier> {
    const result = await this.pluginsPort.callRpc("processingGetOrLoadTokenSource", {
      pci: this.processingContextIdentifier,
      token: this.token,
    });
    return result.tokenSourceIdentifier;
  }
  public async hasStatus(): Promise<boolean> {
    return await this.pluginsPort.callRpc("processingHasStatus", {
      pci: this.processingContextIdentifier,
      token: this.token,
    });
  }
  public async needsNaming(): Promise<boolean> {
    return await this.pluginsPort.callRpc("processingNeedsNaming", {
      pci: this.processingContextIdentifier,
      token: this.token,
    });
  }
  public async suggestName(name: string) {
    await this.pluginsPort.callRpc("processingSuggestName", {
      pci: this.processingContextIdentifier,
      token: this.token,
      name,
    });
  }
}

interface ProcessingControllerHandle {
  abortSignal: AbortSignal;
  sendUpdate: (update: ProcessingUpdate) => void;
  sendRequest<TType extends ProcessingRequest["type"]>(
    request: ProcessingRequest & { type: TType },
  ): Promise<ProcessingRequestResponse & { type: TType }>;
}

/**
 * Options to use with {@link ProcessingController#createContentBlock}.
 *
 * @public
 */
export interface CreateContentBlockOpts {
  roleOverride?: "user" | "assistant" | "system" | "tool";
  includeInContext?: boolean;
  style?: ContentBlockStyle;
  prefix?: string;
  suffix?: string;
}

/**
 * Options to use with {@link ProcessingController#createCitationBlock}.
 *
 * @public
 */
export interface CreateCitationBlockOpts {
  fileName: string;
  fileIdentifier: string;
  pageNumber?: number | [start: number, end: number];
  lineNumber?: number | [start: number, end: number];
}

/**
 * Options to use with {@link ProcessingController#requestConfirmToolCall}.
 *
 * @public
 * @deprecated [DEP-PLUGIN-PREDICTION-LOOP-HANDLER] Prediction loop handler support is still in
 * development. Stay tuned for updates.
 */
export interface RequestConfirmToolCallOpts {
  callId: number;
  pluginIdentifier?: string;
  name: string;
  parameters: Record<string, any>;
}

/**
 * Return type of {@link ProcessingController#requestConfirmToolCall}.
 *
 * @public
 * @deprecated [DEP-PLUGIN-PREDICTION-LOOP-HANDLER] Prediction loop handler support is still in
 * development. Stay tuned for updates.
 */
export type RequestConfirmToolCallResult =
  | {
      type: "allow";
      toolArgsOverride?: Record<string, any>;
    }
  | {
      type: "deny";
      denyReason?: string;
    };

/**
 * @public
 */
export class ProcessingController extends BaseController {
  /** @internal */
  private readonly processingControllerHandle: ProcessingControllerHandle;

  /** @internal */
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
    this.processingControllerHandle = {
      abortSignal: connector.abortSignal,
      sendUpdate: update => {
        connector.handleUpdate(update);
      },
      sendRequest: async request => {
        const type = request.type;
        const response = await connector.handleRequest(request);
        if (response.type !== type) {
          throw new Error(
            `Expected response type ${type}, but got ${response.type}. This is a bug.`,
          );
        }
        return response as ProcessingRequestResponse & { type: typeof type };
      },
    };
  }

  private sendUpdate(update: ProcessingUpdate) {
    this.processingControllerHandle.sendUpdate(update);
  }

  /**
   * Gets a mutable copy of the current history. The returned history is a copy, so mutating it will
   * not affect the actual history. It is mutable for convenience reasons.
   *
   * - If you are a promptPreprocessor, this will not include the user message you are currently
   *   preprocessing.
   * - If you are a prediction loop handler, this will include the user message, and can be fed into
   *   the {@link LLMDynamicHandle#respond} method directly.
   */
  public async pullHistory() {
    return await this.connector.pullHistory(this.shouldIncludeCurrentInHistory);
  }

  public createStatus(initialState: StatusStepState): PredictionProcessStatusController {
    const id = createId();
    this.sendUpdate({
      type: "status.create",
      id,
      state: initialState,
    });
    const statusController = new PredictionProcessStatusController(
      this.processingControllerHandle,
      initialState,
      id,
    );
    return statusController;
  }

  public addCitations(retrievalResult: RetrievalResult): void;
  public addCitations(entries: Array<RetrievalResultEntry>): void;
  public addCitations(arg: RetrievalResult | Array<RetrievalResultEntry>) {
    if (Array.isArray(arg)) {
      for (const entry of arg) {
        this.createCitationBlock(entry.content, {
          fileName: entry.source.name,
          fileIdentifier: entry.source.identifier,
        });
      }
    } else {
      for (const entry of arg.entries) {
        this.createCitationBlock(entry.content, {
          fileName: entry.source.name,
          fileIdentifier: entry.source.identifier,
        });
      }
    }
  }

  public createCitationBlock(
    citedText: string,
    source: CreateCitationBlockOpts,
  ): PredictionProcessCitationBlockController {
    const id = createId();
    this.sendUpdate({
      type: "citationBlock.create",
      id,
      citedText,
      ...source,
    });
    const citationBlockController = new PredictionProcessCitationBlockController(
      this.processingControllerHandle,
      id,
    );
    return citationBlockController;
  }

  /**
   * @internal
   */
  public createDebugInfoBlock(debugInfo: string): PredictionProcessDebugInfoBlockController {
    const id = createId();
    this.sendUpdate({
      type: "debugInfoBlock.create",
      id,
      debugInfo,
    });
    const debugInfoBlockController = new PredictionProcessDebugInfoBlockController(
      this.processingControllerHandle,
      id,
    );
    return debugInfoBlockController;
  }

  public createContentBlock({
    roleOverride,
    includeInContext = true,
    style,
    prefix,
    suffix,
  }: CreateContentBlockOpts = {}): PredictionProcessContentBlockController {
    const id = createId();
    this.sendUpdate({
      type: "contentBlock.create",
      id,
      roleOverride,
      includeInContext,
      style,
      prefix,
      suffix,
    });
    const contentBlockController = new PredictionProcessContentBlockController(
      this.processingControllerHandle,
      id,
      roleOverride ?? "assistant",
    );
    return contentBlockController;
  }

  public debug(...messages: Array<any>) {
    this.createDebugInfoBlock(concatenateDebugMessages(...messages));
  }

  /**
   * Gets the token source associated with this prediction process (i.e. what the user has selected
   * on the top navigation bar).
   *
   * The token source can either be a model or a generator plugin. In both cases, the returned
   * object will contain a ".act" and a ".respond" method, which can be used to generate text.
   *
   * The token source is already pre-configured to use user's prediction config - you don't need to
   * pass through any additional configuration.
   */
  public async tokenSource(): Promise<LLM | LLMGeneratorHandle> {
    const tokenSourceIdentifier = await this.connector.getOrLoadTokenSource();
    const tokenSourceIdentifierType = tokenSourceIdentifier.type;

    switch (tokenSourceIdentifierType) {
      case "model": {
        const model = await this.client.llm.model(tokenSourceIdentifier.identifier);
        // Don't use the server session config for this model
        (model as any).internalIgnoreServerSessionConfig = true;
        // Inject the prediction config
        (model as any).internalKVConfigStack = {
          layers: [
            {
              layerName: "conversationSpecific",
              config: this.config,
            },
          ],
        } satisfies KVConfigStack;
        return model;
      }
      case "generator": {
        const generator = this.client.plugins.createGeneratorHandleAssociatedWithPredictionProcess(
          tokenSourceIdentifier.pluginIdentifier,
          this.connector.processingContextIdentifier,
          this.connector.token,
        );
        return generator;
      }
    }
  }

  /**
   * Sets the sender name for this message. The sender name shown above the message in the chat.
   */
  public async setSenderName(name: string) {
    this.sendUpdate({
      type: "setSenderName",
      name,
    });
  }

  /**
   * Throws an error if the prediction process has been aborted. Sprinkle this throughout your code
   * to ensure that the prediction process is aborted as soon as possible.
   */
  public guardAbort() {
    this.abortSignal.throwIfAborted();
  }

  /**
   * Whether this prediction process has had any status.
   */
  public async hasStatus() {
    return await this.connector.hasStatus();
  }

  /**
   * Returns whether this conversation needs a name.
   */
  public async needsNaming() {
    return await this.connector.needsNaming();
  }

  /**
   * Suggests a name for this conversation.
   */
  public async suggestName(name: string) {
    await this.connector.suggestName(name);
  }

  public async requestConfirmToolCall({
    callId,
    pluginIdentifier,
    name,
    parameters,
  }: RequestConfirmToolCallOpts): Promise<RequestConfirmToolCallResult> {
    const { result } = await raceWithAbortSignal(
      this.processingControllerHandle.sendRequest({
        type: "confirmToolCall",
        callId,
        pluginIdentifier,
        name,
        parameters,
      }),
      this.abortSignal,
    );
    const resultType = result.type;
    switch (resultType) {
      case "allow": {
        return {
          type: "allow",
          toolArgsOverride: result.toolArgsOverride,
        };
      }
      case "deny": {
        return {
          type: "deny",
          denyReason: result.denyReason,
        };
      }
      default: {
        const exhaustiveCheck: never = resultType;
        throw new Error(
          `Unexpected result type ${exhaustiveCheck}. This is a bug. Please report it.`,
        );
      }
    }
  }

  public createToolStatus(
    callId: number,
    initialStatus: ToolStatusStepStateStatus,
  ): PredictionProcessToolStatusController {
    const id = createId();
    this.sendUpdate({
      type: "toolStatus.create",
      id,
      callId,
      state: {
        status: initialStatus,
        customStatus: "",
        customWarnings: [],
      },
    });
    const toolStatusController = new PredictionProcessToolStatusController(
      this.processingControllerHandle,
      id,
      initialStatus,
    );
    return toolStatusController;
  }

  /**
   * Starts a tool use session with tools available in the prediction process. Note, this method
   * should be used with "Explicit Resource Management". That is, you should use it like so:
   *
   * ```typescript
   * using toolUseSession = await ctl.startToolUseSession();
   * // ^ Notice the `using` keyword here.
   * ```
   *
   * If you do not `using`, you should call `toolUseSession[Symbol.dispose]()` after you are done.
   *
   * If you don't, lmstudio-js will close the session upon the end of the prediction step
   * automatically. However, it is not recommended.
   *
   * @public
   * @deprecated WIP
   */
  public async startToolUseSession(): Promise<RemoteToolUseSession> {
    const identifiersOfPluginsWithTools = this.enabledPluginInfos
      .filter(({ hasToolsProvider }) => hasToolsProvider)
      .map(({ identifier }) => identifier);
    return await this.client.plugins.startToolUseSessionUsingPredictionProcess(
      // We start a tool use session with all the plugins that have tools available
      identifiersOfPluginsWithTools,
      this.connector.processingContextIdentifier,
      this.connector.token,
    );
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

/**
 * Controller for a status block in the prediction process.
 *
 * @public
 */
export class PredictionProcessStatusController {
  /** @internal */
  public constructor(
    /** @internal */
    private readonly handle: ProcessingControllerHandle,
    initialState: StatusStepState,
    private readonly id: string,
    private readonly indentation: number = 0,
  ) {
    this.lastState = initialState;
  }
  private lastSubStatus: PredictionProcessStatusController = this;
  private lastState: StatusStepState;
  public setText(text: string) {
    this.lastState.text = text;
    this.handle.sendUpdate({
      type: "status.update",
      id: this.id,
      state: this.lastState,
    });
  }
  public setState(state: StatusStepState) {
    this.lastState = state;
    this.handle.sendUpdate({
      type: "status.update",
      id: this.id,
      state,
    });
  }
  public remove() {
    this.handle.sendUpdate({
      type: "status.remove",
      id: this.id,
    });
  }
  private getNestedLastSubStatusBlockId() {
    let current = this.lastSubStatus;
    while (current !== current.lastSubStatus) {
      current = current.lastSubStatus;
    }
    return current.id;
  }
  public addSubStatus(initialState: StatusStepState): PredictionProcessStatusController {
    const id = createId();
    this.handle.sendUpdate({
      type: "status.create",
      id,
      state: initialState,
      location: {
        type: "afterId",
        id: this.getNestedLastSubStatusBlockId(),
      },
      indentation: this.indentation + 1,
    });
    const controller = new PredictionProcessStatusController(
      this.handle,
      initialState,
      id,
      this.indentation + 1,
    );
    this.lastSubStatus = controller;
    return controller;
  }
}

/**
 * Controller for a citation block in the prediction process. Currently cannot do anything.
 *
 * @public
 */
export class PredictionProcessCitationBlockController {
  /** @internal */
  public constructor(
    /** @internal */
    private readonly handle: ProcessingControllerHandle,
    private readonly id: string,
  ) {}
}

/**
 * Controller for a debug info block in the prediction process. Currently cannot do anything.
 *
 * @public
 */
export class PredictionProcessDebugInfoBlockController {
  /** @internal */
  public constructor(
    /** @internal */
    private readonly handle: ProcessingControllerHandle,
    private readonly id: string,
  ) {}
}

/**
 * Options to use with {@link PredictionProcessContentBlockController#appendText}.
 *
 * @public
 */
export interface ContentBlockAppendTextOpts {
  tokensCount?: number;
  fromDraftModel?: boolean;
  /**
   * @experimental WIP - do not use yet.
   */
  isStructural?: boolean;
}

/**
 * Options to use with {@link PredictionProcessContentBlockController#appendToolRequest}.
 *
 * @public
 */
export interface ContentBlockAppendToolRequestOpts {
  callId: number;
  toolCallRequestId?: string;
  name: string;
  parameters: Record<string, any>;
  pluginIdentifier?: string;
}

/**
 * Options to use with {@link PredictionProcessContentBlockController#replaceToolRequest}.
 *
 * @public
 */
export interface ContentBlockReplaceToolRequestOpts {
  callId: number;
  toolCallRequestId?: string;
  name: string;
  parameters: Record<string, any>;
  pluginIdentifier?: string;
}

/**
 * Options to use with {@link PredictionProcessContentBlockController#appendToolResult}.
 *
 * @public
 */
export interface ContentBlockAppendToolResultOpts {
  callId: number;
  toolCallRequestId?: string;
  content: string;
}

/**
 * @public
 *
 * TODO: Documentation
 */
export class PredictionProcessContentBlockController {
  /** @internal */
  public constructor(
    /** @internal */
    private readonly handle: ProcessingControllerHandle,
    private readonly id: string,
    private readonly role: ChatMessageRoleData,
  ) {}
  public appendText(
    text: string,
    { tokensCount, fromDraftModel, isStructural }: ContentBlockAppendTextOpts = {},
  ) {
    if (this.role === "tool") {
      throw new Error("Text cannot be appended to tool blocks.");
    }
    this.handle.sendUpdate({
      type: "contentBlock.appendText",
      id: this.id,
      text,
      tokensCount,
      fromDraftModel,
      isStructural,
    });
  }
  public appendToolRequest({
    callId,
    toolCallRequestId,
    name,
    parameters,
    pluginIdentifier,
  }: ContentBlockAppendToolRequestOpts) {
    if (this.role !== "assistant") {
      throw new Error(
        `Tool requests can only be appended to assistant blocks. This is a ${this.role} block.`,
      );
    }
    this.handle.sendUpdate({
      type: "contentBlock.appendToolRequest",
      id: this.id,
      callId,
      toolCallRequestId,
      name,
      parameters,
      pluginIdentifier,
    });
  }
  public replaceToolRequest({
    callId,
    toolCallRequestId,
    name,
    parameters,
    pluginIdentifier,
  }: ContentBlockReplaceToolRequestOpts) {
    if (this.role !== "assistant") {
      throw new Error(
        `Tool requests can only be replaced in assistant blocks. This is a ${this.role} block.`,
      );
    }
    this.handle.sendUpdate({
      type: "contentBlock.replaceToolRequest",
      id: this.id,
      callId,
      toolCallRequestId,
      name,
      parameters,
      pluginIdentifier,
    });
  }
  public appendToolResult({
    callId,
    toolCallRequestId,
    content,
  }: ContentBlockAppendToolResultOpts) {
    if (this.role !== "tool") {
      throw new Error(
        `Tool results can only be appended to tool blocks. This is a ${this.role} block.`,
      );
    }
    this.handle.sendUpdate({
      type: "contentBlock.appendToolResult",
      id: this.id,
      callId,
      toolCallRequestId,
      content,
    });
  }
  public replaceText(text: string) {
    if (this.role === "tool") {
      throw new Error("Text cannot be set in tool blocks.");
    }
    this.handle.sendUpdate({
      type: "contentBlock.replaceText",
      id: this.id,
      text,
    });
  }
  public setStyle(style: ContentBlockStyle) {
    this.handle.sendUpdate({
      type: "contentBlock.setStyle",
      id: this.id,
      style,
    });
  }
  public setPrefix(prefix: string) {
    this.handle.sendUpdate({
      type: "contentBlock.setPrefix",
      id: this.id,
      prefix,
    });
  }
  public setSuffix(suffix: string) {
    this.handle.sendUpdate({
      type: "contentBlock.setSuffix",
      id: this.id,
      suffix,
    });
  }
  public attachGenInfo(genInfo: LLMGenInfo) {
    this.handle.sendUpdate({
      type: "contentBlock.attachGenInfo",
      id: this.id,
      genInfo,
    });
  }
  public async pipeFrom(prediction: OngoingPrediction): Promise<PredictionResult> {
    using cleaner = new Cleaner();
    const abortListener = () => {
      prediction.cancel();
    };
    this.handle.abortSignal.addEventListener("abort", abortListener);
    cleaner.register(() => {
      this.handle.abortSignal.removeEventListener("abort", abortListener);
    });
    for await (const { content } of prediction) {
      this.appendText(content);
    }
    const result = await prediction;
    this.attachGenInfo({
      indexedModelIdentifier: result.modelInfo.path,
      identifier: result.modelInfo.identifier,
      loadModelConfig: result.loadConfig,
      predictionConfig: result.predictionConfig,
      stats: result.stats,
    });
    this.handle.abortSignal.throwIfAborted();
    return result;
  }
}

/**
 * Controller for a tool status block in the prediction process.
 *
 * @public
 */
export class PredictionProcessToolStatusController {
  private status: ToolStatusStepStateStatus;
  /** @internal */
  public constructor(
    /** @internal */
    private readonly handle: ProcessingControllerHandle,
    private readonly id: string,
    initialStatus: ToolStatusStepStateStatus,
  ) {
    this.status = initialStatus;
  }
  private customStatus: string = "";
  private customWarnings: Array<string> = [];
  private updateState() {
    this.handle.sendUpdate({
      type: "toolStatus.update",
      id: this.id,
      state: {
        status: this.status,
        customStatus: this.customStatus,
        customWarnings: this.customWarnings,
      },
    });
  }
  public setCustomStatusText(status: string) {
    this.customStatus = status;
    this.updateState();
  }
  public addWarning(warning: string) {
    this.customWarnings.push(warning);
    this.updateState();
  }
  public setStatus(status: ToolStatusStepStateStatus) {
    this.status = status;
    this.updateState();
  }
  public appendArgumentFragment(content: string) {
    this.handle.sendUpdate({
      type: "toolStatus.argumentFragment",
      id: this.id,
      content,
    });
  }
}
