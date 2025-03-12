import useLocalStorage from "@/hooks/useLocalStorage";
import { useCallback } from "react";

export interface TradeSettings {
  slippage: number;
  speed: "fast" | "turbo" | "ultra";
  isProtectionEnabled: boolean;
  tipAmount: string;
}

export function useTradeSettings() {
  const [slippage, setSlippage] = useLocalStorage<TradeSettings["slippage"]>(
    "trade-settings-slippage",
    1,
  );
  const [speed, setSpeed] = useLocalStorage<TradeSettings["speed"]>(
    "trade-settings-speed",
    "turbo",
  );

  // Protection & tip commented code
  const [isProtectionEnabled, setIsProtectionEnabled] = useLocalStorage<
    TradeSettings["isProtectionEnabled"]
  >("trade-settings-protection", false);
  const [tipAmount, setTipAmount] = useLocalStorage<TradeSettings["tipAmount"]>(
    "trade-settings-tip-amount",
    "0.004",
  );

  const saveSettings = useCallback(
    (settings: TradeSettings) => {
      setSlippage(settings.slippage || 1);
      setSpeed(settings.speed || "turbo");
      setIsProtectionEnabled(settings.isProtectionEnabled || false);
      setTipAmount(settings.tipAmount || "0.004");
    },
    [setSlippage, setSpeed, setIsProtectionEnabled, setTipAmount],
  );

  return {
    slippage,
    setSlippage,
    speed,
    setSpeed,
    isProtectionEnabled,
    setIsProtectionEnabled,
    tipAmount,
    setTipAmount,
    saveSettings,
  };
}
