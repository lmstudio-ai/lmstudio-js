import os from "node:os";
import { resolveConfigPath } from "./shellConfig";

describe("resolveConfigPath", () => {
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

    expect(resolveConfigPath({ shellName: "zsh", configFileName: ".zshrc" })).toBe(
      "/tmp/custom-zsh/.zshrc",
    );
  });

  it("falls back to the home directory for zsh when ZDOTDIR is unset", () => {
    delete process.env.ZDOTDIR;

    expect(resolveConfigPath({ shellName: "zsh", configFileName: ".zshrc" })).toBe(
      `${os.homedir()}/.zshrc`,
    );
  });

  it("keeps non-zsh shells in the home directory", () => {
    process.env.ZDOTDIR = "/tmp/custom-zsh";

    expect(resolveConfigPath({ shellName: "bash", configFileName: ".bashrc" })).toBe(
      `${os.homedir()}/.bashrc`,
    );
  });
});
