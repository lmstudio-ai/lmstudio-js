import { z } from "zod";

/**
 * Authentication status returned by LM Studio Hub APIs.
 *
 * @public
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development
 * and will change. Not recommended for public adoption.
 */
export interface AuthenticationStatus {
  userName: string;
}
export const authenticationStatusSchema = z.object({
  userName: z.string(),
});
