import { ReactNode } from "react";

export type LabelledInputProps = {
  label?: string;
  leftIndicator?: ReactNode;
  rightIndicator?: ReactNode;
  rightHeaderIndicator?: ReactNode;
  inputTag?: ReactNode;
  isOptional?: boolean;
};
