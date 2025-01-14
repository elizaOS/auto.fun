import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

export function HolderDistribution() {
  const holders = [
    { address: "0xBwK...yPH", percentage: 90.55, amount: "bonding curve" },
    { address: "0x5yQ...BK", percentage: 4.49, amount: "2.5k" },
    { address: "0x7Xh...wY", percentage: 3.37, amount: "1.8k" },
    { address: "0x2Yg...PU", percentage: 0.66, amount: "360" },
    { address: "0xDcQ...47", percentage: 0.30, amount: "165" },
  ]

  return (
    <Card className="bg-black border-green-500/20">
      <CardHeader className="text-green-500">
        <CardTitle>Holder Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 text-green-500">
          {holders.map((holder, i) => (
            <div key={i} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>{holder.address}</span>
                <span>{holder.percentage}%</span>
              </div>
              <Progress value={holder.percentage} className="h-1 bg-green-500/20 [&>div]:bg-green-500" />
              <div className="text-right text-xs text-green-500/50">{holder.amount}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

