import { z } from "zod";

/**
 * A peer reachable via LM Link.
 *
 * @public
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development
 * and will change. Not recommended for public adoption.
 */
export interface LMLinkPeer {
  deviceIdentifier: string;
  deviceName: string;
  status: "connected" | "disconnected";
}
export const lmLinkPeerSchema = z.object({
  deviceIdentifier: z.string(),
  deviceName: z.string(),
  status: z.enum(["connected", "disconnected"]),
});

/**
 * The most recent LM Link error, if any.
 *
 * @public
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development
 * and will change. Not recommended for public adoption.
 */
export interface LMLinkLastError {
  message: string;
  timestamp: number;
}
export const lmLinkLastErrorSchema = z.object({
  message: z.string(),
  timestamp: z.number().int().nonnegative(),
});

/**
 * The current LM Link status.
 *
 * @public
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development
 * and will change. Not recommended for public adoption.
 */
export type LMLinkStatus = "offline" | "starting" | "online" | "stopping";
export const lmLinkStatusSchema = z.enum(["offline", "starting", "online", "stopping"]);

/**
 * Issues that can prevent LM Link from starting.
 *
 * @public
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development
 * and will change. Not recommended for public adoption.
 */
export type LMLinkIssue = "deviceDisabled" | "notLoggedIn" | "noAccess" | "badVersion";
export const lmLinkIssueSchema = z.enum([
  "deviceDisabled",
  "notLoggedIn",
  "noAccess",
  "badVersion",
]);

/**
 * Status payload returned by LM Link.
 *
 * @public
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development
 * and will change. Not recommended for public adoption.
 */
export interface LMLinkStatusResult {
  /**
   * The current status of LM Link.
   */
  status: LMLinkStatus;
  /**
   * Issues that will prevent LM Link from starting.
   */
  issues: Array<LMLinkIssue>;
  /**
   * The currently connected peers.
   */
  peers: Array<LMLinkPeer>;
  /**
   * The local device identifier, if available.
   */
  deviceIdentifier: string | null;
  /**
   * The local device name.
   */
  deviceName: string;
  /**
   * The preferred device identifier, if available.
   */
  preferredDeviceIdentifier?: string;
  /**
   * The number of seconds until the next reconnect attempt, if known.
   */
  reconnectInSeconds?: number;
  /**
   * The most recent LM Link error, if any.
   */
  lastError?: LMLinkLastError;
}
export const lmLinkStatusResultSchema = z.object({
  status: lmLinkStatusSchema,
  issues: z.array(lmLinkIssueSchema),
  peers: z.array(lmLinkPeerSchema),
  deviceIdentifier: z.string().nullable(),
  deviceName: z.string(),
  preferredDeviceIdentifier: z.string().optional(),
  reconnectInSeconds: z.number().int().nonnegative().optional(),
  lastError: lmLinkLastErrorSchema.optional(),
});
