import useLocalStorage from "@/hooks/useLocalStorage";
import { useCallback } from "react";

export interface TradeSettings {
  slippage: number;
  speed: "fast" | "turbo" | "ultra";
  isProtectionEnabled: boolean;
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
  const [isProtectionEnabled, setIsProtectionEnabled] = useLocalStorage<
    TradeSettings["isProtectionEnabled"]
  >("trade-settings-protection", false);

  const saveSettings = useCallback(
    (settings: TradeSettings) => {
      setSlippage(settings.slippage);
      setSpeed(settings.speed);
      setIsProtectionEnabled(settings.isProtectionEnabled);
    },
    [setSlippage, setSpeed, setIsProtectionEnabled],
  );

  return {
    slippage,
    setSlippage,
    speed,
    setSpeed,
    isProtectionEnabled,
    setIsProtectionEnabled,
    saveSettings,
  };
}
