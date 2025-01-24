import { z } from "zod";

export const AgentSummarySchema = z.object({
  _id: z.string(),
  ownerAddress: z.string(),
  contractAddress: z.string(),
  symbol: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  image_src: z.string().optional().nullable(),
});

export const AgentDataSchema = z.object({
  _id: z.string(),
  ownerAddress: z.string(),
  contractAddress: z.string(),
  txId: z.string(),
  symbol: z.string(),
  name: z.string(),
  twitterUsername: z.string(),
  description: z.string().nullable(),
  personalities: z.number().array().optional(),
  image_src: z.string().optional().nullable(),
  systemPrompt: z.string().nullable(),
  modelProvider: z.string().nullable(),
  bio: z.array(z.string()).nullable(),
  lore: z.array(z.string()).nullable(),
  messageExamples: z.array(z.string()).nullable().optional(),
  postExamples: z.array(z.string()).nullable(),
  adjectives: z.array(z.string()).nullable(),
  people: z.array(z.string()).nullable(),
  topics: z.array(z.string()).nullable(),
  styleAll: z.array(z.string()).nullable(),
  styleChat: z.array(z.string()).nullable(),
  stylePost: z.array(z.string()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AgentData = z.infer<typeof AgentDataSchema>;
export type AgentSummary = z.infer<typeof AgentSummarySchema>;

export type AgentsProps = {
  agents: AgentSummary[];
  refetchAgents: () => Promise<void>;
};
