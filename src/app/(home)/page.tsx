"use client";

import { RoundedButton } from "@/components/common/button/RoundedButton";
import { Token } from "./Token";
import { useTokens } from "@/utils/tokens";

export default function HomePage() {
  const {
    tokens,
    currentPage,
    hasPreviousPage,
    hasNextPage,
    nextPage,
    previousPage,
    isLiveUpdate,
  } = useTokens();

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

      {tokens && (
        <div className="grid grid-cols-3 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
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
