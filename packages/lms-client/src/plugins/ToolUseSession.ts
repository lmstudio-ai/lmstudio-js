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
import { internalCreateRemoteTool, type RemoteTool } from "../llm/tool";

/**
 * Represents a session for using remote tools.
 */
export interface RemoteToolUseSession extends Disposable {
  tools: Array<RemoteTool>;
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
 * Represents a tool use session backed by a single plugin. Don't construct this class yourself.
 *
 * @public
 */
export class SingleRemoteToolUseSession implements RemoteToolUseSession {
  private status: SingleToolUseSessionStatus = "initializing";
  /**
   * Whether this session is "poisoned". A session is poisoned either when the underlying channel
   * has errored/closed.
   */
  private poison: Error | null = null;
  /**
   * Tools available in this session.
   */
  public tools!: Array<RemoteTool>;
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
  ): Promise<RemoteToolUseSession> {
    const session = new SingleRemoteToolUseSession(
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
  private makeTool(toolDefinition: LLMTool): RemoteTool {
    return internalCreateRemoteTool({
      name: toolDefinition.function.name,
      description: toolDefinition.function.description ?? "",
      pluginIdentifier: this.pluginIdentifier,
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

/**
 * Represents a tool use session backed by multiple plugins. Don't construct this class yourself.
 *
 * @public
 */
export class MultiRemoteToolUseSession implements RemoteToolUseSession {
  public static async createUsingPredictionProcess(
    pluginsPort: PluginsPort,
    pluginIdentifiers: Array<string>,
    predictionContextIdentifier: string,
    token: string,
    logger: SimpleLogger,
    stack?: string,
  ) {
    // Start initializing all the sessions in parallel. This is OK because usually all the plugins
    // are already loaded for the prediction process anyway.
    const results = await Promise.allSettled(
      pluginIdentifiers.map(pluginIdentifier =>
        SingleRemoteToolUseSession.create(
          pluginsPort,
          pluginIdentifier,
          {
            type: "predictionProcess",
            pci: predictionContextIdentifier,
            token,
          },
          logger,
          stack,
        ),
      ),
    );

    const failed = results.filter(result => result.status === "rejected");
    if (failed.length > 0) {
      // Some sessions failed to initialize. We need to terminate all the sessions that
      // successfully initialized.
      for (const result of results) {
        if (result.status === "fulfilled") {
          try {
            result.value[Symbol.dispose]();
          } catch (error) {
            logger.error("Failed to dispose a session after initialization failure.", error);
          }
        }
      }

      throw new AggregateError(
        failed.map(result => result.reason),
        "Failed to initialize some tool use sessions.",
      );
    }

    return new MultiRemoteToolUseSession(
      results.map(result => (result as PromiseFulfilledResult<SingleRemoteToolUseSession>).value),
      logger,
    );
  }

  public tools: Array<RemoteTool> = [];

  private constructor(
    private readonly sessions: Array<SingleRemoteToolUseSession>,
    private readonly logger: SimpleLogger,
  ) {
    this.tools = sessions.flatMap(session => session.tools);
  }

  public [Symbol.dispose](): void {
    // Dispose all the sessions.
    for (const session of this.sessions) {
      try {
        session[Symbol.dispose]();
      } catch (error) {
        this.logger.error("Failed to dispose a session.", error);
      }
    }
  }
}
