import { z } from "zod";

export type TokenMetadata = {
  name: string;
  symbol: string;
  initial_sol: number;
  image_base64: string;
  description: string;
  links: TokenLinks;
};

export type TwitterCredentials = {
  username: string;
  email: string;
  password: string;
};

type TokenLinks = {
  twitter: string;
  telegram: string;
  website: string;
};

export type TokenMetadataForm = {
  name: string;
  symbol: string;
  initial_sol: string;
  media_base64: File;
  description: string;
  links: TokenLinks;
};

export type AgentFields =
  | "name"
  | "description"
  | "personalities"
  | "systemPrompt"
  | "bio"
  | "lore"
  | "postExamples"
  | "adjectives"
  | "style"
  | "topics";

export const advancedDetails: ReadonlyArray<AgentFields> = [
  "systemPrompt",
  "bio",
  "lore",
  "postExamples",
  "adjectives",
  "style",
  "topics",
];

export type TwitterDetailsForm = {
  twitter_email: string;
  twitter_username: string;
  twitter_password: string;
};

export const AgentDetailsSchema = z.object({
  name: z.string(),
  description: z.string(),
  personalities: z.number().array(),
  systemPrompt: z.string().optional(),
  bio: z.string().optional(),
  lore: z.string().optional(),
  postExamples: z.string().optional(),
  adjectives: z.string().optional(),
  style: z.string().optional(),
  topics: z.string().optional(),
});

export type AgentDetailsForm = z.infer<typeof AgentDetailsSchema>;
export type AgentDetails = AgentDetailsForm;

export type AgentDetailsInput = keyof AgentDetailsForm;
