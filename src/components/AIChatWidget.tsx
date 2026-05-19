import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Send, X, Bot, Loader2, Moon, UtensilsCrossed, Droplets, CheckCircle2, Stethoscope, Speech, Wallet, Brain, Apple, BedDouble, Mic, MicOff, AlertTriangle, Sparkles, Square, Zap, Info, RotateCcw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { useChildContext } from "@/hooks/useChildContext";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useChatHistory, type Message } from "@/hooks/useChatHistory";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useChatUsage } from "@/hooks/useChatUsage";
import { onChatOpen } from "@/lib/chatOpener";

const HEALTH_SKILLS = new Set(["pediatrician", "slp", "developmental", "nutrition", "sleep"]);

type LogAction = { type: "sleep" | "feeding" | "diaper"; label: string; data: Record<string, string> };

export type SkillId = "general" | "pediatrician" | "slp" | "financial" | "developmental" | "nutrition" | "sleep";

// Skill colors map to brand module tokens where there's a natural match
// (nutrition→feeding, sleep→sleep, financial→finance, developmental→milestones,
// slp→milestones tint). Pediatrician uses the semantic destructive token to
// signal "health concerns." General uses primary.
const SKILLS: { id: SkillId; label: string; icon: React.ElementType; description: string; color: string }[] = [
  { id: "general", label: "General", icon: Bot, description: "Ask anything about parenting", color: "bg-primary/15 text-primary" },
  { id: "pediatrician", label: "Pediatrician", icon: Stethoscope, description: "Health, vaccines, illness", color: "bg-destructive/15 text-destructive" },
  { id: "slp", label: "Speech (SLP)", icon: Speech, description: "Language milestones & activities", color: "bg-milestones/15 text-milestones" },
  { id: "developmental", label: "Development", icon: Brain, description: "Motor, sensory & cognitive", color: "bg-accent/15 text-accent" },
  { id: "nutrition", label: "Nutrition", icon: Apple, description: "Feeding, solids & allergens", color: "bg-feeding/15 text-feeding" },
  { id: "sleep", label: "Sleep", icon: BedDouble, description: "Schedules, training & regressions", color: "bg-sleep/15 text-sleep" },
  { id: "financial", label: "Financial", icon: Wallet, description: "529s, tax credits & budgeting", color: "bg-finance/15 text-finance" },
];

// One starter from each non-general expert. The server-side router picks the
// right specialist from the prompt text — users no longer pick a skill.
const STARTER_PROMPTS: string[] = [
  "My baby has a fever of 101°F",
  "Wake windows for 4 months",
  "When can I start solids?",
  "Is my baby's babbling normal?",
  "When should baby start crawling?",
  "How do I start a 529 plan?",
];

interface AIChatWidgetProps {
  activeChildId?: string;
  quickLogMode?: boolean;
}

interface SendOptions {
  forceSkill?: SkillId;
}

const QUICK_LOG_SUGGESTIONS = [
  "Log a 90 min nap",
  "Log a 4oz bottle",
  "Log a wet diaper",
  "Log a 2 hour night sleep",
];

type View = "closed" | "chat";

// SSE frames are delimited by a blank line — either `\n\n` or `\r\n\r\n`.
// Returns the index of the end of the frame (start of the delimiter), or -1.
function findFrameBoundary(buf: string): number {
  const a = buf.indexOf("\n\n");
  const b = buf.indexOf("\r\n\r\n");
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}

export function AIChatWidget({ activeChildId, quickLogMode }: AIChatWidgetProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const chatHistory = useChatHistory(activeChildId);
  const { data: childContext } = useChildContext(activeChildId);
  const usage = useChatUsage();

  const [view, setView] = useState<View>("closed");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<LogAction | null>(null);
  const [actionSaving, setActionSaving] = useState(false);
  const [currentConvoId, setCurrentConvoId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Full-screen voice mode (opens from the mic button; routes transcript into
  // its own state so the small input field doesn't double as the display).
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const voiceModeOpenRef = useRef(false);
  useEffect(() => { voiceModeOpenRef.current = voiceModeOpen; }, [voiceModeOpen]);

  const { isListening, isSupported: supportsVoice, start: startVoice, stop: stopVoice } = useSpeechRecognition({
    onResult: (transcript) => {
      if (voiceModeOpenRef.current) setVoiceTranscript(transcript);
      else sendMessage(transcript);
    },
    onInterim: (transcript) => {
      if (voiceModeOpenRef.current) setVoiceTranscript(transcript);
      else setInput(transcript);
    },
  });

  const toggleVoice = () => {
    if (isListening) stopVoice();
    else startVoice();
  };

  useEffect(() => {
    if (chatHistory.savedMessages.length > 0 && chatHistory.activeConversationId) {
      setMessages(chatHistory.savedMessages);
      setCurrentConvoId(chatHistory.activeConversationId);
    }
  }, [chatHistory.savedMessages, chatHistory.activeConversationId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, pendingAction]);

  useEffect(() => {
    if (view === "chat" && inputRef.current) inputRef.current.focus();
  }, [view]);

  // External handoff: subscribe to the module-level chatOpener bus so surfaces
  // like SleepTriageCard can open the widget with a pre-seeded prompt and an
  // explicit skill override. We hold the latest `sendMessage` in a ref so the
  // single subscription always dispatches against the current closure.
  const sendMessageRef = useRef<((text: string, opts?: SendOptions) => void) | null>(null);
  useEffect(() => {
    return onChatOpen(({ seedPrompt, forceSkill }) => {
      setView("chat");
      setInput(seedPrompt);
      // Let the dialog mount and the input render before kicking off the
      // request — mirrors the sendVoiceTranscript handoff pattern.
      setTimeout(() => {
        sendMessageRef.current?.(seedPrompt, { forceSkill });
        setInput("");
      }, 50);
    });
  }, []);

  const parseLogAction = (text: string): LogAction | null => {
    const lower = text.toLowerCase();
    // Bind units to digits so "90 min nap" isn't parsed as 90 hours. Either
    // the hr-group or the min-group must match for a duration to be valid.
    const sleepMatch = lower.match(/log\s+(?:a\s+)?(?:(\d+\.?\d*)\s*(?:hr|hour|hours|h)\b)?\s*(?:(\d+)\s*(?:min|minute|minutes|m)\b)?\s*(nap|night|sleep)?/);
    if (sleepMatch && (sleepMatch[1] || sleepMatch[2])) {
      const hours = parseFloat(sleepMatch[1] || "0") || 0;
      const mins = parseInt(sleepMatch[2] || "0") || 0;
      const totalMins = Math.round(hours * 60 + mins);
      const sleepType = sleepMatch[3] === "night" ? "night" : "nap";
      if (totalMins > 0) {
        const h = Math.floor(totalMins / 60);
        const m = totalMins % 60;
        const durationLabel = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
        return { type: "sleep", label: `${sleepType === "nap" ? "☀️ Nap" : "🌙 Night"} — ${durationLabel}`, data: { duration_minutes: String(totalMins), sleep_type: sleepType } };
      }
    }
    const feedMatch = lower.match(/log\s+(?:a\s+)?(?:(\d+\.?\d*)\s*(?:oz|ounce))?\s*(bottle|breast|formula|nursing|feed|solid)/);
    if (feedMatch) {
      const oz = feedMatch[1] || "";
      const typeWord = feedMatch[2] || "bottle";
      let feedingType = "bottle";
      if (typeWord.includes("breast") || typeWord.includes("nurs")) feedingType = "breast";
      else if (typeWord.includes("solid")) feedingType = "solid";
      else if (typeWord.includes("formula")) feedingType = "formula";
      return { type: "feeding", label: `🍼 ${feedingType.charAt(0).toUpperCase() + feedingType.slice(1)}${oz ? ` — ${oz} oz` : ""}`, data: { feeding_type: feedingType, ...(oz ? { amount_oz: oz } : {}) } };
    }
    const diaperMatch = lower.match(/log\s+(?:a\s+)?(wet|dirty|mixed|diaper)/);
    if (diaperMatch) {
      const dType = diaperMatch[1] === "diaper" ? "wet" : diaperMatch[1];
      return { type: "diaper", label: `🧷 ${dType.charAt(0).toUpperCase() + dType.slice(1)} diaper`, data: { diaper_type: dType } };
    }
    return null;
  };

  const executeAction = async (action: LogAction) => {
    if (!activeChildId || !user) { toast({ title: "No active child selected", variant: "destructive" }); return; }
    setActionSaving(true);
    try {
      const now = new Date();
      if (action.type === "sleep") {
        const durationMins = parseInt(action.data.duration_minutes);
        const { error } = await supabase.from("sleep_logs").insert({ child_id: activeChildId, parent_id: user.id, sleep_type: action.data.sleep_type, started_at: new Date(now.getTime() - durationMins * 60000).toISOString(), ended_at: now.toISOString() });
        if (error) throw error;
      } else if (action.type === "feeding") {
        const { error } = await supabase.from("feeding_logs").insert({ child_id: activeChildId, parent_id: user.id, feeding_type: action.data.feeding_type, ...(action.data.amount_oz ? { amount_oz: parseFloat(action.data.amount_oz) } : {}) });
        if (error) throw error;
      } else if (action.type === "diaper") {
        const { error } = await supabase.from("diaper_logs").insert({ child_id: activeChildId, parent_id: user.id, diaper_type: action.data.diaper_type });
        if (error) throw error;
      }
      ["sleep-logs", "today-sleep", "today-feeds", "today-diapers", "streak", "activity-feed"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      setPendingAction(null);
      const confirmMsg: Message = { role: "assistant", content: `✅ Logged! ${action.label}` };
      setMessages((prev) => [...prev, confirmMsg]);
      if (currentConvoId) await chatHistory.saveMessages(currentConvoId, [confirmMsg]);
      toast({ title: "Entry logged! ✅" });
    } catch (e) {
      const err = e as { message?: string; code?: string } | null;
      let description = err?.message || (e instanceof Error ? e.message : "Something went wrong. Try again.");
      if (err?.code === "23P01") {
        description = "That window overlaps another sleep entry. Edit or delete the existing one first.";
      }
      toast({ title: "Failed to log entry", description, variant: "destructive" });
    } finally { setActionSaving(false); }
  };

  const sendMessage = async (text: string, opts: SendOptions = {}) => {
    if (!text.trim() || isLoading) return;
    const action = parseLogAction(text);
    const userMsg: Message = { role: "user", content: text.trim() };

    let convoId = currentConvoId;
    if (!convoId) {
      convoId = await chatHistory.createConversation(text.trim());
      setCurrentConvoId(convoId);
    }

    if (action) {
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setPendingAction(action);
      if (convoId) await chatHistory.saveMessages(convoId, [userMsg]);
      return;
    }

    if (!usage.isUnlimited && usage.remaining <= 0) {
      toast({
        title: "Daily limit reached",
        description: `You've used all ${usage.limit} free expert messages today. Upgrade to Flare+ for unlimited access.`,
        variant: "destructive",
        action: (
          <ToastAction altText="Upgrade to Flare+" onClick={() => navigate("/upgrade")}>
            Upgrade
          </ToastAction>
        ),
      });
      return;
    }

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);
    let assistantContent = "";
    let routedSkill: SkillId | undefined = opts.forceSkill;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");
      const resp = await fetch(
        `https://ieuznbvvwdvhtirzwkly.supabase.co/functions/v1/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ messages: updatedMessages, skill: opts.forceSkill ?? "auto", context: childContext || undefined }),
        }
      );

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        if (resp.status === 429 && errData.error === "daily_limit_reached") {
          toast({
            title: "Daily limit reached",
            description: errData.message ?? `You've used all ${usage.limit} free expert messages today. Upgrade to Flare+ for unlimited access.`,
            variant: "destructive",
            action: (
              <button
                onClick={() => navigate("/upgrade")}
                className="text-xs font-semibold underline"
              >
                Upgrade
              </button>
            ),
          });
          queryClient.invalidateQueries({ queryKey: ["chat-usage"] });
          setMessages((prev) => prev.slice(0, -1));
          return;
        }
        throw new Error(errData.error || errData.message || `HTTP ${resp.status}`);
      }
      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let done = false;

      const upsertAssistant = (content: string, skill?: SkillId) => {
        const displayContent = content.trim();
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return prev.map((m, i) =>
              i === prev.length - 1
                ? { ...m, content: displayContent, ...(skill ? { routedSkill: skill } : {}) }
                : m,
            );
          }
          return [
            ...prev,
            { role: "assistant", content: displayContent, ...(skill ? { routedSkill: skill } : {}) },
          ];
        });
      };

      // Apply the routed-skill preamble before any content arrives so the badge
      // renders the moment the user sees a reply forming.
      const applyRouted = (skill: SkillId) => {
        routedSkill = skill;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return prev.map((m, i) =>
              i === prev.length - 1 ? { ...m, routedSkill: skill } : m,
            );
          }
          return [...prev, { role: "assistant", content: "", routedSkill: skill }];
        });
      };

      // SSE frames are separated by a blank line. Each frame may carry an
      // `event:` line plus one or more `data:` lines. We buffer until we have
      // a complete frame, then dispatch.
      while (!done) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        textBuffer += decoder.decode(value, { stream: true });

        let sepIdx: number;
        while ((sepIdx = findFrameBoundary(textBuffer)) !== -1) {
          const rawFrame = textBuffer.slice(0, sepIdx);
          textBuffer = textBuffer.slice(sepIdx).replace(/^(\r?\n)+/, "");

          let eventName = "message";
          const dataLines: string[] = [];
          for (const rawLine of rawFrame.split("\n")) {
            const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
            if (!line || line.startsWith(":")) continue;
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
          }
          if (dataLines.length === 0) continue;
          const dataStr = dataLines.join("\n");

          if (eventName === "routed") {
            try {
              const parsed = JSON.parse(dataStr) as { skill?: SkillId };
              if (parsed.skill) applyRouted(parsed.skill);
            } catch {
              // Malformed preamble — ignore and let the content stream through.
            }
            continue;
          }

          if (dataStr === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(dataStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              upsertAssistant(assistantContent, routedSkill);
            }
          } catch {
            // Incomplete JSON — push it back and wait for more bytes.
            textBuffer = `data: ${dataStr}\n\n${textBuffer}`;
            break;
          }
        }
      }

      if (convoId && assistantContent) {
        await chatHistory.saveMessages(convoId, [userMsg, { role: "assistant", content: assistantContent }]);
        queryClient.invalidateQueries({ queryKey: ["chat-usage"] });
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Something went wrong";
      setMessages((prev) => [...prev, { role: "assistant", content: `Sorry, I couldn't respond right now. ${errorMsg}` }]);
    } finally { setIsLoading(false); }
  };

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  });

  const openVoiceMode = () => {
    setMessages([]);
    setCurrentConvoId(null);
    chatHistory.startNewChat();
    setVoiceTranscript("");
    setVoiceModeOpen(true);
    // Brief delay so the overlay renders before the recognition prompt fires
    setTimeout(() => startVoice(), 150);
  };

  const cancelVoiceMode = () => {
    if (isListening) stopVoice();
    setVoiceTranscript("");
    setVoiceModeOpen(false);
  };

  const sendVoiceTranscript = () => {
    const text = voiceTranscript.trim();
    if (isListening) stopVoice();
    setVoiceTranscript("");
    setVoiceModeOpen(false);
    if (text) {
      setView("chat");
      // Let the chat view mount before the message stream kicks off
      setTimeout(() => sendMessage(text), 50);
    }
  };

  const actionIcon = (type: string) => {
    if (type === "sleep") return <Moon className="w-4 h-4 text-sleep" />;
    if (type === "feeding") return <UtensilsCrossed className="w-4 h-4 text-feeding" />;
    return <Droplets className="w-4 h-4 text-diapers" />;
  };

  const openQuickLogChat = () => {
    setView("chat");
  };

  // Full-screen voice overlay rendered above the closed-view UI when active.
  const voiceOverlay = voiceModeOpen ? (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Top bar — cancel */}
      <div className="flex items-center justify-between p-4">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Voice quick log
        </span>
        <button
          onClick={cancelVoiceMode}
          aria-label="Cancel voice"
          className="w-10 h-10 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center active:scale-95 transition-transform"
        >
          <X className="w-5 h-5 text-foreground" />
        </button>
      </div>

      {/* Mic + transcript */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-10">
        <div className="relative w-40 h-40 flex items-center justify-center">
          {isListening && (
            <>
              <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
              <span className="absolute -inset-4 rounded-full bg-primary/10 animate-pulse" />
            </>
          )}
          <div className="relative w-32 h-32 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-2xl">
            <Mic className="w-16 h-16" />
          </div>
        </div>

        <p className="text-sm text-muted-foreground text-center min-h-[20px]">
          {isListening
            ? "Listening — speak naturally, then tap stop."
            : voiceTranscript
              ? "Tap send to log it, or cancel to discard."
              : "Tap stop if nothing was captured."}
        </p>

        <div className="w-full max-w-md min-h-[100px] px-2">
          <p className="text-lg text-center text-foreground leading-relaxed">
            {voiceTranscript || (isListening ? <span className="text-muted-foreground">…</span> : <span className="text-muted-foreground italic">No transcript yet</span>)}
          </p>
        </div>

        {/* Example prompts — fade out once the user starts speaking */}
        {!voiceTranscript && (
          <div className="w-full max-w-md space-y-2">
            <p className="text-xs text-muted-foreground text-center uppercase tracking-wide font-semibold">Try saying</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {QUICK_LOG_SUGGESTIONS.map((s) => (
                <span
                  key={s}
                  className="text-xs px-3 py-1.5 rounded-full bg-muted text-muted-foreground"
                >
                  "{s}"
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-center pt-1">
              Or ask a question — "is 11h sleep normal at 4 months?"
            </p>
          </div>
        )}
      </div>

      {/* Action button */}
      <div className="p-8 flex justify-center">
        {isListening ? (
          <button
            onClick={() => stopVoice()}
            aria-label="Stop recording"
            className="w-20 h-20 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-xl active:scale-95 transition-transform"
          >
            <Square className="w-8 h-8" fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={sendVoiceTranscript}
            disabled={!voiceTranscript.trim()}
            aria-label="Send transcript"
            className="w-20 h-20 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xl active:scale-95 transition-transform disabled:opacity-40 disabled:active:scale-100"
          >
            <Send className="w-8 h-8" />
          </button>
        )}
      </div>
    </div>
  ) : null;

  // CLOSED-view entry button (rendered alongside the Dialog so the chat
  // dialog can play its close animation without unmounting).
  const closedEntry = quickLogMode ? (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button onClick={openQuickLogChat} className="flex items-center gap-2 flex-1 p-3 rounded-2xl bg-primary/10 hover:bg-primary/15 transition-colors active:scale-[0.98]">
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold">Quick Log with AI</p>
            <p className="text-xs text-muted-foreground">Say or type "fed her 4oz" or "90 min nap"</p>
          </div>
        </button>
        {supportsVoice && (
          <button
            onClick={openVoiceMode}
            aria-label="Quick log by voice"
            className="w-12 h-12 rounded-full bg-primary/10 hover:bg-primary/15 flex items-center justify-center transition-all active:scale-95 shrink-0"
          >
            <Mic className="w-5 h-5 text-primary" />
          </button>
        )}
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <button onClick={() => setView("chat")} className="flex items-center gap-2 flex-1 p-3 rounded-2xl bg-primary/10 hover:bg-primary/15 transition-colors active:scale-[0.98]">
        <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
          <Bot className="w-5 h-5 text-primary" />
        </div>
        <div className="text-left">
          <p className="text-sm font-semibold">Ask Grace Flare AI</p>
          <p className="text-xs text-muted-foreground">Ask anything — we'll route to the right expert</p>
        </div>
      </button>
      {supportsVoice && (
        <button
          onClick={openVoiceMode}
          aria-label="Ask by voice"
          className="w-12 h-12 rounded-full bg-primary/10 hover:bg-primary/15 flex items-center justify-center transition-all active:scale-95 shrink-0"
        >
          <Mic className="w-5 h-5 text-primary" />
        </button>
      )}
    </div>
  );

  // CHAT VIEW — popup modal. Full-bleed on mobile, centered card on desktop,
  // so the conversation has room and the on-screen keyboard never crushes it.
  return (
    <>
      {voiceOverlay}
      {closedEntry}
      <Dialog
        open={view === "chat"}
        onOpenChange={(open) => {
          if (!open) setView("closed");
        }}
      >
        <DialogContent
          className="max-w-md sm:max-w-lg max-h-[80dvh] p-0 gap-0 flex flex-col overflow-hidden"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <DialogTitle className="sr-only">Grace Flare AI chat</DialogTitle>
          <div className="flex items-center gap-2 px-4 py-3 bg-primary/10 border-b border-border shrink-0">
            <span className="font-display text-base font-bold">Grace Flare AI</span>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => { chatHistory.startNewChat(); setCurrentConvoId(null); setMessages([]); setPendingAction(null); }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                New chat
              </Button>
            )}
          </div>

      {!usage.isUnlimited && !usage.isLoading && (
        <button
          onClick={() => navigate("/upgrade")}
          className={cn(
            "w-full flex items-center justify-between gap-2 px-3 py-2 border-b border-border text-xs transition-colors shrink-0",
            usage.remaining === 0
              ? "bg-destructive/10 text-destructive hover:bg-destructive/15"
              : usage.remaining <= 2
                ? "bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/50"
                : "bg-muted/60 text-muted-foreground hover:bg-muted",
          )}
        >
          <span className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" />
            {usage.remaining === 0
              ? `Daily limit reached (${usage.limit}/${usage.limit})`
              : `${usage.remaining} of ${usage.limit} free expert messages left today`}
          </span>
          <span className="font-semibold underline">Upgrade to Flare+</span>
        </button>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && !pendingAction && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground text-center py-2">
              {quickLogMode
                ? "Say or type what happened — I'll log it. 👶"
                : "Ask anything — we'll route to the right expert. 👶"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(quickLogMode ? QUICK_LOG_SUGGESTIONS : STARTER_PROMPTS).map((s) => (
                <button key={s} onClick={() => sendMessage(s)} className="text-xs px-2.5 py-1.5 rounded-full bg-secondary hover:bg-secondary/80 text-foreground transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => {
          const badge =
            msg.role === "assistant" && msg.routedSkill && msg.routedSkill !== "general"
              ? SKILLS.find((s) => s.id === msg.routedSkill)
              : undefined;
          const showHealthNotice =
            msg.role === "assistant" && msg.routedSkill && HEALTH_SKILLS.has(msg.routedSkill);
          const showFinanceNotice =
            msg.role === "assistant" && msg.routedSkill === "financial";
          return (
            <div key={i} className={cn("flex flex-col gap-1", msg.role === "user" ? "items-end" : "items-start")}>
              {badge && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold",
                    badge.color,
                  )}
                >
                  <badge.icon className="w-3 h-3" />
                  {badge.label}
                </span>
              )}
              <div
                className={cn(
                  "max-w-[85%] text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md px-3.5 py-2.5 shadow-sm"
                    : "bg-muted/80 border border-border/40 text-foreground rounded-2xl rounded-bl-md px-3.5 py-2.5",
                )}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
              {showHealthNotice && (
                <div className="max-w-[85%] flex items-start gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>For general information only — not medical advice or diagnosis. For emergencies, <strong>call 911</strong>. Always consult your healthcare provider.</span>
                </div>
              )}
              {showFinanceNotice && (
                <div className="max-w-[85%] flex items-start gap-1.5 px-2.5 py-1.5 rounded-md bg-muted/60 text-xs text-muted-foreground">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>General information only. Consult a licensed financial advisor for personalised advice.</span>
                </div>
              )}
            </div>
          );
        })}
        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex justify-start">
            <div className="bg-muted/80 border border-border/40 rounded-2xl rounded-bl-md px-3.5 py-2.5">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      {pendingAction && (
        <div className="px-3 pb-2 shrink-0">
          <div className="rounded-xl bg-secondary/80 p-3 space-y-2">
            <div className="flex items-center gap-2">
              {actionIcon(pendingAction.type)}
              <span className="text-sm font-medium">{pendingAction.label}</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 gap-1.5 h-8" onClick={() => executeAction(pendingAction)} disabled={actionSaving}>
                {actionSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Confirm
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setPendingAction(null)} disabled={actionSaving}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      <div className="p-3 border-t border-border shrink-0">
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex gap-2 items-center bg-muted/40 rounded-full p-1.5">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isListening ? "Listening..." : "Ask a question or log an entry..."}
            className={cn(
              "flex-1 h-11 text-base md:text-sm border-0 bg-transparent focus-visible:ring-0 px-3",
              isListening && "text-primary",
            )}
            disabled={isLoading}
          />
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-10 w-10 rounded-full shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="About AI replies"
              >
                <Info className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" align="end" className="w-64 text-xs leading-relaxed">
              AI-generated using your child's tracked data. Replies are for general information only — not medical advice.{" "}
              <Link to="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>
            </PopoverContent>
          </Popover>
          {supportsVoice && (
            <Button
              type="button"
              size="icon"
              variant={isListening ? "default" : "ghost"}
              className={cn(
                "h-10 w-10 rounded-full shrink-0",
                isListening && "bg-destructive hover:bg-destructive/90 animate-pulse text-destructive-foreground",
              )}
              onClick={toggleVoice}
              disabled={isLoading}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>
          )}
          <Button
            type="submit"
            size="icon"
            className="h-10 w-10 rounded-full bg-primary shrink-0"
            disabled={!input.trim() || isLoading}
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
