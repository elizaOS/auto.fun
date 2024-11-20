import { LabelledInputProps } from "./index.type";
import { TextareaAutosizeProps } from "react-textarea-autosize";

export type FormTextAreaProps = Omit<
  LabelledInputProps,
  "leftIndicator" | "leftIndicatorOpacity"
> &
  Omit<TextareaAutosizeProps, "className">;
