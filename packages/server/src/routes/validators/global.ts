export enum TokenStatus {
  Active = "active",
  Migrating = "migrating",
  Migrated = "migrated",
  Locked = "locked",
  Finalized = "finalized",
}

export interface Pagination {
  limit: number;
  page: number;
  offset: number;
}

export enum SortBy {
  CreatedAt = "createdAt",
  MarketCapUSD = "marketCapUSD",
  Volume24h = "volume24h",
  HolderCount = "holderCount",
  CurveProgress = "curveProgress",
  Featured = "featured",
  Verified = "verified",
}

export enum FilterBy {
  Verified = "verified",
}

export enum SortOrder {
  Asc = "asc",
  Desc = "desc",
}

export interface RawTokenQuery {
  page?: string;
  limit?: string;
  status?: string;
  hideImported?: string;
  creator?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
}

export interface TokenQueryParams {
  page: number;
  limit: number;
  status?: TokenStatus;
  hideImported?: 0 | 1;
  creator?: string;
  search?: string;
  sortBy: SortBy;
  sortOrder: SortOrder;
}

export const MAX_LIMIT = 50;
export const MAX_PAGE = 500;

export const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function parseSolanaAddress(raw: unknown, name = "address"): string {
  if (typeof raw !== "string" || !SOLANA_ADDRESS_REGEX.test(raw)) {
    throw new Error(`Invalid ${name}`);
  }
  return raw;
}

export function parsePaginationQuery(
  query: Record<string, string | undefined>,
  { defaultLimit = 50, maxLimit = 50, maxPage = 1000 } = {}
): Pagination {
  const rawLimit = parseInt(query.limit || "", 10);
  const rawPage = parseInt(query.page || "", 10);

  const limit = Number.isNaN(rawLimit)
    ? defaultLimit
    : Math.min(rawLimit, maxLimit);

  const page = Number.isNaN(rawPage)
    ? 1
    : Math.min(Math.max(1, rawPage), maxPage);

  return { limit, page, offset: (page - 1) * limit };
}
