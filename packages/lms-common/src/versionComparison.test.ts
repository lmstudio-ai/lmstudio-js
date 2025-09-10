import { SimpleLogger } from "./SimpleLogger";
import {
  compareVersion,
  normalizeThreePartSimpleVersionOrThrow,
  twoPartSemverLtOrThrow,
  versionIsNewer,
} from "./versionComparison";

describe("Version Comparison Functions", () => {
  describe("twoPartSemverLtOrThrow", () => {
    it("should return true when first version is less than second", () => {
      expect(twoPartSemverLtOrThrow("1.0", "1.1")).toBe(true);
      expect(twoPartSemverLtOrThrow("1.9", "2.0")).toBe(true);
      expect(twoPartSemverLtOrThrow("0.5", "1.0")).toBe(true);
      expect(twoPartSemverLtOrThrow("0.2", "0.11")).toBe(true);
    });

    it("should return false when first version is greater than or equal to second", () => {
      expect(twoPartSemverLtOrThrow("1.1", "1.0")).toBe(false);
      expect(twoPartSemverLtOrThrow("2.0", "1.9")).toBe(false);
      expect(twoPartSemverLtOrThrow("1.0", "1.0")).toBe(false);
      expect(twoPartSemverLtOrThrow("0.11", "0.2")).toBe(false);
    });

    it("should throw error for invalid first parameter format", () => {
      expect(() => twoPartSemverLtOrThrow("1", "1.0")).toThrow();
      expect(() => twoPartSemverLtOrThrow("1.0.0", "1.0")).toThrow();
      expect(() => twoPartSemverLtOrThrow("invalid", "1.0")).toThrow();
    });

    it("should throw error for invalid second parameter format", () => {
      expect(() => twoPartSemverLtOrThrow("1.0", "1")).toThrow();
      expect(() => twoPartSemverLtOrThrow("1.0", "1.0.0")).toThrow();
      expect(() => twoPartSemverLtOrThrow("1.0", "invalid")).toThrow();
    });
  });

  describe("normalizeThreePartSimpleVersionOrThrow", () => {
    it("should normalize versions with fewer than 3 components", () => {
      expect(normalizeThreePartSimpleVersionOrThrow("1")).toBe("1.0.0");
      expect(normalizeThreePartSimpleVersionOrThrow("1.2")).toBe("1.2.0");
    });

    it("should keep three-part versions unchanged", () => {
      expect(normalizeThreePartSimpleVersionOrThrow("1.2.3")).toBe("1.2.3");
    });

    it("should remove leading zeros", () => {
      expect(normalizeThreePartSimpleVersionOrThrow("1.01.03")).toBe("1.1.3");
      expect(normalizeThreePartSimpleVersionOrThrow("01.02.03")).toBe("1.2.3");
    });

    it("should throw error for more than 3 components", () => {
      expect(() => normalizeThreePartSimpleVersionOrThrow("1.2.3.4")).toThrow();
    });

    it("should throw error for invalid version components", () => {
      expect(() => normalizeThreePartSimpleVersionOrThrow("1.a.3")).toThrow();
      expect(() => normalizeThreePartSimpleVersionOrThrow("1.2.invalid")).toThrow();
    });
  });

  describe("versionIsNewer", () => {
    it("should return true when first version is newer", () => {
      expect(versionIsNewer("1.2.3", "1.2.2")).toBe(true);
      expect(versionIsNewer("1.2.0", "1.1.9")).toBe(true);
      expect(versionIsNewer("2.0.0", "1.9.9")).toBe(true);
      expect(versionIsNewer("0.0.11", "0.0.2")).toBe(true);
    });

    it("should return false when first version is older or equal", () => {
      expect(versionIsNewer("1.1.9", "1.1.10")).toBe(false);
      expect(versionIsNewer("1.2.2", "1.2.3")).toBe(false);
      expect(versionIsNewer("1.2.3", "1.2.3")).toBe(false);
      expect(versionIsNewer("0.0.2", "0.0.11")).toBe(false);
    });

    it("should return false for empty or null inputs", () => {
      expect(versionIsNewer("", "1.2.3")).toBe(false);
      expect(versionIsNewer("1.2.3", "")).toBe(false);
    });

    it("should throw error for invalid format", () => {
      expect(() => versionIsNewer("1.2", "1.2.3")).toThrow();
      expect(() => versionIsNewer("1.2.3", "1.2")).toThrow();
      expect(() => versionIsNewer("1.2.3.4", "1.2.3")).toThrow();
    });
  });

  describe("compareVersion", () => {
    it("should return 1 when first version is newer", () => {
      const logger = new SimpleLogger();
      expect(compareVersion(logger, "1.2.3", "1.2.2")).toBe(1);
      expect(compareVersion(logger, "2.0", "1.9.9")).toBe(1);
      expect(compareVersion(logger, "0.0.11", "0.0.2")).toBe(1);
    });

    it("should return -1 when second version is newer", () => {
      const logger = new SimpleLogger();
      expect(compareVersion(logger, "1.2.2", "1.2.3")).toBe(-1);
      expect(compareVersion(logger, "1.9.9", "2.0")).toBe(-1);
      expect(compareVersion(logger, "0.0.2", "0.0.11")).toBe(-1);
    });

    it("should return 0 when versions are equal", () => {
      const logger = new SimpleLogger();
      expect(compareVersion(logger, "1.2.3", "1.2.3")).toBe(0);
      expect(compareVersion(logger, "1.0", "1.0.0")).toBe(0);
    });

    it("should handle versions with leading zeros", () => {
      const logger = new SimpleLogger();
      expect(compareVersion(logger, "1.01.3", "1.1.3")).toBe(0);
      expect(compareVersion(logger, "1.02.3", "1.1.3")).toBe(1);
    });

    it("should return 0 for invalid versions (legacy error handling)", () => {
      const logger = new SimpleLogger();
      expect(compareVersion(logger, "invalid", "1.2.3")).toBe(0);
    });
  });
});
