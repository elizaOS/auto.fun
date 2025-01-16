import { createQuery } from "react-query-kit";
import { womboApi } from "./fetch";
import { z } from "zod";

export const usePersonalities = createQuery({
  staleTime: 600000, // 10 mins
  queryKey: ["personality"],
  fetcher: async () => {
    const result = await womboApi.get({
      endpoint: "/agent-personalities",
      schema: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
        }),
      ),
    });

    return result.sort((a, b) => a.id - b.id);
  },
});
