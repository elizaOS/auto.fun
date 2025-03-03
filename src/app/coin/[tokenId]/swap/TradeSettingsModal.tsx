"use client";

import { Modal } from "@/components/common/Modal";
import { useState } from "react";
import ToggleGroup from "@/components/common/ToggleGroup";
import { Slider } from "@/components/common/Slider";
import { SolanaIcon } from "./SolanaIcon";

interface TradeSettings {
  slippage: number;
  speed: "fast" | "turbo" | "ultra";
  tradeSize: number;
  ownTradesFilter: boolean;
  tipAmount: number;
}

const useTradeSettings = () => {
  // Mock implementation
  return {
    slippage: 5,
    speed: "fast" as const,
    tradeSize: 0,
    ownTradesFilter: false,
    tipAmount: 0.004,
    saveSettings: (settings: TradeSettings) => console.log(settings),
  };
};

export const TradeSettingsModal = ({
  modalOpen,
  onClose,
}: {
  modalOpen: boolean;
  onClose: () => void;
}) => {
  const {
    slippage: savedSlippage,
    speed: savedSpeed,
    tradeSize: savedTradeSize,
    ownTradesFilter: savedOwnTradesFilter,
    tipAmount: savedTipAmount,
    saveSettings,
  } = useTradeSettings();

  const [slippage, setSlippage] = useState(savedSlippage);
  const [speed, setSpeed] = useState<"fast" | "turbo" | "ultra">(savedSpeed);
  const [isProtectionEnabled, setIsProtectionEnabled] = useState(false);
  const [tipAmount, setTipAmount] = useState(savedTipAmount || 0.004);

  const onModalClose = () => {
    onClose();
    setSlippage(savedSlippage);
    setSpeed(savedSpeed);
    setIsProtectionEnabled(false);
    setTipAmount(savedTipAmount || 0.004);
  };

  return (
    <Modal
      isOpen={modalOpen}
      onClose={onModalClose}
      title="Trade Settings"
      className="!max-w-[587px] !p-0 !bg-[#171717] !border-neutral-800"
    >
      <div className="flex flex-col gap-8 p-6">
        <div className="flex flex-col gap-8">
          {/* Slippage Section */}
          <div className="flex flex-col gap-3">
            <div className="text-[#a6a6a6] text-xl font-['DM Mono'] flex items-center gap-2">
              SLIPPAGE_%: <span className="text-[#22C55E]">{slippage.toFixed(1)}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Slider
                  value={slippage}
                  onChange={setSlippage}
                  minValue={0}
                  maxValue={30}
                  step={0.1}
                />
              </div>
              <div className="w-[120px] px-4 py-2 bg-[#262626] rounded-md text-white text-xl font-['DM Mono']">
                {slippage.toFixed(1)}%
              </div>
            </div>
            <div className="text-[#a6a6a6] text-sm font-['DM Mono']">
              This is the maximum amount of slippage you are willing to accept when placing trades
            </div>
          </div>

          {/* Speed Section */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-white text-xl font-['DM Mono']">Speed</div>
              <ToggleGroup
                options={[
                  { value: "fast", name: "Fast" },
                  { value: "turbo", name: "Turbo" },
                  { value: "ultra", name: "Ultra" },
                ] as const}
                onChange={(value: "fast" | "turbo" | "ultra") => setSpeed(value)}
                defaultValue={speed}
              />
            </div>
            <div className="text-[#a6a6a6] text-sm font-['DM Mono']">
              Higher speeds will increase your priority fees, making your transactions confirm faster
            </div>
          </div>

          {/* Protection Section */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-white text-xl font-['DM Mono']">
                Enable front-running protection:
              </div>
              <ToggleGroup
                options={[
                  { value: true, name: "ON" },
                  { value: false, name: "OFF" },
                ] as const}
                onChange={(value: boolean) => setIsProtectionEnabled(value)}
                defaultValue={isProtectionEnabled}
              />
            </div>
          </div>

          {/* Tip Amount Section - Only shown when protection is ON */}
          {isProtectionEnabled && (
            <div className="flex flex-col gap-3">
              <div className="text-white text-xl font-['DM Mono']">
                Tip Amount
              </div>
              <div className="flex items-center justify-between px-4 py-3 bg-[#262626] rounded-lg">
                <input
                  type="number"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(Number(e.target.value))}
                  className="bg-transparent text-[#a6a6a6] text-xl font-['DM Mono'] outline-none w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  step="0.001"
                  min="0"
                />
                <div className="flex items-center gap-2">
                  <SolanaIcon />
                  <span className="text-white text-base font-['DM Mono']">SOL</span>
                </div>
              </div>
              <div className="text-[#a6a6a6] text-sm font-['DM Mono']">
                A higher tip amount will make your transactions confirm faster. This is the transaction fee that you pay to the Solana network on each trade.
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => {
            saveSettings({
              slippage,
              speed,
              tradeSize: savedTradeSize,
              ownTradesFilter: savedOwnTradesFilter,
              tipAmount: isProtectionEnabled ? tipAmount : 0,
            });
            onClose();
          }}
          className="w-full h-12 bg-[#092f0e] hover:bg-[#0a3711] active:bg-[#072409] transition-colors rounded-lg text-[#03ff24] text-xl font-['DM Mono'] active:shadow-none"
        >
          Update
        </button>
      </div>
    </Modal>
  );
};