import { UseFormReturn } from "react-hook-form";

export type Personality = { id: string; description: string };

export type AgentDetailsProps = {
  personalities: Personality[];
} & UseFormReturn<AgentDetailsForm, unknown, undefined>;

export type AgentDetailsForm = {
  name: string;
  description: string;
  selectedPersonalities: string[];
};
