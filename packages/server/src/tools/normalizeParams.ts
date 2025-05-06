import crypto from "crypto";

export function normalizeParams(q: Record<string, string | undefined>) {
  const {
    page,
    limit,
    search,
    status,
    hideImported,
    creator,
    sortBy,
    sortOrder,
  } = q;
  const p: Record<string, string | number> = {};

  if (parseInt(page || "") > 1) p.page = Number(page);
  if (parseInt(limit || "") !== 50) p.limit = Number(limit);
  if (search) p.search = search.trim().slice(0, 50);
  if (status) p.status = status;
  if (hideImported === "1" || hideImported === "0")
    p.hideImported = +hideImported;
  if (creator) p.creator = creator;
  if (sortBy && sortBy !== "createdAt") p.sortBy = sortBy;
  if (sortOrder && sortOrder.toLowerCase() === "asc") p.sortOrder = "asc";

  return p;
}

export function makeCacheKey(params: Record<string, string | number>) {
  const json = JSON.stringify(params);
  return crypto.createHash("md5").update(json).digest("hex");
}
