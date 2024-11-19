import { InputHTMLAttributes } from "react";
import { LabelledInputProps } from "./index.type";

export type FormInputProps = LabelledInputProps & {
  /**
   * Whether to pad the input on the left, right, or both sides.
   */
  inputPad?: "left" | "right" | "both";
  variant?: "error" | "default";
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className">;
