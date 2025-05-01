import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
const SearchTokenBodySchema = z.object({
   mint: z
      .string()
      .min(32, { message: "Mint address too short" })
      .max(44, { message: "Mint address too long" })
      .refine((val) => {
         try {
            new PublicKey(val);
            return true;
         } catch {
            return false;
         }
      }, { message: "Invalid mint address format" }),
   requestor: z.string().min(1, { message: "Missing requestor" })
});

export type SearchTokenInput = z.infer<typeof SearchTokenBodySchema>;

export function parseSearchTokenRequest(data: unknown): SearchTokenInput {
   return SearchTokenBodySchema.parse(data);
}
