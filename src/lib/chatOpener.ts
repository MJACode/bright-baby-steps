// Lightweight module-level event bus for opening the global AIChatWidget from
// anywhere in the tree. AIChatWidget is mounted in the dashboard shell, not
// co-located with the surfaces that hand off to it (e.g. SleepTriageCard) —
// rather than thread a context through every parent, callers dispatch on this
// bus and the widget subscribes once on mount.
//
// Upgrade path: when a second handoff source appears beyond Sleep Triage,
// promote this to a `ChatOpenerContext` so the React tree owns the surface.
import type { SkillId } from "@/components/AIChatWidget";

export interface ChatOpenDetail {
  seedPrompt: string;
  forceSkill?: SkillId;
}

const bus = new EventTarget();
const EVENT = "open-chat";

export function openChat(detail: ChatOpenDetail): void {
  bus.dispatchEvent(new CustomEvent<ChatOpenDetail>(EVENT, { detail }));
}

export function onChatOpen(listener: (detail: ChatOpenDetail) => void): () => void {
  const handler = (e: Event) => {
    const ce = e as CustomEvent<ChatOpenDetail>;
    if (ce.detail) listener(ce.detail);
  };
  bus.addEventListener(EVENT, handler);
  return () => bus.removeEventListener(EVENT, handler);
}
