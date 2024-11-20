import { RefAttributes } from "react";
import { LabelledInputProps } from "./index.type";

export type FormTextAreaProps = Omit<
  LabelledInputProps,
  "leftIndicator" | "leftIndicatorOpacity"
> &
  Omit<RefAttributes<HTMLTextAreaElement>, "className">;
