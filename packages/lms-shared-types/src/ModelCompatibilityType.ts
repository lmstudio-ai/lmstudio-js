import { z } from "zod";

/**
 * @public
 */
export type ModelCompatibilityType =
  | "gguf"
  | "safetensors"
  | "onnx"
  | "ggml"
  | "pte"
  | "mlx_placeholder"
  | "torch_safetensors";
export const modelCompatibilityTypeSchema = z.enum([
  "gguf",
  "safetensors",
  "onnx",
  "ggml",
  "pte",
  "mlx_placeholder",
  "torch_safetensors",
]);
