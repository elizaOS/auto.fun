import { UseFormRegister } from "react-hook-form";
import { AgentDetailsForm, AgentDetailsInput } from "../../../form.type";

import { FormTextAreaProps } from "../../common/input/FormTextArea.type";

export type OutputAreaProps = {
  onRefresh: () => Promise<void>;
} & FormTextAreaProps;

export type AdvancedCreationProps = {
  register: UseFormRegister<AgentDetailsForm>;
  refreshField: (name: AgentDetailsInput) => Promise<void>;
};
