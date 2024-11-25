import { UseFormReturn } from "react-hook-form";
import { AgentDetailsForm } from "../../../form.type";

export type Personality = { id: string; description: string };

export type AgentDetailsProps = {
  form: UseFormReturn<AgentDetailsForm, unknown, undefined>;
};
