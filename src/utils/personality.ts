import { createQuery } from "react-query-kit";
import { womboApi } from "./fetch";
import { z } from "zod";

const PersonalitySchema = z
  .object({
    _id: z.string(),
    name: z.string(),
  })
  .transform((personality) => {
    const { _id, ...rest } = personality;
    return {
      id: _id,
      ...rest,
    };
  });

export const usePersonalities = createQuery({
  staleTime: 600000, // 10 mins
  queryKey: ["personality"],
  fetcher: async () => {
    const result = await womboApi.get({
      endpoint: "/agent-personalities",
      schema: PersonalitySchema.array(),
    });

    return result.sort((a, b) => a.id.localeCompare(b.id));
  },
});

export type Personality = z.infer<typeof PersonalitySchema>;
