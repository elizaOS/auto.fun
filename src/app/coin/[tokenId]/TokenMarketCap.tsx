"use client";

import { Tooltip } from "@/components/common/Tooltip";
import { formatNumber } from "@/utils/number";
import { Token, useToken } from "@/utils/tokens";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { PropsWithChildren, useMemo } from "react";

export const Money = ({ children }: PropsWithChildren) => {
  return (
    <div className="text-[#33c55e] text-2xl font-bold leading-loose">
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
    <div className="bg-[#33c55e]/10 rounded-xl flex-1 py-3 px-4">
      {children}
    </div>
  );
};

const LoadingBar = ({ progress }: { progress: number }) => {
  console.log("Loading bar progress", progress);
  return (
    <div className="flex gap-2 items-center flex-1">
      <div className="w-full h-1 rounded-full bg-gray-900 flex overflow-hidden">
        <div
          className="h-full bg-[#33c55e] rounded-full z-10 shrink-0 transition-all duration-1000 ease-in-out"
          style={{ width: `${progress}%` }}
        />
        <div className="bg-gradient-to-r from-[#33c55e50] to-transparent w-20 h-full -ml-1" />
      </div>
      <div className="text-[#33c55e] text-base font-medium leading-normal">
        {progress.toFixed(0)}%
      </div>
    </div>
  );
};

export const BondingStatus = ({ token }: { token: Token }) => {
  // Graduation market cap is the market cap at which the token will graduate to Raydium
  // This is the market cap at which the token will have 100% of the bonding curve
  const finalTokenPrice = 0.00000045; // Calculated from the bonding curve configuration (from backend)
  const finalTokenUSDPrice = finalTokenPrice * token.solPriceUSD;
  const graduationMarketCap = finalTokenUSDPrice * 1_000_000_000;

  const status = useMemo(() => {
    switch (token.status) {
      case "active":
        return (
          <>
            Graduate this coin to{" "}
            <a
              className="text-[#33c55e] text-xs font-medium"
              href="https://raydium.io"
              target="_blank"
            >
              Raydium
            </a>{" "}
            at ~$
            {formatNumber(graduationMarketCap)} market cap. There is{" "}
            {(
              (token.reserveLamport - token.virtualReserves) /
              LAMPORTS_PER_SOL
            ).toFixed(3)}{" "}
            SOL in the bonding curve.
          </>
        );
      case "locked":
        return (
          <div>
            The pool has been seeded. This coin has migrated to{" "}
            <a
              className="text-[#33c55e] text-xs font-medium"
              href={`https://raydium.io/swap/?inputCurrency=sol&outputMint=${token.mint}`}
              target="_blank"
            >
              Raydium
            </a>
            .
          </div>
        );
      case "migration_failed":
        return <div>Raydium migration failed</div>;
      case "withdrawn":
      case "migrated":
      case "migrating":
        return <div>Raydium migration in progress...</div>;
    }
  }, [
    graduationMarketCap,
    token.mint,
    token.reserveLamport,
    token.status,
    token.virtualReserves,
  ]);

  return (
    <>
      <Container>
        <div className="flex justify-between mb-3">
          <Title>Bonding progress</Title>
          <Tooltip
            content="Bonding progress is the percentage of the total supply that has been bonded to the token."
            position="left"
          />
        </div>
        <div className="flex gap-2 items-center">
          {token.curveProgress >= 100 && (
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M2.66686 3.33366H4.0002M3.33353 2.66699V4.00033M7.66686 2.66699L7.33353 4.00033M12.0002 3.33366H13.3335M12.6669 2.66699V4.00033M10.0002 6.00033L9.33353 6.66699M12.0002 8.66699L13.3335 8.33366M12.0002 12.667H13.3335M12.6669 12.0003V13.3337M9.33353 11.0123L4.9882 6.66699L2.06153 13.0537C2.00368 13.1777 1.98539 13.3165 2.00914 13.4512C2.03289 13.586 2.09753 13.7101 2.19429 13.8069C2.29104 13.9037 2.41522 13.9683 2.54998 13.992C2.68473 14.0158 2.82353 13.9975 2.94753 13.9397L9.33353 11.0123Z"
                stroke="#33c55e"
                strokeWidth="1.33333"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          <LoadingBar progress={token.curveProgress} />
        </div>
      </Container>
      <div className="text-[#cab7c7] text-xs font-medium leading-normal">
        {status}
      </div>
    </>
  );
};

export const TokenMarketCap = ({ mint }: { mint: string }) => {
  const { data: token } = useToken({ variables: mint });

  if (!token) return null;

  return (
    <div className="flex flex-col bg-[#272727] rounded-xl p-4 gap-3">
      {/* <Tweet url={token.xurl} /> */}

      <div className="flex gap-3 w-full">
        <Container>
          <Title>Market cap</Title>
          <Money>${formatNumber(token.marketCapUSD)}</Money>
        </Container>

        {/* <Container>
          <Title>Capital Raised</Title>
          <Money>${formatNumber(token.liquidity)}</Money>
        </Container> */}
      </div>

      <BondingStatus token={token} />
    </div>
  );
};
