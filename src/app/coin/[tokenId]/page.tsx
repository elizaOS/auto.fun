"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SendHorizontal } from "lucide-react";
import { useToken } from "@/utils/tokens";
import { useParams } from "next/navigation";
import { TradingChart } from "@/components/TVChart/TradingChart";
import { usePaginatedLiveData } from "@/utils/paginatedLiveData";
import { z } from "zod";
import { getSocket } from "@/utils/socket";
import { queryClient } from "@/components/providers";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { CardContent, CardHeader, CardTitle, Card } from "@/components/ui/card";
import { TokenBuySell } from "./swap/TokenBuySell";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Comments } from "./Comments";
import { TradeTable } from "@/components/TradeTable";
import { RoundedButton } from "@/components/common/button/RoundedButton";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { womboApi } from "@/utils/fetch";
import { toast } from "react-toastify";
import { AgentCardInfo } from "@/components/agent-card/AgentCardInfo";
import { TokenBuySellSkeleton } from "./swap/TokenBuySell";

const HolderSchema = z.object({
  address: z.string(),
  mint: z.string(),
  amount: z.number(),
  percentage: z.number(),
  createdAt: z.string().datetime(),
  lastUpdated: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export default function TradingInterface() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [activeTab, setActiveTab] = useState("comments");
  const params = useParams();

  const tokenId = params.tokenId as string;
  const { data: token, isLoading } = useToken({ variables: tokenId });

  const { items: _holders } = usePaginatedLiveData({
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

  const socket = useMemo(() => getSocket(), []);

  useEffect(() => {
    console.log("subscribe", tokenId);
    socket.emit("subscribe", tokenId);
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

  const messages = [
    {
      id: "1",
      address: "0x742...3ab",
      content: "This agent is performing really well!",
      timestamp: "(2 min ago)",
      role: "USER",
    },
    {
      id: "2",
      address: "0x123...def",
      content: "Agreed, the market cap is growing steadily",
      timestamp: "(1 min ago)",
      role: "ASSISTANT",
    },
  ];

  return (
    <div className="min-h-screen text-gray-200 flex flex-col mt-12">
      <div className="flex flex-col lg:flex-row gap-4 justify-center">
        <div className="flex flex-col space-y-4 flex-1 max-w-[960px]">
          {/* Stats Section */}
          <div className="box-border flex flex-row items-center py-3 px-0 w-full h-[80px] bg-[#171717] border border-[#262626] rounded-[6px]">
            <div className="flex flex-col justify-center items-center p-0 gap-2 w-[266.88px] h-[56px] rounded-l-[6px] flex-1">
              <span className="font-['DM_Mono'] font-normal text-base leading-6 text-[#8C8C8C]">Market Cap</span>
              <span className="font-['DM_Mono'] font-normal text-xl leading-6 text-[#2FD345]">{Intl.NumberFormat("en-US", {style: "currency", currency: "USD", notation: "compact"}).format(Number(token.marketCapUSD))}</span>
            </div>
            <div className="w-[1px] h-[56px] bg-[#262626] flex-none" />
            <div className="flex flex-col justify-center items-center p-0 gap-2 w-[266.88px] h-[56px] flex-1">
              <span className="font-['DM_Mono'] font-normal text-base leading-6 text-[#8C8C8C]">24hr Volume</span>
              <span className="font-['DM_Mono'] font-normal text-xl leading-6 text-white">{Intl.NumberFormat("en-US", {style: "currency", currency: "USD", notation: "compact"}).format(Number(token.liquidity || 0))}</span>
            </div>
            <div className="w-[1px] h-[56px] bg-[#262626] flex-none" />
            <div className="flex flex-col justify-center items-center p-0 gap-2 w-[266.88px] h-[56px] flex-1">
              <span className="font-['DM_Mono'] font-normal text-base leading-6 text-[#8C8C8C]">Creator</span>
              <div className="flex flex-row items-center p-0 gap-2 w-[132px] h-6">
                <span className="font-['DM_Mono'] font-normal text-xl leading-6 text-white">{`${token.creator.slice(0, 4)}...${token.creator.slice(-4)}`}</span>
              </div>
            </div>
            <div className="w-[1px] h-[56px] bg-[#262626] flex-none" />
            <div className="flex flex-col justify-center items-center p-0 gap-2 w-[266.88px] h-[56px] rounded-r-[6px] flex-1">
              <span className="font-['DM_Mono'] font-normal text-base leading-6 text-[#8C8C8C]">Creation Time</span>
              <span className="font-['DM_Mono'] font-normal text-xl leading-6 text-white">{new Date(token.createdAt).toLocaleString(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}</span>
            </div>
          </div>

          {/* Trading Chart */}
          {token && token.status === "active" && (
            <div className="w-full h-[846px] bg-[#171717] border border-[#262626] rounded-xl overflow-hidden">
              <TradingChart param={token} />
            </div>
          )}

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

          {/* Trades/Comments/Chat */}
          <div className="bg-[#171717] border border-[#262626] text-sm md:text-lg text-gray-400 rounded-xl p-4 md:p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="gap-2 mb-10 flex justify-start overflow-x-scroll lg:overflow-hidden">
                <TabsTrigger
                  className={cn(
                    activeTab === "trades" ? "text-white bg-[#262626]" : "",
                    "text-sm md:text-xl",
                  )}
                  value="trades"
                >
                  Trades
                </TabsTrigger>
                <TabsTrigger
                  className={cn(
                    activeTab === "comments" ? "text-white bg-[#262626]" : "",
                    "text-sm md:text-xl",
                  )}
                  value="comments"
                >
                  Comments
                </TabsTrigger>
                <TabsTrigger
                  className={cn(
                    activeTab === "chat" ? "text-white bg-[#262626]" : "",
                    "text-sm md:text-xl",
                  )}
                  value="chat"
                >
                  Agent Chat
                </TabsTrigger>
              </TabsList>

              <TabsContent className="mt-0" value="trades">
                <TradeTable tokenId={tokenId} />
              </TabsContent>

              <Comments tokenId={tokenId} />

              <TabsContent className="mt-0" value="chat">
                <div className="flex flex-col gap-4 h-[400px] overflow-y-scroll">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn([
                        "flex flex-col",
                        message.role === "USER" ? "items-end" : "items-start",
                      ])}
                    >
                      <div className="flex items-center gap-4 mb-2">
                        <span
                          className={cn("text-[#22C55E] font-bold", [
                            message.role === "USER" ? "text-white" : "",
                          ])}
                        >
                          {message.role === "USER" ? "You" : "AI"}
                        </span>
                        <span
                          className={cn("text-[#11632F] text-sm", [
                            message.role === "USER" ? "text-gray-400" : "",
                          ])}
                        >
                          {message.timestamp}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <p className="text-[#a1a1a1] mb-3">{message.content}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <Input
                    type="text"
                    placeholder="Type a message..."
                    className="flex-1 bg-[#262626] border border-gray-700 px-7 py-6 text-white !text-xl md:text-2xl rounded-lg"
                  />
                  <button className="text-[#22C55E] hover:text-[#45a049]">
                    <SendHorizontal className="w-5 h-5" />
                  </button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <div className="flex flex-col space-y-4 md:max-w-[420px] 2xl:max-w-[480px]">
          <AgentCardInfo 
            name={token.name}
            ticker={token.ticker}
            image={token.image}
            description={token.description}
            bondingCurveProgress={token.curveProgress}
            bondingCurveAmount={token.reserveLamport / 1e9}
            targetMarketCap={token.curveLimit}
            contractAddress={token.mint}
          />

          <TokenBuySell tokenId={tokenId} />
        </div>
      </div>
    </div>
  );
}

const renderSkeletons = () => (
  <div className="min-h-screen text-gray-200 flex flex-col mt-12">
    <div className="flex flex-col lg:flex-row gap-4 justify-center">
      <div className="flex flex-col space-y-4 flex-1 max-w-[960px]">
        {/* Stats Section Skeleton */}
        <div className="box-border flex flex-row items-center py-3 px-0 w-full h-[80px] bg-[#171717] border border-[#262626] rounded-[6px]">
          <div className="flex flex-col justify-center items-center p-0 gap-2 w-[266.88px] h-[56px] rounded-l-[6px] flex-1">
            <div className="w-48 h-7 bg-neutral-800 rounded animate-pulse" />
          </div>
          <div className="w-[1px] h-[56px] bg-[#262626] flex-none" />
          <div className="flex flex-col justify-center items-center p-0 gap-2 w-[266.88px] h-[56px] flex-1">
            <div className="w-48 h-7 bg-neutral-800 rounded animate-pulse" />
          </div>
          <div className="w-[1px] h-[56px] bg-[#262626] flex-none" />
          <div className="flex flex-col justify-center items-center p-0 gap-2 w-[266.88px] h-[56px] flex-1">
            <div className="w-48 h-7 bg-neutral-800 rounded animate-pulse" />
          </div>
          <div className="w-[1px] h-[56px] bg-[#262626] flex-none" />
          <div className="flex flex-col justify-center items-center p-0 gap-2 w-[266.88px] h-[56px] rounded-r-[6px] flex-1">
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
              <div key={i} className="w-24 h-8 bg-neutral-800 rounded animate-pulse" />
            ))}
          </div>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="w-full h-16 bg-neutral-800 rounded animate-pulse" />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col space-y-4 md:max-w-[420px] 2xl:max-w-[480px]">
        {/* Agent Card Info Skeleton */}
        <div className="flex flex-col justify-center items-start p-4 gap-6 w-[587px] bg-[#171717] border border-[#262626] rounded-[6px]">
          {/* Product Info Skeleton */}
          <div className="flex flex-row items-start gap-5 w-full">
            {/* Product Image */}
            <div className="flex flex-col justify-center items-start w-[144px] h-[144px]">
              <div className="w-[144px] h-[144px] bg-[#262626] rounded-[4px] border border-[#262626] animate-pulse" />
            </div>
            
            {/* Product Details */}
            <div className="flex flex-col items-start gap-4 flex-1">
              <div className="flex flex-col gap-2 w-full">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-48 bg-[#262626] rounded animate-pulse" />
                  <div className="h-6 w-20 bg-[#262626] rounded animate-pulse" />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-1">
                    <div className="h-4 w-12 bg-[#262626] rounded animate-pulse" />
                    <div className="h-4 w-24 bg-[#262626] rounded animate-pulse" />
                  </div>
                  <div className="font-satoshi text-base leading-6 tracking-[-0.4px] h-20 w-full bg-[#262626] rounded animate-pulse mt-2" />
                </div>
              </div>
            </div>
          </div>

          {/* Contract Address Skeleton */}
          <div className="flex w-full h-10 border border-[#262626] rounded-[6px]">
            <div className="flex items-center px-3 h-10 bg-[#2E2E2E] border-r border-[#262626] rounded-l-[6px] w-[40px] animate-pulse" />
            <div className="flex flex-1 items-center justify-between px-3 h-10 bg-[#212121] rounded-r-[6px] animate-pulse" />
          </div>

          {/* Social Links Skeleton */}
          <div className="flex w-full h-10 gap-0.5">
            {[...Array(4)].map((_, i) => (
              <div 
                key={i}
                className={`flex-1 h-10 bg-[#212121] border border-[#262626] animate-pulse
                  ${i === 0 ? 'rounded-l-[6px]' : ''} 
                  ${i === 3 ? 'rounded-r-[6px]' : ''}`}
              />
            ))}
          </div>

          {/* Price Information Skeleton */}
          <div className="flex w-full h-[72px] gap-0.5">
            <div className="flex-1 flex flex-col justify-center items-center gap-2 p-4 bg-[#212121] border border-[#262626] rounded-l-[6px]">
              <div className="h-6 w-24 bg-[#262626] rounded animate-pulse" />
              <div className="h-6 w-32 bg-[#262626] rounded animate-pulse" />
            </div>
            <div className="flex-1 flex flex-col justify-center items-center gap-2 p-4 bg-[#212121] border border-[#262626] rounded-r-[6px]">
              <div className="h-6 w-24 bg-[#262626] rounded animate-pulse" />
              <div className="h-6 w-32 bg-[#262626] rounded animate-pulse" />
            </div>
          </div>

          {/* Bonding Curve Progress Skeleton */}
          <div className="flex flex-col gap-3.5 w-full">
            <div className="flex items-center gap-2">
              <div className="font-satoshi text-xl leading-7 h-7 w-48 bg-[#262626] rounded animate-pulse" />
              <div className="font-geist text-xl leading-7 h-7 w-12 bg-[#262626] rounded animate-pulse" />
            </div>
            <div className="relative w-full h-2 bg-[#262626] rounded-[999px] animate-pulse">
              <div className="absolute h-full w-[28%] bg-gradient-to-r from-[#1a1a1a] to-[#333333] rounded-[999px]" />
            </div>
            <div className="font-satoshi text-base leading-5 h-10 w-full bg-[#262626] rounded animate-pulse" />
          </div>
        </div>

        {/* Buy/Sell Skeleton */}
        <TokenBuySellSkeleton />
      </div>
    </div>
  </div>
);
