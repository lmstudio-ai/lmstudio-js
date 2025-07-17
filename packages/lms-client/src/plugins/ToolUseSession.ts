import { Cleaner, IdGiver, makePromise, type SimpleLogger } from "@lmstudio/lms-common";
import { type InferClientChannelType } from "@lmstudio/lms-communication";
import {
  type PluginsBackendInterface,
  type PluginsPort,
} from "@lmstudio/lms-external-backend-interfaces";
import {
  fromSerializedError,
  type LLMTool,
  type PluginConfigSpecifier,
} from "@lmstudio/lms-shared-types";
import { rawFunctionTool, type Tool } from "../llm/tool";

/**
 * Represents a session for using tools from a plugin.
 */
export interface ToolUseSession {
  tools: Array<Tool>;
  [Symbol.dispose](): void;
}

type SingleToolUseSessionStatus = "initializing" | "ready" | "disposed";

interface OngoingToolCall {
  callId: number;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  reportStatus: (text: string) => void;
  reportWarning: (text: string) => void;
}

/**
 * Represents a tool use session backed by a single tool.
 */
export class SingleToolUseSession implements ToolUseSession {
  private status: SingleToolUseSessionStatus = "initializing";
  /**
   * Whether this session is "poisoned". A session is poisoned either when the underlying channel
   * has errored/closed.
   */
  private poison: Error | null = null;
  /**
   * Tools available in this session.
   */
  public tools!: Array<Tool>;
  /**
   * Map to track all the ongoing tool calls.
   */
  private ongoingToolCalls: Map<number, OngoingToolCall> = new Map();
  private callIdGiver = new IdGiver(0);
  /**
   * The communication channel. Initialized in `.init`.
   */
  private channel!: InferClientChannelType<PluginsBackendInterface, "startToolUseSession">;
  public static async create(
    pluginsPort: PluginsPort,
    pluginIdentifier: string,
    pluginConfigSpecifier: PluginConfigSpecifier,
    logger: SimpleLogger,
    stack?: string,
  ): Promise<ToolUseSession> {
    const session = new SingleToolUseSession(
      pluginsPort,
      pluginIdentifier,
      pluginConfigSpecifier,
      logger,
    );
    await session.init(stack);
    return session;
  }
  private constructor(
    private readonly pluginsPort: PluginsPort,
    private readonly pluginIdentifier: string,
    private readonly pluginConfigSpecifier: PluginConfigSpecifier,
    private readonly logger: SimpleLogger,
  ) {}
  private async init(stack?: string): Promise<void> {
    const { promise: initPromise, resolve: resolveInit, reject: rejectInit } = makePromise<void>();
    const channel = this.pluginsPort.createChannel(
      "startToolUseSession",
      {
        pluginIdentifier: this.pluginIdentifier,
        pluginConfigSpecifier: this.pluginConfigSpecifier,
      },
      message => {
        const messageType = message.type;
        switch (messageType) {
          // Upon receiving session ready, mark self as ready and resolve the promise.
          case "sessionReady": {
            if (this.status !== "initializing") {
              this.logger.error("Received sessionReady message while not initializing");
              return;
            }
            this.status = "ready";
            resolveInit();
            this.tools = message.toolDefinitions.map(toolDefinition =>
              this.makeTool(toolDefinition),
            );
            break;
          }

          case "toolCallComplete": {
            const ongoingCall = this.ongoingToolCalls.get(message.callId);
            if (ongoingCall === undefined) {
              return;
            }
            ongoingCall.resolve(message.result);
            break;
          }

          case "toolCallError": {
            const ongoingCall = this.ongoingToolCalls.get(message.callId);
            if (ongoingCall === undefined) {
              return;
            }
            ongoingCall.reject(fromSerializedError(message.error));
            break;
          }

          case "toolCallStatus": {
            const ongoingCall = this.ongoingToolCalls.get(message.callId);
            if (ongoingCall === undefined) {
              return;
            }
            ongoingCall.reportStatus(message.statusText);
            break;
          }

          case "toolCallWarn": {
            const ongoingCall = this.ongoingToolCalls.get(message.callId);
            if (ongoingCall === undefined) {
              return;
            }
            ongoingCall.reportWarning(message.warnText);
            break;
          }

          default: {
            const exhaustiveCheck: never = messageType;
            this.logger.warn(
              `Received unexpected message type in tool use session: ${exhaustiveCheck}`,
            );
          }
        }
      },
      { stack },
    );
    channel.onError.subscribeOnce(error => {
      if (this.status === "initializing") {
        // If still initializing, reject the promise with the error.
        rejectInit(error);
      } else {
        this.logger.error("Tool use session error.", error);
        this.poison = error;
      }
      // Reject all ongoing tool calls with the error.
      for (const ongoingCall of this.ongoingToolCalls.values()) {
        ongoingCall.reject(error);
      }
      this.status = "disposed";
    });
    channel.onClose.subscribeOnce(() => {
      let error: Error;
      if (this.status === "initializing") {
        // If still initializing, reject the promise with the error.
        error = new Error("Tool use session channel closed unexpectedly during initialization.");
        rejectInit(error);
      } else {
        error = new Error("Tool use session has already ended.");
        // We don't print an error here because channel can close normally. We only poison this
        // session so it throws the error when used.
        this.poison = error;
      }
      // Reject all ongoing tool calls with the error.
      for (const ongoingCall of this.ongoingToolCalls.values()) {
        ongoingCall.reject(error);
      }
      this.status = "disposed";
    });
    this.channel = channel;
    await initPromise;
  }
  public [Symbol.dispose](): void {
    // As long as we are not already disposed, we send a discard message to the channel.
    if (this.status !== "disposed") {
      this.channel.send({ type: "discardSession" });
      this.status = "disposed";
      const error = new Error("Session disposed by client.");
      // Reject all ongoing tool calls with the error.
      for (const ongoingCall of this.ongoingToolCalls.values()) {
        ongoingCall.reject(error);
      }
      this.poison = error;
    }
  }
  private makeTool(toolDefinition: LLMTool): Tool {
    return rawFunctionTool({
      name: toolDefinition.function.name,
      description: toolDefinition.function.description ?? "",
      parametersJsonSchema: toolDefinition.function.parameters ?? {},
      implementation: async (args, ctx) => {
        // We now need to provide an implementation that basically proxies the execution of the tool
        // to the backend.
        if (this.poison !== null) {
          // If the session is already poisoned, throw the error.
          throw this.poison;
        }

        // Handling the case where the request is already aborted before we start the tool call.
        if (ctx.signal.aborted) {
          throw ctx.signal.reason;
        }

        const callId = this.callIdGiver.next();
        const { promise, resolve, reject } = makePromise<any>();
        using cleaner = new Cleaner();
        this.ongoingToolCalls.set(callId, {
          callId,
          resolve,
          reject,
          reportStatus: status => ctx.status(status),
          reportWarning: warning => ctx.warn(warning),
        });
        cleaner.register(() => {
          this.ongoingToolCalls.delete(callId);
        });

        this.channel.send({
          type: "callTool",
          callId,
          name: toolDefinition.function.name,
          arguments: args,
        });

        ctx.signal.addEventListener(
          "abort",
          () => {
            if (this.status === "disposed") {
              return;
            }
            this.channel.send({
              type: "abortToolCall",
              callId,
            });
            reject(ctx.signal.reason);
          },
          { once: true },
        );

        return await promise;
      },
    });
  }
}
