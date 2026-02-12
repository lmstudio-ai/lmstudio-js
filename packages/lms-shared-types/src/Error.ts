import { z, type ZodSchema } from "zod";
import {
  type GenericErrorDisplayData,
  genericErrorDisplayDataSchema,
} from "./GenericErrorDisplayData.js";
import { type LLMErrorDisplayData, llmErrorDisplayDataSchema } from "./llm/LLMErrorDisplayData.js";

export const errorDisplayDataSchema = z.discriminatedUnion("code", [
  ...llmErrorDisplayDataSchema,
  ...genericErrorDisplayDataSchema,
]);

export type ErrorDisplayData = LLMErrorDisplayData | GenericErrorDisplayData;

/**
 * Makes a Zod schema that turns a failed parse into an `undefined`.
 */
function failOk<T>(schema: ZodSchema<T>): ZodSchema<T | undefined> {
  return z.any().transform(val => (schema.safeParse(val).success ? val : undefined));
}

export interface SerializedLMSExtendedError {
  title: string;
  cause?: string;
  suggestion?: string;
  errorData?: Record<string, unknown>;
  displayData?: ErrorDisplayData;
  stack?: string;
  rootTitle?: string;
}
export const serializedLMSExtendedErrorSchema = z.object({
  title: failOk(z.string()).default("Unknown error"),
  cause: failOk(z.string()).optional(),
  suggestion: failOk(z.string()).optional(),
  errorData: failOk(z.record(z.string(), z.unknown())).optional(),
  displayData: failOk(errorDisplayDataSchema).optional(),
  stack: failOk(z.string()).optional(),
  rootTitle: failOk(z.string()).optional(),
}) as ZodSchema<SerializedLMSExtendedError>;
export function serializeError(error: any): SerializedLMSExtendedError {
  if (typeof error === "object") {
    const title = error.title ?? error.lmstudioRawError ?? error.message ?? "Unknown error";
    return serializedLMSExtendedErrorSchema.parse({
      title,
      cause: error.cause,
      suggestion: error.suggestion,
      errorData: error.errorData,
      displayData: error.displayData,
      stack: error.stack,
      rootTitle: title,
    });
  } else {
    const title = String(error);
    return {
      title,
      rootTitle: title,
    };
  }
}

/**
 * Attaches the additional error data from a serialized error to an error object.
 */
export function attachSerializedErrorData(
  error: Error,
  serialized: SerializedLMSExtendedError,
): void {
  const untypedError = error as any;
  untypedError.title = serialized.title;
  if (serialized.cause !== undefined) {
    untypedError.cause = serialized.cause;
  }
  if (serialized.suggestion !== undefined) {
    untypedError.suggestion = serialized.suggestion;
  }
  if (serialized.errorData !== undefined) {
    untypedError.errorData = serialized.errorData;
  }
}
export function fromSerializedError(
  error: SerializedLMSExtendedError,
  message = "Rehydrated error",
  replacementStack?: string,
): Error {
  const result = new Error(error.rootTitle) as any;
  attachSerializedErrorData(result, error);
  if (error.displayData !== undefined) {
    result.displayData = error.displayData;
  }
  if (replacementStack !== undefined) {
    if (error.stack !== undefined) {
      result.stack = `Error: ${message}\n${replacementStack}\n- Caused By: ${error.stack}`;
    } else {
      result.stack = `Error: ${message}\n${replacementStack}`;
    }
  } else {
    if (error.stack !== undefined) {
      result.stack =
        `Error: ${message}\n${result.stack.substring(error.stack.indexOf("\n") + 1)}\n- Caused By: ` +
        error.stack;
    } else {
      result.message += ` - caused by error without stack (${error.title})`;
    }
  }
  return result;
}
/**
 * Recreate an error as-is.
 */
export function recreateSerializedError(error: SerializedLMSExtendedError) {
  const result = new Error(error.title) as any;
  result.name = "LMSExtendedError";
  attachSerializedErrorData(result, error);
  return result;
}

export function extractDisplayData(error: Error): ErrorDisplayData | undefined {
  return (error as any).displayData;
}
