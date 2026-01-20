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
 * Represents the result of turning on LM Link.
 *
 * @public
 */
export interface LMLinkUpResult {
  peers: Array<LMLinkPeer>;
}
export const lmLinkUpResultSchema = z.object({
  peers: z.array(lmLinkPeerSchema),
});

/**
 * Represents the status of LM Link.
 *
 * @public
 */
export type LMLinkStatus = "offline" | "starting" | "online" | "stopping";
export const lmLinkStatusSchema = z.enum(["offline", "starting", "online", "stopping"]);

export interface LMLinkStatusResult {
  /**
   * Whether LM Link is enabled. Being enabled does not mean it is currently online.
   *
   * When LM Link is enabled, LM Studio/llmster will attempt to connect to LM Link on startup.
   */
  enabled: boolean;
  /**
   * The current status of LM Link.
   */
  status: LMLinkStatus;
  /**
   * The currently connected peers.
   */
  peers: Array<LMLinkPeer>;
}
export const lmLinkStatusResultSchema = z.object({
  enabled: z.boolean(),
  status: lmLinkStatusSchema,
  peers: z.array(lmLinkPeerSchema),
});
