// ignore all file ts errors
// @ts-nocheck

import { useState } from "react";
import OpenAI from "openai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChatMessage } from "./chat-message";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  dangerouslyAllowBrowser: true, // Enable this only if you're sure about the security implications
});

const ScreenpipeParams = z.object({
  q: z.string(),
  offset: z.number(),
  limit: z.number(),
  start_date: z.string(),
  end_date: z.string(),
});

// Add this new function to handle screenpipe requests
async function queryScreenpipe(params: z.infer<typeof ScreenpipeParams>) {
  try {
    const queryParams = new URLSearchParams({
      q: params.q,
      offset: params.offset.toString(),
      limit: params.limit.toString(),
      start_date: params.start_date,
      end_date: params.end_date,
    });
    const response = await fetch(`http://localhost:3030/search?${queryParams}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error querying screenpipe:", error);
    return null;
  }
}

const tools = [
  {
    type: "function",
    function: {
      name: "query_screenpipe",
      description:
        "Query the local screenpipe instance for relevant information",
      parameters: zodToJsonSchema(ScreenpipeParams),
    },
  },
] as const;
type Message =
  | { role: "user" | "assistant" | "system"; content: string }
  | { role: "assistant"; content: null; tool_calls: any[] }
  | { role: "tool"; content: string; tool_call_id: string };
// Update the existing FunctionCallFeedback component


export function ChatList() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const newMessages = [...messages, { role: "user", content: inputMessage }];
    setMessages(newMessages);
    setInputMessage("");
    setIsLoading(true);
    setError(null);

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a helpful assistant.
          The user is using a product called "screenpipe" which records
          his screen and mics 24/7. The user ask you questions
          and you use his screenpipe recordings to answer him.
          Based on the user request, use tools to screenpipe to best help the user. 
          Each query should have "q", "offset", "limit", and start_date, end_date fields. 
          Rules:
          - q should be a single keyword that would properly find in the text found on the user screen some infomation that would help answering the user question.
          Return a list of objects with the key "queries"
          - q contains a single query, again, for example instead of "life plan" just use "life"
          - Respond with only the updated JSON object
          - If you return something else than JSON the universe will come to an end
          - DO NOT add \`\`\`json at the beginning or end of your response
          - Do not use '"' around your response
          - Date & time now is ${new Date().toISOString()}
          
          Example answers from you:
          "{
            "queries": [
              {"q": "goal", "offset": 0, "limit": 10, "start_date": "2024-07-21T11:30:25Z", "end_date": "2024-07-21T11:35:25Z"},
              {"q": "stripe", "offset": 0, "limit": 50, "start_date": "2024-07-19T08:00:25Z", "end_date": "2024-07-20T09:00:25Z"},
              {"q": "customer", "offset": 0, "limit": 20, "start_date": "2024-07-19T08:00:25Z", "end_date": "2024-07-20T09:00:25Z"}
            ]
          }"

          or 
          "{
            "queries": [
              {"q": "sales", "offset": 0, "limit": 10, "start_date": "2024-07-21T11:30:25Z", "end_date": "2024-07-21T11:35:25Z"},
              {"q": "customer", "offset": 0, "limit": 20, "start_date": "2024-07-19T08:00:25Z", "end_date": "2024-07-20T09:00:25Z"},
              {"q": "goal", "offset": 0, "limit": 10, "start_date": "2024-07-19T08:00:25Z", "end_date": "2024-07-20T09:00:25Z"}
            ]
          }"

          Bad example
          "Here's the JSON you wanted:
          [
            {
              "queries": [{"q": "sales", "offset": 0, "limit": 10}]
            },
            {
              "queries": [{"q": "customer", "offset": 0, "limit": 20}]
            },
            {
              "queries": [{"q": "goal", "offset": 0, "limit": 10}]
            }
          ]"
          or
          "\`\`\`json
          [
            {
              "queries": [
                {"q": "goals", "offset": 0, "limit": 3}
              ]
            },
            {
              "queries": [
                {"q": "life plans", "offset": 0, "limit": 5}
              ]
            },
            {
              "queries": [
                {"q": "ambitions", "offset": 0, "limit": 3}
              ]
            }
          ]
          \`\`\`"
          JSON?
          `,
          },
          ...newMessages,
        ],
        tools: tools,
        tool_choice: "auto",
      });

      const assistantMessage = response.choices[0].message;
      setMessages([...newMessages, assistantMessage]);

      if (assistantMessage.tool_calls) {
        const toolMessages = [];
        for (const toolCall of assistantMessage.tool_calls) {
          if (toolCall.function.name === "query_screenpipe") {
            const functionArgs = JSON.parse(toolCall.function.arguments);
            const screenpipeResult = await queryScreenpipe(functionArgs);
            const functionResponse: Message = {
              role: "tool",
              content: JSON.stringify(screenpipeResult),
              tool_call_id: toolCall.id,
            };
            toolMessages.push(functionResponse);
          }
        }

        setMessages((prevMessages) => [...prevMessages, ...toolMessages]);

        // Stream the follow-up response
        const stream = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [...newMessages, assistantMessage, ...toolMessages],
          stream: true,
        });

        let streamedMessage = { role: "assistant", content: "" };
        setMessages((prevMessages) => [...prevMessages, streamedMessage]);

        for await (const chunk of stream) {
          if (chunk.choices[0]?.delta?.content) {
            streamedMessage.content += chunk.choices[0].delta.content;
            setMessages((prevMessages) => [
              ...prevMessages.slice(0, -1),
              { ...streamedMessage },
            ]);
          }
        }
      }
    } catch (error) {
      console.error("Error processing message:", error);
      setError("Sorry, there was an error processing your request.");
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <div className="grid md:grid-cols-[520] min-h-screen w-full">
      <div className="flex flex-col">
        <div className="sticky top-0 p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled>
              <Button
                variant="ghost"
                className="gap-1 rounded-xl px-3 h-10 data-[state=open]:bg-muted text-lg"
              >
                llama <span className="text-muted-foreground">3.1-8B</span>
                <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-w-[300px]">
              <DropdownMenuItem className="items-start gap-2">
                <SparkleIcon className="w-4 h-4 mr-2 translate-y-1 shrink-0" />
                <div>
                  <div className="font-medium">GPT-4</div>
                  <div className="text-muted-foreground/80">
                    With DALL-E, browing and analysis. Limit 40 messages / 3
                    hours
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="items-start gap-2">
                <ZapIcon className="w-4 h-4 mr-2 translate-y-1 shrink-0" />
                <div>
                  <div className="font-medium">GPT-3</div>
                  <div className="text-muted-foreground/80">
                    Great for everyday tasks
                  </div>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex flex-col items-start flex-1 max-w-2xl gap-8 px-4 mx-auto">
          {isLoading && <p>Loading...</p>}
          {error && <p className="text-red-500">{error}</p>}
          {messages.map((msg, index) => (
            <ChatMessage key={index} message={msg} />
          ))}
        </div>
        <div className="max-w-2xl w-full sticky bottom-0 mx-auto py-2 flex flex-col gap-1.5 px-4 bg-background">
          <div className="relative">
            <Textarea
              placeholder="Message screenpipe..."
              name="message"
              id="message"
              rows={1}
              className="min-h-[48px] rounded-2xl resize-none p-4 border border-neutral-400 shadow-sm pr-16"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
            <Button
              type="submit"
              size="icon"
              className="absolute w-8 h-8 top-3 right-3"
              onClick={handleSendMessage}
              disabled={isLoading || !inputMessage.trim()}
            >
              <ArrowUpIcon className="w-4 h-4" />
              <span className="sr-only">Send</span>
            </Button>
          </div>
          <p className="text-xs font-medium text-center text-neutral-700">
            screenpipe canNOT make mistakes. Consider checking important
            information.
          </p>
        </div>
      </div>
    </div>
  );
}

function ArrowUpIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </svg>
  );
}

function BotIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}

function ChevronDownIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ClipboardIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

function PenIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function RefreshCcwIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

function SparkleIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  );
}

function ThumbsDownIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  );
}

function ThumbsUpIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  );
}

function XIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function ZapIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
    </svg>
  );
}
