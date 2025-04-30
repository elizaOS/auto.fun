import { Fragment, PropsWithChildren } from "react";
import "react-tooltip/dist/react-tooltip.css";
import MainentenaceProvider from "./maintenance-provider";
import { SolPriceProvider } from "./sol-price-provider";
import TosProvider from "./tos-provider";
import { Wallet } from "./wallet";

export function Providers({ children }: PropsWithChildren) {
  return (
    <Fragment>
      <TosProvider />
      <MainentenaceProvider />
      <Wallet>
        <SolPriceProvider>{children}</SolPriceProvider>
      </Wallet>
    </Fragment>
  );
}
