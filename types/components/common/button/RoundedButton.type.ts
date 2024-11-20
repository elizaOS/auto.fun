import { HTMLAttributes, PropsWithChildren } from "react";

export type RoundedButtonProps = {
  variant?: "filled" | "outlined";
  color?: "red";
  disabled?: boolean;
} & PropsWithChildren &
  HTMLAttributes<HTMLButtonElement>;
