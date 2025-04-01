import { z, type ZodSchema } from "zod";
import { kvConfigSchema, type KVConfig } from "./KVConfig.js";

export interface VirtualModelDefinition {
  /**
   * The self proclaimed indexed model identifier. Should always be in the shape of user/repo.
   */
  model: string;
  /**
   * The next model in the inheritance chain.
   */
  base: string;
  config?: {
    load?: KVConfig;
    operation?: KVConfig;
  };
}
export const virtualModelDefinitionSchema = z.object({
  model: z.string().regex(/^[^/]+\/[^/]+$/),
  base: z.string(),
  config: z
    .object({
      load: kvConfigSchema.optional(),
      operation: kvConfigSchema.optional(),
    })
    .optional(),
}) as ZodSchema<VirtualModelDefinition>;
