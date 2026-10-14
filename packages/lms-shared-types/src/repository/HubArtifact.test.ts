import { hubArtifactSchema, type HubModel } from "./HubArtifact.js";

it("parses a decision model from the Hub without requiring LLM capabilities", () => {
  const model: HubModel = {
    type: "model",
    owner: "example-org",
    name: "decision-model",
    description: "An organization-curated decision model",
    downloads: 0,
    likeCount: 0,
    metadata: {
      type: "decision",
      architectures: ["qwen2"],
      compatibilityTypes: ["gguf"],
      paramsStrings: ["7B"],
      minMemoryUsageBytes: 4_000_000_000,
      contextLengths: [4096],
    },
  };

  expect(hubArtifactSchema.parse(model)).toEqual(model);
});
