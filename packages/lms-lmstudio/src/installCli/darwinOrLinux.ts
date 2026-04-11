import { makeTitledPrettyError, text } from "@lmstudio/lms-common";
import chalk from "chalk";
// import inquirer from "inquirer";
import inquirer from "inquirer";
import { execSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { type InstallCliOpts } from ".";
import { resolveConfigPath, type ShellInstallationInfo } from "./shellConfig.js";

interface ResolvedShellInstallationInfo extends ShellInstallationInfo {
  configPath: string;
}

const shellInstallationInfo: Array<ShellInstallationInfo> = [
  {
    shellName: "sh",
    configFileName: ".profile",
  },
  {
    shellName: "bash",
    configFileName: ".bashrc",
  },
  {
    shellName: "bash",
    configFileName: ".bash_profile",
  },
  {
    shellName: "zsh",
    configFileName: ".zshrc",
  },
  {
    shellName: "fish",
    configFileName: ".config/fish/config.fish",
  },
  {
    shellName: "csh",
    configFileName: ".cshrc",
  },
  {
    shellName: "tcsh",
    configFileName: ".tcshrc",
  },
];

function getCommandToAddComment(shell: ResolvedShellInstallationInfo) {
  const quotedConfigPath = JSON.stringify(shell.configPath);
  return `echo '' >> ${quotedConfigPath} && echo '# Added by LM Studio CLI tool (lms)' >> ${quotedConfigPath}`;
}

function getCommandToAddPath(shell: ResolvedShellInstallationInfo, targetPath: string) {
  const quotedConfigPath = JSON.stringify(shell.configPath);
  if (shell.shellName === "fish") {
    return `echo 'set -gx PATH $PATH ${targetPath}' >> ${quotedConfigPath}`;
  }
  if (shell.shellName === "csh" || shell.shellName === "tcsh") {
    return `echo 'setenv PATH "$PATH:${targetPath}"' >> ${quotedConfigPath}`;
  }
  return `echo 'export PATH="$PATH:${targetPath}"' >> ${quotedConfigPath}`;
}

export async function installCliDarwinOrLinux(path: string, { skipConfirmation }: InstallCliOpts) {
  const detectedShells: Array<ResolvedShellInstallationInfo> = [];
  const detectedAlreadyInstalledShells: Array<ResolvedShellInstallationInfo> = [];
  for (const shell of shellInstallationInfo) {
    const configPath = resolveConfigPath(shell);
    const resolvedShell = { ...shell, configPath };
    try {
      await access(configPath);
    } catch (e) {
      continue;
    }
    const content = await readFile(configPath, { encoding: "utf8" });
    if (content.includes(path)) {
      detectedAlreadyInstalledShells.push(resolvedShell);
    } else {
      detectedShells.push(resolvedShell);
    }
  }

  if (detectedShells.length === 0) {
    if (detectedAlreadyInstalledShells.length === 0) {
      throw makeTitledPrettyError(
        "Unable to find any shell configuration files",
        text`
          We couldn't find any shell configuration file in your home directory.

          To complete the installation manually, please try to add the following directory to the
          PATH environment variable:

              ${chalk.yellowBright(path)}
        `,
      );
    } else {
      console.info(
        text`
          ${chalk.greenBright("  ✓ Already Installed  ")}

          LM Studio CLI tool is already installed for the following shells:

          ${detectedAlreadyInstalledShells
            .map(shell =>
              chalk.cyanBright(
                `    · ${shell.shellName} ${chalk.gray(`(~/${shell.configFileName})`)}`,
              ),
            )
            .join("\n")}

          If your shell is not listed above, please try to add the following directory to the PATH
          environment variable:

              ${chalk.yellowBright(path)}

            ${chalk.gray(text`
              (i) If you are having trouble running the CLI tool, please open a new terminal. and
              try again.
            `)}
          `,
      );
      return;
    }
  }

  const commandsToRun: Array<string> = [];
  const commandsToRunFormatted: Array<string> = [];

  for (const shell of detectedShells) {
    const command = getCommandToAddPath(shell, path);
    commandsToRun.push(getCommandToAddComment(shell));
    commandsToRun.push(command);
    commandsToRunFormatted.push(`    ${command} ${chalk.gray(`# for ${shell.shellName}`)}`);
  }

  if (!skipConfirmation) {
    console.info(
      text`
        We are about to run the following commands to install the LM Studio CLI tool
        (lms).

        ${chalk.cyanBright(commandsToRunFormatted.join("\n"))}

        It will add the path ${chalk.greenBright(path)} to the PATH environment variable.
      `,
    );

    const { cont } = await inquirer.createPromptModule({
      output: process.stderr,
    })([
      {
        type: "confirm",
        name: "cont",
        message: chalk.yellowBright("Do you want to continue?"),
        default: false,
      },
    ]);

    if (!cont) {
      console.info(chalk.greenBright("Installation aborted. No changes were made."));
      return;
    }
  }

  execSync(commandsToRun.join(" && "));

  console.info(
    text`
      ${chalk.greenBright("  ✓ Installation Completed  ")}

        ${chalk.cyanBright(text`
          (i) You need to open a new terminal window for these changes to take effect.
        `)}

      The LM Studio CLI tool (lms) has been successfully installed. To test it, run the following
      command in a new terminal window:

          ${chalk.yellowBright("lms")}
    `,
  );
}
