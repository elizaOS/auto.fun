import { Fragment, PropsWithChildren } from "react";
import { Wallet } from "./wallet";
import { SolPriceProvider } from "./sol-price-provider";
import MainentenaceProvider from "./maintenance-provider";
import "react-tooltip/dist/react-tooltip.css";
import TosProvider from "./tos-provider";

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
