import { UseFormReturn } from "react-hook-form";

export type Personality = { id: string; description: string };

export type AgentDetailsProps = UseFormReturn<
  AgentDetailsForm,
  unknown,
  undefined
>;

export type AgentDetailsForm = {
  name: string;
  description: string;
  selectedPersonalities: string[];
  systemPrompt: string;
  bio: string;
  lore: string;
  postExamples: string;
  topics: string;
  style: string;
  adjectives: string;
};
