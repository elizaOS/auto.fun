import { UseFormReturn } from "react-hook-form";
import { AgentDetailsForm } from "../../../form.type";

export type Personality = { id: number; name: string };

export type AgentDetailsProps = {
  form: UseFormReturn<AgentDetailsForm, unknown, undefined>;
  mode: "update" | "create";
  loading?: boolean;
};
