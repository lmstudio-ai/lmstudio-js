import { z } from "zod";

/**
 * Represents the quantization of a model.
 *
 * @public
 */
export type Quantization = {
  /**
   * Name of the quantization.
   */
  name: string;
  /**
   * Roughly how many bits this quantization uses per value. This is not accurate and can vary from
   * the actual BPW (bits per weight) of the quantization. Gives a rough idea of the
   * quantization level.
   */
  bits: number;
};
export const quantizationSchema = z.object({
  name: z.string(),
  bits: z.number().int(),
});
