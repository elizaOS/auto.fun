import React from "react";
import { BaseWalletDisconnectButton } from "./BaseWalletDisconnectButton";
import type { ButtonProps } from "./Button";

const LABELS = {
  disconnecting: "Disconnecting ...",
  "has-wallet": "Disconnect",
  "no-wallet": "Disconnect Wallet",
} as const;

export function WalletDisconnectButton(props: ButtonProps) {
  return <BaseWalletDisconnectButton {...props} labels={LABELS} />;
}
