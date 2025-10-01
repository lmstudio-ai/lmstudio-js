import { z } from "zod";

export type DenoBrokerRequest = {
  v: 1;
  id: number;
  datetime: string;
  permission: string;
  value: string | null;
};
export const denoBrokerRequestSchema = z.object({
  v: z.literal(1),
  id: z.number().int(),
  datetime: z.string(),
  permission: z.string(),
  value: z.string().nullable(),
});

export type DenoBrokerResponse = {
  id: number;
  result: "allow" | "deny";
};
export const denoBrokerResponseSchema = z.object({
  id: z.number().int(),
  result: z.enum(["allow", "deny"]),
});
