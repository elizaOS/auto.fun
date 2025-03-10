import { UseFormReturn } from "react-hook-form";
import { AgentDetailsForm } from "../../../form.type";

export type AgentDetailsProps = {
  form: UseFormReturn<AgentDetailsForm, unknown, undefined>;
  mode: "update" | "create";
  loading?: boolean;
};
