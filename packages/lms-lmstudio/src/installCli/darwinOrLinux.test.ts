import os from "node:os";
import { getZshConfigPath } from "./zshConfigPath";

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
