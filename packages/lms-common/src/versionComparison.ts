import { type LoggerInterface } from "./SimpleLogger";

/**
 * Normalize a simple X.Y.Z style version for semver comparison
 * All components must be numbers, and there be 3 or less components or this will throw
 *
 * Examples:
 *  - "1.2.3" -> "1.2.3"
 *  - "1.2" -> "1.2.0"
 *  - "1" -> "1.0.0"
 *  - "1.01.03" -> "1.1.3"
 */
export function normalizeThreePartSimpleVersionOrThrow(version: string): string {
  const components = version.split(".");

  // Ensure we have exactly 3 components
  while (components.length < 3) {
    components.push("0");
  }

  // if more than three components, throw
  if (components.length > 3) {
    throw new Error(`Expected 3 or less version components in '${components}'`);
  }

  // Convert each component to a number and back to string to remove leading zeros
  return components
    .map(component => {
      const num = +component;
      if (!Number.isSafeInteger(num)) {
        throw new Error(`Invalid version component: ${component}`);
      }
      return num.toString();
    })
    .join(".");
}

/**
 * Determines if the first version string represents a newer version than the second version string.
 * Both version strings must be in the format "major.minor.patch".
 *
 * Examples:
 * - versionIsNewer("1.2.3", "1.2.2") returns true
 * - versionIsNewer("1.1.9", "1.1.10") returns false
 * - versionIsNewer("1.2.0", "1.1.9") returns true
 *
 * @param newerVersionCandidate The version string to test if it is newer.
 * @param versionBeingCompared The version string being compared against.
 * @returns true if newerVersionCandidate is newer than versionBeingCompared, false otherwise.
 * @throws Error if either version string is not in the correct format.
 */
export const versionIsNewer = (newerVersionCandidate: string, versionBeingCompared: string) => {
  if (!newerVersionCandidate || !versionBeingCompared) {
    return false;
  }
  const versionParts = newerVersionCandidate.split(".");
  const otherVersionParts = versionBeingCompared.split(".");

  if (versionParts.length !== 3 || otherVersionParts.length !== 3) {
    throw new Error(
      `Invalid version number format: ${newerVersionCandidate} or ${versionBeingCompared}`,
    );
  }

  const major = parseInt(versionParts[0]);
  const minor = parseInt(versionParts[1]);
  const patch = parseInt(versionParts[2]);

  const otherMajor = parseInt(otherVersionParts[0]);
  const otherMinor = parseInt(otherVersionParts[1]);
  const otherPatch = parseInt(otherVersionParts[2]);

  if (major > otherMajor) {
    return true;
  }

  if (major < otherMajor) {
    return false;
  }

  if (minor > otherMinor) {
    return true;
  }

  if (minor < otherMinor) {
    return false;
  }

  if (patch > otherPatch) {
    return true;
  }

  if (patch < otherPatch) {
    return false;
  }

  return false;
};

/**
 * Compare two version strings in the format "X.Y.Z". Useful for sorting.
 *
 * @param a - The first version string to compare.
 * @param b - The second version string to compare.
 * @returns 1 if a is newer, -1 if b is newer, 0 if they are equal
 */
export function compareVersion(logger: LoggerInterface, a: string, b: string): number {
  try {
    const normalizedA = normalizeThreePartSimpleVersionOrThrow(a);
    const normalizedB = normalizeThreePartSimpleVersionOrThrow(b);
    if (versionIsNewer(normalizedA, normalizedB)) {
      return 1;
    } else if (versionIsNewer(normalizedB, normalizedA)) {
      return -1;
    } else {
      return 0;
    }
  } catch (error) {
    logger.error("Error comparing versions:", error);
    // Default to equal if versions are formatted incorrectly (or other error thrown) to
    // match pre-existing no-throw behavior
    return 0;
  }
}
