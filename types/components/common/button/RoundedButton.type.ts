import { ButtonHTMLAttributes, PropsWithChildren } from "react";

export type RoundedButtonProps = {
  variant?: "filled" | "outlined";
  color?: "inverted";
  disabled?: boolean;
} & PropsWithChildren &
  ButtonHTMLAttributes<HTMLButtonElement>;
