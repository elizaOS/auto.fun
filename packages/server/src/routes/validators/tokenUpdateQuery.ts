
import { parseSolanaAddress } from "./global";
import { z } from "zod";

export const updateTokenBodySchema = z.object({
   website: z.string().url().optional(),
   twitter: z.string().url().optional(),
   telegram: z.string().url().optional(),
   discord: z.string().url().optional(),
   farcaster: z.string().optional(),
});


export type UpdateTokenBody = z.infer<typeof updateTokenBodySchema>;


export function parseUpdateTokenRequest(
   raw: {
      mint: unknown;
      body: unknown;
      user: unknown;
   }
): { mint: string; body: UpdateTokenBody; userId: string } {
   const mint = parseSolanaAddress(raw.mint, "mint address");

   const body = updateTokenBodySchema.parse(raw.body);

   if (
      typeof raw.user !== "object" ||
      raw.user === null ||
      typeof (raw.user as any).id !== "string"
   ) {
      throw new Error("Unauthorized: missing or invalid user");
   }
   const userId = (raw.user as any).id;

   return { mint, body, userId };
}
