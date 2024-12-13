"use client";

import { RoundedButton } from "@/components/common/button/RoundedButton";
import { Token } from "./Token";

export default function HomePage() {
  return (
    <div className="mt-12 flex flex-col">
      <div className="flex justify-between items-center">
        <div className="text-white text-[56px] font-bold font-secondary leading-[64px] mb-6">
          Token Board
        </div>
        <div className="flex gap-4">
          <RoundedButton color="inverted" className="px-4 py-2 rounded-full">
            All
          </RoundedButton>
          <RoundedButton color="inverted" className="px-4 py-2 rounded-full">
            Market Cap
          </RoundedButton>
        </div>
      </div>
      <div className="grid grid-cols-3 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
        <Token />
        <Token />
        <Token />
        <Token />
        <Token />
        <Token />
        <Token />
        <Token />
      </div>
    </div>
  );
}
