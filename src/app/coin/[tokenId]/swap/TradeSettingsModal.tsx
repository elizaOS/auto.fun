"use client";

import { Modal } from "@/components/common/Modal";
import { useState } from "react";
import ToggleGroup from "@/components/common/ToggleGroup";
import { Slider } from "@/components/common/Slider";
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
    tipAmount: savedTipAmount,
    saveSettings,
    speed: savedSpeed,
    isProtectionEnabled: savedProtectionEnabled,
  } = useTradeSettings();

  const [slippage, setSlippage] = useState(savedSlippage);
  const [speed, setSpeed] = useState(savedSpeed);
  const [isProtectionEnabled, setIsProtectionEnabled] = useState(
    savedProtectionEnabled,
  );
  const [tipAmount, setTipAmount] = useState(savedTipAmount);

  const onModalClose = () => {
    onClose();
    setSlippage(savedSlippage);
    setSpeed(savedSpeed);
    setIsProtectionEnabled(savedProtectionEnabled);
    setTipAmount(savedTipAmount);
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
              SLIPPAGE_%: {slippage.toFixed(1)}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Slider
                  value={slippage}
                  onChange={setSlippage}
                  minValue={0}
                  maxValue={5}
                  step={0.1}
                />
              </div>
              <div className="text-green-500/80 text-xl font-['DM Mono']">
                MAX_5%
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
              Higher speeds will increase your priority fees, making your
              transactions confirm faster
            </div>
          </div>

          <div className="border-t border-[#505050]" />

          {/* Protection Section */}
          <div className="flex items-center justify-between py-1">
            <div className="text-white text-xl font-medium font-['DM Mono']">
              Enable front-running protection:
            </div>
            <ToggleGroup
              options={[
                { value: true, name: "On" },
                { value: false, name: "Off" },
              ]}
              onChange={(value) => setIsProtectionEnabled(value)}
              defaultValue={savedProtectionEnabled}
            />
          </div>

          <div className="border-t border-[#505050]" />

          {/* Tip Amount Section */}
          <div className="flex flex-col gap-1">
            <div className="flex flex-col gap-3 py-1">
              <div className="text-white text-xl font-medium font-['DM Mono']">
                Tip Amount
              </div>
              <div className="flex items-center justify-between px-3 py-2 bg-[#212121] rounded-md border border-neutral-800">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={tipAmount}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "" || Number(value) >= 0) {
                      setTipAmount(value);
                    }
                  }}
                  className="bg-transparent text-[#a6a6a6] text-base font-['DM Mono'] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <div className="flex items-center gap-1">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <rect width="24" height="24" rx="12" fill="black" />
                    <path
                      d="M18.5987 15.2916L16.3976 17.5913C16.3497 17.6412 16.2918 17.681 16.2275 17.7083C16.1632 17.7355 16.0938 17.7495 16.0237 17.7495H5.58951C5.53973 17.7495 5.49102 17.7353 5.44939 17.7087C5.40776 17.6821 5.37501 17.6443 5.35516 17.5998C5.33532 17.5553 5.32924 17.5061 5.33769 17.4583C5.34613 17.4105 5.36872 17.3662 5.40269 17.3307L7.60542 15.0311C7.65314 14.9812 7.71084 14.9415 7.77496 14.9143C7.83909 14.8871 7.90827 14.873 7.97822 14.8729H18.4118C18.4616 14.8729 18.5103 14.887 18.5519 14.9136C18.5935 14.9402 18.6263 14.9781 18.6462 15.0226C18.666 15.0671 18.6721 15.1162 18.6636 15.164C18.6552 15.2118 18.6326 15.2562 18.5987 15.2916ZM16.3976 10.6608C16.3497 10.6108 16.2918 10.571 16.2275 10.5438C16.1632 10.5166 16.0938 10.5026 16.0237 10.5026H5.58951C5.53973 10.5026 5.49102 10.5168 5.44939 10.5434C5.40776 10.57 5.37501 10.6078 5.35516 10.6523C5.33532 10.6968 5.32924 10.7459 5.33769 10.7937C5.34613 10.8415 5.36872 10.8859 5.40269 10.9214L7.60542 13.221C7.65314 13.2708 7.71084 13.3106 7.77496 13.3378C7.83909 13.365 7.90827 13.3791 7.97822 13.3792H18.4118C18.4616 13.3792 18.5103 13.365 18.5519 13.3384C18.5935 13.3118 18.6263 13.274 18.6462 13.2295C18.666 13.185 18.6721 13.1359 18.6636 13.0881C18.6552 13.0403 18.6326 12.9959 18.5987 12.9604L16.3976 10.6608ZM5.58951 9.00896H16.0237C16.0938 9.00898 16.1632 8.99496 16.2275 8.96774C16.2918 8.94052 16.3497 8.90069 16.3976 8.85074L18.5987 6.5511C18.6326 6.51563 18.6552 6.47128 18.6636 6.42348C18.6721 6.37568 18.666 6.32652 18.6462 6.28204C18.6263 6.23756 18.5935 6.19969 18.5519 6.17309C18.5103 6.1465 18.4616 6.13233 18.4118 6.13232H7.97822C7.90827 6.13244 7.83909 6.14654 7.77496 6.17376C7.71084 6.20097 7.65314 6.24072 7.60542 6.29054L5.40325 8.59019C5.36932 8.6256 5.34674 8.66992 5.33828 8.71766C5.32982 8.76541 5.33584 8.81453 5.35562 8.85899C5.37539 8.90345 5.40805 8.94131 5.4496 8.96795C5.49115 8.99459 5.53977 9.00884 5.58951 9.00896Z"
                      fill="url(#paint0_linear_737_3098)"
                    />
                    <defs>
                      <linearGradient
                        id="paint0_linear_737_3098"
                        x1="6.45947"
                        y1="18.0264"
                        x2="17.0823"
                        y2="5.73414"
                        gradientUnits="userSpaceOnUse"
                      >
                        <stop offset="0.08" stopColor="#9945FF" />
                        <stop offset="0.3" stopColor="#8752F3" />
                        <stop offset="0.5" stopColor="#5497D5" />
                        <stop offset="0.6" stopColor="#43B4CA" />
                        <stop offset="0.72" stopColor="#28E0B9" />
                        <stop offset="0.97" stopColor="#19FB9B" />
                      </linearGradient>
                    </defs>
                  </svg>

                  <span className="text-white text-base font-['DM Mono'] uppercase tracking-widest">
                    SOL
                  </span>
                </div>
              </div>
            </div>
            <div className="text-[#a6a6a6] text-sm font-['DM Mono']">
              A higher tip amount will make your transactions confirm faster.
              This is the transaction fee that you pay to the Solana network on
              each trade.
            </div>
          </div>

          <div className="border-t border-[#505050]" />
        </div>

        <button
          className="w-full px-5 py-2 bg-[#092f0e] rounded-lg"
          onClick={() => {
            saveSettings({ slippage, speed, isProtectionEnabled, tipAmount });
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
};
