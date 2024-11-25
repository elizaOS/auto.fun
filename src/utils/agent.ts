import {
  AgentDetailsForm,
  AgentDetailsInput,
  AgentDetailsSchema,
} from "../../types/form.type";
import { womboApi } from "./fetch";
import { z } from "zod";

export const generateAllAdvancedAgentDetails = async (
  inputs: Pick<AgentDetailsForm, "name" | "description" | "personality">,
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
  inputs: AgentDetailsForm;
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
