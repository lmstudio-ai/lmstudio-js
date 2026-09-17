import {
  modelCompatibilityTypeSchema,
  type ModelCompatibilityType,
} from "./ModelCompatibilityType.js";
import { modelFormatNameSchema, type ModelFormatName } from "./RuntimeCommon.js";

it("accepts the yuzu compatibility and format-name atoms", () => {
  const compatibility: ModelCompatibilityType = "yuzu";
  const formatName: ModelFormatName = "yuzu";
  expect(modelCompatibilityTypeSchema.parse(compatibility)).toBe("yuzu");
  expect(modelFormatNameSchema.parse(formatName)).toBe("yuzu");
});

it.each(["gguf", "safetensors", "onnx", "ggml", "pte", "mlx_placeholder", "torch_safetensors"])(
  "preserves public compatibility %s",
  value => {
    expect(modelCompatibilityTypeSchema.parse(value)).toBe(value);
  },
);

it.each(["GGUF", "MLX", "GGML", "PT", "PTE"])("preserves display format %s", value => {
  expect(modelFormatNameSchema.parse(value)).toBe(value);
});
