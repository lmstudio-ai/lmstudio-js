import {
  getCurrentStack,
  SimpleLogger,
  type LoggerInterface,
  type Validator,
} from "@lmstudio/lms-common";
import { type DiagnosticsPort } from "@lmstudio/lms-external-backend-interfaces";
import { type DiagnosticsLogEvent } from "@lmstudio/lms-shared-types";
import { z } from "zod";

interface DiagnosticsStreamLogsOpts {
  originDeviceIdentifier?: string;
}

/** @public */
export class DiagnosticsNamespace {
  /** @internal */
  private readonly logger: SimpleLogger;
  /** @internal */
  public constructor(
    private readonly diagnosticsPort: DiagnosticsPort,
    private readonly validator: Validator,
    parentLogger: LoggerInterface,
  ) {
    this.logger = new SimpleLogger("Diagnostics", parentLogger);
  }

  /**
   * Register a callback to receive log events. Return a function to stop receiving log events.
   *
   * This method is in alpha. Do not use this method in production yet.
   * @alpha
   */
  public unstable_streamLogs(
    listener: (logEvent: DiagnosticsLogEvent) => void,
    opts?: DiagnosticsStreamLogsOpts,
  ): () => void {
    const stack = getCurrentStack(1);
    this.validator.validateMethodParamOrThrow(
      "client.diagnostics",
      "unstable_streamLogs",
      "listener",
      z.function(),
      listener,
      stack,
    );
    const channel = this.diagnosticsPort.createChannel(
      "streamLogs",
      opts,
      undefined,
      {
        stack,
      },
    );
    const unsubscribe = channel.onMessage.subscribe(message => {
      if (message.type === "log") {
        listener(message.log);
      }
    });
    return () => {
      unsubscribe();
      channel.send({
        type: "stop",
      });
    };
  }
}
