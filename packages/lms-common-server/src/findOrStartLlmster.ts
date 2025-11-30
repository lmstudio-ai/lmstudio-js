import { apiServerPorts, type LoggerInterface } from "@lmstudio/lms-common";
import { spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { findLMStudioHome } from "./findLMStudioHome.js";

interface InstallLocation {
  path: string;
  argv: Array<string>;
  cwd: string;
}

export interface FindOrStartLlmsterOptions {
  logger?: LoggerInterface;
  /**
   * Called when the LM Studio daemon is not running and no existing installation can be found.
   * Should install llmster and return the path to the newly installed executable.
   */
  installLlmster?: () => Promise<{ path: string; argv: Array<string>; cwd: string }>;
  /**
   * Maximum number of polling attempts while waiting for the daemon to become available. Defaults
   * to 60 (about 60 seconds).
   */
  maxAttempts?: number;
  /**
   * Interval in milliseconds between polling attempts. Defaults to 1000ms.
   */
  pollIntervalMs?: number;
}

/**
 * Attempts to find a running LM Studio / llmster daemon, and if none is found tries to start one.
 * If a daemon cannot be found or started, returns null.
 *
 * This function is responsible only for locating or starting the daemon; it does not create an LM
 * Studio client.
 */
export async function findOrStartLlmster(
  options: FindOrStartLlmsterOptions = {},
): Promise<number | null> {
  const { installLlmster, maxAttempts = 60, pollIntervalMs = 1000 } = options;
  const logger: LoggerInterface = (options.logger ?? console) as LoggerInterface;

  // 1. Try to find an already running daemon.
  const serverStatus = await tryFindLocalAPIServer(logger);
  if (serverStatus !== null) {
    logger.debug(`Found running LM Studio daemon at port ${serverStatus}`);
    logger.debug(`package=${serverStatus.package}, version=${serverStatus.version}`);
    return serverStatus.port;
  }

  logger.debug("No running LM Studio daemon detected.");

  // 2. Try to start from an existing installation, or install if missing.
  const appInstallLocationFilePath = getAppInstallLocationFilePath();
  const appInstallLocation = readInstallLocationFile(appInstallLocationFilePath, logger);
  logger.debug("Found LM Studio install location:", appInstallLocation);

  const llmsterInstallLocationFilePath = getLlmsterInstallLocationFilePath();
  const llmsterInstallLocation = readInstallLocationFile(llmsterInstallLocationFilePath, logger);
  logger.debug("Found llmster install location:", llmsterInstallLocation);

  let installLocation: InstallLocation | null = null;
  let isDaemon = false;
  if (llmsterInstallLocation !== null) {
    // Always prefer llmster for now
    installLocation = llmsterInstallLocation;
    isDaemon = true;

    // Print different logging messages to help with debugging
    if (appInstallLocation !== null) {
      logger.debug(`Both LM Studio and llmster install locations found; using llmster.`);
    } else {
      logger.debug(`Using llmster install location.`);
    }
  } else {
    if (appInstallLocation !== null) {
      logger.debug(`Using LM Studio install location.`);
      installLocation = appInstallLocation;
      isDaemon = false;
    } else {
      logger.debug(`No LM Studio or llmster install location found.`);
    }
  }

  if (installLocation === null || !existsSync(installLocation.path)) {
    logger.debug(`No valid LM Studio installation found at ${appInstallLocationFilePath}.`);

    if (installLlmster !== undefined) {
      try {
        logger.info("Installing llmster...");
        const { path, argv, cwd } = await installLlmster();
        installLocation = { path, argv, cwd };
        writeFileSync(llmsterInstallLocationFilePath, JSON.stringify(installLocation), "utf-8");
        logger.debug(`Recorded LM Studio installation to ${llmsterInstallLocationFilePath}.`);
        isDaemon = true;
      } catch (e) {
        logger.error("installLlmster threw an error:", e);
      }
    }

    if (installLocation === null || !existsSync(installLocation.path)) {
      logger.error(
        "LM Studio daemon is not running and no valid installation could be found or installed.",
      );
      return null;
    }
  }

  // 3. Start the daemon from the resolved installation.
  wakeUpServiceFromLocation(logger, installLocation, isDaemon);

  // 4. Poll for the daemon to become available.
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    logger.debug(`Polling LM Studio daemon... (attempt ${attempt})`);
    const serverStatus = await tryFindLocalAPIServer(logger);
    if (serverStatus !== null) {
      logger.debug(`LM Studio daemon became available at port ${serverStatus}`);
      logger.debug(`package=${serverStatus.package}, version=${serverStatus.version}`);
      return serverStatus.port;
    }
  }

  logger.error("Timed out waiting for LM Studio daemon to start.");
  return null;
}

function getAppInstallLocationFilePath(): string {
  const lmstudioHome = findLMStudioHome();
  return join(lmstudioHome, ".internal", "app-install-location.json");
}

function getLlmsterInstallLocationFilePath(): string {
  const lmstudioHome = findLMStudioHome();
  return join(lmstudioHome, ".internal", "llmster-install-location.json");
}

function ensureDirectoryExists(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function readInstallLocationFile(
  installLocationFilePath: string,
  logger: LoggerInterface,
): InstallLocation | null {
  try {
    if (!existsSync(installLocationFilePath)) {
      logger.debug(`Install location file does not exist at ${installLocationFilePath}.`);
      return null;
    }
    const content = readFileSync(installLocationFilePath, "utf-8");
    return JSON.parse(content) as InstallLocation;
  } catch (e) {
    logger.debug(`Failed to read or parse install location file at ${installLocationFilePath}.`, e);
    return null;
  }
}

async function getLocalServerStatusAtPortOrThrow(
  port: number,
  timeoutMs?: number,
): Promise<{ package: string; version: string; port: number }> {
  const controller = new AbortController();
  const timeout =
    typeof timeoutMs === "number" ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  let response: any;
  try {
    response = await fetch(`http://127.0.0.1:${port}/lms-status`, {
      signal: controller.signal,
    });
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
  if (response.status !== 200) {
    throw new Error("Status is not 200.");
  }
  const json = await response.json();
  if (json === null || typeof json !== "object") {
    throw new Error("Invalid JSON response.");
  }
  if (!Object.prototype.hasOwnProperty.call(json, "package")) {
    throw new Error("Missing 'package' field in response.");
  }
  if (typeof json.package !== "string") {
    throw new Error("'package' field is not a string.");
  }
  if (!Object.prototype.hasOwnProperty.call(json, "version")) {
    throw new Error("Missing 'version' field in response.");
  }
  if (typeof json.version !== "string") {
    throw new Error("'version' field is not a string.");
  }
  return { package: json.package, version: json.version, port };
}

export async function tryFindLocalAPIServer(logger: LoggerInterface): Promise<{
  package: string;
  version: string;
  port: number;
} | null> {
  try {
    return await Promise.any(
      apiServerPorts.map(port => getLocalServerStatusAtPortOrThrow(port, 3000)),
    );
  } catch (e) {
    logger.debug("Failed to find local API server on known ports:", e);
    return null;
  }
}

function wakeUpServiceFromLocation(
  logger: LoggerInterface,
  installLocation: InstallLocation,
  isDaemon: boolean,
) {
  logger.info("Waking up LM Studio service...");

  const args: Array<string> = [];
  const { path, argv, cwd } = installLocation;
  if (argv[1] === ".") {
    // We are in development environment
    args.push(".");
  }
  // Add the headless flag only for the app (LM Studio), not for the llmster daemon.
  if (isDaemon === false) {
    args.push("--run-as-service");
  }

  logger.debug("Preparing to spawn LM Studio daemon process:", { path, args, cwd });

  const env = {
    ...(process.platform === "linux" ? { DISPLAY: ":0" } : {}),
    ...process.env,
  } as NodeJS.ProcessEnv;

  try {
    if (process.platform === "win32" && isDaemon) {
      // On Windows + daemon, launch via PowerShell's Start-Process with a Hidden window style
      // to avoid opening a console window.
      const escapePs = (s: string) => `'${s.replace(/'/g, "''")}'`;
      const argList = args.join(" ");
      const psCommand = [
        "Start-Process",
        "-FilePath",
        escapePs(path),
        "-ArgumentList",
        escapePs(argList),
        "-WorkingDirectory",
        escapePs(cwd),
        "-WindowStyle",
        "Hidden",
      ].join(" ");

      logger.debug("Spawning llmster via PowerShell Start-Process (hidden window).", {
        psCommand,
      });

      const child = spawn(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", psCommand],
        { cwd, env },
      );
      child.unref();
      logger.debug("LM Studio daemon process spawned (Windows/PowerShell).");
    } else {
      // Non-Windows platforms: spawn the executable directly.
      const child = spawn(path, args, { cwd, detached: true, stdio: "ignore", env });
      child.unref();
      logger.debug("LM Studio daemon process spawned.");
    }
  } catch (e) {
    logger.debug("Failed to launch LM Studio daemon process:", e);
  }
}
