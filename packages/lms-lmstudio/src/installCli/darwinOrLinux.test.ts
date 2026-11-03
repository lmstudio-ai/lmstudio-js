import inquirer from "inquirer";
import { execSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import { dirname, join } from "node:path";
import { installCliDarwinOrLinux } from "./darwinOrLinux.js";

jest.mock("node:child_process", () => ({ execSync: jest.fn() }));

let fixtureDir: string;
let targetPath: string;
let configPath: string;
let snippetPath: string;

beforeEach(async () => {
  fixtureDir = await mkdtemp(join(os.tmpdir(), "lms-installer-test-"));
  targetPath = join(fixtureDir, ".lmstudio", "bin");
  configPath = join(fixtureDir, ".config", "fish", "config.fish");
  snippetPath = join(fixtureDir, ".config", "fish", "conf.d", "lms.fish");
  jest.spyOn(os, "homedir").mockReturnValue(fixtureDir);
  jest.replaceProperty(process, "env", {
    ...process.env,
    SHELL: "/usr/bin/fish",
    XDG_CONFIG_HOME: "",
  });
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.mocked(execSync).mockClear();
});

afterEach(async () => {
  jest.restoreAllMocks();
  await rm(fixtureDir, { recursive: true, force: true });
});

test("migrates fish even when config.fish already contains the absolute target", async () => {
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    `# Added by LM Studio CLI tool (lms)\nset -gx PATH $PATH ${targetPath}\n`,
  );
  await installCliDarwinOrLinux(targetPath, { skipConfirmation: true });
  expect(await readFile(configPath, "utf8")).toBe("");
  expect(await readFile(snippetPath, "utf8")).toContain("fish_add_path --append --path");
  expect(execSync).not.toHaveBeenCalled();
});

test("reports the snippet destination on installation and subsequent already-installed runs", async () => {
  process.env.XDG_CONFIG_HOME = join(fixtureDir, "custom config");
  const destination = join(process.env.XDG_CONFIG_HOME, "fish", "conf.d", "lms.fish");
  await installCliDarwinOrLinux(targetPath, { skipConfirmation: true });
  expect(console.info).toHaveBeenCalledWith(expect.stringContaining(destination));
  jest.mocked(console.info).mockClear();
  await installCliDarwinOrLinux(targetPath, { skipConfirmation: true });
  expect(console.info).toHaveBeenCalledWith(expect.stringContaining("Already Installed"));
  expect(console.info).toHaveBeenCalledWith(expect.stringContaining(`(${destination})`));
  expect(execSync).not.toHaveBeenCalled();
});

test.each([false, true])(
  "honors confirmation before any fish writes (continue: %s)",
  async cont => {
    await mkdir(dirname(configPath), { recursive: true });
    const legacy = `# Added by LM Studio CLI tool (lms)\nset -gx PATH $PATH ${targetPath}\n`;
    await writeFile(configPath, legacy);
    const prompt = jest.fn().mockResolvedValue({ cont });
    jest
      .spyOn(inquirer, "createPromptModule")
      .mockReturnValue(prompt as unknown as ReturnType<typeof inquirer.createPromptModule>);
    await installCliDarwinOrLinux(targetPath, {});
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining(snippetPath));
    if (cont) {
      expect(await readFile(configPath, "utf8")).toBe("");
      expect(await readFile(snippetPath, "utf8")).toContain("fish_add_path");
    } else {
      expect(await readFile(configPath, "utf8")).toBe(legacy);
      await expect(stat(snippetPath)).rejects.toMatchObject({ code: "ENOENT" });
    }
  },
);

test("leaves the existing bash installation command unchanged", async () => {
  process.env.SHELL = "/bin/bash";
  await writeFile(join(fixtureDir, ".bashrc"), "# personal config\n");
  await installCliDarwinOrLinux(targetPath, { skipConfirmation: true });
  expect(execSync).toHaveBeenCalledWith(
    `echo '' >> ~/.bashrc && echo '# Added by LM Studio CLI tool (lms)' >> ~/.bashrc && echo 'export PATH="$PATH:${targetPath}"' >> ~/.bashrc`,
  );
  await expect(stat(snippetPath)).rejects.toMatchObject({ code: "ENOENT" });
});

test("installs fish alongside an existing zsh configuration", async () => {
  await writeFile(join(fixtureDir, ".zshrc"), "# personal config\n");
  await installCliDarwinOrLinux(targetPath, { skipConfirmation: true });
  expect(execSync).toHaveBeenCalledTimes(1);
  expect(execSync).toHaveBeenCalledWith(expect.stringContaining(">> ~/.zshrc"));
  expect(await readFile(snippetPath, "utf8")).toContain("fish_add_path");
});
