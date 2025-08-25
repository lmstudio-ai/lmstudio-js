import { text } from "@lmstudio/lms-common";
import chalk from "chalk";
// import inquirer from "inquirer";
import inquirer from "inquirer";
import { execSync } from "node:child_process";
import { access } from "node:fs/promises";
import { type InstallCliOpts } from ".";

async function getPowershellPath() {
  // Common PowerShell paths on Windows
  const possiblePaths = [
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    "C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe",
  ];

  // Check if PowerShell exists in common paths
  for (const p of possiblePaths) {
    try {
      await access(p);
      return p; // Return the valid path
    } catch (e) {
      continue; // Check the next path
    }
  }

  return "powershell"; // Default to PATH
}
export async function installCliWin32(path: string, { skipConfirmation }: InstallCliOpts) {
  const powershellPath = await getPowershellPath();
  const previousPath = execSync(`[Environment]::GetEnvironmentVariable('PATH', 'User')`, {
    shell: powershellPath,
    encoding: "utf8", // Ensure the output is a string
  }).trimEnd();
  if (previousPath.includes(path)) {
    console.info(
      text`
        ${chalk.greenBright("  ✓ Already Installed  ")}

        The path ${chalk.greenBright(path)} is already in the PATH environment variable.

          ${chalk.cyanBright(text`
            (i) If Windows cannot find the CLI tool, please try again in a new terminal window.
          `)}

          ${chalk.cyanBright(text`
            (i) If you are using an integrated terminal in an editor (such as VS Code), please try
            to restart the editor.
          `)}
      `,
    );
    return;
  }

  const command = `$path = [Environment]::GetEnvironmentVariable('PATH', 'User');
$path += ";${path}";
[Environment]::SetEnvironmentVariable('PATH', $path, 'User');`;

  if (!skipConfirmation) {
    console.info(
      text`
        We are about to run the following powershell commands to install the LM Studio CLI tool
        (lms).

        ${chalk.cyanBright("    " + command.split("\n").join("\n    "))}

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

  execSync(command, { shell: powershellPath });

  console.info(
    text`
      ${chalk.greenBright("  ✓ Installation Completed  ")}

        ${chalk.cyanBright(text`
          (i) You need to open a new terminal window for these changes to take effect.
        `)}

        ${chalk.cyanBright(text`
          (i) If you are using an integrated terminal in an editor (such as VS Code), please try
          to restart the editor.
        `)}

      The LM Studio CLI tool (lms) has been successfully installed. To test it, run the following
      command in a new terminal window:

          ${chalk.yellowBright("lms")}
    `,
  );
}
