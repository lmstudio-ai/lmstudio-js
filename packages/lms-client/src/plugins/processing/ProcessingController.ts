import { Cleaner, type SimpleLogger } from "@lmstudio/lms-common";
import { type PluginsPort } from "@lmstudio/lms-external-backend-interfaces";
import {
  type GlobalKVFieldValueTypeLibraryMap,
  type KVConfigSchematics,
  kvConfigToLLMPredictionConfig,
} from "@lmstudio/lms-kv-config";
import {
  type ContentBlockStyle,
  type KVConfig,
  type KVConfigStack,
  type LLMGenInfo,
  type LLMPredictionConfig,
  type ProcessingUpdate,
  type StatusStepState,
} from "@lmstudio/lms-shared-types";
import { ChatHistory } from "../../ChatHistory.js";
import {
  type ConfigSchematics,
  type ParsedConfig,
  type VirtualConfigSchematics,
} from "../../customConfig.js";
import { LLMDynamicHandle } from "../../llm/LLMDynamicHandle.js";
import { type OngoingPrediction } from "../../llm/OngoingPrediction.js";
import { type PredictionResult } from "../../llm/PredictionResult.js";
import { type LMStudioClient } from "../../LMStudioClient.js";
import {
  type RetrievalResult,
  type RetrievalResultEntry,
} from "../../retrieval/RetrievalResult.js";

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
    private readonly processingContextIdentifier: string,
    private readonly token: string,
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
  public async pullHistory(includeCurrent: boolean): Promise<ChatHistory> {
    const chatHistoryData = await this.pluginsPort.callRpc("processingPullHistory", {
      pci: this.processingContextIdentifier,
      token: this.token,
      includeCurrent,
    });
    // We know the result of callRpc is immutable, so we can safely pass false as the second
    // argument.
    return ChatHistory.createRaw(chatHistoryData, /* mutable */ false).asMutableCopy();
  }
  public async getOrLoadModel(): Promise<string> {
    const result = await this.pluginsPort.callRpc("processingGetOrLoadModel", {
      pci: this.processingContextIdentifier,
      token: this.token,
    });
    return result.identifier;
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
}

/**
 * @public
 */
export interface CreateContentBlockOpts {
  includeInContext?: boolean;
  style?: ContentBlockStyle;
  prefix?: string;
  suffix?: string;
}

/**
 * @public
 */
export interface CreateCitationBlockOpts {
  fileName: string;
  fileIdentifier: string;
  pageNumber?: number | [start: number, end: number];
  lineNumber?: number | [start: number, end: number];
}

/**
 * @public
 */
export class ProcessingController {
  /** @internal */
  private readonly processingControllerHandle: ProcessingControllerHandle;
  public readonly abortSignal: AbortSignal;

  /** @internal */
  public constructor(
    public readonly client: LMStudioClient,
    /** @internal */
    private readonly connector: ProcessingConnector,
    /** @internal */
    private readonly config: KVConfig,
    /** @internal */
    private readonly pluginConfig: KVConfig,
    /**
     * When getting history, should the latest user input be included in the history?
     *
     * @internal
     */
    private readonly shouldIncludeCurrentInHistory: boolean,
  ) {
    this.abortSignal = connector.abortSignal;
    this.processingControllerHandle = {
      abortSignal: connector.abortSignal,
      sendUpdate: update => {
        connector.handleUpdate(update);
      },
    };
  }

  private sendUpdate(update: ProcessingUpdate) {
    this.processingControllerHandle.sendUpdate(update);
  }

  public getPluginConfig<TVirtualConfigSchematics extends VirtualConfigSchematics>(
    configSchematics: ConfigSchematics<TVirtualConfigSchematics>,
  ): ParsedConfig<TVirtualConfigSchematics> {
    return (
      configSchematics as KVConfigSchematics<
        GlobalKVFieldValueTypeLibraryMap,
        TVirtualConfigSchematics
      >
    ).parse(this.pluginConfig);
  }

  /**
   * Gets a mutable copy of the current history. The returned history is a copy, so mutating it will
   * not affect the actual history. It is mutable for convenience reasons.
   *
   * - If you are a preprocessor, this will not include the user message you are currently
   *   preprocessing.
   * - If you are a generator, this will include the user message, and can be fed into the
   *   {@link LLMDynamicHandle#respond} directly.
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
    includeInContext = true,
    style,
    prefix,
    suffix,
  }: CreateContentBlockOpts = {}): PredictionProcessContentBlockController {
    const id = createId();
    this.sendUpdate({
      type: "contentBlock.create",
      id,
      includeInContext,
      style,
      prefix,
      suffix,
    });
    const contentBlockController = new PredictionProcessContentBlockController(
      this.processingControllerHandle,
      id,
    );
    return contentBlockController;
  }

  public debug(...messages: Array<any>) {
    this.createDebugInfoBlock(concatenateDebugMessages(...messages));
  }

  public getPredictionConfig(): LLMPredictionConfig {
    return kvConfigToLLMPredictionConfig(this.config);
  }

  public readonly model = Object.freeze({
    getOrLoad: async () => {
      const identifier = await this.connector.getOrLoadModel();
      const model = await this.client.llm.get({ identifier });
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
    },
  });

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
}

/**
 * @public
 */
export type PreprocessorController = Omit<
  ProcessingController,
  "createContentBlock" | "setSenderName"
>;
/**
 * @public
 */
export type GeneratorController = Omit<ProcessingController, never>;

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
  ) {}
  public appendText(text: string) {
    this.handle.sendUpdate({
      type: "contentBlock.appendText",
      id: this.id,
      text,
    });
  }
  public replaceText(text: string) {
    this.handle.sendUpdate({
      type: "contentBlock.replaceText",
      id: this.id,
      text,
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
