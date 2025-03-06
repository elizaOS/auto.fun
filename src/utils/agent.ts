import { createMutation } from "react-query-kit";
import {
  AgentDetailsForm,
  AgentDetailsInput,
  AgentDetailsSchema,
} from "../../types/form.type";
import { womboApi } from "./fetch";
import {
  AgentData,
  AgentDataSchema,
  AgentSummary,
  AgentSummarySchema,
} from "../../types/components/agents/index.type";
import { createAuthenticatedQuery } from "./api/createAuthenticatedQuery";
import { AgentDetails, TwitterCredentials } from "../../types/form.type";

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
        inputs: {
          ...inputs,
          personality: inputs.personalities,
          personalities: undefined,
        },
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
    inputs: Pick<AgentDetailsForm, "name" | "description" | "personalities">;
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
        inputs: {
          name: inputs.name,
          personality: inputs.personalities,
          description: inputs.description,
        },
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

export const useAgentData = createAuthenticatedQuery<
  AgentData,
  Pick<AgentData, "_id">
>({
  queryKey: ["agentData"],
  fetcher: async ({ _id }) => {
    const result = await womboApi.get({
      endpoint: `/agents/${_id}`,
      schema: AgentDataSchema,
    });

    return result;
  },
});

export const useAgentByMintAddress = createAuthenticatedQuery<
  AgentData,
  Pick<AgentData, "contractAddress">
>({
  queryKey: ["agentData"],
  fetcher: async ({ contractAddress }) => {
    const result = await womboApi.get({
      endpoint: `/agents/mint/${contractAddress}`,
      schema: AgentDataSchema,
    });

    return result;
  },
});

export const useAgents = createAuthenticatedQuery<AgentSummary[]>({
  queryKey: ["agents"],
  fetcher: async () => {
    const result = await womboApi.get({
      endpoint: `/agents`,
      schema: z.array(AgentSummarySchema),
    });

    return result;
  },
});

export const useCreateAgent = createMutation({
  mutationKey: ["createAgent"],
  mutationFn: async ({
    twitter_credentials,
    agent_metadata,
    tokenId,
  }: {
    twitter_credentials: TwitterCredentials;
    agent_metadata: AgentDetails;
    tokenId: string;
  }) => {
    return womboApi.post({
      endpoint: `/agents/${tokenId}`,
      body: {
        twitter_credentials,
        agent_metadata,
      },
    });
  },
});
