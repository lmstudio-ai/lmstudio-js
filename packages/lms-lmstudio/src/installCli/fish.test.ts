import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import { dirname, join } from "node:path";
import { applyFishInstallation, prepareFishInstallation } from "./fish.js";

let fixtureDir: string;
let targetPath: string;
let configPath: string;
let snippetPath: string;

async function write(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

async function prepare() {
  const installation = await prepareFishInstallation(targetPath);
  expect(installation).not.toBeNull();
  return installation!;
}

const legacyBlock = (target: string) =>
  `# Added by LM Studio CLI tool (lms)\nset -gx PATH $PATH ${target}\n`;

beforeEach(async () => {
  fixtureDir = await mkdtemp(join(os.tmpdir(), "lms-fish-test-"));
  targetPath = join(fixtureDir, ".lmstudio", "bin");
  configPath = join(fixtureDir, ".config", "fish", "config.fish");
  snippetPath = join(fixtureDir, ".config", "fish", "conf.d", "lms.fish");
  jest.spyOn(os, "homedir").mockReturnValue(fixtureDir);
  jest.replaceProperty(process, "env", { ...process.env, SHELL: "/bin/zsh", XDG_CONFIG_HOME: "" });
});

afterEach(async () => {
  jest.restoreAllMocks();
  await rm(fixtureDir, { recursive: true, force: true });
});

describe("fish installation", () => {
  test("does not install fish without an existing configuration directory or fish login shell", async () => {
    expect(await prepareFishInstallation(targetPath)).toBeNull();
  });

  test("supports a conf.d-only setup without creating config.fish", async () => {
    await mkdir(dirname(snippetPath), { recursive: true });
    const installation = await prepare();
    await expect(stat(snippetPath)).rejects.toMatchObject({ code: "ENOENT" });
    await applyFishInstallation(installation);
    expect(await readFile(snippetPath, "utf8")).toContain("fish_add_path --append --path");
    await expect(stat(configPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("creates conf.d for a fish login shell with no existing configuration", async () => {
    process.env.SHELL = "/opt/homebrew/bin/fish";
    await applyFishInstallation(await prepare());
    expect(await readFile(snippetPath, "utf8")).toContain(targetPath);
    await expect(stat(configPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("reinstalling does not rewrite the snippet or change custom config.fish contents", async () => {
    const customConfig = "# Personal configuration\nset -g fish_greeting\n";
    await write(configPath, customConfig);
    await applyFishInstallation(await prepare());
    const original = await readFile(snippetPath, "utf8");
    const timestamp = new Date("2000-01-01T00:00:00Z");
    await utimes(snippetPath, timestamp, timestamp);
    await applyFishInstallation(await prepare());
    expect(await readFile(snippetPath, "utf8")).toBe(original);
    expect((await stat(snippetPath)).mtime).toEqual(timestamp);
    expect(await readFile(configPath, "utf8")).toBe(customConfig);
  });

  test("removes repeated legacy blocks while preserving unmarked and user-modified commands", async () => {
    const custom = `# Personal configuration\nset -gx PATH $PATH ${targetPath}\n`;
    const modified = "# Added by LM Studio CLI tool (lms)\nset -gx PATH /custom $PATH\n";
    await write(configPath, custom + legacyBlock(targetPath) + modified + legacyBlock(targetPath));
    await applyFishInstallation(await prepare());
    expect(await readFile(configPath, "utf8")).toBe(custom + modified);
    expect(await readFile(snippetPath, "utf8")).toContain("fish_add_path --append --path");
  });

  test.each([
    "~/.lmstudio/bin",
    "$HOME/.lmstudio/bin",
    '"$HOME/.lmstudio/bin"',
    "absolute",
    "single-quoted",
    "double-quoted",
  ])("migrates a recognized legacy block with a %s target", async spelling => {
    const target =
      spelling === "absolute"
        ? targetPath
        : spelling === "single-quoted"
          ? `'${targetPath}'`
          : spelling === "double-quoted"
            ? `"${targetPath}"`
            : spelling;
    await write(configPath, legacyBlock(target));
    await applyFishInstallation(await prepare());
    expect(await readFile(configPath, "utf8")).toBe("");
  });

  test("preserves CRLF in surrounding configuration", async () => {
    await write(
      configPath,
      "# before\r\n" + legacyBlock(targetPath).replaceAll("\n", "\r\n") + "# after\r\n",
    );
    await applyFishInstallation(await prepare());
    expect(await readFile(configPath, "utf8")).toBe("# before\r\n# after\r\n");
  });

  test("reuses a corrected block in lms.fish and preserves custom functions", async () => {
    const helpers = "function lmsup\n    lms server start\nend\n\n";
    await write(
      snippetPath,
      helpers +
        '# Added by LM Studio CLI (lms)\nfish_add_path "$HOME/.lmstudio/bin"\n# End of LM Studio CLI section\n',
    );
    await applyFishInstallation(await prepare());
    const snippet = await readFile(snippetPath, "utf8");
    expect(snippet.startsWith(helpers)).toBe(true);
    expect(snippet).not.toContain("# Added by LM Studio CLI (lms)");
    expect(snippet.match(/fish_add_path --append --path/g)).toHaveLength(1);
    await expect(stat(configPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("appends to a custom snippet without a final newline", async () => {
    await write(snippetPath, "# My helpers");
    await applyFishInstallation(await prepare());
    expect(await readFile(snippetPath, "utf8")).toMatch(/^# My helpers\n# >>> LM Studio CLI/);
  });

  test("updates a managed target and preserves content following the block", async () => {
    process.env.SHELL = "/usr/bin/fish";
    await applyFishInstallation(await prepare());
    await write(snippetPath, (await readFile(snippetPath, "utf8")) + "# custom footer\n");
    const oldTarget = targetPath;
    targetPath = join(fixtureDir, "custom models", "bin");
    await applyFishInstallation(await prepare());
    const snippet = await readFile(snippetPath, "utf8");
    expect(snippet).not.toContain(oldTarget);
    expect(snippet).toContain(targetPath);
    expect(snippet.endsWith("# custom footer\n")).toBe(true);
  });

  test("a comment mentioning the target does not suppress installation", async () => {
    await write(configPath, `# ${targetPath}\n`);
    await applyFishInstallation(await prepare());
    expect(await readFile(snippetPath, "utf8")).toContain("fish_add_path --append --path");
    expect(await readFile(configPath, "utf8")).toBe(`# ${targetPath}\n`);
  });

  test("respects XDG_CONFIG_HOME and migrates both the active and old hardcoded config paths", async () => {
    process.env.XDG_CONFIG_HOME = join(fixtureDir, "custom config");
    const activeConfig = join(process.env.XDG_CONFIG_HOME, "fish", "config.fish");
    await write(activeConfig, "# active\n" + legacyBlock(targetPath));
    await write(configPath, "# default\n" + legacyBlock(targetPath));
    const installation = await prepare();
    expect(installation.configPath).toBe(
      join(process.env.XDG_CONFIG_HOME, "fish", "conf.d", "lms.fish"),
    );
    await applyFishInstallation(installation);
    expect(await readFile(activeConfig, "utf8")).toBe("# active\n");
    expect(await readFile(configPath, "utf8")).toBe("# default\n");
    await expect(stat(snippetPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  test.each([undefined, "", "relative/config"])(
    "uses ~/.config for XDG_CONFIG_HOME=%s",
    async value => {
      if (value === undefined) {
        delete process.env.XDG_CONFIG_HOME;
      } else {
        process.env.XDG_CONFIG_HOME = value;
      }
      process.env.SHELL = "/usr/bin/fish";
      expect((await prepare()).configPath).toBe(snippetPath);
    },
  );

  test("does not remove legacy configuration if the snippet cannot be written", async () => {
    const legacy = legacyBlock(targetPath);
    await write(configPath, legacy);
    const installation = await prepare();
    await mkdir(snippetPath, { recursive: true });
    await expect(applyFishInstallation(installation)).rejects.toMatchObject({ code: "EISDIR" });
    expect(await readFile(configPath, "utf8")).toBe(legacy);
  });

  test.each([
    "# >>> LM Studio CLI (lms) >>>\n# user text\n",
    "# >>> LM Studio CLI (lms) >>>\n# >>> LM Studio CLI (lms) >>>\n# user text\n# <<< LM Studio CLI (lms) <<<\n",
  ])("preserves malformed managed blocks and reports the problem", async incomplete => {
    await write(snippetPath, incomplete);
    await expect(prepareFishInstallation(targetPath)).rejects.toThrow(
      "Incomplete LM Studio CLI block",
    );
    expect(await readFile(snippetPath, "utf8")).toBe(incomplete);
  });
});

const fishAvailable = spawnSync("fish", ["--version"]).status === 0;
const describeWithFish = fishAvailable ? describe : describe.skip;

describeWithFish("generated snippet in fish", () => {
  function runFish(command: string, ...args: Array<string>) {
    return execFileSync("fish", ["--no-config", "--command", command, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        XDG_CONFIG_HOME: join(fixtureDir, ".config"),
        XDG_DATA_HOME: join(fixtureDir, "data"),
        XDG_CACHE_HOME: join(fixtureDir, "cache"),
      },
    }).trim();
  }

  beforeEach(async () => {
    process.env.SHELL = "/usr/bin/fish";
    targetPath = join(fixtureDir, "model tools' $literal (test) \\folder", "bin");
    await mkdir(targetPath, { recursive: true });
    await applyFishInstallation(await prepare());
  });

  test.each([false, true])(
    "does not duplicate PATH on repeated sourcing (compatibility fallback: %s)",
    fallback => {
      const disableFishAddPath = fallback
        ? "set -g fish_function_path; functions -e fish_add_path"
        : "";
      const result = runFish(
        `set -g fish_user_paths
set -gx PATH /usr/bin /bin
${disableFishAddPath}
for run in 1 2 3
    source $argv[1]
    count (string match -- $argv[2] $PATH)
end
printf '%s\\n' $PATH`,
        snippetPath,
        targetPath,
      );
      expect(result).toBe(`1\n1\n1\n/usr/bin\n/bin\n${targetPath}`);
    },
  );

  test("keeps one PATH entry in nested fish", () => {
    expect(
      runFish(
        `set -g fish_user_paths
set -gx PATH /usr/bin /bin
source $argv[1]
set -l fish_executable (status fish-path)
$fish_executable --no-config --command 'source $argv[1]; count (string match -- $argv[2] $PATH)' $argv[1] $argv[2]`,
        snippetPath,
        targetPath,
      ),
    ).toBe("1");
  });

  test("does not set a universal fish_user_paths variable", () => {
    expect(
      runFish(
        "source $argv[1]; set --query --universal fish_user_paths; echo $status",
        snippetPath,
      ),
    ).toBe("1");
  });

  test("fish automatically loads the snippet at startup", () => {
    const fishExecutable = runFish("status fish-path");
    expect(
      execFileSync(
        fishExecutable,
        ["--command", "count (string match -- $argv[1] $PATH)", targetPath],
        {
          encoding: "utf8",
          env: {
            PATH: "/usr/bin:/bin",
            XDG_CONFIG_HOME: join(fixtureDir, ".config"),
            XDG_DATA_HOME: join(fixtureDir, "data"),
            XDG_CACHE_HOME: join(fixtureDir, "cache"),
          },
        },
      ).trim(),
    ).toBe("1");
  });
});
