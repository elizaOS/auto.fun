"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Send } from 'lucide-react'

export function AgentChat() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: "0x742...3ab",
      content: "This agent is performing really well!",
      timestamp: "2 min ago"
    },
    {
      id: 2,
      sender: "0x123...def",
      content: "Agreed, the market cap is growing steadily",
      timestamp: "1 min ago"
    }
  ])

  const [newMessage, setNewMessage] = useState("")

  const handleSendMessage = () => {
    if (newMessage.trim()) {
      setMessages([...messages, {
        id: messages.length + 1,
        sender: "You",
        content: newMessage,
        timestamp: "Just now"
      }])
      setNewMessage("")
    }
  }

  return (
    <Card className="bg-black border-green-500/20">
      <CardHeader>
        <CardTitle>Chat</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 mb-4 max-h-[300px] overflow-y-auto">
          {messages.map((message) => (
            <div key={message.id} className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{message.sender}</span>
                <span className="text-xs text-green-500/50">{message.timestamp}</span>
              </div>
              <p className="text-green-500/70">{message.content}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input 
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..." 
            className="bg-transparent border-green-500/20 text-green-500 placeholder:text-green-500/50"
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          />
          <Button size="icon" className="shrink-0" onClick={handleSendMessage}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

