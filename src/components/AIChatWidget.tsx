import React, { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, X, Bot, Loader2, Moon, UtensilsCrossed, Droplets, CheckCircle2, ChevronLeft, Stethoscope, Speech, Wallet, Brain, Apple, BedDouble, Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { useChildContext } from "@/hooks/useChildContext";
import { toast } from "@/hooks/use-toast";
import { useChatHistory, type Message } from "@/hooks/useChatHistory";

type LogAction = { type: "sleep" | "feeding" | "diaper"; label: string; data: Record<string, string> };

export type SkillId = "general" | "pediatrician" | "slp" | "financial" | "developmental" | "nutrition" | "sleep" | "onboarding";

const SKILLS: { id: SkillId; label: string; icon: React.ElementType; description: string; color: string }[] = [
  { id: "general", label: "General", icon: Bot, description: "Ask anything about parenting", color: "bg-primary/15 text-primary" },
  { id: "pediatrician", label: "Pediatrician", icon: Stethoscope, description: "Health, vaccines, illness", color: "bg-red-500/15 text-red-600" },
  { id: "slp", label: "Speech (SLP)", icon: Speech, description: "Language milestones & activities", color: "bg-violet-500/15 text-violet-600" },
  { id: "developmental", label: "Development", icon: Brain, description: "Motor, sensory & cognitive", color: "bg-amber-500/15 text-amber-600" },
  { id: "nutrition", label: "Nutrition", icon: Apple, description: "Feeding, solids & allergens", color: "bg-green-500/15 text-green-600" },
  { id: "sleep", label: "Sleep", icon: BedDouble, description: "Schedules, training & regressions", color: "bg-indigo-500/15 text-indigo-600" },
  { id: "financial", label: "Financial", icon: Wallet, description: "529s, tax credits & budgeting", color: "bg-emerald-500/15 text-emerald-600" },
];

const SKILL_SUGGESTIONS: Record<SkillId, string[]> = {
  general: ["Log a 2 hour nap", "How's my baby doing?", "Log a bottle feeding", "Tips for teething pain"],
  pediatrician: ["When is the next vaccine due?", "My baby has a fever of 101°F", "What happens at the 6-month visit?", "When should I call the doctor?"],
  slp: ["Is my baby's babbling normal?", "Activities to encourage first words", "When should I worry about speech?", "How to read to my baby"],
  financial: ["How do I start a 529 plan?", "What tax credits can I claim?", "How much should I budget for childcare?", "Do I need life insurance?"],
  developmental: ["Tummy time tips for a hater", "When should baby start crawling?", "Best toys for 6 months", "Is my baby's pincer grasp on track?"],
  nutrition: ["When can I start solids?", "How to introduce peanuts safely", "Iron-rich foods for baby", "My toddler won't eat vegetables"],
  sleep: ["Wake windows for 4 months", "How to handle the 4-month regression", "When to drop to 2 naps?", "Safe sleep guidelines"],
  onboarding: [],
};

interface AIChatWidgetProps {
  activeChildId?: string;
  forceOnboarding?: boolean;
  onOnboardingComplete?: () => void;
}

type View = "closed" | "skills" | "chat";

export function AIChatWidget({ activeChildId, forceOnboarding, onOnboardingComplete }: AIChatWidgetProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const chatHistory = useChatHistory(activeChildId);
  const { data: childContext } = useChildContext(activeChildId);

  const [view, setView] = useState<View>(forceOnboarding ? "chat" : "closed");
  const [messages, setMessages] = useState<Message[]>(
    forceOnboarding ? [{ role: "assistant", content: "Welcome to Baby Steps! 🎉 I'm here to help you get set up. What's your baby's name?" }] : []
  );
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<LogAction | null>(null);
  const [actionSaving, setActionSaving] = useState(false);
  const [currentConvoId, setCurrentConvoId] = useState<string | null>(null);
  const [activeSkill, setActiveSkill] = useState<SkillId>(forceOnboarding ? "onboarding" : "general");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const [isListening, setIsListening] = useState(false);

  const supportsVoice = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const toggleVoice = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: "Voice not supported", description: "Your browser doesn't support speech recognition.", variant: "destructive" });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    let finalTranscript = "";

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interim += transcript;
        }
      }
      setInput(finalTranscript + interim);
    };

    recognition.onend = () => {
      setIsListening(false);
      if (finalTranscript.trim()) {
        sendMessage(finalTranscript.trim());
      }
    };

    recognition.onerror = (event: any) => {
      setIsListening(false);
      if (event.error !== "no-speech") {
        toast({ title: "Voice error", description: event.error, variant: "destructive" });
      }
    };

    recognition.start();
    setIsListening(true);
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

  const parseLogAction = (text: string): LogAction | null => {
    const lower = text.toLowerCase();
    const sleepMatch = lower.match(/log\s+(?:a\s+)?(\d+\.?\d*)\s*(?:hr|hour|h)?\s*(\d+)?\s*(?:min|minute|m)?\s*(nap|night|sleep)?/);
    if (sleepMatch) {
      const hours = parseFloat(sleepMatch[1]) || 0;
      const mins = parseInt(sleepMatch[2] || "0") || 0;
      const totalMins = Math.round(hours * 60 + mins);
      const sleepType = sleepMatch[3] === "night" ? "night" : "nap";
      if (totalMins > 0) {
        return { type: "sleep", label: `${sleepType === "nap" ? "☀️ Nap" : "🌙 Night"} — ${hours > 0 ? `${Math.floor(totalMins / 60)}h ${totalMins % 60}m` : `${totalMins}m`}`, data: { duration_minutes: String(totalMins), sleep_type: sleepType } };
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
      toast({ title: "Failed to log entry", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally { setActionSaving(false); }
  };

  const sendMessage = async (text: string) => {
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

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);
    let assistantContent = "";

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `https://ieuznbvvwdvhtirzwkly.supabase.co/functions/v1/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlldXpuYnZ2d2R2aHRpcnp3a2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5OTIzODQsImV4cCI6MjA4ODU2ODM4NH0.04dxqjtlwWujfWTSM8fm2Y6EXGqIpOZisvBcN4eETEc"}` },
          body: JSON.stringify({ messages: updatedMessages, skill: activeSkill, context: childContext || undefined }),
        }
      );

      if (!resp.ok) { const errData = await resp.json().catch(() => ({})); throw new Error(errData.error || "Failed to get response"); }
      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      const upsertAssistant = (content: string) => {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content } : m));
          return [...prev, { role: "assistant", content }];
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) { assistantContent += content; upsertAssistant(assistantContent); }
          } catch { textBuffer = line + "\n" + textBuffer; break; }
        }
      }

      // Check for onboarding child creation command
      const createChildMatch = assistantContent.match(/:::CREATE_CHILD:::(.*?):::END:::/s);
      if (createChildMatch && user) {
        try {
          const childData = JSON.parse(createChildMatch[1]);
          const { error } = await supabase.from("children").insert({
            parent_id: user.id,
            name: childData.name,
            date_of_birth: childData.date_of_birth,
            is_premature: childData.is_premature || false,
            due_date: childData.due_date || null,
          });
          if (!error) {
            queryClient.invalidateQueries({ queryKey: ["children"] });
            // Clean the create command from displayed message
            const cleanContent = assistantContent.replace(/:::CREATE_CHILD:::.*?:::END:::/s, "").trim();
            upsertAssistant(cleanContent);
            assistantContent = cleanContent;
            onOnboardingComplete?.();
          }
        } catch (parseErr) {
          console.error("Failed to parse child creation:", parseErr);
        }
      }

      if (convoId && assistantContent) {
        await chatHistory.saveMessages(convoId, [userMsg, { role: "assistant", content: assistantContent }]);
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Something went wrong";
      setMessages((prev) => [...prev, { role: "assistant", content: `Sorry, I couldn't respond right now. ${errorMsg}` }]);
    } finally { setIsLoading(false); }
  };

  const handleNewChat = () => {
    chatHistory.startNewChat();
    setCurrentConvoId(null);
    setMessages([]);
    setPendingAction(null);
    setView("skills");
  };

  const handleVoiceFromOutside = () => {
    setActiveSkill("general");
    setMessages([]);
    setCurrentConvoId(null);
    chatHistory.startNewChat();
    setView("chat");
    // Start voice recognition after a brief delay to let the view render
    setTimeout(() => toggleVoice(), 300);
  };

  const handleSelectSkill = (skillId: SkillId) => {
    setActiveSkill(skillId);
    setView("chat");
  };

  const handleOpenConversation = (id: string) => {
    chatHistory.openConversation(id);
    setView("chat");
  };

  const actionIcon = (type: string) => {
    if (type === "sleep") return <Moon className="w-4 h-4 text-sleep" />;
    if (type === "feeding") return <UtensilsCrossed className="w-4 h-4 text-feeding" />;
    return <Droplets className="w-4 h-4 text-diapers" />;
  };

  const activeSkillInfo = SKILLS.find(s => s.id === activeSkill);

  // CLOSED — AI button + voice mic side by side
  if (view === "closed") {
    return (
      <div className="flex items-center gap-2">
        <button onClick={() => setView("skills")} className="flex items-center gap-2 flex-1 p-3 rounded-2xl bg-primary/10 hover:bg-primary/15 transition-colors active:scale-[0.98]">
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold">Ask Baby Steps AI</p>
            <p className="text-xs text-muted-foreground">6 expert skills • Ask anything</p>
          </div>
        </button>
        {supportsVoice && (
          <button
            onClick={handleVoiceFromOutside}
            className="w-12 h-12 rounded-full bg-primary/10 hover:bg-primary/15 flex items-center justify-center transition-all active:scale-95 shrink-0"
          >
            <Mic className="w-5 h-5 text-primary" />
          </button>
        )}
      </div>
    );
  }

  // SKILLS PICKER
  if (view === "skills") {
    return (
      <Card className="border-0 bg-card shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-primary/10 border-b border-border">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setView("closed")}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-semibold">Choose an Expert</span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setView("closed")}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-3 grid grid-cols-2 gap-2">
          {SKILLS.map((skill) => (
            <button
              key={skill.id}
              onClick={() => handleSelectSkill(skill.id)}
              className={cn(
                "flex flex-col items-start gap-1.5 p-3 rounded-xl text-left transition-all active:scale-95 border border-transparent hover:border-border",
                skill.color
              )}
            >
              <skill.icon className="w-5 h-5" />
              <div>
                <p className="text-xs font-semibold leading-tight">{skill.label}</p>
                <p className="text-[10px] opacity-70 leading-tight mt-0.5">{skill.description}</p>
              </div>
            </button>
          ))}
        </div>
      </Card>
    );
  }

  // CHAT VIEW
  const isOnboardingChat = forceOnboarding && activeSkill === "onboarding";

  return (
    <Card className={cn("border-0 bg-card shadow-lg overflow-hidden", isOnboardingChat && "shadow-none")}>
      {!isOnboardingChat && (
        <div className="flex items-center justify-between px-4 py-3 bg-primary/10 border-b border-border">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setView("closed"); chatHistory.startNewChat(); setCurrentConvoId(null); setMessages([]); }}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            {activeSkillInfo && (
              <button onClick={() => setView("skills")} className={cn("flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium", activeSkillInfo.color)}>
                <activeSkillInfo.icon className="w-3.5 h-3.5" />
                {activeSkillInfo.label}
              </button>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setView("closed")}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      <div ref={scrollRef} className={cn("overflow-y-auto p-3 space-y-3", isOnboardingChat ? "h-[45vh]" : "h-64")}>
        {messages.length === 0 && !pendingAction && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground text-center py-2">
              {activeSkillInfo ? `Ask your ${activeSkillInfo.label.toLowerCase()} questions! 👶` : "Ask questions or log entries naturally! 👶"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(SKILL_SUGGESTIONS[activeSkill] || SKILL_SUGGESTIONS.general).map((s) => (
                <button key={s} onClick={() => sendMessage(s)} className="text-xs px-2.5 py-1.5 rounded-full bg-secondary hover:bg-secondary/80 text-foreground transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed", msg.role === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-secondary text-foreground rounded-bl-sm")}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex justify-start">
            <div className="bg-secondary rounded-2xl rounded-bl-sm px-3 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      {pendingAction && (
        <div className="px-3 pb-2">
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

      <div className="p-3 border-t border-border">
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex gap-2">
          <Input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder={isListening ? "Listening..." : "Ask a question or log an entry..."} className={cn("flex-1 h-9 text-sm rounded-full", isListening && "border-primary ring-1 ring-primary")} disabled={isLoading} />
          {supportsVoice && (
            <Button type="button" size="icon" variant={isListening ? "default" : "outline"} className={cn("h-9 w-9 rounded-full shrink-0", isListening && "bg-destructive hover:bg-destructive/90 animate-pulse")} onClick={toggleVoice} disabled={isLoading}>
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>
          )}
          <Button type="submit" size="icon" className="h-9 w-9 rounded-full bg-primary shrink-0" disabled={!input.trim() || isLoading}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </Card>
  );
}
