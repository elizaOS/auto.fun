import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function AgentDescription() {
  return (
    <Card className="bg-black/50 border-green-500/50 backdrop-blur-sm [clip-path:polygon(0_10px,10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%)]">
      <CardHeader className="border-b border-green-500/20">
        <CardTitle className="text-green-500 font-mono text-xl tracking-widest uppercase after:content-['_//']">About</CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        <p className="text-green-500/70 font-mono leading-relaxed">
          This AI agent is designed to process complex data and provide intelligent insights. 
          It leverages cutting-edge machine learning algorithms and natural language processing 
          to deliver accurate and contextual responses.
        </p>
        <div className="mt-4">
          <h3 className="font-semibold mb-2 text-green-500 font-mono">Capabilities:</h3>
          <ul className="list-none space-y-2 text-green-500/70 font-mono">
            {[
              "Advanced natural language processing",
              "Real-time data analysis",
              "Predictive modeling",
              "Multi-platform integration"
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
  )
}

