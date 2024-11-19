import { InputHTMLAttributes } from "react";
import { LabelledInputProps } from "./index.type";

export type FormInputProps = LabelledInputProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "className">;
