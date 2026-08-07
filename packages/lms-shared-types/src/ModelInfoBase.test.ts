import { modelInfoBaseSchema } from "./ModelInfoBase.js";

const modelInfoBasePayload = {
  modelKey: "publisher/model",
  format: "gguf",
  displayName: "Model",
  publisher: "publisher",
  path: "publisher/model/model.gguf",
  sizeBytes: 123,
  indexedModelIdentifier: "publisher/model/model.gguf",
  deviceIdentifier: null,
};

describe("modelInfoBaseSchema", () => {
  it("defaults isDraftOnly to false for older server payloads", () => {
    expect(modelInfoBaseSchema.parse(modelInfoBasePayload).isDraftOnly).toBe(false);
  });

  it("preserves explicit isDraftOnly values", () => {
    expect(
      modelInfoBaseSchema.parse({
        ...modelInfoBasePayload,
        isDraftOnly: true,
      }).isDraftOnly,
    ).toBe(true);
  });
});
