import React from "react";
import { BaseWalletConnectButton } from "./BaseWalletConnectButton";
import type { ButtonProps } from "./Button";

const LABELS = {
  connecting: "Connecting ...",
  connected: "Connected",
  "has-wallet": "Connect",
  "no-wallet": "Connect Wallet",
} as const;

export function WalletConnectButton(props: ButtonProps) {
  return <BaseWalletConnectButton {...props} labels={LABELS} />;
}
