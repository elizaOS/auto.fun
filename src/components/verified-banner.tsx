"use client";

import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Token } from "@/utils/tokens";
import { Bot, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";

export function VerifiedBanner({ tokens }: { tokens: Token[] }) {
  return (
    <div className="mb-8">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 hidden md:grid">
        {tokens.map((token, index) => (
          <Card
            key={token.mint}
            className="bg-black border-green-500/20 overflow-hidden"
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
      <div className="flex gap-4 overflow-x-auto md:hidden">
        {tokens.map((token) => (
          <Card
            key={token.mint}
            className="bg-black border-green-500/20 overflow-hidden flex-shrink-0 w-80"
          >
            <CardContent className="p-0 relative aspect-[2/1] flex">
              <div className="absolute inset-0 bg-gradient-to-r from-green-500/20 to-transparent" />
              <div className="relative z-10 p-6 flex flex-col h-full justify-between p-[24px] flex-1">
                <div className="flex items-center gap-2 text-green-500">
                  <Sparkles className="h-5 w-5" />
                  <span className="text-sm font-medium">Verified</span>
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
  );
}
