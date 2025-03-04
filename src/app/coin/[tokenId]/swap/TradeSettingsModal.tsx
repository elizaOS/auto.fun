"use client";

import { Modal } from "@/components/common/Modal";
import { useState } from "react";
import ToggleGroup from "@/components/common/ToggleGroup";
import { useTradeSettings } from "./useTradeSettings";

export const TradeSettingsModal = ({
  modalOpen,
  onClose,
}: {
  modalOpen: boolean;
  onClose: () => void;
}) => {
  const {
    slippage: savedSlippage,
    saveSettings,
    speed: savedSpeed,
    isProtectionEnabled: savedProtectionEnabled,
  } = useTradeSettings();

  const [slippage, setSlippage] = useState(savedSlippage);
  const [speed, setSpeed] = useState<"fast" | "turbo" | "ultra">(savedSpeed);
  const [isProtectionEnabled, setIsProtectionEnabled] = useState(
    savedProtectionEnabled,
  );

  const discardChanges = () => {
    setSlippage(savedSlippage);
    setSpeed(savedSpeed);
    setIsProtectionEnabled(savedProtectionEnabled);
  };

  const onModalClose = () => {
    onClose();
    discardChanges();
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
            <div className="flex justify-between">
              <div className="text-white text-xl flex items-center gap-2">
                SLIPPAGE_%:{" "}
                <span className="text-[#2fd345] text-xl">
                  {slippage.toFixed(1)}
                </span>
              </div>
              <input
                className="w-[120px] px-4 py-2 bg-[#262626] rounded-md text-white text-xl font-['DM Mono']"
                placeholder={slippage.toFixed(1) + "%"}
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={slippage || ""}
                onChange={(e) => {
                  const value =
                    e.target.value === "" ? 0 : parseFloat(e.target.value);
                  if (
                    e.target.value === "" ||
                    (!isNaN(value) && value >= 0 && value <= 100)
                  ) {
                    setSlippage(value);
                  }
                }}
              />
            </div>
            <div className="text-[#8c8c8c] text-sm font-['DM Mono']">
              This is the maximum amount of slippage you are willing to accept
              when placing trades
            </div>
          </div>

          {/* Speed Section */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-white text-xl">Speed</div>
              <ToggleGroup
                options={
                  [
                    { value: "fast", name: "Fast" },
                    { value: "turbo", name: "Turbo" },
                    { value: "ultra", name: "Ultra" },
                  ] as const
                }
                onChange={(value: "fast" | "turbo" | "ultra") =>
                  setSpeed(value)
                }
                defaultValue={speed}
              />
            </div>
            <div className="text-[#8c8c8c] text-sm font-['DM Mono']">
              Higher speeds will increase your priority fees, making your
              transactions confirm faster
            </div>
          </div>

          {/* Protection Section */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-white text-xl font-['DM Mono']">
                Enable front-running protection:
              </div>
              <ToggleGroup
                options={
                  [
                    { value: true, name: "ON" },
                    { value: false, name: "OFF" },
                  ] as const
                }
                onChange={(value: boolean) => setIsProtectionEnabled(value)}
                defaultValue={isProtectionEnabled}
              />
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            saveSettings({
              slippage,
              speed,
              isProtectionEnabled,
            });
            onClose();
          }}
          className="w-full py-2 bg-[#2e2e2e] hover:bg-[#0a3711] active:bg-[#072409] transition-colors rounded-md text-[#03ff24] text-sm leading-tight font-['DM Mono'] active:shadow-none"
        >
          Update
        </button>
      </div>
    </Modal>
  );
};
