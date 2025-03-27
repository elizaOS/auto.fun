import { PropsWithChildren } from "react";
import { Wallet } from "./wallet";

export function Providers({ children }: PropsWithChildren) {
  return <Wallet>{children}</Wallet>;
}
