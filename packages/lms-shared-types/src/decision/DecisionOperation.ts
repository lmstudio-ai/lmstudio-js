import { z } from "zod";

/** Internal app/engine/Link contract; not a public SDK inference API. */
export type DecisionJSONValue =
  | null
  | boolean
  | number
  | string
  | DecisionJSONObject
  | DecisionJSONValue[];
export interface DecisionJSONObject {
  [key: string]: DecisionJSONValue;
}
export type DecisionContent = string | DecisionJSONObject | DecisionJSONValue[];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

function isJSONValue(value: unknown, ancestors = new Set<object>()): value is DecisionJSONValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (!Array.isArray(value) && !isPlainObject(value)) {
    return false;
  }
  if (ancestors.has(value)) {
    return false;
  }
  ancestors.add(value);
  const valid = Object.values(value).every(child => isJSONValue(child, ancestors));
  ancestors.delete(value);
  return valid;
}

const jsonValueSchema = z.custom<DecisionJSONValue>(isJSONValue, "Expected a JSON-safe value");
const contentSchema = jsonValueSchema.superRefine((value, context) => {
  if (typeof value !== "string" && (value === null || typeof value !== "object")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Expected a string, object or array",
      fatal: true,
    });
  }
}) as z.ZodType<DecisionContent>;

// z.record drops __proto__ during parsing. These are wire objects, not runtime stores: retain all
// own ids without assigning them through an object's prototype setter or interpreting inherited ids.
function recordSchema<TValue>(valueSchema: z.ZodType<TValue>) {
  return z
    .custom<Record<string, TValue>>(isPlainObject, "Expected an object")
    .superRefine((value, context) => {
      for (const [key, child] of Object.entries(value)) {
        const parsed = valueSchema.safeParse(child);
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            context.addIssue({ ...issue, path: [key, ...issue.path], fatal: true });
          }
        }
      }
    });
}

export const decisionQuestionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("choice"),
    instructions: contentSchema,
    criteria: recordSchema(jsonValueSchema).refine(
      criteria => Object.keys(criteria).length > 0,
      "Expected at least one choice",
    ),
  }),
  z.object({
    type: z.literal("score"),
    instructions: contentSchema,
    criteria: z.array(jsonValueSchema).min(2).max(10),
  }),
  z.object({
    type: z.literal("noul"),
    instructions: contentSchema,
    criteria: z
      .object({ true: jsonValueSchema.optional(), false: jsonValueSchema.optional() })
      .nullable()
      .optional(),
  }),
]);
export type DecisionQuestion = z.infer<typeof decisionQuestionSchema>;

export const decisionImageDataURLSchema = z
  .string()
  .regex(
    /^data:image\/[a-zA-Z0-9.+-]+;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
    "Expected an inline base64 image data URL (data:image/...;base64,...); HTTP(S) URLs and file references are not supported",
  )
  .refine(
    value => value.substring(value.indexOf(",") + 1).length > 0,
    "Expected non-empty inline base64 image data (data:image/...;base64,...)",
  );

export const decisionRequestSchema = z
  .object({
    state: contentSchema,
    questions: recordSchema(decisionQuestionSchema).refine(
      questions => Object.keys(questions).length > 0,
      "Expected at least one question",
    ),
    images: z.array(decisionImageDataURLSchema).optional(),
  })
  .superRefine(({ state }, context) => {
    const messages = Array.isArray(state)
      ? state
      : isPlainObject(state)
        ? state.messages
        : undefined;
    if (!Array.isArray(messages)) {
      return;
    }
    for (const [messageIndex, message] of messages.entries()) {
      if (!isPlainObject(message) || !Array.isArray(message.content)) {
        continue;
      }
      for (const [partIndex, part] of message.content.entries()) {
        if (!isPlainObject(part) || part.type !== "image_url") {
          continue;
        }
        const imageURL = isPlainObject(part.image_url) ? part.image_url.url : part.image_url;
        const parsed = decisionImageDataURLSchema.safeParse(imageURL);
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            context.addIssue({
              ...issue,
              path: [
                "state",
                ...(Array.isArray(state) ? [] : ["messages"]),
                messageIndex,
                "content",
                partIndex,
                "image_url",
                ...(isPlainObject(part.image_url) ? ["url"] : []),
              ],
            });
          }
        }
      }
    }
  });
export type DecisionRequest = z.infer<typeof decisionRequestSchema>;

const probabilitySchema = z.number().finite().min(0).max(1);
export const decisionAnswerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("choice"),
    choice: z.string(),
    probabilities: recordSchema(probabilitySchema),
    confidence: probabilitySchema,
  }),
  z.object({
    type: z.literal("score"),
    score: z.number().finite(),
    legend: recordSchema(jsonValueSchema),
    probabilities: recordSchema(probabilitySchema),
    confidence: probabilitySchema,
  }),
  z.object({ type: z.literal("noul"), noul: probabilitySchema }),
]);
export type DecisionAnswer = z.infer<typeof decisionAnswerSchema>;
export const decisionResultSchema = z.object({
  model: z.string(),
  answers: recordSchema(decisionAnswerSchema),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});
export type DecisionResult = z.infer<typeof decisionResultSchema>;

/** Safe additions to the existing SerializedLMSExtendedError.errorData, not a new error envelope.
 * Standard AbortError/TimeoutError names distinguish cancellation and transport timeout.
 * Phase 3 preserves safe HTTP status/capability data; raw bodies, paths and credentials are excluded.
 */
export interface DecisionOperationErrorData {
  name: string;
  code?: string | number;
  capability?: string;
  status?: number;
  validationStage?: "request" | "result";
}

/** Schema for a particular operation's result, without merging/coercing engine artifacts. */
export function decisionResultSchemaForRequest(request: DecisionRequest) {
  return decisionResultSchema.superRefine((result, context) => {
    const questionIds = Object.keys(request.questions);
    if (Object.keys(result.answers).length !== questionIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["answers"],
        message: "Answer ids must match question ids",
      });
    }
    for (const questionId of questionIds) {
      const question = request.questions[questionId];
      const answer = Object.hasOwn(result.answers, questionId)
        ? result.answers[questionId]
        : undefined;
      if (answer === undefined || answer.type !== question.type) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["answers", questionId],
          message: "Answer id/type must match the submitted question",
        });
        continue;
      }
      if (question.type === "noul" || answer.type === "noul") {
        continue;
      }
      const optionIds =
        question.type === "choice"
          ? Object.keys(question.criteria)
          : question.criteria.map((_, index) => String(index));
      const hasExactIds = (value: object) =>
        Object.keys(value).length === optionIds.length &&
        optionIds.every(optionId => Object.hasOwn(value, optionId));
      if (!hasExactIds(answer.probabilities)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["answers", questionId, "probabilities"],
          message: "Probability ids must match the submitted criteria",
        });
      }
      if (answer.type === "choice" && !optionIds.includes(answer.choice)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["answers", questionId, "choice"],
          message: "Unknown choice",
        });
      }
      if (
        answer.type === "score" &&
        (!hasExactIds(answer.legend) || answer.score < 0 || answer.score > optionIds.length - 1)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["answers", questionId],
          message: "Score/legend must match the submitted levels",
        });
      }
    }
  });
}
