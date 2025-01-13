"use client";

import { useToken } from "@/utils/tokens";
import { ContractAddress } from "./ContractAddress";
import { useTimeAgo } from "@/app/formatTimeAgo";

export const TokenMetadata = ({ mint }: { mint: string }) => {
  const { data: token } = useToken({ variables: mint });
  const timeAgo = useTimeAgo(token?.createdAt ?? "");

  // TODO: add a loading state
  if (!token) return null;

  return (
    <div className="bg-[#272727] rounded-2xl p-4 flex flex-col gap-4">
      <div className="flex gap-4">
        <img
          src={token.image || undefined}
          className="rounded-xl aspect-square w-[132px] h-[132px]"
          alt="placeholder"
        />

        <div className="flex flex-col justify-between">
          <div>
            <div className="text-white text-2xl font-normal font-secondary">
              {token.name}
            </div>

            <div className="text-[#b3a0b3] text-2xl font-bold font-secondary uppercase">
              ${token.ticker}
            </div>
          </div>

          <ContractAddress mint={mint} />
        </div>
      </div>

      <div className="bg-[#03ff2436] h-px" />
      <div className="text-white/60 text-base font-medium">{timeAgo}</div>
    </div>
  );
};
