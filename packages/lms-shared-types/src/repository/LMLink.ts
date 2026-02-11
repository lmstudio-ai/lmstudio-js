import { z } from "zod";

/**
 * Represents a peer reachable via LM Link.
 *
 * @public
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
 * Represents the status of LM Link.
 *
 * @public
 */
export type LMLinkStatus = "offline" | "starting" | "online" | "stopping";
export const lmLinkStatusSchema = z.enum(["offline", "starting", "online", "stopping"]);

/**
 * Represents any issue that will prevent LM Link from starting.
 *
 * @public
 */
export type LMLinkIssue = "deviceDisabled" | "notLoggedIn" | "noAccess";
export const lmLinkIssueSchema = z.enum(["deviceDisabled", "notLoggedIn", "noAccess"]);

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
}
export const lmLinkStatusResultSchema = z.object({
  status: lmLinkStatusSchema,
  issues: z.array(lmLinkIssueSchema),
  peers: z.array(lmLinkPeerSchema),
  deviceIdentifier: z.string().nullable(),
  deviceName: z.string(),
  preferredDeviceIdentifier: z.string().optional(),
});
