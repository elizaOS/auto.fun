import {
   RawTokenQuery,
   TokenQueryParams,
   TokenStatus,
   SortBy,
   SortOrder,
   parseSolanaAddress,
} from './global';

export function parseTokensQuery(raw: RawTokenQuery): TokenQueryParams {
   const page = raw.page ? parseInt(raw.page, 10) : 1;
   if (isNaN(page) || page < 1) {
      throw new Error(`Invalid 'page' parameter: ${raw.page}`);
   }

   const limit = raw.limit ? parseInt(raw.limit, 10) : 50;
   if (isNaN(limit) || limit < 1) {
      throw new Error(`Invalid 'limit' parameter: ${raw.limit}`);
   }
   let status: TokenStatus | undefined;
   if (raw.status) {
      if (Object.values(TokenStatus).includes(raw.status as TokenStatus)) {
         status = raw.status as TokenStatus;
      } else {
         throw new Error(`Invalid 'status' parameter: ${raw.status}`);
      }
   }

   let hideImported: 0 | 1 | undefined;
   if (raw.hideImported === "0") hideImported = 0;
   else if (raw.hideImported === "1") hideImported = 1;

   let creator: string | undefined;
   if (raw.creator) {
      if (parseSolanaAddress(raw.creator)) {
         creator = raw.creator;
      } else {
         throw new Error(`Invalid Solana address for 'creator': ${raw.creator}`);
      }
   }

   const search = raw.search && raw.search.trim() !== "" ? raw.search.trim() : undefined;

   let sortBy: SortBy = SortBy.CreatedAt;
   if (raw.sortBy) {
      if (Object.values(SortBy).includes(raw.sortBy as SortBy)) {
         sortBy = raw.sortBy as SortBy;
      } else {
         throw new Error(`Invalid 'sortBy' parameter: ${raw.sortBy}`);
      }
   }

   let sortOrder: SortOrder = SortOrder.Desc;
   if (raw.sortOrder) {
      const lower = raw.sortOrder.toLowerCase();
      if (lower === SortOrder.Asc || lower === SortOrder.Desc) {
         sortOrder = lower as SortOrder;
      } else {
         throw new Error(`Invalid 'sortOrder' parameter: ${raw.sortOrder}`);
      }
   }

   return { page, limit, status, hideImported, creator, search, sortBy, sortOrder };
}
