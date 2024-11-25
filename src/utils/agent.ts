import {
  AgentDetails,
  AgentDetailsInput,
  AgentDetailsSchema,
} from "@/app/(home)/form.types";
import { womboApi } from "./fetch";
import { z } from "zod";

export const generateAllAdvancedAgentDetails = async (
  inputs: Pick<AgentDetails, "name" | "description" | "personality">,
) => {
  const outputs: AgentDetailsInput[] = [
    "systemPrompt",
    "bio",
    "lore",
    "postExamples",
    "adjectives",
    "style",
  ];

  return await womboApi.post({
    endpoint: "/agent-details",
    body: {
      inputs,
      outputs,
    },
    schema: AgentDetailsSchema.pick(
      outputs.reduce((outputs, key) => ({ ...outputs, [key]: true }), {}),
    ),
  });
};

export const generateSingleAgentDetail = async <T extends AgentDetailsInput>({
  inputs,
  output,
}: {
  inputs: AgentDetails;
  output: T;
}) => {
  const result = (await womboApi.post({
    endpoint: "/agent-details",
    body: {
      inputs,
      outputs: [output],
    },
    schema: z.object({ [output]: z.string() }),
  })) as { [key in T]: string };

  return result[output];
};
