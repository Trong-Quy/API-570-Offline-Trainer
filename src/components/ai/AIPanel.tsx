import { useState, useRef, useEffect } from "react";
import { Bot, Send, X, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import type { Question } from "../../types";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AIPanelProps {
  question?: Question;
  initialPrompt?: string;
  onClose?: () => void;
  embedded?: boolean;
}

const QUICK_PROMPTS = [
  "Explain why this answer is correct",
  "Give me a practical field example",
  "What API/ASME clause applies?",
  "What are common exam traps for this topic?",
  "Summarize this concept in simple terms",
];

const OFFLINE_RESPONSES: Record<string, string> = {
  default: `I'm currently offline — the AI model is not running.

**To enable AI assistance:**
1. Install Ollama: https://ollama.ai
2. Run: \`ollama pull qwen2.5:7b\`
3. Start Ollama: \`ollama serve\`
4. Reopen this app

**Why the answer is correct** is also explained in the "Explanation" section below each question — that's always available without AI.`,
};

async function queryOllama(endpoint: string, model: string, prompt: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(`${endpoint}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: true }),
    signal,
  });

  if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value).split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.response) full += obj.response;
        if (obj.done) return full;
      } catch { /* skip malformed */ }
    }
  }
  return full;
}

function buildSystemPrompt(question?: Question): string {
  const base = `You are an expert API 570 Piping Inspector certification trainer. You help candidates understand piping inspection codes, ASME B31.3, API standards, and practical field inspection concepts. Be concise, accurate, and reference the relevant API/ASME clauses when applicable.`;
  if (!question) return base;
  return `${base}

Current question context:
Topic: ${question.topic}
Source: ${question.source_document} ${question.clause ? `§${question.clause}` : ""}
Question: ${question.question_text}
Correct Answer: ${question.correct_answer} — ${question[`option_${question.correct_answer.toLowerCase()}` as keyof Question]}
Explanation: ${question.explanation}`;
}

export function AIPanel({ question, initialPrompt, onClose, embedded = false }: AIPanelProps) {
  const { settings, aiStatus, checkAiStatus } = useAppStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialPrompt ?? "");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (initialPrompt) {
      setInput(initialPrompt);
    }
  }, [initialPrompt]);

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;
    setInput("");

    const userMsg: Message = { role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);

    if (aiStatus !== "online") {
      setTimeout(() => {
        setMessages((m) => [...m, { role: "assistant", content: OFFLINE_RESPONSES.default }]);
        setLoading(false);
      }, 400);
      return;
    }

    abortRef.current = new AbortController();
    const systemPrompt = buildSystemPrompt(question);
    const conversationHistory = [...messages, userMsg]
      .map((m) => `${m.role === "user" ? "Human" : "Assistant"}: ${m.content}`)
      .join("\n\n");
    const fullPrompt = `${systemPrompt}\n\n${conversationHistory}\n\nAssistant:`;

    try {
      const reply = await queryOllama(settings.aiEndpoint, settings.aiModel, fullPrompt, abortRef.current.signal);
      setMessages((m) => [...m, { role: "assistant", content: reply.trim() }]);
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setMessages((m) => [...m, {
          role: "assistant",
          content: `Connection failed. Make sure Ollama is running at ${settings.aiEndpoint}.\n\nError: ${e.message}`,
        }]);
        checkAiStatus();
      }
    } finally {
      setLoading(false);
    }
  };

  const stopGeneration = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  const containerClass = embedded
    ? "flex flex-col h-full bg-[#0f0f0f] border-l border-[#2a2a2a]"
    : "flex flex-col h-full bg-[#0a0a0a]";

  return (
    <div className={containerClass}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a] shrink-0">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-[#818cf8]" />
          <span className="text-[#e5e5e5] font-semibold text-sm">AI Assistant</span>
          <div className={`w-1.5 h-1.5 rounded-full ${aiStatus === "online" ? "bg-[#22c55e]" : aiStatus === "checking" ? "bg-[#f5c842] animate-pulse" : "bg-[#ef4444]"}`} />
          <span className="text-[10px] text-[#555]">
            {aiStatus === "online" ? settings.aiModel : aiStatus === "checking" ? "checking..." : "offline"}
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-[#555] hover:text-[#e5e5e5] transition-colors">
            <X size={15} />
          </button>
        )}
      </div>

      {/* Offline banner */}
      {aiStatus === "offline" && (
        <div className="mx-4 mt-3 p-3 rounded-lg bg-[#f97316]/10 border border-[#f97316]/30 shrink-0">
          <div className="flex items-start gap-2">
            <AlertCircle size={13} className="text-[#f97316] mt-0.5 shrink-0" />
            <div className="text-xs text-[#f97316]">
              <p className="font-semibold">AI offline</p>
              <p className="text-[#f97316]/70 mt-0.5">Install Ollama + pull a model to enable AI. See Settings.</p>
            </div>
          </div>
        </div>
      )}

      {/* Quick prompts */}
      {messages.length === 0 && (
        <div className="px-4 py-4 shrink-0">
          <p className="text-[#444] text-xs mb-3">Suggested questions</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => send(p)}
                className="text-xs text-[#888] bg-[#1a1a1a] border border-[#2a2a2a] px-2.5 py-1.5 rounded-lg hover:border-[#818cf8]/40 hover:text-[#818cf8] transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-6 h-6 rounded-full bg-[#818cf8]/20 flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={12} className="text-[#818cf8]" />
              </div>
            )}
            <div className={`max-w-[85%] rounded-xl px-3 py-2.5 text-sm leading-relaxed ${msg.role === "user"
              ? "bg-[#f5c842]/15 text-[#e5e5e5] border border-[#f5c842]/20"
              : "bg-[#1a1a1a] text-[#ccc] border border-[#2a2a2a]"
            }`}>
              {msg.content.split("\n").map((line, j) => (
                <span key={j}>
                  {line.startsWith("**") && line.endsWith("**")
                    ? <strong className="text-[#e5e5e5]">{line.slice(2, -2)}</strong>
                    : line}
                  {j < msg.content.split("\n").length - 1 && <br />}
                </span>
              ))}
            </div>
            {msg.role === "user" && (
              <div className="w-6 h-6 rounded-full bg-[#f5c842]/20 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles size={11} className="text-[#f5c842]" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-2 justify-start">
            <div className="w-6 h-6 rounded-full bg-[#818cf8]/20 flex items-center justify-center">
              <Loader2 size={12} className="text-[#818cf8] animate-spin" />
            </div>
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2.5">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-[#555] animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-[#555] animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-[#555] animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-[#2a2a2a] shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder="Ask about this question, code clause, or concept..."
            rows={2}
            className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-[#e5e5e5] placeholder-[#444] focus:outline-none focus:border-[#818cf8]/50 resize-none"
          />
          {loading ? (
            <button onClick={stopGeneration} className="p-2.5 rounded-xl bg-[#ef4444]/15 text-[#ef4444] hover:bg-[#ef4444]/25 transition-colors">
              <X size={16} />
            </button>
          ) : (
            <button
              onClick={() => send()}
              disabled={!input.trim()}
              className="p-2.5 rounded-xl bg-[#818cf8] text-white hover:bg-[#6366f1] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={16} />
            </button>
          )}
        </div>
        <p className="text-[10px] text-[#333] mt-1.5">Enter to send · Shift+Enter for new line · 100% local</p>
      </div>
    </div>
  );
}
