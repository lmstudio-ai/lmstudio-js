import { z, type ZodSchema } from "zod";
import {
  modelInfoBaseSchema,
  modelInstanceInfoBaseSchema,
  type ModelInfoBase,
  type ModelInstanceInfoBase,
} from "../ModelInfoBase.js";

/**
 * LLM specific information.
 *
 * @public
 */
export interface LLMAdditionalInfo {
  /**
   * Whether this model is vision-enabled (i.e. supports image input).
   */
  vision: boolean;
  /**
   * Whether this model is trained natively for tool use.
   */
  trainedForToolUse: boolean;
  /**
   * Maximum context length of the model.
   */
  maxContextLength: number;
}
export const llmAdditionalInfoSchema = z.object({
  vision: z.boolean(),
  trainedForToolUse: z.boolean(),
  maxContextLength: z.number().int(),
});

/**
 * Additional information of an LLM instance.
 *
 * @public
 */
export interface LLMInstanceAdditionalInfo {
  contextLength: number;
}
export const llmInstanceAdditionalInfoSchema = z.object({
  contextLength: z.number().int(),
});

/**
 * Info of an LLM. It is a combination of {@link ModelInfoBase} and {@link LLMAdditionalInfo}.
 *
 * @public
 */
export type LLMInfo = { type: "llm" } & ModelInfoBase & LLMAdditionalInfo;
export const llmInfoSchema = z
  .object({
    type: z.literal("llm"),
  })
  .extend(modelInfoBaseSchema.shape)
  .extend(llmAdditionalInfoSchema.shape) as ZodSchema<LLMInfo>;

/**
 * Info of a speculative-decoding drafter model. Drafters are addressable model resources for use
 * with compatible LLM loads, but they are not standalone-loadable LLMs.
 *
 * @public
 */
export type DrafterModelInfo = { type: "drafter" } & ModelInfoBase & LLMAdditionalInfo;
export const drafterModelInfoSchema = z
  .object({
    type: z.literal("drafter"),
  })
  .extend(modelInfoBaseSchema.shape)
  .extend(llmAdditionalInfoSchema.shape) as ZodSchema<DrafterModelInfo>;

/**
 * Info of a loaded LLM instance. It is a combination of {@link ModelInstanceInfoBase},
 * {@link LLMAdditionalInfo} and {@link LLMInstanceAdditionalInfo}.
 *
 * @public
 */
export type LLMInstanceInfo = { type: "llm" } & ModelInstanceInfoBase &
  LLMAdditionalInfo &
  LLMInstanceAdditionalInfo;
export const llmInstanceInfoSchema = z
  .object({
    type: z.literal("llm"),
  })
  .extend(modelInstanceInfoBaseSchema.shape)
  .extend(llmAdditionalInfoSchema.shape)
  .extend(llmInstanceAdditionalInfoSchema.shape) as ZodSchema<LLMInstanceInfo>;
