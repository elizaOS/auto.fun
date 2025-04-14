import React from "react";
import { BaseWalletMultiButton } from "./BaseWalletMultiButton";
import type { ButtonProps } from "./Button";
import "./styles.css";

const LABELS = {
  "change-wallet": "Change wallet",
  connecting: "Connecting ...",
  "copy-address": "Copy address",
  copied: "Copied",
  disconnect: "Disconnect",
  "has-wallet": "Connect",
  "no-wallet": "Select Wallet",
  "view-profile": "Profile Page",
} as const;

export function WalletMultiButton(props: ButtonProps) {
  return <BaseWalletMultiButton {...props} labels={LABELS} />;
}
