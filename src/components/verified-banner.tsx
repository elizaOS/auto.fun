"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Bot, Sparkles, TrendingUp } from "lucide-react";

export function VerifiedBanner() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
      <Card className="bg-black border-green-500/20 overflow-hidden">
        <CardContent className="p-0 relative aspect-[2/1]">
          <div className="absolute inset-0 bg-gradient-to-r from-green-500/20 to-transparent" />
          <div className="relative z-10 p-6 flex flex-col h-full justify-between">
            <div className="flex items-center gap-2 text-green-500">
              <Sparkles className="h-5 w-5" />
              <span className="text-sm font-medium">Verified</span>
            </div>
            <div>
              <h3 className="text-lg font-bold mb-1">CyberMind AI</h3>
              <p className="text-sm text-green-500/70">Market Cap: $250k</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-black border-green-500/20 overflow-hidden">
        <CardContent className="p-0 relative aspect-[2/1]">
          <div className="absolute inset-0 bg-gradient-to-r from-green-500/20 to-transparent" />
          <div className="relative z-10 p-6 flex flex-col h-full justify-between">
            <div className="flex items-center gap-2 text-green-500">
              <Bot className="h-5 w-5" />
              <span className="text-sm font-medium">New</span>
            </div>
            <div>
              <h3 className="text-lg font-bold mb-1">NeuroNet v2</h3>
              <p className="text-sm text-green-500/70">Market Cap: $180k</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-black border-green-500/20 overflow-hidden">
        <CardContent className="p-0 relative aspect-[2/1]">
          <div className="absolute inset-0 bg-gradient-to-r from-green-500/20 to-transparent" />
          <div className="relative z-10 p-6 flex flex-col h-full justify-between">
            <div className="flex items-center gap-2 text-green-500">
              <TrendingUp className="h-5 w-5" />
              <span className="text-sm font-medium">Popular</span>
            </div>
            <div>
              <h3 className="text-lg font-bold mb-1">SynthIA</h3>
              <p className="text-sm text-green-500/70">Market Cap: $320k</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
