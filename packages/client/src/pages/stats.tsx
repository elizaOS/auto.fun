import useAuthentication from "@/hooks/use-authentication";
import { useTokens, UseTokensParams } from "@/hooks/use-tokens";
import { IToken } from "@/types";
import {
  abbreviateNumber,
  formatNumber,
  formatNumberSubscriptSmart,
} from "@/utils";
import { env } from "@/utils/env";

const GridViewStats = ({
  title,
  iframes,
}: {
  title: string;
  iframes: string[];
}) => {
  return (
    <div className="my-4">
      <h2 className="text-2xl font-bold mb-4">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {iframes.map((iframe, index) => (
          <div key={index} className="border rounded-lg overflow-hidden">
            <iframe
              src={iframe}
              className="w-full h-64"
              title={`Stats iframe ${index + 1}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

import { useCallback, useRef } from "react";
import { Link } from "react-router";

const BondedTokenRow = ({ token }: { token: IToken }) => {
  const priceChangeColor =
    token.priceChange24h && token.priceChange24h > 0
      ? "text-green-500"
      : token.priceChange24h && token.priceChange24h < 0
        ? "text-red-500"
        : "text-gray-400";

  return (
    <Link
      to={`/token/${token.mint}`}
      className="flex flex-col sm:flex-row items-center justify-between p-4 border-b border-gray-700 hover:bg-gray-800 transition-colors duration-150"
    >
      <div className="flex items-center mb-4 sm:mb-0 sm:w-1/3 lg:w-1/4">
        <img
          src={token.image || "/user-placeholder.png"}
          alt={token.name || "Token"}
          className="w-10 h-10 rounded-full mr-3 object-cover"
          onError={(e) => (e.currentTarget.src = "/user-placeholder.png")}
        />
        <div className="flex flex-col">
          <span
            className="font-semibold text-white truncate max-w-[150px] sm:max-w-[200px]"
            title={token.name || "N/A"}
          >
            {token.name || "N/A"}
          </span>
          <span className="text-xs text-gray-400 uppercase">
            {token.ticker || "N/A"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-2 text-sm w-full sm:w-2/3 lg:w-3/4 text-right">
        <div className="flex flex-col items-end">
          <span className="text-xs text-gray-400">Price</span>
          <span className="text-white font-medium">
            {formatNumberSubscriptSmart(token.tokenPriceUSD, 3)}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-xs text-gray-400">24h Change</span>
          <span className={`${priceChangeColor} font-medium`}>
            {token.priceChange24h?.toFixed(2) || "0.00"}%
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-xs text-gray-400">Market Cap</span>
          <span className="text-white font-medium">
            {formatNumber(token.marketCapUSD)}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-xs text-gray-400">24h Volume</span>
          <span className="text-white font-medium">
            {formatNumber(token.volume24h)}
          </span>
        </div>
        <div className="flex flex-col items-end col-span-2 sm:col-span-1">
          <span className="text-xs text-gray-400">Holders</span>
          <span className="text-white font-medium">
            {abbreviateNumber(token.holderCount, true)}
          </span>
        </div>
        {/* Optional: Created At 
        <div className="flex flex-col items-end">
          <span className="text-xs text-gray-400">Created</span>
          <span className="text-white font-medium">
            {token.createdAt ? new Date(token.createdAt).toLocaleDateString() : 'N/A'}
          </span>
        </div>
        */}
      </div>
    </Link>
  );
};

export default function StatsPage() {
  const { walletAddress } = useAuthentication();
  const isAdmin =
    (walletAddress && env.adminAddresses.includes(walletAddress)) || false;

  const params: UseTokensParams = {
    hideImported: 1,
    sortBy: "createdAt",
    sortOrder: "desc",
    status: "locked",
  };

  const query = useTokens(params);

  const observer = useRef<IntersectionObserver | null>(null);
  const lastElementRef = useCallback(
    (node: HTMLDivElement) => {
      if (query.isLoading || query.isFetchingNextPage) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && query.hasNextPage) {
          (query.fetchNextPage as any)();
        }
      });
      if (node) observer.current.observe(node);
    },
    [
      query.isLoading,
      query.isFetchingNextPage,
      query.hasNextPage,
      query.fetchNextPage,
    ],
  );

  if (!isAdmin) {
    window.location.href = "/";
    return null;
  }

  return (
    <div className="mt-4 mx-4">
      <GridViewStats
        title="Addresses"
        iframes={[
          "https://dune.com/embeds/5133792/8462503?darkMode=true",
          "https://dune.com/embeds/5133792/8463015?darkMode=true",
          "https://dune.com/embeds/5133760/8462538?darkMode=true",
        ]}
      />
      <GridViewStats
        title="Fees"
        iframes={[
          "https://dune.com/embeds/5133738/8462511?darkMode=true",
          "https://dune.com/embeds/5133685/8465708?darkMode=true",
        ]}
      />
      <GridViewStats
        title="Volume"
        iframes={[
          "https://dune.com/embeds/5133685/8462540?darkMode=true",
          "https://dune.com/embeds/5133685/8465708?darkMode=true",
        ]}
      />

      <div className="flex flex-col items-center mt-12">
        <h1 className="text-3xl font-bold mb-6">Bonded Tokens</h1>
        <div className="max-w-[1600px]">
          {query.items.map((token) => (
            <BondedTokenRow key={token.mint} token={token} />
          ))}
        </div>
      </div>
      <div ref={lastElementRef} className="h-10 w-full" />
    </div>
  );
}
