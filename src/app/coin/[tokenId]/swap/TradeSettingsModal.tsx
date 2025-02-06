"use client";

import { Modal } from "@/components/common/Modal";
import { useState } from "react";
import ToggleGroup from "@/components/common/ToggleGroup";
import { Slider } from "@/components/common/Slider";
import { useTradeSettings } from "./useTradeSettings";
import { SolanaIcon } from "./SolanaIcon";

export const TradeSettingsModal = ({
  modalOpen,
  onClose,
}: {
  modalOpen: boolean;
  onClose: () => void;
}) => {
  const {
    slippage: savedSlippage,
    // tipAmount: savedTipAmount,
    saveSettings,
    speed: savedSpeed,
    tradeSize: savedTradeSize,
    ownTradesFilter: savedOwnTradesFilter,
    // isProtectionEnabled: savedProtectionEnabled,
  } = useTradeSettings();

  const [slippage, setSlippage] = useState(savedSlippage);
  const [speed, setSpeed] = useState(savedSpeed);
  const [tradeSize, setTradeSize] = useState(savedTradeSize);
  const [ownTradesFilter, setOwnTradesFilter] = useState(savedOwnTradesFilter);
  // const [isProtectionEnabled, setIsProtectionEnabled] = useState(
  //   savedProtectionEnabled,
  // );
  // const [tipAmount, setTipAmount] = useState(savedTipAmount);

  const onModalClose = () => {
    onClose();
    setSlippage(savedSlippage);
    setSpeed(savedSpeed);
    // setIsProtectionEnabled(savedProtectionEnabled);
    // setTipAmount(savedTipAmount);
    setTradeSize(savedTradeSize);
    setOwnTradesFilter(savedOwnTradesFilter);
  };
  const speedTips = {
    fast: "0.001 SOL",
    turbo: "0.005 SOL",
    ultra: "0.01 SOL"
  };

  return (
    <Modal
      isOpen={modalOpen}
      onClose={onModalClose}
      title="Trade Settings"
      className="!max-w-[587px] !p-0 !bg-neutral-900 !border-neutral-800"
    >
      <div className="flex flex-col gap-[34px] py-2.5 px-3.5">
        <div className="flex flex-col gap-6">
          {/* Slippage Section */}
          <div className="flex flex-col gap-3">
            <div className="text-[#a1a1a1] text-xl font-['DM Mono']">
              SLIPPAGE: {slippage.toFixed(1)}%
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
            </div>
            <div className="text-[#a6a6a6] text-sm font-['DM Mono']">
              This is the maximum amount of slippage you are willing to accept
              when placing trades
            </div>
          </div>

          <div className="border-t border-[#505050]" />

          {/* Speed Section */}
          <div className="flex flex-col gap-3.5">
            <div className="flex items-center justify-between">
              <div className="text-white text-xl font-medium font-['DM Mono']">
                Speed
              </div>
              <ToggleGroup
                options={
                  [
                    { value: "fast", name: "Fast" },
                    { value: "turbo", name: "Turbo" },
                    { value: "ultra", name: "Ultra" },
                  ] as const
                }
                onChange={(value) => setSpeed(value)}
                defaultValue={savedSpeed}
              />
            </div>
            <div className="text-[#a6a6a6] text-sm font-['DM Mono']">
              Priority fee: {speedTips[speed]}
            </div>
          </div>

          <div className="border-t border-[#505050]" />

          {/* Trade Size Section */}
          <div className="flex flex-col gap-3">
            <div className="text-white text-xl font-medium font-['DM Mono']">
              Trade Size
            </div>
            <div className="flex items-center justify-between px-3 py-2 bg-[#212121] rounded-md border border-neutral-800">
              <input
                type="number"
                min="0"
                step="0.01"
                value={tradeSize}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "" || Number(value) >= 0) {
                    setTradeSize(Number(value));
                  }
                }}
                className="bg-transparent text-[#a6a6a6] text-base font-['DM Mono'] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none w-full"
              />
              <div className="flex items-center gap-1">
                <SolanaIcon />
                <span className="text-white text-base font-['DM Mono'] uppercase tracking-widest">
                  SOL
                </span>
              </div>
            </div>
            <div className="text-[#a6a6a6] text-sm font-['DM Mono']">
              Specify the maximum trade size in SOL
            </div>
          </div>

          <div className="border-t border-[#505050]" />

          {/* Own Trades Filter Section */}
          <div className="flex items-center justify-between py-1">
            <div className="text-white text-xl font-medium font-['DM Mono']">
              Own Trades Only
            </div>
            <ToggleGroup
              options={[
                { value: true, name: "On" },
                { value: false, name: "Off" },
              ]}
              onChange={(value) => setOwnTradesFilter(value)}
              defaultValue={savedOwnTradesFilter}
            />
          </div>
        </div>

        <button
          className="w-full px-5 py-2 bg-[#092f0e] rounded-lg"
          onClick={() => {
            saveSettings({
              slippage,
              speed,
              tradeSize,
              ownTradesFilter
            });
            onClose();
          }}
        >
          <span className="text-center text-[#03ff24] text-base font-medium font-['DM Mono']">
            Update
          </span>
        </button>
      </div>
    </Modal>
  );
}