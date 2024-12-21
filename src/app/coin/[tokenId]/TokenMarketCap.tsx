"use client";

import { Tooltip } from "@/components/common/Tooltip";
import { Tweet } from "@/components/common/Tweet";
import { formatCurrency } from "@/utils/formatCurrency";
import { useToken } from "@/utils/tokens";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { PropsWithChildren } from "react";

const Money = ({ children }: PropsWithChildren) => {
  return (
    <div className="text-[#f743f6] text-2xl font-bold leading-loose">
      {children}
    </div>
  );
};

const Title = ({ children }: PropsWithChildren) => {
  return (
    <div className="text-white text-base font-medium leading-normal">
      {children}
    </div>
  );
};

const Container = ({ children }: PropsWithChildren) => {
  return (
    <div className="bg-[#f743f6]/10 rounded-xl flex-1 py-3 px-4">
      {children}
    </div>
  );
};

const LoadingBar = ({ progress }: { progress: number }) => {
  return (
    <div className="flex gap-2 items-center">
      <div className="w-full h-1 rounded-full bg-gray-900 flex overflow-hidden">
        <div
          className="h-full bg-[#F743F6] rounded-full z-10 shrink-0 transition-all duration-1000 ease-in-out"
          style={{ width: `${progress}%` }}
        />
        <div className="bg-gradient-to-r from-[#F743F650] to-transparent w-20 h-full -ml-1" />
      </div>
      <div className="text-[#f743f6] text-base font-medium leading-normal">
        {progress.toFixed(0)}%
      </div>
    </div>
  );
};

export const TokenMarketCap = ({ mint }: { mint: string }) => {
  const { data: token } = useToken(mint);

  if (!token) return null;

  return (
    <div className="flex flex-col bg-[#401141] rounded-xl p-4 gap-3">
      <Tweet url={token.xurl} />

      <div className="flex gap-3 w-full">
        <Container>
          <Title>Market cap</Title>
          <Money>${formatCurrency(token.marketCapUSD)}</Money>
        </Container>

        <Container>
          <Title>Capital Raised</Title>
          <Money>${formatCurrency(token.liquidity)}</Money>
        </Container>
      </div>

      <Container>
        <div className="flex justify-between mb-3">
          <Title>Bonding progress</Title>
          <Tooltip
            content="Bonding progress is the percentage of the total supply that has been bonded to the token."
            position="left"
          />
        </div>
        <LoadingBar progress={token.curveProgress} />
      </Container>

      <div className="text-[#cab7c7] text-xs font-medium leading-normal">
        Graduate this coin to{" "}
        <a
          className="text-[#f743f6] text-xs font-medium"
          href="https://raydium.io"
          target="_blank"
        >
          Raydium
        </a>{" "}
        at $
        {formatCurrency(
          (token.curveLimit / LAMPORTS_PER_SOL) * token.solPriceUSD,
        )}{" "}
        market cap. There is{" "}
        {(
          (token.reserveLamport - token.virtualReserves) /
          LAMPORTS_PER_SOL
        ).toFixed(3)}{" "}
        SOL in the bonding curve.
      </div>
    </div>
  );
};
