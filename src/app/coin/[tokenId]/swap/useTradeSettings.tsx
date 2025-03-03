import useLocalStorage from "@/hooks/useLocalStorage";
import { useCallback } from "react";

export interface TradeSettings {
  slippage: number;
  speed: "fast" | "turbo" | "ultra";
  isProtectionEnabled: boolean;
  tipAmount: string;
  tradeSize: number;
  ownTradesFilter: boolean;
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

  const [tradeSize, setTradeSize] = useLocalStorage<TradeSettings["tradeSize"]>(
    "trade-settings-trade-size",
    0.1, // Default trade size in SOL
  );
  const [ownTradesFilter, setOwnTradesFilter] = useLocalStorage<
    TradeSettings["ownTradesFilter"]
  >("trade-settings-own-trades-filter", false);

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
      setTradeSize(settings.tradeSize || 0.1);
      setOwnTradesFilter(settings.ownTradesFilter || false);
      setIsProtectionEnabled(settings.isProtectionEnabled || false);
      setTipAmount(settings.tipAmount || "0.004");
    },
    [
      setSlippage,
      setSpeed,
      setTradeSize,
      setOwnTradesFilter,
      setIsProtectionEnabled,
      setTipAmount,
    ],
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
    tradeSize,
    setTradeSize,
    ownTradesFilter,
    setOwnTradesFilter,
    saveSettings,
  };
}
