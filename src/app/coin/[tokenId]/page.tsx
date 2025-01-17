"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MessageSquare,
  InfoIcon,
  SendHorizontal,
  CheckCircle,
  MessageCircle,
} from "lucide-react";
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

  useEffect(() => {
    if (!token) return;

    const socket = getSocket();

    console.log("subscribe", tokenId);
    socket.emit("subscribe", tokenId);

    socket.on("updateToken", (token) => {
      console.log("updateToken", token);
      queryClient.setQueryData(useToken.getKey(tokenId), token);
    });

    return () => {
      socket.off("updateToken");
    };
  }, [token, tokenId]);

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
    },
    {
      id: "2",
      address: "0x123...def",
      content: "Agreed, the market cap is growing steadily",
      timestamp: "(1 min ago)",
    },
  ];

  const capabilities = [
    "Advanced natural language processing",
    "Predictive modeling",
    "Real-time data analysis",
    "Multi-platform integration",
  ];

  const comments = [
    {
      id: "1",
      author: "0x742...3ab",
      content: "This agent is performing really well!",
      timestamp: "(2 min ago)",
      replies: 1,
    },
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

  return (
    <div className="min-h-screen text-gray-200 flex flex-col">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,320px] gap-4 p-4">
        <div className="space-y-4">
          {/* Header Profile */}
          <div className="bg-[#171717] border border-[#262626] rounded-lg p-4">
            <div className="flex items-start gap-4 flex-col md:flex-row items-stretch">
              <img
                src={token.image}
                alt="AI Agent Profile"
                className="rounded-lg w-auto md:w-[150px]"
              />
              <div className="flex-1 flex flex-col self-stretch">
                <div className="flex items-center gap-2">
                  <h1 className="text-[#4CAF50] font-mono">
                    {token.name} ({token.ticker})
                  </h1>
                  <span className="text-gray-400 text-sm">
                    {token.status === "active" ? "48h...wse" : "Inactive"}
                  </span>
                </div>
                {/* <p className="text-sm text-gray-300 mt-2">
                  {token.}
                </p> */}
                <div className="flex gap-4 mt-4">
                  <div className="flex items-center gap-1 text-sm">
                    <span className="text-[#4CAF50]">
                      MC $
                      {Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                        notation: "compact",
                      }).format(Number(token.marketCapUSD))}
                    </span>
                    {/* <span className="text-[#4CAF50]">↑ 47%</span>
                    <span>≈ 139</span> */}
                  </div>
                </div>
                <div className="flex gap-4 mt-auto">
                  <Link
                    href="#"
                    className="text-gray-400 hover:text-gray-200 flex items-center gap-1"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Discord
                  </Link>
                  <Link href="#" className="text-gray-400 hover:text-gray-200">
                    Twitter
                  </Link>
                  <Link href="#" className="text-gray-400 hover:text-gray-200">
                    Telegram
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {token && token.status === "active" && <TradingChart param={token} />}

          {/* Capabilities */}
          <div className="bg-[#171717] border border-[#262626] rounded-lg p-4">
            <h2 className="text-gray-200 font-mono mb-4">Capabilities:</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {capabilities.map((capability, index) => (
                <div key={index} className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-[#4CAF50]" />
                  <span className="text-[#4CAF50] text-sm">{capability}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Comments */}
          <div className="bg-[#171717] border border-[#262626] rounded-lg p-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="bg-[#252525]">
                <TabsTrigger value="trades">Trades</TabsTrigger>
                <TabsTrigger value="comments">Comments</TabsTrigger>
                <TabsTrigger value="chat">Agent Chat</TabsTrigger>
              </TabsList>

              <TabsContent value="trades">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="py-2 px-4 text-[#4CAF50] font-mono text-sm">
                          ACCOUNT
                        </th>
                        <th className="py-2 px-4 text-[#4CAF50] font-mono text-sm">
                          Type
                        </th>
                        <th className="py-2 px-4 text-[#4CAF50] font-mono text-sm">
                          SOL
                        </th>
                        <th className="py-2 px-4 text-[#4CAF50] font-mono text-sm">
                          WAIFU
                        </th>
                        <th className="py-2 px-4 text-[#4CAF50] font-mono text-sm">
                          DATE
                        </th>
                        <th className="py-2 px-4 text-[#4CAF50] font-mono text-sm">
                          TRANSACTION
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((trade, index) => (
                        <tr key={index} className="border-b border-gray-800">
                          <td className="py-2 px-4 font-mono text-sm">
                            {trade.account}
                          </td>
                          <td className="py-2 px-4 font-mono text-sm">
                            <span
                              className={
                                trade.type === "Buy"
                                  ? "text-[#4CAF50]"
                                  : "text-[#f44336]"
                              }
                            >
                              {trade.type}
                            </span>
                          </td>
                          <td className="py-2 px-4 font-mono text-sm">
                            {trade.sol}
                          </td>
                          <td className="py-2 px-4 font-mono text-sm">
                            {trade.waifu}
                          </td>
                          <td className="py-2 px-4 font-mono text-sm text-gray-400">
                            {trade.date}
                          </td>
                          <td className="py-2 px-4 font-mono text-sm text-gray-400">
                            {trade.transaction}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="comments">
                <textarea
                  placeholder="Write your comment..."
                  className="w-full bg-[#252525] border border-gray-700 rounded p-3 text-gray-200 min-h-[100px] mb-4"
                />

                <div className="space-y-4">
                  {comments.map((comment) => (
                    <div key={comment.id} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <MessageCircle className="w-4 h-4 text-gray-400" />
                        <span className="text-[#4CAF50] font-mono">
                          {comment.author}
                        </span>
                        <span className="text-gray-400 text-sm">
                          {comment.timestamp}
                        </span>
                      </div>
                      <p className="text-gray-300">{comment.content}</p>
                      <button className="text-gray-400 text-sm hover:text-gray-200">
                        Reply ({comment.replies})
                      </button>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="chat">
                <div className="bg-[#171717] border border-[#262626] rounded-lg p-4">
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <div key={message.id} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[#4CAF50] font-mono">
                            {message.address}
                          </span>
                          <span className="text-gray-400 text-sm">
                            {message.timestamp}
                          </span>
                        </div>
                        <p className="text-gray-300">{message.content}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Type a message..."
                      className="flex-1 bg-[#252525] border border-gray-700 rounded px-3 py-2 text-gray-200"
                    />
                    <button className="text-[#4CAF50] hover:text-[#45a049]">
                      <SendHorizontal className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <div className="space-y-4">
          {/* Trade Interface */}
          <TokenBuySell tokenId={tokenId} />
          {/* <div className="bg-[#171717] border border-[#262626] rounded-lg p-4">
            <h2 className="text-[#4CAF50] font-mono mb-4">
              TRADE INTERFACE //
            </h2>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 mb-1 block font-mono">
                  AMOUNT_SOL:
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full bg-[#252525] border border-gray-700 rounded px-3 py-2 font-mono text-gray-200"
                  placeholder="0.00"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  className="font-mono text-gray-300"
                  onClick={() => setAmount(0.1)}
                >
                  0.1 SOL
                </Button>
                <Button
                  variant="outline"
                  className="font-mono text-gray-300"
                  onClick={() => setAmount(0.5)}
                >
                  0.5 SOL
                </Button>
                <Button
                  variant="outline"
                  className="font-mono text-gray-300"
                  onClick={() => setAmount(1)}
                >
                  1 SOL
                </Button>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm text-gray-400 font-mono">
                    SLIPPAGE_%: {slippage}
                  </label>
                  <InfoIcon className="w-4 h-4 text-gray-400" />
                </div>
                <Slider
                  value={[slippage]}
                  onValueChange={(value) => setSlippage(value[0])}
                  max={5}
                  step={0.1}
                  className="my-4"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button className="bg-[#4CAF50] hover:bg-[#45a049] text-white font-mono">
                  EXECUTE_BUY
                </Button>
                <Button className="bg-[#9C27B0] hover:bg-[#7B1FA2] text-white font-mono">
                  EXECUTE_SELL
                </Button>
              </div>
            </div>
          </div> */}

          <div className="bg-[#171717] border border-[#262626] rounded-lg p-4">
            <div className="mt-4 bg-[#252525] rounded p-3">
              <div className="flex justify-between items-center">
                <span className="text-[#4CAF50] font-mono text-sm">
                  Bonding curve progress: 2%
                </span>
                <InfoIcon className="w-4 h-4 text-gray-400" />
              </div>
              <div className="w-full bg-[#333] rounded-full h-2 mt-2">
                <div
                  className="bg-[#4CAF50] h-2 rounded-full"
                  style={{ width: "2%" }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Graduate this coin to rayDium at $87,140 market cap. There is
                0.382 SOL in the bonding curve.
              </p>
            </div>
          </div>

          {/* Holder Distribution */}
          <div className="bg-[#171717] border border-[#262626] rounded-lg p-4">
            <h2 className="text-gray-200 font-mono mb-4">
              Holder Distribution
            </h2>

            <div className="space-y-2">
              {holders.map((holder, index) => (
                <div key={index} className="flex justify-between items-center">
                  <span className="text-[#4CAF50] font-mono text-sm">
                    {holder.address.slice(0, 4)}...
                    {holder.address.slice(-4)}
                  </span>
                  <span className="text-gray-300 font-mono text-sm">
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
        <div className="flex flex-col md:flex-row items-center justify-between p-4 bg-black/50 border border-green-500/20 rounded-lg backdrop-blur-sm">
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
              className="rounded-lg"
            />
            <Card className="bg-black/50 border-green-500/50 backdrop-blur-sm [clip-path:polygon(0_10px,10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%)]">
              <CardContent className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className="text-center p-4 border border-green-500/20 rounded-lg relative overflow-hidden group"
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
                  className="rounded-lg mb-4"
                />
                <Skeleton
                  width="100%"
                  height={50}
                  baseColor="#171717"
                  highlightColor="#00ff0026"
                  className="rounded-lg"
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
                  className="rounded-lg mb-2"
                />
                <Skeleton
                  width="100%"
                  height={10}
                  baseColor="#171717"
                  highlightColor="#00ff0026"
                  className="rounded-lg"
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
