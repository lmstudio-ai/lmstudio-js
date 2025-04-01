import { z } from "zod";

/**
 * Matches valid file names
 */
export const fileNameRegex =
  /^[\p{L}\p{N}!@#$%^&()\-_+=,.;'[\]{}~`][\p{L}\p{N}!@#$%^&()\-_+=,.;'[\]{}~` ]*(?<![. ])$/u;
export const fileNameSchema = z.string().regex(fileNameRegex, { message: "Invalid file name" });

/**
 * Matches paths like:
 *
 * a/b/c
 */
export const relativePathNoLeadingDotSlashRegex =
  /^[\p{L}\p{N}!@#$%^&()\-_+=,.;'[\]{}~`][\p{L}\p{N}!@#$%^&()\-_+=,.;'[\]{}~` ]*(?<![. ])(?:\/[\p{L}\p{N}!@#$%^&()\-_+=,.;'[\]{}~`][\p{L}\p{N}!@#$%^&()\-_+=,.;'[\]{}~` ]*(?<![. ]))*$/u;
export const relativePathNoLeadingDotSlashSchema = z
  .string()
  .regex(relativePathNoLeadingDotSlashRegex, {
    message: "Invalid relative path",
  });
