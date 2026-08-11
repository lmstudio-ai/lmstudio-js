import { artifactManifestSchema, artifactTypeSchema } from "./ArtifactManifest.js";

describe("skill artifact manifests", () => {
  it("parses skills with ordinary artifact dependencies", () => {
    expect(
      artifactManifestSchema.parse({
        type: "skill",
        owner: "lmstudio",
        name: "code-review",
        revision: 3,
        dependencies: [
          { type: "artifact", owner: "lmstudio", name: "dependency", purpose: "custom" },
        ],
      }),
    ).toEqual({
      type: "skill",
      owner: "lmstudio",
      name: "code-review",
      revision: 3,
      dependencies: [
        { type: "artifact", owner: "lmstudio", name: "dependency", purpose: "custom" },
      ],
    });
    expect(artifactTypeSchema.parse("skill")).toBe("skill");
  });
});
