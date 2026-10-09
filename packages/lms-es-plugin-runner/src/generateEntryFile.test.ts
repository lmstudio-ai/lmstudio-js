import { mkdtemp, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { createEsBuildArgs } from "./esbuildArgs.js";
import { generateEntryFileAt } from "./generateEntryFile.js";

describe("generateEntryFileAt", () => {
  it("marks the cache folder as CommonJS", async () => {
    const pluginPath = await mkdtemp(join(tmpdir(), "lms-plugin-"));
    // A plugin that declares itself ESM, as in #586.
    await writeFile(join(pluginPath, "package.json"), JSON.stringify({ type: "module" }), "utf-8");

    const cacheFolderPath = join(pluginPath, ".lmstudio");
    await generateEntryFileAt(join(cacheFolderPath, "entry.ts"), {});

    // Without this, Node resolves the bundle's module type from the plugin's own
    // package.json, reads the CommonJS bundle as ESM, and the first require()
    // throws "require is not defined in ES module scope".
    const marker = JSON.parse(await readFile(join(cacheFolderPath, "package.json"), "utf-8"));
    expect(marker.type).toBe("commonjs");
  });

  it("still writes the entry file", async () => {
    const pluginPath = await mkdtemp(join(tmpdir(), "lms-plugin-"));
    const entryFilePath = join(pluginPath, ".lmstudio", "entry.ts");

    await generateEntryFileAt(entryFilePath, {});

    const contents = await readFile(entryFilePath, "utf-8");
    expect(contents).toContain("LMStudioClient");
  });
});

describe("createEsBuildArgs", () => {
  it("declares the output format rather than inheriting it", () => {
    const args = createEsBuildArgs({ entryPath: "entry.ts", outPath: "dev.js" });
    expect(args).toContain("--format=cjs");
  });
});
