"use client";

import { useState } from "react";

export default function TestPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [slippage, setSlippage] = useState<string | number>(2);
  const [isFocus, setIsFocus] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <button
        className="flex items-center gap-2"
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
            stroke="#F743F6"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          className={`border rounded-lg relative ${
            isFocus ? "border-[#f743f6]" : "border-[#662066]"
          }`}
        >
          <input
            className="text-[#f743f6] font-medium bg-inherit p-3 w-full"
            type="number"
            onKeyDown={(e) => {
              if (e.key === "-" || e.key === "e") {
                e.preventDefault();
              }
            }}
            min={0}
            value={slippage}
            onChange={(e) =>
              setSlippage(e.target.value === "" ? "" : Number(e.target.value))
            }
            onFocus={() => setIsFocus(true)}
            onBlur={() => setIsFocus(false)}
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2">%</div>
        </div>
      )}
    </div>
  );
}
