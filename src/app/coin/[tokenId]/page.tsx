"use client";

import { BondingStatus, Money } from "./TokenMarketCap";
import { TokenBuySell } from "./swap/TokenBuySell";
import { useParams } from "next/navigation";
import { useToken } from "@/utils/tokens";
import { TradingChart } from "@/components/TVChart/TradingChart";
import { useEffect } from "react";
import { getSocket } from "@/utils/socket";
import { queryClient } from "@/components/providers";

import { Share2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ContractAddress } from "./ContractAddress";
import { formatNumber } from "@/utils/number";
import { z } from "zod";
import { usePaginatedLiveData } from "@/utils/paginatedLiveData";

const HolderSchema = z.object({
  address: z.string(),
  mint: z.string(),
  amount: z.number(),
  percentage: z.number(),
  createdAt: z.string().datetime(),
  lastUpdated: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export default function TokenDetailsPage() {
  const params = useParams();
  const tokenId = params.tokenId as string;

  const { data: token } = useToken({ variables: tokenId });

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

  if (!token) return null;

  const stats = [
    {
      label: "Market Cap",
      value: <Money>${formatNumber(token.marketCapUSD)}</Money>,
    },
    // { label: "24h Volume", value: "$14.8m" },
    // { label: "Holders", value: "119,835" },
    // { label: "Total Supply", value: "1,359,657" },
  ];

  return (
    <>
      <div className="min-h-screen text-green-500 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20"></div>
        <div className="relative z-10">
          <div className="container mx-auto p-4 space-y-6">
            <div className="flex flex-col md:flex-row items-center justify-between p-4 bg-black/50 border border-green-500/20 rounded-lg backdrop-blur-sm">
              <div className="flex items-center gap-4 mb-4 md:mb-0">
                <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center relative overflow-hidden group">
                  <img
                    src={token.image}
                    alt={token.name}
                    className="object-contain"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-green-500/0 via-green-500/30 to-green-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </div>
                <div>
                  <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2 text-green-500">
                    {token.name} ${token.ticker}
                    <span className="text-xs bg-green-500/20 px-2 py-1 rounded animate-pulse">
                      Verified
                    </span>
                  </h1>
                  <p className="text-green-500/70 font-mono">
                    <ContractAddress mint={tokenId} />
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="border-green-500/20 hover:bg-green-500/20 transition-colors duration-300"
                >
                  <Star className="h-4 w-4 text-green-500" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="border-green-500/20 hover:bg-green-500/20 transition-colors duration-300"
                >
                  <Share2 className="h-4 w-4 text-green-500" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {token.status === "active" && <TradingChart param={token} />}
                <Card className="bg-black/50 border-green-500/50 backdrop-blur-sm [clip-path:polygon(0_10px,10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%)]">
                  <CardContent className="p-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {stats.map((stat, i) => (
                        <div
                          key={i}
                          className="text-center p-4 border border-green-500/20 rounded-lg relative overflow-hidden group"
                        >
                          <div className="relative z-10">
                            <div className="text-2xl font-bold text-green-500">
                              {stat.value}
                            </div>
                            <div className="text-sm text-green-500/70 font-mono">
                              {stat.label}
                            </div>
                          </div>
                          <div className="absolute inset-0 bg-gradient-to-r from-green-500/0 via-green-500/10 to-green-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                {/* <Card className="bg-black/50 border-green-500/50 backdrop-blur-sm [clip-path:polygon(0_10px,10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%)]">
                  <CardHeader className="border-b border-green-500/20">
                    <CardTitle className="text-green-500 font-mono text-xl tracking-widest uppercase after:content-['_//']">
                      About
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <p className="text-green-500/70 font-mono leading-relaxed">
                      This AI agent is designed to process complex data and
                      provide intelligent insights. It leverages cutting-edge
                      machine learning algorithms and natural language
                      processing to deliver accurate and contextual responses.
                    </p>
                    <div className="mt-4">
                      <h3 className="font-semibold mb-2 text-green-500 font-mono">
                        Capabilities:
                      </h3>
                      <ul className="list-none space-y-2 text-green-500/70 font-mono">
                        {[
                          "Advanced natural language processing",
                          "Real-time data analysis",
                          "Predictive modeling",
                          "Multi-platform integration",
                        ].map((capability, index) => (
                          <li key={index} className="flex items-center">
                            <span className="mr-2 text-green-500">&#9654;</span>
                            {capability}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
                <Suspense
                  fallback={
                    <div className="text-green-500 animate-pulse">
                      Loading chat...
                    </div>
                  }
                >
                  <AgentChat />
                </Suspense> */}
              </div>

              <div className="space-y-6 lg:sticky lg:top-4 lg:self-start">
                {/* <Card className="bg-black/90 border-[1px] border-green-500 [clip-path:polygon(0_10px,10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%)] shadow-[0_0_15px_rgba(34,197,94,0.2)] z-20">
                  <CardHeader className="border-b border-green-500/20">
                    <CardTitle className="text-green-500 font-mono text-xl tracking-widest uppercase after:content-['_//']">
                      Trade Interface
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6 p-6">
                    <div className="space-y-2">
                      <label className="text-sm text-green-500 font-mono tracking-wider">
                        AMOUNT_SOL:
                      </label>
                      <div className="relative">
                        <Input
                          type="number"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className="bg-black/30 border-green-500/50 text-green-500 font-mono tracking-wider placeholder-green-500/30 focus:border-green-500 focus:ring-1 focus:ring-green-500/50 [appearance:textfield]"
                        />
                        <div className="absolute right-0 top-0 h-full w-1 bg-green-500/20" />
                        <div className="absolute left-0 bottom-0 h-1 w-full bg-green-500/20" />
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        {["0.1", "0.5", "1"].map((value) => (
                          <Button
                            key={value}
                            variant="outline"
                            size="sm"
                            onClick={() => setAmount(value)}
                            className="border-green-500/50 text-green-500 font-mono hover:bg-green-500/20 hover:border-green-500 transition-all duration-200 relative overflow-hidden group"
                          >
                            <span className="relative z-10">{value}_SOL</span>
                            <div className="absolute inset-0 bg-gradient-to-r from-green-500/0 via-green-500/5 to-green-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 relative">
                      <label className="text-sm text-green-500 font-mono tracking-wider">
                        SLIPPAGE_%: {slippage.toFixed(1)}
                      </label>
                      <Slider
                        value={[slippage]}
                        onValueChange={([value]) => setSlippage(value)}
                        max={5}
                        step={0.1}
                        className="[&_[role=slider]]:bg-green-500 [&_[role=slider]]:shadow-[0_0_10px_rgba(34,197,94,0.5)] [&_[role=slider]]:border-0"
                      />
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 text-green-500/50 font-mono text-sm">
                        MAX_5%
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 relative">
                      <Button className="bg-green-500 text-black font-mono tracking-wider hover:bg-green-400 shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:shadow-[0_0_25px_rgba(34,197,94,0.5)] transition-all duration-200 [clip-path:polygon(0_0,calc(100%-10px)_0,100%_10px,100%_100%,10px_100%,0_calc(100%-10px))]">
                        EXECUTE_BUY
                      </Button>
                      <Button className="bg-purple-500 text-black font-mono tracking-wider hover:bg-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.3)] hover:shadow-[0_0_25px_rgba(168,85,247,0.5)] transition-all duration-200 [clip-path:polygon(0_0,calc(100%-10px)_0,100%_10px,100%_100%,10px_100%,0_calc(100%-10px))]">
                        EXECUTE_SELL
                      </Button>
                    </div>
                  </CardContent>
                </Card> */}
                <TokenBuySell tokenId={tokenId} />
                <BondingStatus token={token} />

                <Card className="bg-black border-green-500/20">
                  <CardHeader className="text-green-500">
                    <CardTitle>Holder Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4 text-green-500">
                      {holders.map((holder, i) => (
                        <div key={i} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span>
                              {holder.address.slice(0, 3)}...
                              {holder.address.slice(-3)}
                            </span>
                            <span>{holder.percentage}%</span>
                          </div>
                          <Progress
                            value={holder.percentage}
                            className="h-1 bg-green-500/20 [&>div]:bg-green-500"
                          />
                          <div className="text-right text-xs text-green-500/50">
                            {holder.amount}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
        <div className="fixed bottom-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 via-blue-500 to-purple-500"></div>
      </div>
    </>
  );
}
