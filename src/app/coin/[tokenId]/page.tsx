"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToken } from "@/utils/tokens";
import { useParams } from "next/navigation";
import { TradingChart } from "@/components/TVChart/TradingChart";
import { usePaginatedLiveData } from "@/utils/paginatedLiveData";
import { z } from "zod";
import { getSocket } from "@/utils/socket";
import { queryClient } from "@/components/providers";
import { TokenBuySell } from "./swap/TokenBuySell";
import { RoundedButton } from "@/components/common/button/RoundedButton";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, VersionedTransaction } from "@solana/web3.js";
import { womboApi } from "@/utils/fetch";
import { toast } from "react-toastify";
import { AgentCardInfo } from "@/components/agent-card/AgentCardInfo";
import { SolanaIcon } from "./swap/SolanaIcon";
import { useTimeAgo } from "@/app/formatTimeAgo";
import { useAgentByMintAddress } from "@/utils/agent";
import { HolderTable } from "./HolderTable";
import { TradeTable } from "./TradeTable";

const HolderSchema = z.object({
  address: z.string(),
  mint: z.string(),
  amount: z.number(),
  percentage: z.number(),
  createdAt: z.string().datetime(),
  lastUpdated: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Holder = z.infer<typeof HolderSchema>;

const TransactionSchema = z
  .object({
    txId: z.string(),
    timestamp: z.string().datetime(),
    user: z.string(),
    direction: z.number().int().min(0).max(1),
    amountIn: z.number(),
    amountOut: z.number(),
  })
  .transform((tx) => ({
    txId: tx.txId,
    timestamp: tx.timestamp,
    user: tx.user,
    type: tx.direction === 0 ? ("Buy" as const) : ("Sell" as const),
    solAmount:
      (tx.direction === 0 ? tx.amountIn : tx.amountOut) / LAMPORTS_PER_SOL,
    tokenAmount:
      tx.direction === 0 ? tx.amountOut / 10 ** 6 : tx.amountIn / 10 ** 6,
  }));

export type Transaction = z.infer<typeof TransactionSchema>;

const Switcher = ({
  enabled,
  onChange,
  label,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) => (
  <div className="flex items-center gap-2 font-satoshi">
    <span className="text-sm font-medium">{label}</span>
    <button
      onClick={() => onChange(!enabled)}
      className={`w-10 h-5 rounded-full transition-colors duration-200 ease-in-out ${
        enabled ? "bg-[#4ADE80]" : "bg-[#262626]"
      } relative`}
    >
      <div
        className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform duration-200 ease-in-out ${
          enabled ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  </div>
);

const SMALL_TRADE_THRESHOLD = 0.05;

export default function TradingInterface() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [activeTab, setActiveTab] = useState("trades");
  const [showOwnTrades, setShowOwnTrades] = useState(false);
  const [showSmallTrades, setShowSmallTrades] = useState(false);
  const params = useParams();

  const tokenId = params.tokenId as string;
  const { data: token, isLoading: isTokenLoading } = useToken({
    variables: tokenId,
  });
  const { data: agent, isLoading: isAgentLoading } = useAgentByMintAddress({
    enabled: !!token?.hasAgent,
    variables: { contractAddress: token?.mint ?? "" },
  });
  const isLoading = isTokenLoading || isAgentLoading;

  const { items: holders } = usePaginatedLiveData({
    itemsPerPage: 100,
    endpoint: `/tokens/${tokenId}/holders`,
    validationSchema: HolderSchema,
    getUniqueId: (holder) => holder.address,
    socketConfig: {
      subscribeEvent: {
        event: "subscribe",
        args: [tokenId],
      },
      newDataEvent: "newHolder",
    },
    itemsPropertyName: "holders",
  });

  const { items: transactions } = usePaginatedLiveData({
    itemsPerPage: 100,
    endpoint: `/swaps/${tokenId}`,
    validationSchema: TransactionSchema,
    getUniqueId: (tx) => tx.txId,
    socketConfig: {
      subscribeEvent: {
        event: "subscribe",
        args: [tokenId],
      },
      newDataEvent: "newSwap",
    },
    itemsPropertyName: "swaps",
  });

  const filteredTransactions = useMemo(() => {
    return transactions
      .filter((tx) => showSmallTrades || tx.solAmount > SMALL_TRADE_THRESHOLD)
      .filter((tx) => !showOwnTrades || tx.user === publicKey?.toBase58());
  }, [publicKey, showOwnTrades, showSmallTrades, transactions]);

  const tokenTimeAgo =
    useTimeAgo(token?.createdAt || "").toLowerCase() + " ago";

  const socket = useMemo(() => getSocket(), []);

  useEffect(() => {
    console.log("subscribe", tokenId);
    socket.emit("subscribe", tokenId);

    return () => {
      socket.emit("unsubscribe", tokenId);
    };
  }, [tokenId, socket]);

  useEffect(() => {
    if (!token) return;

    socket.on("updateToken", (token) => {
      console.log("updateToken", token);
      queryClient.setQueryData(useToken.getKey(tokenId), token);
    });

    return () => {
      socket.off("updateToken");
    };
  }, [token, tokenId, socket]);

  const harvestTokenFees = async () => {
    try {
      const data: {
        transaction: string;
      } = await womboApi.get({
        endpoint: `/tokens/${tokenId}/harvest-tx?owner=${publicKey?.toString()}`,
      });

      const txBytes = Buffer.from(data.transaction, "base64");
      const tx = VersionedTransaction.deserialize(txBytes);

      const txHash = await sendTransaction(tx, connection);

      toast.success(`Fees harvested successfully ${txHash}`, {
        autoClose: 5000,
      });
    } catch (error) {
      console.error(error);
      toast.error("Failed to harvest fees: " + (error as Error).message);
    }
  };

  if (isLoading) {
    return renderSkeletons();
  }

  if (!token) return null;

  if (agent && "unauthenticated" in agent) return null;

  return (
    <div className="min-h-screen text-gray-200 flex flex-col mt-4">
      <div className="flex flex-col lg:flex-row gap-4 justify-center px-4 py-6 max-w-[1680px] mx-auto w-full">
        <div className="order-1 lg:order-0 flex flex-col flex-1 w-full space-y-4">
          {/* Stats Section */}
          <div className="box-border flex flex-row items-center py-3 px-4 w-full bg-[#171717] border border-[#262626] rounded-[6px] overflow-x-auto scrollbar-hide">
            <div className="flex flex-col justify-center items-center p-0 gap-2 rounded-l-[6px] flex-1">
              <span className="font-['DM_Mono'] font-normal text-xs sm:text-base leading-6 text-[#8C8C8C] whitespace-nowrap">
                Market Cap
              </span>
              <span className="font-['DM_Mono'] font-normal text-sm sm:text-xl leading-6 text-[#2FD345]">
                {Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  notation: "compact",
                }).format(Number(token.marketCapUSD))}
              </span>
            </div>
            <div className="bg-[#262626] flex-none" />
            <div className="flex flex-col justify-center items-center p-0 gap-2 flex-1">
              <span className="font-['DM_Mono'] font-normal text-xs sm:text-base leading-6 text-[#8C8C8C] whitespace-nowrap">
                24hr Volume
              </span>
              <span className="font-['DM_Mono'] font-normal text-sm sm:text-xl leading-6 text-white">
                {Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  notation: "compact",
                }).format(Number(token.volume24h))}
              </span>
            </div>
            <div className="bg-[#262626] flex-none" />
            <div className="flex flex-col justify-center items-center p-0 gap-2 flex-1">
              <span className="font-['DM_Mono'] font-normal text-xs sm:text-base leading-6 text-[#8C8C8C] whitespace-nowrap">
                Creator
              </span>
              <div className="flex flex-row items-center p-0 gap-2 w-[132px] h-6">
                <span className="font-['DM_Mono'] font-normal text-sm sm:text-xl leading-6 text-white">{`${token.creator.slice(0, 4)}...${token.creator.slice(-4)}`}</span>
              </div>
            </div>
            <div className="bg-[#262626] flex-none" />
            <div className="flex flex-col justify-center items-center p-0 gap-2 rounded-r-[6px] flex-1">
              <span className="font-['DM_Mono'] font-normal text-xs sm:text-base leading-6 text-[#8C8C8C] whitespace-nowrap">
                Creation Time
              </span>
              <span className="font-['DM_Mono'] font-normal text-sm sm:text-xl leading-6 text-white">
                {tokenTimeAgo}
              </span>
            </div>
          </div>

          {((token && token.status === "active") ||
            token?.status === "locked") && (
            <div className="w-full h-[50vh] bg-[#171717] border border-[#262626] rounded-xl overflow-hidden">
              <TradingChart param={token} />
            </div>
          )}

          {/* Trading Activity Panel */}
          <div className="bg-[#171717] border border-[#262626] rounded-xl overflow-hidden">
            {/* Tab Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border-b border-[#262626] gap-4">
              <div className="flex gap-4">
                <button
                  onClick={() => setActiveTab("trades")}
                  className={`px-4 py-2 rounded-md text-sm font-medium font-satoshi ${
                    activeTab === "trades"
                      ? "bg-[#262626] text-white"
                      : "text-[#8C8C8C] hover:text-white"
                  }`}
                >
                  Trades
                </button>
                <button
                  onClick={() => setActiveTab("holders")}
                  className={`px-4 py-2 rounded-md text-sm font-medium font-satoshi ${
                    activeTab === "holders"
                      ? "bg-[#262626] text-white"
                      : "text-[#8C8C8C] hover:text-white"
                  }`}
                >
                  Holders
                </button>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-4 overflow-x-auto sm:overflow-visible">
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    <span className="text-sm font-satoshi font-medium">
                      Size
                    </span>
                    <div className="flex items-center gap-1">
                      <SolanaIcon />
                      <span className="text-xs font-satoshi">
                        {SMALL_TRADE_THRESHOLD}
                      </span>
                    </div>
                    <Switcher
                      enabled={showSmallTrades}
                      onChange={setShowSmallTrades}
                      label=""
                    />
                  </div>
                  <Switcher
                    enabled={showOwnTrades}
                    onChange={setShowOwnTrades}
                    label="Own Trades"
                  />
                </div>
              </div>
            </div>

            {/* Trade List */}
            {activeTab === "trades" && (
              <TradeTable
                ticker={token.ticker}
                transactions={filteredTransactions}
              />
            )}

            {/* Holders List */}
            {activeTab === "holders" && <HolderTable holders={holders} />}
          </div>

          {publicKey?.toString() === token.creator && (
            <div className="bg-[#171717] border border-[#262626] rounded-xl p-4 md:p-8">
              <div className="flex items-center gap-6 flex-col md:flex-row justify-between">
                <h3>Admin</h3>
                <div className="flex items-center gap-4">
                  <RoundedButton
                    className="px-4 py-2"
                    onClick={() => harvestTokenFees()}
                  >
                    Harvest Fees
                  </RoundedButton>

                  {!token.hasAgent && (
                    <Link href={`/create-agent/${token.mint}`}>
                      <RoundedButton className="px-4 py-2">
                        Launch Agent
                      </RoundedButton>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Fal Generator Section */}
          {/* <FalGenerator /> */}
        </div>

        <div className="order-0 lg:order-1 flex flex-col items-start space-y-4">
          <AgentCardInfo
            curveProgress={token.curveProgress}
            description={token.description}
            image={token.image}
            mint={token.mint}
            name={token.name}
            reserveLamport={token.reserveLamport}
            virtualReserves={token.virtualReserves}
            ticker={token.ticker}
            socialLinks={{
              discord: token.discord,
              telegram: token.telegram,
              twitter: token.twitter,
              website: token.website,
              agentLink: token.agentLink,
            }}
            solPriceUSD={token.solPriceUSD}
            tokenPriceUSD={token.tokenPriceUSD}
            agentName={agent?.name}
          />

          <div className="flex flex-col lg:flex-1 lg:w-full">
            <TokenBuySell tokenId={tokenId} />
          </div>
        </div>
      </div>
    </div>
  );
}

const renderSkeletons = () => (
  <div className="min-h-screen text-gray-200 flex flex-col mt-4">
    <div className="flex flex-col lg:flex-row gap-4 justify-center px-4 py-6">
      <div className="flex flex-col space-y-4 flex-1 w-full lg:max-w-[960px]">
        {/* Stats Section Skeleton */}
        <div className="box-border flex flex-row items-center py-3 px-0 w-full h-[80px] bg-[#171717] border border-[#262626] rounded-[6px] overflow-x-auto">
          <div className="flex flex-col justify-center items-center p-0 gap-2 min-w-[200px] sm:min-w-0 sm:w-[266.88px] h-[56px] rounded-l-[6px] flex-1">
            <div className="w-48 h-7 bg-neutral-800 rounded animate-pulse" />
          </div>
          <div className="bg-[#262626] flex-none" />
          <div className="flex flex-col justify-center items-center p-0 gap-2 min-w-[200px] sm:min-w-0 sm:w-[266.88px] h-[56px] flex-1">
            <div className="w-48 h-7 bg-neutral-800 rounded animate-pulse" />
          </div>
          <div className="bg-[#262626] flex-none" />
          <div className="flex flex-col justify-center items-center p-0 gap-2 min-w-[200px] sm:min-w-0 sm:w-[266.88px] h-[56px] flex-1">
            <div className="w-48 h-7 bg-neutral-800 rounded animate-pulse" />
          </div>
          <div className="bg-[#262626] flex-none" />
          <div className="flex flex-col justify-center items-center p-0 gap-2 min-w-[200px] sm:min-w-0 sm:w-[266.88px] h-[56px] rounded-r-[6px] flex-1">
            <div className="w-48 h-7 bg-neutral-800 rounded animate-pulse" />
          </div>
        </div>

        {/* Chart Skeleton */}
        <div className="bg-[#171717] border border-[#262626] rounded-[6px] p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex flex-col">
              <div className="w-48 h-7 bg-neutral-800 rounded animate-pulse" />
            </div>
            <div className="flex flex-col">
              <div className="w-48 h-7 bg-neutral-800 rounded animate-pulse" />
            </div>
            <div className="flex flex-col">
              <div className="w-48 h-7 bg-neutral-800 rounded animate-pulse" />
            </div>
            <div className="flex flex-col">
              <div className="w-48 h-7 bg-neutral-800 rounded animate-pulse" />
            </div>
          </div>
        </div>

        {/* Chart Skeleton */}
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-4 h-[400px] flex items-center justify-center">
          <div className="w-full h-full bg-neutral-800 rounded animate-pulse" />
        </div>

        {/* Tabs Section Skeleton */}
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-4 md:p-6">
          <div className="flex gap-4 mb-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-24 h-8 bg-neutral-800 rounded animate-pulse"
              />
            ))}
          </div>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-full h-16 bg-neutral-800 rounded animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col space-y-4 w-full lg:w-auto lg:min-w-[380px] lg:max-w-[420px] 2lg:max-w-[480px]">
        {/* Add skeleton for AgentCardInfo */}
        <div className="w-full h-[400px] bg-[#171717] border border-[#262626] rounded-xl animate-pulse" />
        {/* Add skeleton for TokenBuySell */}
        <div className="w-full h-[200px] bg-[#171717] border border-[#262626] rounded-xl animate-pulse" />
      </div>
    </div>
  </div>
);
