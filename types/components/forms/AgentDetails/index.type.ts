import { UseFormReturn } from "react-hook-form";
import { AgentDetailsForm, TwitterDetailsForm } from "../../../form.type";

export type AgentDetailsProps = {
  form: UseFormReturn<AgentDetailsForm, unknown, undefined>;
  twitterForm?: UseFormReturn<TwitterDetailsForm, unknown, undefined>;
  mode: "update" | "create";
  loading?: boolean;
  submit?: () => void;
  disabled?: boolean;
};
