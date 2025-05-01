
import { parseSolanaAddress, MAX_LIMIT, MAX_PAGE } from "./global";

export interface RawHoldersQuery {
   limit?: string;
   page?: string;
}

export interface ParsedHoldersQuery {
   mint: string;
   limit: number;
   page: number;
   offset: number;
}


export function parseHoldersQuery(
   mintParam: string | undefined,
   query: RawHoldersQuery
): ParsedHoldersQuery {
   if (!mintParam) {
      throw new Error("Missing mint address");
   }
   if (!parseSolanaAddress(mintParam)) {
      throw new Error(`Invalid mint address: ${mintParam}`);
   }
   const mint = mintParam;

   const rawLimit = query.limit ? parseInt(query.limit, 10) : MAX_LIMIT;
   if (isNaN(rawLimit) || rawLimit < 1) {
      throw new Error(`Invalid limit parameter: ${query.limit}`);
   }
   const limit = Math.min(rawLimit, MAX_LIMIT);

   const rawPage = query.page ? parseInt(query.page, 10) : 1;
   if (isNaN(rawPage) || rawPage < 1) {
      throw new Error(`Invalid page parameter: ${query.page}`);
   }
   const page = Math.min(rawPage, MAX_PAGE);

   const offset = (page - 1) * limit;

   return { mint, limit, page, offset };
}
