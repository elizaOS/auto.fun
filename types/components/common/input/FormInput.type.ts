import { InputHTMLAttributes } from "react";

export type FormInputProps = {
  label: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className">;
