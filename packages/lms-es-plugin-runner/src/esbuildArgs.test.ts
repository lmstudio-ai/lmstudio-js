import { execFile } from "child_process";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { basename, join } from "path";
import { promisify } from "util";
import { createEsBuildArgs } from "./esbuildArgs.js";

const execFileAsync = promisify(execFile);

test("Node plugin builds use ESM output", () => {
  const args = createEsBuildArgs({
    entryPath: "/tmp/plugin/.lmstudio/entry.ts",
    outPath: "/tmp/plugin/.lmstudio/production.js",
    production: true,
  });

  expect(args).toContain("--format=esm");
  expect(args).toContain(
    '--banner:js=import { createRequire as __lmsCreateRequire } from "module"; import { fileURLToPath as __lmsFileURLToPath } from "url"; import { dirname as __lmsDirname } from "path"; if (!("require" in globalThis)) Object.defineProperty(globalThis, "require", { value: __lmsCreateRequire(import.meta.url), configurable: true }); if (!("__filename" in globalThis)) Object.defineProperty(globalThis, "__filename", { value: __lmsFileURLToPath(import.meta.url), configurable: true }); if (!("__dirname" in globalThis)) Object.defineProperty(globalThis, "__dirname", { value: __lmsDirname(globalThis.__filename), configurable: true });',
  );
});

test("ESM build banner restores CommonJS file globals", async () => {
  const args = createEsBuildArgs({
    entryPath: "/tmp/plugin/.lmstudio/entry.ts",
    outPath: "/tmp/plugin/.lmstudio/production.js",
  });
  const banner = args.find(arg => arg.startsWith("--banner:js="))!.slice("--banner:js=".length);
  const directory = await mkdtemp(join(tmpdir(), "lms-esm-banner-"));
  const bundlePath = join(directory, "bundle.mjs");

  try {
    await writeFile(
      bundlePath,
      `${banner}\nconsole.log(JSON.stringify({ requireType: typeof require, filename: __filename, dirname: __dirname }));`,
      "utf-8",
    );
    const { stdout } = await execFileAsync(process.execPath, [bundlePath]);
    const globals = JSON.parse(stdout) as {
      requireType: string;
      filename: string;
      dirname: string;
    };

    expect(globals.requireType).toBe("function");
    expect(basename(globals.filename)).toBe("bundle.mjs");
    expect(globals.dirname).toBe(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("ESM build banner does not collide with plugin-provided file globals", async () => {
  const args = createEsBuildArgs({
    entryPath: "/tmp/plugin/.lmstudio/entry.ts",
    outPath: "/tmp/plugin/.lmstudio/production.js",
  });
  const banner = args.find(arg => arg.startsWith("--banner:js="))!.slice("--banner:js=".length);
  const directory = await mkdtemp(join(tmpdir(), "lms-esm-banner-collision-"));
  const bundlePath = join(directory, "bundle.mjs");

  try {
    await writeFile(
      bundlePath,
      `${banner}\nconst require = "plugin require"; const __filename = "plugin filename"; const __dirname = "plugin dirname"; console.log(JSON.stringify({ require, filename: __filename, dirname: __dirname }));`,
      "utf-8",
    );
    const { stdout } = await execFileAsync(process.execPath, [bundlePath]);
    expect(JSON.parse(stdout)).toEqual({
      require: "plugin require",
      filename: "plugin filename",
      dirname: "plugin dirname",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
