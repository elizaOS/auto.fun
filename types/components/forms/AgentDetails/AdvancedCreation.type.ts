import { UseFormRegister } from "react-hook-form";
import { AgentDetailsForm } from "../../../form.type";

import { FormTextAreaProps } from "../../common/input/FormTextArea.type";

export type OutputAreaProps = {
  onRefresh: () => void;
} & FormTextAreaProps;

export type AdvancedCreationProps = {
  register: UseFormRegister<AgentDetailsForm>;
};
