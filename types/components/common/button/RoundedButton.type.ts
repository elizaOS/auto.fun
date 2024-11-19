import { HTMLAttributes, PropsWithChildren } from "react";

export type RoundedButtonProps = {
  variant?: "filled" | "outlined";
  color?: "red" | "green";
  disabled?: boolean;
} & PropsWithChildren &
  Omit<HTMLAttributes<HTMLButtonElement>, "className">;
