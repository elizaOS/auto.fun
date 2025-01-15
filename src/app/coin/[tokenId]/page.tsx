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
import Skeleton from "react-loading-skeleton";

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

  if (isLoading) {
    return renderSkeletons();
  }

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
              </div>

              <div className="space-y-6 lg:sticky lg:top-4 lg:self-start">
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
