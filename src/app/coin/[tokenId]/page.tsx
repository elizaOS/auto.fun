"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InfoIcon, SendHorizontal, CheckCircle, Copy } from "lucide-react";
import { useToken } from "@/utils/tokens";
import { useParams } from "next/navigation";
import { TradingChart } from "@/components/TVChart/TradingChart";
import { usePaginatedLiveData } from "@/utils/paginatedLiveData";
import { z } from "zod";
import { getSocket } from "@/utils/socket";
import { queryClient } from "@/components/providers";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Card } from "@/components/ui/card";
import Skeleton from "react-loading-skeleton";
import { TokenBuySell } from "./swap/TokenBuySell";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Comments } from "./Comments";

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
  // const [amount, setAmount] = useState(0);
  // const [slippage, setSlippage] = useState(1.0);
  const [activeTab, setActiveTab] = useState("comments");
  const params = useParams();

  const tokenId = params.tokenId as string;
  const { data: token, isLoading } = useToken({ variables: tokenId });

  const { items: holders } = usePaginatedLiveData({
    itemsPerPage: 100,
    maxPages: 1,
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

  const capabilities = [
    "Advanced natural language processing",
    "Predictive modeling",
    "Real-time data analysis",
    "Multi-platform integration",
  ];

  const trades = [
    {
      account: "0x742...3ab",
      type: "Buy",
      sol: "0.515",
      waifu: "1.55m",
      date: "2s ago",
      transaction: "#X7988",
    },
    {
      account: "0x742...3ab",
      type: "Sell",
      sol: "0.515",
      waifu: "1.55m",
      date: "2s ago",
      transaction: "#X7988",
    },
    {
      account: "0x742...3ab",
      type: "Buy",
      sol: "0.515",
      waifu: "1.55m",
      date: "2s ago",
      transaction: "#X7988",
    },
    {
      account: "0x742...3ab",
      type: "Sell",
      sol: "0.515",
      waifu: "1.55m",
      date: "2s ago",
      transaction: "#X7988",
    },
    {
      account: "0x742...3ab",
      type: "Buy",
      sol: "0.515",
      waifu: "1.55m",
      date: "2s ago",
      transaction: "#X7988",
    },
    {
      account: "0x742...3ab",
      type: "Sell",
      sol: "0.515",
      waifu: "1.55m",
      date: "2s ago",
      transaction: "#X7988",
    },
  ];

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen text-gray-200 flex flex-col mt-12">
      <div className="flex flex-col lg:flex-row gap-4 justify-center">
        <div className="flex flex-col space-y-4 flex-1 max-w-[960px]">
          {/* Header Profile */}
          <div className="bg-[#171717] border border-[#262626] rounded-xl p-4 md:p-8">
            <div className="flex items-start gap-6 flex-col md:flex-row items-stretch">
              <img
                src={token.image}
                alt="AI Agent Profile"
                className="rounded-xl w-auto h-[150px]"
              />
              <div className="flex-1 flex flex-col self-stretch gap-2">
                <div className="flex flex-col gap-2">
                  <h1 className="text-[#22C55E] font-bold text-xl md:text-2xl">
                    {token.name} (${token.ticker})
                  </h1>
                  <div className="flex items-center gap-1 text-gray-300 text-xs">
                    {`${token.mint.slice(0, 3)}...${token.mint.slice(-3)}`}
                    <Copy
                      className="cursor-pointer text-gray-300 h-3"
                      onClick={() => handleCopy(token.mint)}
                    />
                  </div>
                </div>
                <p className="text-[#a1a1a1] text-sm md:text-lg break-all">
                  This AI agent is designed to process complex data and provide
                  intelligent insights. It leverages cutting-edge machine
                  learning algorithms and natural language processing to deliver
                  accurate and contextual responses.
                </p>
                <div className="flex gap-4 mt-6">
                  <div className="text-xs text-[#03FF24]">
                    <span className="text-gray-300">MC</span>{" "}
                    <b>
                      {Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                        notation: "compact",
                      }).format(Number(token.marketCapUSD))}
                    </b>
                  </div>
                </div>
                <div className="flex gap-4 mt-6 flex-col md:flex-row">
                  <Link
                    href="#"
                    className="text-gray-400 hover:text-gray-200 py-3 md:py-1 px-3 bg-[#262626] text-white gap-2 rounded-lg text-sm flex items-center gap-1"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="13"
                      fill="none"
                      viewBox="0 0 16 13"
                    >
                      <path
                        fill="#fff"
                        d="M13.545 1.77A13.2 13.2 0 0 0 10.288.76a.05.05 0 0 0-.052.025c-.141.25-.297.577-.406.833a12.2 12.2 0 0 0-3.658 0A8 8 0 0 0 5.76.785a.05.05 0 0 0-.052-.024 13.2 13.2 0 0 0-3.257 1.01.05.05 0 0 0-.021.018C.356 4.888-.213 7.911.066 10.896q.003.024.02.037a13.3 13.3 0 0 0 3.996 2.02.05.05 0 0 0 .056-.018q.463-.63.818-1.33a.05.05 0 0 0-.028-.07 9 9 0 0 1-1.248-.595.05.05 0 0 1-.005-.085q.127-.096.248-.194a.05.05 0 0 1 .051-.008c2.619 1.196 5.454 1.196 8.041 0a.05.05 0 0 1 .053.007q.121.1.248.195a.05.05 0 0 1-.004.085q-.597.349-1.249.594a.05.05 0 0 0-.027.071c.24.466.515.909.817 1.329a.05.05 0 0 0 .056.02 13.2 13.2 0 0 0 4.001-2.02.05.05 0 0 0 .021-.037c.334-3.452-.559-6.45-2.365-9.107a.04.04 0 0 0-.021-.02M5.347 9.079c-.789 0-1.438-.723-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.45.73 1.438 1.613 0 .889-.637 1.612-1.438 1.612m5.316 0c-.788 0-1.438-.723-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.45.73 1.438 1.613 0 .889-.63 1.612-1.438 1.612"
                      ></path>
                    </svg>
                    Discord
                  </Link>
                  <Link
                    href="#"
                    className="text-gray-400 hover:text-gray-200 py-3 md:py-1 px-3 bg-[#262626] text-white gap-2 rounded-lg text-sm flex items-center gap-1"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="14"
                      fill="none"
                      viewBox="0 0 16 14"
                    >
                      <path
                        fill="#fff"
                        d="M12.218.27h2.249L9.553 5.885l5.78 7.642h-4.525L7.263 8.892l-4.056 4.635H.957L6.211 7.52.667.27h4.64l3.205 4.236zm-.79 11.91h1.246L4.63 1.546H3.293z"
                      ></path>
                    </svg>
                    Twitter
                  </Link>
                  <Link
                    href="#"
                    className="text-gray-400 hover:text-gray-200 py-3 md:py-1 px-3 bg-[#262626] text-white gap-2 rounded-lg text-sm flex items-center gap-1"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      fill="none"
                      viewBox="0 0 16 16"
                    >
                      <path
                        fill="#fff"
                        fillRule="evenodd"
                        d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M8.287 5.906q-1.167.485-4.666 2.01-.567.225-.595.442c-.03.243.274.339.69.47l.175.055c.408.133.958.288 1.243.294q.389.01.868-.32Q9.27 6.65 9.376 6.627c.05-.012.12-.026.166.016s.042.12.037.141c-.03.129-1.227 1.241-1.846 1.817-.193.18-.33.307-.358.336a7 7 0 0 1-.188.186c-.38.366-.664.64.015 1.088.327.216.589.393.85.571.284.194.568.387.936.628q.14.094.27.188c.331.236.63.448.997.414.214-.02.435-.22.547-.82.265-1.417.786-4.486.906-5.751.01-.111-.003-.253-.013-.315a.34.34 0 0 0-.114-.217.53.53 0 0 0-.31-.093c-.301.005-.763.166-2.984 1.09"
                        clipRule="evenodd"
                      ></path>
                    </svg>
                    Telegram
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {token && token.status === "active" && <TradingChart param={token} />}

          {/* Capabilities */}
          <div className="bg-[#171717] border border-[#262626] rounded-xl p-4 md:p-6">
            <h2 className="text-white mb-4 text-xl md:text-2xl">
              Capabilities:
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {capabilities.map((capability, index) => (
                <div key={index} className="flex items-center gap-6">
                  <CheckCircle className="w-4 h-4 text-[#22C55E]" />
                  <span className="text-[#22C55E] text-sm md:text-xl">
                    {capability}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Trades/Comments/Chat */}
          <div className="bg-[#171717] border border-[#262626] text-sm md:text-lg text-gray-400 rounded-xl p-4 md:p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="gap-2 mb-10 flex justify-start overflow-x-scroll">
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
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="py-6 px-4 text-[#22C55E] text-sm">
                          ACCOUNT
                        </th>
                        <th className="py-6 px-4 text-[#22C55E] text-sm">
                          Type
                        </th>
                        <th className="py-6 px-4 text-[#22C55E] text-sm">
                          SOL
                        </th>
                        <th className="py-6 px-4 text-[#22C55E] text-sm">
                          WAIFU
                        </th>
                        <th className="py-6 px-4 text-[#22C55E] text-sm">
                          DATE
                        </th>
                        <th className="py-6 px-4 text-[#22C55E] text-sm">
                          TRANSACTION
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((trade, index) => (
                        <tr key={index} className="border-b border-gray-800">
                          <td className="py-5 px-4 text-sm">{trade.account}</td>
                          <td className="py-5 px-4 text-sm">
                            <span
                              className={
                                trade.type === "Buy"
                                  ? "text-[#22C55E]"
                                  : "text-[#f44336]"
                              }
                            >
                              {trade.type}
                            </span>
                          </td>
                          <td className="py-5 px-4 text-sm">{trade.sol}</td>
                          <td className="py-5 px-4 text-sm">{trade.waifu}</td>
                          <td className="py-5 px-4 text-sm text-gray-400">
                            {trade.date}
                          </td>
                          <td className="py-5 px-4 text-sm text-gray-400">
                            {trade.transaction}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <Comments tokenId={tokenId} />

              <TabsContent className="mt-0" value="chat">
                <div className="flex flex-col gap-4 h-[400px] overflow-y-scroll">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn([
                        "flex flex-col",
                        [message.role === "USER" ? "items-end" : "items-start"],
                      ])}
                    >
                      <div className="flex items-center gap-4 mb-2">
                        {/* <img
                          src="/anonymous.png"
                          className="w-10 h-10 rounded-full"
                        /> */}
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
                    className="flex-1 bg-[#262626] border border-gray-700 rounded px-7 py-6 text-white !text-xl md:text-2xl rounded-lg"
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
          <TokenBuySell tokenId={tokenId} />

          <div className="flex flex-col gap-2 bg-[#171717] border border-[#262626] rounded-xl p-4 md:p-6">
            <div className="flex justify-between items-center">
              <span className="text-[#22C55E] text-sm">
                Bonding curve progress: 2%
              </span>
              <InfoIcon className="w-4 h-4 text-gray-400" />
            </div>
            <div className="w-full bg-[#333] rounded-full h-2 mt-2">
              <div
                className="bg-[#22C55E] h-2 rounded-full"
                style={{ width: "2%" }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Graduate this coin to rayDium at $87,140 market cap. There is
              0.382 SOL in the bonding curve.
            </p>
          </div>

          {/* Holder Distribution */}
          <div className="bg-[#171717] border border-[#262626] rounded-xl p-4 md:p-6">
            <h2 className="text-gray-200 mb-4">Holder Distribution</h2>

            <div className="space-y-2">
              {holders.map((holder, index) => (
                <div key={index} className="flex justify-between items-center">
                  <span className="text-[#22C55E] text-sm">
                    {holder.address.slice(0, 4)}...
                    {holder.address.slice(-4)}
                  </span>
                  <span className="text-[#a1a1a1] text-sm">
                    {holder.percentage}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const renderSkeletons = () => (
  <div className="min-h-screen text-green-500 relative overflow-hidden">
    <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20"></div>
    <div className="relative z-10">
      <div className="container mx-auto p-4 space-y-6">
        <div className="flex flex-col md:flex-row items-center justify-between p-4 bg-black/50 border border-green-500/20 rounded-xl backdrop-blur-sm">
          <div className="flex items-center gap-4 mb-4 md:mb-0">
            <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center relative overflow-hidden group">
              <Skeleton
                width={64}
                height={64}
                baseColor="#171717"
                highlightColor="#00ff0026"
                className="rounded-full"
              />
            </div>
            <div>
              <Skeleton
                width={150}
                height={24}
                baseColor="#171717"
                highlightColor="#00ff0026"
                className="mb-2"
              />
              <Skeleton
                width={100}
                height={16}
                baseColor="#171717"
                highlightColor="#00ff0026"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Skeleton
              width={32}
              height={32}
              baseColor="#171717"
              highlightColor="#00ff0026"
              className="rounded-full"
            />
            <Skeleton
              width={32}
              height={32}
              baseColor="#171717"
              highlightColor="#00ff0026"
              className="rounded-full"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton
              width="100%"
              height={300}
              baseColor="#171717"
              highlightColor="#00ff0026"
              className="rounded-xl"
            />
            <Card className="bg-black/50 border-green-500/50 backdrop-blur-sm [clip-path:polygon(0_10px,10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%)]">
              <CardContent className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className="text-center p-4 border border-green-500/20 rounded-xl relative overflow-hidden group"
                    >
                      <Skeleton
                        width={80}
                        height={24}
                        baseColor="#171717"
                        highlightColor="#00ff0026"
                        className="mb-2"
                      />
                      <Skeleton
                        width={60}
                        height={16}
                        baseColor="#171717"
                        highlightColor="#00ff0026"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6 lg:sticky lg:top-4 lg:self-start">
            <Card className="bg-black border-green-500/20">
              <CardHeader className="text-green-500">
                <CardTitle>{/* Token Buy/Sell */}</CardTitle>
              </CardHeader>
              <CardContent>
                <Skeleton
                  width="100%"
                  height={50}
                  baseColor="#171717"
                  highlightColor="#00ff0026"
                  className="rounded-xl mb-4"
                />
                <Skeleton
                  width="100%"
                  height={50}
                  baseColor="#171717"
                  highlightColor="#00ff0026"
                  className="rounded-xl"
                />
              </CardContent>
            </Card>

            <Card className="bg-black border-green-500/20">
              <CardHeader className="text-green-500">
                <CardTitle>{/* Bonding Status */}</CardTitle>
              </CardHeader>
              <CardContent>
                <Skeleton
                  width="100%"
                  height={20}
                  baseColor="#171717"
                  highlightColor="#00ff0026"
                  className="rounded-xl mb-2"
                />
                <Skeleton
                  width="100%"
                  height={10}
                  baseColor="#171717"
                  highlightColor="#00ff0026"
                  className="rounded-xl"
                />
              </CardContent>
            </Card>
            <Card className="bg-black border-green-500/20">
              <CardHeader className="text-green-500">
                <CardTitle>{/* Holder Distribution */}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-green-500">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <Skeleton
                          width={50}
                          height={16}
                          baseColor="#171717"
                          highlightColor="#00ff0026"
                        />
                        <Skeleton
                          width={30}
                          height={16}
                          baseColor="#171717"
                          highlightColor="#00ff0026"
                        />
                      </div>
                      <Skeleton
                        width="100%"
                        height={4}
                        baseColor="#171717"
                        highlightColor="#00ff0026"
                        className="rounded"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  </div>
);
