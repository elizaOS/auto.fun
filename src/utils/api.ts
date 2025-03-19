const BASE_URL = "https://dev-api.auto.fun";

const fetcher = async (
  endpoint: string,
  method: "GET" | "POST",
  body?: object
) => {
  const query: { method: string; body?: string; headers: object } = {
    method,
    headers: {
      accept: "application/json",
    },
  };

  if (body) {
    query.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, query as object);

  if (!response.ok) {
    throw new Error(response.statusText);
  }

  return await response.json();
};

export const getTokens = ({
  page,
  limit,
  sortBy,
  sortOrder,
}: {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: string;
}) => {
  return fetcher(
    `/tokens?limit=${limit || 12}&page=${
      page || 1
    }&sortBy=${sortBy}&sortOrder=${sortOrder}`,
    "GET"
  );
};
