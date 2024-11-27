import { createMutation } from "react-query-kit";
import {
  AgentDetailsForm,
  AgentDetailsInput,
  AgentDetailsSchema,
} from "../../types/form.type";
import { womboApi } from "./fetch";
import { z } from "zod";

const stripFieldWhitespace = <T extends Record<string, unknown>>(object: T) =>
  Object.entries(object).reduce((newObject, [key, value]) => {
    return {
      ...newObject,
      [key]: typeof value === "string" ? value.trim() : value,
    };
  }, {} as T);

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

    return stripFieldWhitespace(result)[output];
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

    return stripFieldWhitespace(result);
  },
});

export const useGenerateAgentDetails = createMutation({
  mutationKey: ["generateAgentDetails"],
  retry: 2,
  mutationFn: async ({ inputs }: { inputs: AgentDetailsForm }) => {
    const allFields = [
      "systemPrompt",
      "bio",
      "lore",
      "postExamples",
      "adjectives",
      "style",
      "topics",
    ] satisfies AgentDetailsInput[];

    const requestedOutputs = allFields.filter(
      (field) => !inputs[field] || inputs[field].trim() === "",
    ) as AgentDetailsInput[];

    if (requestedOutputs.length === 0) {
      return inputs;
    }

    const result = await womboApi.post({
      endpoint: "/agent-details",
      body: {
        inputs,
        requestedOutputs,
      },
      schema: AgentDetailsSchema.pick(
        Object.fromEntries(
          requestedOutputs.map((field) => [field, true]),
        ) as Record<(typeof requestedOutputs)[number], true>,
      ).required(),
    });

    return {
      ...inputs,
      ...stripFieldWhitespace(result),
    };
  },
});
