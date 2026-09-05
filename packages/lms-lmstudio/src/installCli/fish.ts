import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import { basename, dirname, isAbsolute, join, relative } from "node:path";

const blockStart = "# >>> LM Studio CLI (lms) >>>";
const blockEnd = "# <<< LM Studio CLI (lms) <<<";

interface FileUpdate {
  path: string;
  content: string;
}

export interface FishInstallation {
  configPath: string;
  updates: Array<FileUpdate>;
}

function isMissingFile(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function readConfig(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFile(error)) {
      return "";
    }
    throw error;
  }
}

function quoteFish(value: string) {
  return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

function makeBlock(targetPath: string) {
  const target = quoteFish(targetPath);
  return `${blockStart}
if functions -q fish_add_path
    fish_add_path --append --path ${target}
else if not contains -- ${target} $PATH
    set -gx PATH $PATH ${target}
end
${blockEnd}
`;
}

function removeLegacyBlocks(content: string, targetPath: string) {
  const doubleQuote = (value: string) =>
    `"${value.replace(/[\\"$]/g, character => `\\${character}`)}"`;
  const targets = [targetPath, quoteFish(targetPath), doubleQuote(targetPath)];
  const relativeTarget = relative(os.homedir(), targetPath);
  if (relativeTarget !== ".." && !relativeTarget.startsWith("../") && !isAbsolute(relativeTarget)) {
    targets.push(`"$HOME/${doubleQuote(relativeTarget).slice(1, -1)}"`);
    if (/^[\w./-]+$/.test(relativeTarget)) {
      targets.push(`~/${relativeTarget}`, `$HOME/${relativeTarget}`);
    }
  }
  const commands = new Set(
    targets.flatMap(target => [
      `set -gx PATH $PATH ${target}`,
      `fish_add_path ${target}`,
      `fish_add_path --append --path ${target}`,
    ]),
  );
  const markers = new Set([
    "# Added by LM Studio CLI tool (lms)",
    "# Added by LM Studio CLI (lms)",
  ]);
  const endMarkers = new Set([
    "# End of LM Studio CLI section",
    "# End of LM Studio CLI tool (lms)",
  ]);
  // Keep original line endings and all text outside recognized marker/command pairs.
  const lines = content.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const lineText = (index: number) => lines[index]?.replace(/\r?\n$/, "") ?? "";
  const kept: Array<string> = [];
  for (let i = 0; i < lines.length; i++) {
    if (markers.has(lineText(i)) && commands.has(lineText(i + 1))) {
      i++;
      if (endMarkers.has(lineText(i + 1))) {
        i++;
      }
    } else {
      kept.push(lines[i]);
    }
  }
  return kept.join("");
}

function updateManagedBlock(content: string, block: string) {
  const blockPattern =
    /^# >>> LM Studio CLI \(lms\) >>>\r?\n[\s\S]*?^# <<< LM Studio CLI \(lms\) <<<(?:\r?\n|$)/gm;
  const markers = content.match(
    /^# (?:>>> LM Studio CLI \(lms\) >>>|<<< LM Studio CLI \(lms\) <<<)\r?$/gm,
  );
  if ((markers?.length ?? 0) !== [...content.matchAll(blockPattern)].length * 2) {
    throw new Error(
      "Incomplete LM Studio CLI block in fish/conf.d/lms.fish. Please repair it before installing.",
    );
  }
  let replaced = false;
  const updated = content.replace(blockPattern, () => {
    if (replaced) {
      return "";
    }
    replaced = true;
    return block;
  });
  return replaced ? updated : content + (content && !content.endsWith("\n") ? "\n" : "") + block;
}

/** Plan the fish changes without writing anything before the installer confirmation. */
export async function prepareFishInstallation(
  targetPath: string,
): Promise<FishInstallation | null> {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  const configRoot =
    xdgConfigHome && isAbsolute(xdgConfigHome) ? xdgConfigHome : join(os.homedir(), ".config");
  const fishDir = join(configRoot, "fish");
  const fishDirStat = await stat(fishDir).catch(error => {
    if (isMissingFile(error)) {
      return null;
    }
    throw error;
  });
  if (!fishDirStat?.isDirectory() && basename(process.env.SHELL ?? "") !== "fish") {
    return null;
  }

  const configPath = join(fishDir, "conf.d", "lms.fish");
  const previousSnippet = await readConfig(configPath);
  const snippet = updateManagedBlock(
    removeLegacyBlocks(previousSnippet, targetPath),
    makeBlock(targetPath),
  );
  const updates: Array<FileUpdate> = [];
  if (snippet !== previousSnippet) {
    updates.push({ path: configPath, content: snippet });
  }

  // Older installers always wrote ~/.config, even when fish used XDG_CONFIG_HOME.
  const legacyPaths = new Set([
    join(fishDir, "config.fish"),
    join(os.homedir(), ".config", "fish", "config.fish"),
  ]);
  for (const path of legacyPaths) {
    const previous = await readConfig(path);
    const content = removeLegacyBlocks(previous, targetPath);
    if (content !== previous) {
      updates.push({ path, content });
    }
  }
  return { configPath, updates };
}

export async function applyFishInstallation(installation: FishInstallation) {
  // Install the replacement before removing legacy lines from config.fish.
  for (const update of installation.updates) {
    await mkdir(dirname(update.path), { recursive: true });
    await writeFile(update.path, update.content, "utf8");
  }
}
