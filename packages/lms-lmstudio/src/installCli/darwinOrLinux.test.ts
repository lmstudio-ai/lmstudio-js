import os from "node:os";
import { access, readFile } from "node:fs/promises";
import { installCliDarwinOrLinux } from "./darwinOrLinux";
import { getZshConfigPath } from "./zshConfigPath";

jest.mock("node:fs/promises", () => ({
  access: jest.fn(),
  readFile: jest.fn(),
}));

jest.mock(
  "@lmstudio/lms-common",
  () => ({
    makeTitledPrettyError: jest.fn(),
    text: (strings: TemplateStringsArray, ...values: Array<unknown>) =>
      strings.reduce(
        (result, part, index) =>
          `${result}${part}${index < values.length ? String(values[index]) : ""}`,
        "",
      ),
  }),
  { virtual: true },
);

describe("getZshConfigPath", () => {
  const originalZdotdir = process.env.ZDOTDIR;

  afterEach(() => {
    if (originalZdotdir === undefined) {
      delete process.env.ZDOTDIR;
    } else {
      process.env.ZDOTDIR = originalZdotdir;
    }
  });

  it("uses ZDOTDIR for zsh when it is set", () => {
    process.env.ZDOTDIR = "/tmp/custom-zsh";

    expect(getZshConfigPath()).toBe("/tmp/custom-zsh/.zshrc");
  });

  it("falls back to the home directory for zsh when ZDOTDIR is unset", () => {
    delete process.env.ZDOTDIR;

    expect(getZshConfigPath()).toBe(`${os.homedir()}/.zshrc`);
  });
});

describe("installCliDarwinOrLinux", () => {
  const originalZdotdir = process.env.ZDOTDIR;
  const accessMock = access as jest.MockedFunction<typeof access>;
  const readFileMock = readFile as jest.MockedFunction<typeof readFile>;

  afterEach(() => {
    if (originalZdotdir === undefined) {
      delete process.env.ZDOTDIR;
    } else {
      process.env.ZDOTDIR = originalZdotdir;
    }
    jest.restoreAllMocks();
    accessMock.mockReset();
    readFileMock.mockReset();
  });

  it("reports the resolved zsh config path when ZDOTDIR is set", async () => {
    process.env.ZDOTDIR = "/tmp/custom-zsh";
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});

    accessMock.mockImplementation(async configPath => {
      if (configPath === "/tmp/custom-zsh/.zshrc") {
        return;
      }
      throw new Error("missing config");
    });
    readFileMock.mockResolvedValue(
      'export PATH="$PATH:/Applications/LM Studio.app/Contents/Resources/app/.webpack/bin"',
    );

    await installCliDarwinOrLinux(
      "/Applications/LM Studio.app/Contents/Resources/app/.webpack/bin",
      {
        skipConfirmation: true,
      },
    );

    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("/tmp/custom-zsh/.zshrc"));
  });

  it("reports the bash config path in the home directory", async () => {
    const bashConfigPath = `${os.homedir()}/.bashrc`;
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});

    accessMock.mockImplementation(async configPath => {
      if (configPath === bashConfigPath) {
        return;
      }
      throw new Error("missing config");
    });
    readFileMock.mockResolvedValue(
      'export PATH="$PATH:/Applications/LM Studio.app/Contents/Resources/app/.webpack/bin"',
    );

    await installCliDarwinOrLinux(
      "/Applications/LM Studio.app/Contents/Resources/app/.webpack/bin",
      {
        skipConfirmation: true,
      },
    );

    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("~/.bashrc"));
  });
});
