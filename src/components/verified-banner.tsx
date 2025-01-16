"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Token } from "@/utils/tokens";
import { Bot, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";
import Skeleton from "react-loading-skeleton";

export function VerifiedBanner({ tokens }: { tokens: Token[] }) {
  return tokens && tokens.length > 0 ? (
    <div className="mb-8">
      <div className="flex gap-4 overflow-x-auto md:overflow-hidden">
        {tokens.map((token, index) => (
          <Card
            key={token.mint}
            className="bg-black border-green-500/20 overflow-hidden flex-shrink-0 w-80 md:w-auto md:flex-1"
          >
            <CardContent className="p-0 relative aspect-[2/1] flex">
              <div className="absolute inset-0 bg-gradient-to-r from-green-500/20 to-transparent" />
              <div className="relative z-10 p-6 flex flex-col h-full justify-between p-[24px] flex-1">
                <div className="flex items-center gap-2 text-green-500">
                  {index % 2 === 0 ? (
                    <Sparkles className="h-5 w-5" />
                  ) : index % 2 === 1 ? (
                    <TrendingUp className="h-5 w-5" />
                  ) : (
                    <Bot className="h-5 w-5" />
                  )}
                  <span className="text-sm font-medium">
                    {["Verified", "Popular", "New"][index % 3]}
                  </span>
                </div>
                <div>
                  <Link href={`/coin/${token.mint}`}>
                    <CardTitle className="flex items-center gap-2 text-white text-lg font-bold mb-1">
                      {token.name}
                    </CardTitle>
                  </Link>
                  <p className="text-sm text-green-500/70">
                    Market Cap:&nbsp;
                    {Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      notation: "compact",
                    }).format(Number(token.marketCapUSD))}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-center flex-shrink-0 w-1/2">
                <img
                  src={token.image}
                  alt="Agent Preview"
                  className="object-cover h-full w-full rounded-r-lg"
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  ) : (
    <div className="flex gap-4 overflow-x-auto md:overflow-hidden">
      {[...Array(3)].map((_, index) => (
        <Card
          key={index}
          className="bg-[#171717] border-green-500/20 overflow-hidden flex-shrink-0 w-80 md:w-auto md:flex-1"
        >
          <div className="flex flex-col p-[24px] flex-1">
            <CardHeader className="p-0">
              <Skeleton
                width={120}
                height={24}
                baseColor="#171717"
                highlightColor="#00ff0026"
                className="mb-2"
              />
              <Skeleton
                width={80}
                height={16}
                baseColor="#171717"
                highlightColor="#00ff0026"
              />
            </CardHeader>
            <CardContent className="p-0 flex flex-col flex-1">
              <div className="mt-auto flex flex-col gap-1">
                <Skeleton
                  width={100}
                  height={16}
                  baseColor="#171717"
                  highlightColor="#00ff0026"
                />
              </div>
            </CardContent>
          </div>
          <div className="flex items-center justify-center flex-shrink-0 w-1/2">
            <Skeleton
              width="100%"
              height="100%"
              baseColor="#171717"
              highlightColor="#00ff0026"
              className="rounded-r-lg"
            />
          </div>
        </Card>
      ))}
    </div>
  );
}
