import { z, type ZodSchema } from "zod";
import { kvConfigSchema, type KVConfig } from "./KVConfig.js";

export interface VirtualModelDefinition {
  /**
   * The self proclaimed indexed model identifier. Should always be in the shape of user/repo.
   */
  model: string;
  /**
   * The model key of the next model in the inheritance chain. If multiple models are matched,
   * LM Studio will pick the best one based on hardware and installed engines.
   *
   * If an array is provided, any model matching any of the model keys will be considered.
   */
  base: string | Array<string>;
  config?: {
    load?: KVConfig;
    operation?: KVConfig;
  };
}
export const virtualModelDefinitionSchema = z.object({
  model: z.string().regex(/^[^/]+\/[^/]+$/),
  base: z.string().or(z.array(z.string())),
  config: z
    .object({
      load: kvConfigSchema.optional(),
      operation: kvConfigSchema.optional(),
    })
    .optional(),
}) as ZodSchema<VirtualModelDefinition>;
