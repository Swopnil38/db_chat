"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Send } from "lucide-react"
import VoiceInput from "@/components/ui/voice-input"
import VoiceReadButton from "@/components/ui/voice-read-button"
import { useAppSelector, useAppDispatch } from "@/store/hooks"
import { clearText } from "@/store/features/speechToTextSlice"


interface Message {
  id: string
  content: string
  role: "user" | "assistant"
  timestamp: Date
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState<string>("")
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const recognizedText = useAppSelector((state: any) => state.speechToText.text);
  const dispatch = useAppDispatch();
  // If recognizedText changes, set it as input and clear from redux
  useEffect(() => {
    if (recognizedText) {
      setInput(recognizedText);
      dispatch(clearText());
    }
  }, [recognizedText, dispatch]);

  const handleSend = async () => {
    if (!input.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      content: input.trim(),
      role: "user",
      timestamp: new Date(),
    }

    setMessages((prev: Message[]) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      const res = await fetch(`/api/query/?query=${encodeURIComponent(input.trim())}`,
        {
          method: "GET",
          credentials: "include",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json"
          }
        }
      )
      let resultContent = "No result returned."
      if (!res.ok) {
        // Error response from backend
        const errorData = await res.json()
        resultContent = errorData.error ? `Error: ${errorData.error}` : `Error: ${res.statusText}`
      } else {
        const data = await res.json()
        if (data && data.result !== undefined) {
          resultContent = JSON.stringify(data.result)
        }
      }
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: resultContent,
        role: "assistant",
        timestamp: new Date(),
      }
      setMessages((prev: Message[]) => [...prev, assistantMessage])
    } catch (err) {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "Error fetching result.",
        role: "assistant",
        timestamp: new Date(),
      }
      setMessages((prev: Message[]) => [...prev, assistantMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          // Centered welcome state
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md px-4">
              <h1 className="text-3xl font-semibold text-foreground mb-4">How can I help you today?</h1>
              <p className="text-muted-foreground">Start a conversation by typing a message below.</p>
            </div>
          </div>
        ) : (
          // Full conversation view
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.map((message: Message) => (
              <div key={message.id} className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground ml-12"
                      : "bg-muted text-foreground mr-12"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                </div>
                {message.role === "assistant" && (
                  <VoiceReadButton text={message.content} />
                )}
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted text-foreground rounded-lg px-4 py-3 mr-12">
                  <div className="flex items-center space-x-2">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                      <div
                        className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
                        style={{ animationDelay: "0.1s" }}
                      ></div>
                      <div
                        className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t bg-background p-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end space-x-3">
            <div className="flex-1">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message..."
                className="min-h-[60px] max-h-32 resize-none border-input bg-background"
                disabled={isLoading}
              />
            </div>
            <VoiceInput />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="h-[60px] w-12 shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>

  )
}