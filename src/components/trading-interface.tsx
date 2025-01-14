"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"

export function TradingInterface() {
  const [amount, setAmount] = useState("0.00")
  const [slippage, setSlippage] = useState(1)

  return (
    <Card className="bg-black/90 border-[1px] border-green-500 [clip-path:polygon(0_10px,10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%)] shadow-[0_0_15px_rgba(34,197,94,0.2)] z-20">
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
          <Button 
            className="bg-green-500 text-black font-mono tracking-wider hover:bg-green-400 shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:shadow-[0_0_25px_rgba(34,197,94,0.5)] transition-all duration-200 [clip-path:polygon(0_0,calc(100%-10px)_0,100%_10px,100%_100%,10px_100%,0_calc(100%-10px))]"
          >
            EXECUTE_BUY
          </Button>
          <Button 
            className="bg-purple-500 text-black font-mono tracking-wider hover:bg-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.3)] hover:shadow-[0_0_25px_rgba(168,85,247,0.5)] transition-all duration-200 [clip-path:polygon(0_0,calc(100%-10px)_0,100%_10px,100%_100%,10px_100%,0_calc(100%-10px))]"
          >
            EXECUTE_SELL
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

