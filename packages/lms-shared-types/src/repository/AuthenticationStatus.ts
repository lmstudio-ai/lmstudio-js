import { z } from "zod";

export interface AuthenticationStatus {
  userName: string;
}
export const authenticationStatusSchema = z.object({
  userName: z.string(),
});
