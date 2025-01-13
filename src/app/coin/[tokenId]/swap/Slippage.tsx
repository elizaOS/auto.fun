"use client";

import { useState } from "react";

export function Slippage({
  value,
  onChange,
}: {
  value: number | string;
  onChange: (value: number | string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFocus, setIsFocus] = useState(false);

  return (
    <div className="flex flex-col gap-2 w-full">
      <button
        className="flex justify-between items-center gap-2"
        onClick={() => setIsOpen(!isOpen)}
      >
        Set slippage{" "}
        <svg
          className={`transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M6 9L12 15L18 9"
            stroke="#33c55e"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen && (
        <>
          <div
            className={`border rounded-lg relative ${
              isFocus ? "border-[#33c55e]" : "border-[#42c55e]"
            }`}
          >
            <input
              className="text-[#33c55e] font-medium bg-inherit p-3 w-full"
              type="number"
              onKeyDown={(e) => {
                if (e.key === "-" || e.key === "e") {
                  e.preventDefault();
                }
              }}
              min={0}
              value={value}
              onChange={(e) =>
                onChange(e.target.value === "" ? "" : Number(e.target.value))
              }
              onFocus={() => setIsFocus(true)}
              onBlur={() => setIsFocus(false)}
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2">%</div>
          </div>
          <div className="text-[#cab7c7] text-xs font-medium font-['Inter'] leading-none">
            Max amount of slippage you&apos;re willing to accept when placing
            trades.
          </div>
        </>
      )}
    </div>
  );
}
