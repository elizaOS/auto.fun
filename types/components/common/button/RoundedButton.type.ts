import { ButtonHTMLAttributes, PropsWithChildren } from "react";

export type RoundedButtonProps = {
  variant?: "filled" | "outlined";
  color?: "red";
  disabled?: boolean;
} & PropsWithChildren &
  ButtonHTMLAttributes<HTMLButtonElement>;
