import { mkdtemp, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { generateEntryFileAt } from "./generateEntryFile.js";

test("generating a plugin entry file marks the cache directory as ESM", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lms-plugin-runner-"));

  await generateEntryFileAt(join(directory, "entry.ts"), {});

  await expect(readFile(join(directory, "package.json"), "utf-8")).resolves.toBe(
    '{"type":"module"}\n',
  );
});
