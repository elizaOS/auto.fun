import { PropsWithChildren } from "react";
import { Wallet } from "./wallet";
import { SolPriceProvider } from "./sol-price-provider";
import MainentenaceProvider from "./maintenance-provider";
import 'react-tooltip/dist/react-tooltip.css'


export function Providers({ children }: PropsWithChildren) {
  return (
    <MainentenaceProvider>
      <Wallet>
        <SolPriceProvider>{children}</SolPriceProvider>
      </Wallet>
    </MainentenaceProvider>
  );
}
