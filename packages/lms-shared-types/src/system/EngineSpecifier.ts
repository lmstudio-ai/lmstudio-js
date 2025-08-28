import { z, type ZodSchema } from "zod";

// Step 1b. Define the EngineSpecifier type and schema
/**
 *
 * The specifier for an engine.
 *
 * To make qualifications about experimental, deprecated, etc, visit the lmstudio-js/experimental
 * docs from the lmstudio internal wiki.
 *
 * @experimental [QUALIFIER] Details
 * @deprecated [QUALIFIER] Details
 *
 * @public
 */
export interface EngineSpecifier {
  /**
   * The name of the engine
   */
  name: string;
  version: string;
}
// define schema for type and cast schema as ZodSchema<Type>
export const engineSpecifierSchema = z.object({
  name: z.string(),
  version: z.string(),
}) as ZodSchema<EngineSpecifier>;
