"use client"

import { Button } from "@/components/ui/button"
import { Bot, Share2, Star } from 'lucide-react'

export function AgentHeader({ id }: { id: string }) {
  return (
    <div className="flex items-center justify-between p-4 bg-black/50 border border-green-500/20 rounded-lg backdrop-blur-sm">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center relative overflow-hidden group">
          <Bot className="h-8 w-8 text-green-500 relative z-10" />
          <div className="absolute inset-0 bg-gradient-to-r from-green-500/0 via-green-500/30 to-green-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
        </div>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-green-500">
            Agent #{id}
            <span className="text-xs bg-green-500/20 px-2 py-1 rounded animate-pulse">Verified</span>
          </h1>
          <p className="text-green-500/70 font-mono">Created_by: 0x742...3ab</p>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="border-green-500/20 hover:bg-green-500/20 transition-colors duration-300">
          <Star className="h-4 w-4 text-green-500" />
        </Button>
        <Button variant="outline" size="icon" className="border-green-500/20 hover:bg-green-500/20 transition-colors duration-300">
          <Share2 className="h-4 w-4 text-green-500" />
        </Button>
      </div>
    </div>
  )
}

