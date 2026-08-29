import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import Markdown from "react-markdown";
import { Bot, Send, User } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { askLumina, getAiStatus } from "@/lib/ai";
import type { ChatMessage } from "@/lib/types";

export const Route = createFileRoute("/assistant")({ component: AssistantPage });

const STARTERS = [
  "How do I judge centering on a 2.5×3.5 slab?",
  "What's the difference between a hairline scratch and print line?",
  "When does descratch cross into restoration that a grader will flag?",
];

function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "model",
      text: "I'm Lumina. I can help with centering, surface wear, grade estimates, and restoration ethics. What are you looking at?",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiOk, setAiOk] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void getAiStatus()
      .then((s) => setAiOk(s.available))
      .catch(() => setAiOk(false));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text?: string) => {
    const prompt = (text ?? input).trim();
    if (!prompt || busy || !aiOk) return;
    const userMsg: ChatMessage = { id: String(Date.now()), role: "user", text: prompt, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setBusy(true);
    try {
      const history = [...messages, userMsg].map((m) => ({ role: m.role, text: m.text }));
      const result = await askLumina({ data: { messages: history.slice(0, -1), prompt } });
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: "model",
          text: result.ok ? result.text : result.error,
          timestamp: Date.now(),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: "model",
          text: err instanceof Error ? err.message : "Connection error.",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Lumina" subtitle="Grading and restoration notes">
      <div className="flex flex-col h-[calc(100vh-57px)]">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-3xl mx-auto space-y-5">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className="h-8 w-8 rounded-md border border-border bg-elevated flex items-center justify-center shrink-0">
                  {msg.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5 text-steel" />}
                </div>
                <div className={`max-w-[85%] rounded-lg border border-border px-4 py-3 text-sm leading-relaxed ${msg.role === "user" ? "bg-elevated" : "bg-surface"}`}>
                  <div className="prose-chat [&_p]:mb-2 last:[&_p]:mb-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_code]:font-mono [&_code]:text-xs">
                    <Markdown>{msg.text}</Markdown>
                  </div>
                </div>
              </div>
            ))}
            {busy && <p className="text-xs font-mono text-subtle">Lumina is thinking…</p>}
            <div ref={endRef} />
          </div>
        </div>
        <div className="border-t border-border bg-surface p-4">
          <div className="max-w-3xl mx-auto space-y-3">
            {!aiOk && (
              <p className="text-sm text-warn">
                Lumina runs on the server with <span className="font-mono">XAI_API_KEY</span>. This
                public page has no Node process, so chat is offline.
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="text-[11px] px-2.5 py-1 rounded-md border border-border text-muted hover:text-fg hover:bg-elevated"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="relative">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Ask about grade, centering, or restoration…"
                className="w-full h-12 rounded-lg bg-elevated border border-border pl-4 pr-12 text-sm outline-none focus:ring-2 focus:ring-steel/40"
              />
              <Button
                size="iconSm"
                className="absolute right-2 top-2"
                disabled={!input.trim() || busy}
                onClick={() => send()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-center text-[10px] font-mono text-subtle">Estimates only — verify in hand before submitting to a grader.</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
