import { UseFormRegister } from "react-hook-form";
import { AgentDetailsForm } from "./index.type";
import { FormTextAreaProps } from "../../common/input/FormTextArea.type";

export type OutputAreaProps = {
  content: string;
  onRefresh: () => void;
} & FormTextAreaProps;

export type AdvancedCreationProps = {
  register: UseFormRegister<AgentDetailsForm>;
};
