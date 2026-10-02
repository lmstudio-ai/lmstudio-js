import { virtualModelDefinitionSchema } from "./VirtualModelDefinition.js";

it("preserves a curated decision domain without restricting model architectures", () => {
  const definition = {
    model: "publisher/decision-model",
    base: [{ key: "publisher/concrete-model", sources: [] }],
    metadataOverrides: {
      domain: "decision",
      architectures: ["future-family"],
      compatibilityTypes: ["gguf"],
      contextLengths: [8192],
    },
  };

  expect(virtualModelDefinitionSchema.parse(definition)).toEqual(definition);
});
