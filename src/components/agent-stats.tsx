import { Card, CardContent } from "@/components/ui/card"

export function AgentStats() {
  const stats = [
    { label: "Market Cap", value: "$245.2m" },
    { label: "24h Volume", value: "$14.8m" },
    { label: "Holders", value: "119,835" },
    { label: "Total Supply", value: "1,359,657" },
  ]

  return (
    <Card className="bg-black/50 border-green-500/50 backdrop-blur-sm [clip-path:polygon(0_10px,10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%)]">
      <CardContent className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <div key={i} className="text-center p-4 border border-green-500/20 rounded-lg relative overflow-hidden group">
              <div className="relative z-10">
                <div className="text-2xl font-bold text-green-500">{stat.value}</div>
                <div className="text-sm text-green-500/70 font-mono">{stat.label}</div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-green-500/0 via-green-500/10 to-green-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

