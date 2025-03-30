import { PropsWithChildren } from "react";
import { Wallet } from "./wallet";
import { SolPriceProvider } from "./sol-price-provider";

export function Providers({ children }: PropsWithChildren) {
  return (
    <Wallet>
      <SolPriceProvider>{children}</SolPriceProvider>
    </Wallet>
  );
}
