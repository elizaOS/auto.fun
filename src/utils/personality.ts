import { createQuery } from "react-query-kit";
import {} from "../../types/form.type";
import { womboApi } from "./fetch";
import { z } from "zod";

export const usePersonalities = createQuery({
  staleTime: 600000, // 10 mins
  queryKey: ["personality"],
  fetcher: async () => {
    // TODO: remove once api route exists, this is used for testing
    //
    // const personalities = [
    //   { id: "1", description: "personality 1" },
    //   { id: "2", description: "personality 2" },
    //   { id: "3", description: "personality 3" },
    //   { id: "4", description: "personality 4" },
    //   { id: "5", description: "personality 5" },
    //   { id: "6", description: "personality 6" },
    // ];

    const result = await womboApi.post({
      endpoint: "/personality",
      schema: z.array(
        z.object({
          id: z.string(),
          description: z.string(),
        }),
      ),
    });

    return result;
  },
});
