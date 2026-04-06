import { z } from "zod";

/**
 * Indicates that there is no local LM Studio identity configured.
 *
 * @public
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development
 * and will change. Not recommended for public adoption.
 */
export interface NoAuthenticationStatus {
  type: "none";
}
export const noAuthenticationStatusSchema = z.object({
  type: z.literal("none"),
});

/**
 * Indicates that the local instance is logged in as a user.
 *
 * @public
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development
 * and will change. Not recommended for public adoption.
 */
export interface LoggedInUserAuthenticationStatus {
  type: "loggedInUser";
  userName: string;
}
export const loggedInUserAuthenticationStatusSchema = z.object({
  type: z.literal("loggedInUser"),
  userName: z.string(),
});

/**
 * Indicates that the local instance is configured as a compute device.
 *
 * @public
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development
 * and will change. Not recommended for public adoption.
 */
export interface ComputeDeviceAuthenticationStatus {
  type: "computeDevice";
  ownerUsername: string;
  ownerIsOrganization: boolean;
}
export const computeDeviceAuthenticationStatusSchema = z.object({
  type: z.literal("computeDevice"),
  ownerUsername: z.string(),
  ownerIsOrganization: z.boolean(),
});

/**
 * Authentication status returned by LM Studio Hub APIs.
 *
 * @public
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development
 * and will change. Not recommended for public adoption.
 */
export type AuthenticationStatus =
  | NoAuthenticationStatus
  | LoggedInUserAuthenticationStatus
  | ComputeDeviceAuthenticationStatus;
export const authenticationStatusSchema = z.discriminatedUnion("type", [
  noAuthenticationStatusSchema,
  loggedInUserAuthenticationStatusSchema,
  computeDeviceAuthenticationStatusSchema,
]);
