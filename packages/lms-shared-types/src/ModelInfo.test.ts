import { modelInfoSchema } from "./ModelInfo.js";

const baseModelInfo = {
  modelKey: "test/drafter",
  format: "gguf",
  displayName: "Test Drafter",
  publisher: "test",
  path: "test/drafter/model.gguf",
  sizeBytes: 123,
  indexedModelIdentifier: "test/drafter/model.gguf",
  deviceIdentifier: null,
  vision: false,
  trainedForToolUse: false,
  maxContextLength: 4096,
};

describe("modelInfoSchema", () => {
  it("accepts drafter model info", () => {
    expect(
      modelInfoSchema.parse({
        type: "drafter",
        ...baseModelInfo,
      }),
    ).toEqual({
      type: "drafter",
      ...baseModelInfo,
    });
  });
});
