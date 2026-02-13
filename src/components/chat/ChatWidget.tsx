import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  ClipboardCheck,
  FileText,
  Loader2,
  MessageSquare,
  Send,
  ShieldAlert,
  Trash2,
  X,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { buildRagContext } from "@/lib/chatbot/rag";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

const SUGGESTED_PROMPTS = [
  { icon: ClipboardCheck, label: "Latest audits", prompt: "Show me the latest audits and their statuses" },
  { icon: ShieldAlert, label: "Overdue CAPAs", prompt: "What CAPAs are currently overdue?" },
  { icon: FileText, label: "Active templates", prompt: "List all active audit templates" },
  { icon: Zap, label: "Open incidents", prompt: "Show me open incidents by severity" },
  { icon: Bot, label: "Explain workflow", prompt: "Explain the full audit lifecycle from plan to verification" },
];

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  function flushList() {
    if (listItems.length === 0) return;
    elements.push(
      <ul key={key++} className="my-1 ml-4 list-disc space-y-0.5">
        {listItems.map((item, i) => (
          <li key={i}>{inlineMarkdown(item)}</li>
        ))}
      </ul>
    );
    listItems = [];
  }

  function inlineMarkdown(line: string): React.ReactNode {
    const parts: React.ReactNode[] = [];
    // Regex: **bold**, *italic*, `code`
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }
      if (match[2]) {
        parts.push(<strong key={`b${match.index}`}>{match[2]}</strong>);
      } else if (match[3]) {
        parts.push(<em key={`i${match.index}`}>{match[3]}</em>);
      } else if (match[4]) {
        parts.push(<code key={`c${match.index}`} className="rounded bg-black/10 px-1 py-0.5 text-[0.85em]">{match[4]}</code>);
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }
    return parts.length === 1 ? parts[0] : <>{parts}</>;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    // Bullet list items: - item, * item, or numbered 1. item
    const listMatch = trimmed.match(/^(?:[-*]|\d+\.)\s+(.+)/);
    if (listMatch) {
      listItems.push(listMatch[1]);
      continue;
    }
    flushList();
    if (trimmed === '') {
      elements.push(<div key={key++} className="h-1" />);
    } else {
      elements.push(<p key={key++} className="my-0.5">{inlineMarkdown(trimmed)}</p>);
    }
  }
  flushList();

  return <>{elements}</>;
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  const v: any = value;

  const t1 = v?.message?.content?.[0]?.text;
  if (typeof t1 === "string") return t1;

  const t2 = v?.message?.content?.text;
  if (typeof t2 === "string") return t2;

  const t3 = v?.message?.content;
  if (typeof t3 === "string") return t3;

  const t4 = v?.content;
  if (typeof t4 === "string") return t4;

  const t5 = v?.text;
  if (typeof t5 === "string") return t5;

  return "";
}

export function ChatWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [showCapabilities, setShowCapabilities] = useState(false);

  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: uid(),
      role: "assistant" as ChatRole,
      content:
        "Hi! I'm your Audit Management assistant powered by live database context. Ask me anything about audit plans, audits, verification, CAPA, findings, incidents, templates, branches, suppliers, or roles.",
    },
  ]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 50);
    return () => clearTimeout(t);
  }, [open, messages.length]);

  const canUsePuter = typeof window !== "undefined" && !!window.puter?.ai?.chat;

  const systemPrompt = useMemo(() => {
    return [
      "You are a professional AI assistant for the Burgerizzr Audit Management System web application.",
      "Your tone is confident, concise, and client-ready. Use markdown formatting for lists and emphasis.",
      "Explain workflows step-by-step when asked.",
      "If a user asks for something you cannot verify from the provided database context, ask 1-2 clarifying questions.",
      "Never fabricate records, IDs, codes, statuses, dates, or counts.",
      "Modules: users, regions, branches, BCKs (Burgerizzr Central Kitchens), suppliers, templates, audit plans, audits, audit execution, findings, CAPA (Corrective and Preventive Actions), incidents, verification queue, analytics, reports.",
      "Roles: super_admin, audit_manager, regional_manager, auditor, branch_manager, bck_manager, staff.",
      user ? `Current user: ${user.full_name} (${user.role}).` : "No authenticated user.",
    ].join("\n");
  }, [user]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    setError(null);
    setShowCapabilities(false);

    if (!canUsePuter) {
      setError("Puter.js is not available. Ensure the page has loaded completely, then try again.");
      return;
    }

    const userMsg: ChatMessage = { id: uid(), role: "user" as ChatRole, content: trimmed };
    const assistantId = uid();
    const assistantMsg: ChatMessage = { id: assistantId, role: "assistant" as ChatRole, content: "" };

    setInput("");
    setIsSending(true);

    let historySnapshot: ChatMessage[] = [];
    setMessages((prev) => {
      historySnapshot = [...prev, userMsg];
      return [...prev, userMsg, assistantMsg];
    });

    // Wait one tick so state settles
    await new Promise((r) => setTimeout(r, 0));

    try {
      const ragContext = await buildRagContext({ query: trimmed, user });

      const payloadMessages: Array<{ role: string; content: string }> = [
        { role: "system", content: systemPrompt },
        { role: "system", content: ragContext },
        ...historySnapshot.map((m) => ({ role: m.role as string, content: m.content })),
      ];

      const response: any = await window.puter!.ai.chat(payloadMessages, {
        model: "google/gemini-2.5-flash",
        stream: true,
      });

      if (response && typeof response[Symbol.asyncIterator] === "function") {
        let acc = "";
        for await (const part of response) {
          const delta = typeof part?.text === "string" ? part.text : extractText(part);
          if (!delta) continue;
          acc += delta;
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m)));
        }
      } else {
        const text = extractText(response) || "Sorry, I couldn't generate a response.";
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: text } : m)));
      }
    } catch (e: any) {
      setError(e?.message ?? "Chat request failed. Please try again.");
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setIsSending(false);
    }
  }

  function clearChat() {
    setError(null);
    setShowCapabilities(false);
    setMessages([
      {
        id: uid(),
        role: "assistant" as ChatRole,
        content: "Chat cleared. Ask me about current audits, CAPA, findings, incidents, or how the workflow works.",
      },
    ]);
  }

  function handleSuggestion(prompt: string) {
    setInput(prompt);
    void sendMessage(prompt);
  }

  if (!user) return null;

  // Floating button when closed
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-[9999] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-all hover:scale-105 hover:shadow-2xl active:scale-95"
        aria-label="Open chat assistant"
      >
        <MessageSquare className="h-6 w-6" />
      </button>
    );
  }

  // Chat panel when open
  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex h-[600px] w-[420px] max-h-[85vh] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-primary px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground/20">
            <Bot className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-primary-foreground">Audit Assistant</h3>
            <p className="text-[10px] text-primary-foreground/70">Powered by Gemini Flash • Live Data</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearChat}
            className="rounded-md p-1.5 text-primary-foreground/70 transition-colors hover:bg-primary-foreground/20 hover:text-primary-foreground"
            title="Clear chat"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="rounded-md p-1.5 text-primary-foreground/70 transition-colors hover:bg-primary-foreground/20 hover:text-primary-foreground"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-3">
        <div className="space-y-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                m.role === "user"
                  ? "ml-auto rounded-br-md bg-primary text-primary-foreground"
                  : "rounded-bl-md bg-muted text-foreground"
              )}
            >
              {m.content
                ? (m.role === "assistant" ? renderMarkdown(m.content) : m.content)
                : (m.role === "assistant" && isSending ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Thinking…
                  </span>
                ) : "")}
            </div>
          ))}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Capabilities dropdown */}
      {showCapabilities && (
        <div className="border-t border-border bg-muted/50 px-3 py-2">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Quick Actions</div>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_PROMPTS.map((s) => (
              <button
                key={s.label}
                onClick={() => handleSuggestion(s.prompt)}
                disabled={isSending}
                className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                <s.icon className="h-3 w-3" />
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-border px-3 py-2.5">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage(input);
          }}
        >
          <button
            type="button"
            onClick={() => setShowCapabilities((v) => !v)}
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
              showCapabilities
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
            title="Quick actions"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", showCapabilities && "rotate-180")} />
          </button>
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about audits, CAPA, findings…"
            disabled={isSending}
            className="h-9 text-sm"
          />
          <Button type="submit" size="sm" disabled={isSending || !input.trim()} className="h-9 w-9 shrink-0 p-0">
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
