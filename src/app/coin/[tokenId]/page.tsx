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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { CardContent, CardHeader, CardTitle, Card } from "@/components/ui/card";
import { TokenBuySell } from "./swap/TokenBuySell";
import { RoundedButton } from "@/components/common/button/RoundedButton";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { womboApi } from "@/utils/fetch";
import { toast } from "react-toastify";
import { AgentCardInfo } from "@/components/agent-card/AgentCardInfo";
import { SolanaIcon } from "./swap/SolanaIcon";

const HolderSchema = z.object({
  address: z.string(),
  mint: z.string(),
  amount: z.number(),
  percentage: z.number(),
  createdAt: z.string().datetime(),
  lastUpdated: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const Switcher = ({ enabled, onChange, label }: { enabled: boolean; onChange: (value: boolean) => void; label: string }) => (
  <div className="flex items-center gap-2">
    <span className="text-[#8C8C8C] text-sm">{label}</span>
    <button
      onClick={() => onChange(!enabled)}
      className={`w-10 h-5 rounded-full transition-colors duration-200 ease-in-out ${
        enabled ? 'bg-[#4ADE80]' : 'bg-[#262626]'
      } relative`}
    >
      <div
        className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform duration-200 ease-in-out ${
          enabled ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  </div>
);

export default function TradingInterface() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [activeTab, setActiveTab] = useState("trades");
  const [showOwnTrades, setShowOwnTrades] = useState(false);
  const [showSize, setShowSize] = useState(false);
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

  return (
    <div className="min-h-screen text-gray-200 flex flex-col mt-[92px]">
      <div className="flex flex-col lg:flex-row gap-4 justify-center px-4 md:px-[120px] py-6 max-w-[1680px] mx-auto w-full">
        <div className="flex flex-col space-y-4 flex-1 w-full lg:max-w-[960px]">
          {/* Stats Section */}
          <div className="box-border flex flex-row items-center py-3 px-4 w-full bg-[#171717] border border-[#262626] rounded-[6px] overflow-x-auto scrollbar-hide">
            <div className="flex flex-col justify-center items-center p-0 gap-2 min-w-[140px] sm:min-w-0 sm:w-[266.88px] h-[56px] rounded-l-[6px] flex-1">
              <span className="font-['DM_Mono'] font-normal text-xs sm:text-base leading-6 text-[#8C8C8C] whitespace-nowrap">Market Cap</span>
              <span className="font-['DM_Mono'] font-normal text-sm sm:text-xl leading-6 text-[#2FD345]">{Intl.NumberFormat("en-US", {style: "currency", currency: "USD", notation: "compact"}).format(Number(token.marketCapUSD))}</span>
            </div>
            <div className="w-[1px] h-[56px] bg-[#262626] flex-none" />
            <div className="flex flex-col justify-center items-center p-0 gap-2 min-w-[140px] sm:min-w-0 sm:w-[266.88px] h-[56px] flex-1">
              <span className="font-['DM_Mono'] font-normal text-xs sm:text-base leading-6 text-[#8C8C8C] whitespace-nowrap">24hr Volume</span>
              <span className="font-['DM_Mono'] font-normal text-sm sm:text-xl leading-6 text-white">{Intl.NumberFormat("en-US", {style: "currency", currency: "USD", notation: "compact"}).format(Number(token.liquidity || 0))}</span>
            </div>
            <div className="w-[1px] h-[56px] bg-[#262626] flex-none" />
            <div className="flex flex-col justify-center items-center p-0 gap-2 min-w-[140px] sm:min-w-0 sm:w-[266.88px] h-[56px] flex-1">
              <span className="font-['DM_Mono'] font-normal text-xs sm:text-base leading-6 text-[#8C8C8C] whitespace-nowrap">Creator</span>
              <div className="flex flex-row items-center p-0 gap-2 w-[132px] h-6">
                <span className="font-['DM_Mono'] font-normal text-sm sm:text-xl leading-6 text-white">{`${token.creator.slice(0, 4)}...${token.creator.slice(-4)}`}</span>
              </div>
            </div>
            <div className="w-[1px] h-[56px] bg-[#262626] flex-none" />
            <div className="flex flex-col justify-center items-center p-0 gap-2 min-w-[140px] sm:min-w-0 sm:w-[266.88px] h-[56px] rounded-r-[6px] flex-1">
              <span className="font-['DM_Mono'] font-normal text-xs sm:text-base leading-6 text-[#8C8C8C] whitespace-nowrap">Creation Time</span>
              <span className="font-['DM_Mono'] font-normal text-sm sm:text-xl leading-6 text-white">{new Date(token.createdAt).toLocaleString(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}</span>
            </div>
          </div>

          {/* Trading Chart */}
          {token && token.status === "active" && (
            <div className="w-full h-[400px] sm:h-[600px] lg:h-[846px] bg-[#171717] border border-[#262626] rounded-xl overflow-hidden">
              <TradingChart param={token} />
            </div>
          )}

          {/* Trading Activity Panel */}
          <div className="bg-[#171717] border border-[#262626] rounded-xl overflow-hidden">
            {/* Tab Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border-b border-[#262626] gap-4">
              <div className="flex gap-4">
                <button
                  onClick={() => setActiveTab('trades')}
                  className={`px-4 py-2 rounded-md text-sm font-medium ${
                    activeTab === 'trades' 
                      ? 'bg-[#262626] text-white' 
                      : 'text-[#8C8C8C] hover:text-white'
                  }`}
                >
                  Trades
                </button>
                <button
                  onClick={() => setActiveTab('holders')}
                  className={`px-4 py-2 rounded-md text-sm font-medium ${
                    activeTab === 'holders' 
                      ? 'bg-[#262626] text-white' 
                      : 'text-[#8C8C8C] hover:text-white'
                  }`}
                >
                  Holders
                </button>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-4 overflow-x-auto sm:overflow-visible">
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    <span className="text-[#8C8C8C] text-sm">Size</span>
                    <div className="flex items-center gap-1">
                      <SolanaIcon/>
                      <span className={`text-sm transition-colors duration-200 ${showSize ? 'text-white' : 'text-[#8C8C8C]'}`}>0.05</span>
                    </div>
                    <Switcher
                      enabled={showSize}
                      onChange={setShowSize}
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
            {activeTab === 'trades' && (
              <div className="overflow-x-auto p-4">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="text-[#8C8C8C] text-xs uppercase">
                      <th className="text-left py-2">Account</th>
                      <th className="text-left py-2">Type</th>
                      <th className="text-left py-2">SOL</th>
                      <th className="text-left py-2">WAIFU</th>
                      <th className="text-left py-2">Date</th>
                      <th className="text-left py-2">TXN</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {[...Array(10)].map((_, i) => (
                      <tr key={i} className="border-b border-[#262626] last:border-0">
                        <td className="py-3 text-[#8C8C8C]">0x742..3ab</td>
                        <td className={`py-3 ${i % 2 === 0 ? 'text-[#4ADE80]' : 'text-[#FF4444]'}`}>
                          {i % 2 === 0 ? 'Buy' : 'Sell'}
                        </td>
                        <td className="py-3 text-white">0.515</td>
                        <td className="py-3 text-white">1.55m</td>
                        <td className="py-3 text-[#8C8C8C]">2s ago</td>
                        <td className="py-3">
                          <button className="text-[#8C8C8C] hover:text-white">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Holders List */}
            {activeTab === 'holders' && (
              <div className="overflow-x-auto p-4">
                <table className="w-full">
                  <thead>
                    <tr className="text-[#8C8C8C] text-xs uppercase">
                      <th className="text-left py-2">#</th>
                      <th className="text-left py-2">Account</th>
                      <th className="text-left py-2">Type</th>
                      <th className="text-right py-2">%</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {[
                      { account: "0x742..3ab", type: "(Bonding Curve)", percentage: 7.36 },
                      { account: "0x742..3ab", type: "(DEV)", percentage: 6.16 },
                      { account: "0x742..3ab", type: "", percentage: 6.00 },
                      { account: "0x742..3ab", type: "", percentage: 5.59 },
                      { account: "0x742..3ab", type: "", percentage: 5.43 },
                      { account: "0x742..3ab", type: "", percentage: 5.12 },
                      { account: "0x742..3ab", type: "", percentage: 4.64 },
                      { account: "0x742..3ab", type: "", percentage: 4.32 },
                      { account: "0x742..3ab", type: "", percentage: 3.89 },
                      { account: "0x742..3ab", type: "", percentage: 3.25 },
                    ].map((holder, i) => (
                      <tr key={i} className="border-b border-[#262626] last:border-0">
                        <td className="py-3 text-[#8C8C8C]">#{i + 1}</td>
                        <td className="py-3 text-white">{holder.account}</td>
                        <td className="py-3 text-[#8C8C8C]">{holder.type}</td>
                        <td className="py-3 text-white text-right">{holder.percentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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

          {/* Commented out Trades/Comments/Chat section
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
          */}
        </div>

        <div className="flex flex-col space-y-4 w-full lg:w-auto lg:min-w-[380px] lg:max-w-[420px] 2xl:max-w-[480px]">
          <div className="w-full">
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
          </div>

          <div className="w-full">
            <TokenBuySell tokenId={tokenId} />
          </div>
        </div>
      </div>
    </div>
  );
}

const renderSkeletons = () => (
  <div className="min-h-screen text-gray-200 flex flex-col mt-[92px]">
    <div className="flex flex-col lg:flex-row gap-4 justify-center px-4 md:px-[120px] py-6 max-w-[1680px] mx-auto w-full">
      <div className="flex flex-col space-y-4 flex-1 w-full lg:max-w-[960px]">
        {/* Stats Section Skeleton */}
        <div className="box-border flex flex-row items-center py-3 px-0 w-full h-[80px] bg-[#171717] border border-[#262626] rounded-[6px] overflow-x-auto">
          <div className="flex flex-col justify-center items-center p-0 gap-2 min-w-[200px] sm:min-w-0 sm:w-[266.88px] h-[56px] rounded-l-[6px] flex-1">
            <div className="w-48 h-7 bg-neutral-800 rounded animate-pulse" />
          </div>
          <div className="w-[1px] h-[56px] bg-[#262626] flex-none" />
          <div className="flex flex-col justify-center items-center p-0 gap-2 min-w-[200px] sm:min-w-0 sm:w-[266.88px] h-[56px] flex-1">
            <div className="w-48 h-7 bg-neutral-800 rounded animate-pulse" />
          </div>
          <div className="w-[1px] h-[56px] bg-[#262626] flex-none" />
          <div className="flex flex-col justify-center items-center p-0 gap-2 min-w-[200px] sm:min-w-0 sm:w-[266.88px] h-[56px] flex-1">
            <div className="w-48 h-7 bg-neutral-800 rounded animate-pulse" />
          </div>
          <div className="w-[1px] h-[56px] bg-[#262626] flex-none" />
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

      <div className="flex flex-col space-y-4 w-full lg:w-auto lg:min-w-[380px] lg:max-w-[420px] 2xl:max-w-[480px]">
        {/* Add skeleton for AgentCardInfo */}
        <div className="w-full h-[400px] bg-[#171717] border border-[#262626] rounded-xl animate-pulse" />
        {/* Add skeleton for TokenBuySell */}
        <div className="w-full h-[200px] bg-[#171717] border border-[#262626] rounded-xl animate-pulse" />
      </div>
    </div>
  </div>
);
