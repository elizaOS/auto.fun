import { createMutation } from "react-query-kit";
import {
  AgentDetailsForm,
  AgentDetailsInput,
  AgentDetailsSchema,
} from "../../types/form.type";
import { womboApi } from "./fetch";
import { z } from "zod";

export const useGenerateSingleAgentDetail = createMutation({
  mutationKey: ["generateSingleAgentDetail"],
  retry: 2,
  mutationFn: async ({
    inputs,
    output,
  }: {
    inputs: AgentDetailsForm;
    output: AgentDetailsInput;
  }) => {
    const result = await womboApi.post({
      endpoint: "/agent-details",
      body: {
        inputs,
        requestedOutputs: [output],
      },
      schema: z.object({ [output]: z.string() }),
    });

    return result[output];
  },
});

export const useGenerateAllAdvancedAgentDetails = createMutation({
  mutationKey: ["generateAllAdvancedAgentDetails"],
  retry: 2,
  mutationFn: async ({
    inputs,
  }: {
    inputs: Pick<AgentDetailsForm, "name" | "description" | "personality">;
  }) => {
    const requestedOutputs = [
      "systemPrompt",
      "bio",
      "lore",
      "postExamples",
      "adjectives",
      "style",
      "topics",
    ] satisfies AgentDetailsInput[];

    const result = await womboApi.post({
      endpoint: "/agent-details",
      body: {
        inputs,
        requestedOutputs,
      },
      schema: AgentDetailsSchema.pick({
        systemPrompt: true,
        bio: true,
        lore: true,
        postExamples: true,
        adjectives: true,
        style: true,
        topics: true,
      } satisfies Record<
        (typeof requestedOutputs)[number],
        boolean
      >).required(),
    });

    return result;
  },
});
