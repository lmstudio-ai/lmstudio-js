import { type LoggerInterface } from "./SimpleLogger";

const VERSION_COMPONENTS_COUNT = 3;

/**
 * Parses a version string into validated numeric components
 * @param version - Version string in format "X.Y.Z"
 * @returns Array of 3 validated numbers [major, minor, patch]
 * @throws Error if version format is invalid or components are not safe integers or negative
 */
function parseAndValidateVersionComponents(version: string): number[] {
  const components = version.split(".");

  if (components.length !== VERSION_COMPONENTS_COUNT) {
    throw new Error(`Invalid version number format: ${version}`);
  }

  const validatedComponents: number[] = [];

  for (let i = 0; i < VERSION_COMPONENTS_COUNT; i++) {
    const num = +components[i];
    if (!Number.isSafeInteger(num)) {
      throw new Error(`Invalid version component: ${components[i]} in ${version}`);
    }
    if (num < 0) {
      throw new Error(`Version component must be non-negative: ${components[i]} in ${version}`);
    }
    validatedComponents.push(num);
  }

  return validatedComponents;
}

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

  // Ensure we have exactly 3 components.
  // parseAndValidateVersionComponents will throw if > 3
  while (components.length < 3) {
    components.push("0");
  }

  const validatedComponents = parseAndValidateVersionComponents(components.join("."));

  // Convert back to string to remove leading zeros
  return validatedComponents.map(num => num.toString()).join(".");
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

  const candidateComponents = parseAndValidateVersionComponents(newerVersionCandidate);
  const comparedComponents = parseAndValidateVersionComponents(versionBeingCompared);
  for (let i = 0; i < VERSION_COMPONENTS_COUNT; i++) {
    if (candidateComponents[i] > comparedComponents[i]) {
      return true;
    }
    if (candidateComponents[i] < comparedComponents[i]) {
      return false;
    }
  }

  return false;
};

/**
 * Compare two version strings in the format "X.Y.Z". Useful for sorting.
 *
 * @param a - The first version string to compare.
 * @param b - The second version string to compare.
 * @returns 1 if a is newer, -1 if b is newer, 0 if they are equal or not comparable
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
