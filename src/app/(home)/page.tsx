"use client";

import { RoundedButton } from "@/components/common/button/RoundedButton";
import { Token } from "./Token";
import { useTokens } from "@/utils/tokens";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

export default function HomePage() {
  const {
    tokens,
    currentPage,
    hasPreviousPage,
    hasNextPage,
    nextPage,
    previousPage,
    isLiveUpdate,
    isLoading,
  } = useTokens();

  const renderSkeletons = () => (
    <div className="grid grid-cols-3 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
      {[...Array(30)].map((_, index) => (
        <div
          key={index}
          className="px-4 pt-4 pb-5 bg-[#401141] rounded-[20px] flex flex-col gap-1"
        >
          <div className="self-stretch justify-between items-start inline-flex">
            <Skeleton
              className="!rounded-xl border border-[#642064]"
              width={100}
              height={100}
              baseColor="#2b0b2c"
              highlightColor="#521653"
            />
            <Skeleton
              width={120}
              height={24}
              baseColor="#2b0b2c"
              highlightColor="#521653"
            />
          </div>

          <div className="self-stretch flex-col justify-start items-start flex gap-2">
            <Skeleton
              width={200}
              height={24}
              baseColor="#2b0b2c"
              highlightColor="#521653"
            />
            <Skeleton
              width={120}
              height={24}
              baseColor="#2b0b2c"
              highlightColor="#521653"
            />
          </div>

          <Skeleton
            className="rounded-xl mb-[9px]"
            width="100%"
            height={48}
            baseColor="#521653"
            highlightColor="#642064"
          />

          <Skeleton
            width={120}
            height={24}
            baseColor="#2b0b2c"
            highlightColor="#521653"
          />
        </div>
      ))}
    </div>
  );

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

      {isLoading
        ? renderSkeletons()
        : tokens && (
            <div className="grid grid-cols-3 lg:grid-cols-2 2xl:grid-cols-3 gap-2">
              {tokens.map((token, index) => (
                <Token
                  key={token.mint}
                  mint={token.mint}
                  marketCap="$35.6k"
                  name={token.name}
                  ticker={token.ticker}
                  url={token.image}
                  tweetUrl={token.website}
                  createdAt={token.createdAt}
                  className={`${index === 0 && isLiveUpdate ? "animate-shake" : ""}`}
                />
              ))}
            </div>
          )}

      <div className="mt-6 flex justify-center">
        <div className="flex gap-4 items-center text-white">
          <button
            className="group disabled:opacity-30"
            onClick={previousPage}
            disabled={!hasPreviousPage}
          >
            <span className="group-enabled:hover:font-extrabold">
              [ &lt;&lt;
            </span>
          </button>
          <span>{currentPage}</span>

          <button
            className="group disabled:opacity-30"
            onClick={nextPage}
            disabled={!hasNextPage}
          >
            <span className="group-enabled:hover:font-extrabold">
              &gt;&gt; ]
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
