// The AI persona catalog. Lives here (not in a component) because the only
// remaining consumer is the Next Steps peek panel, which shows the persona icon
// above a generated insight. The server-side router in `next-step-peek` and the
// shared `personas.ts` prompts are the source of truth for behaviour; this is
// just the client-side label/icon/colour mapping.
//
// Colours map to brand module tokens where there's a natural match
// (nutrition→feeding, sleep→sleep, financial→finance, developmental→milestones,
// slp→milestones tint). Pediatrician uses the semantic destructive token to
// signal "health concerns." General uses primary.
import type React from "react";
import { Bot, Stethoscope, Speech, Wallet, Brain, Apple, BedDouble } from "lucide-react";

export type SkillId =
  | "general"
  | "pediatrician"
  | "slp"
  | "financial"
  | "developmental"
  | "nutrition"
  | "sleep";

export const SKILLS: {
  id: SkillId;
  label: string;
  icon: React.ElementType;
  description: string;
  color: string;
}[] = [
  { id: "general", label: "General", icon: Bot, description: "General parenting guidance", color: "bg-primary/15 text-primary" },
  { id: "pediatrician", label: "Pediatrician", icon: Stethoscope, description: "Health, vaccines, illness", color: "bg-destructive/15 text-destructive" },
  { id: "slp", label: "Speech (SLP)", icon: Speech, description: "Language milestones & activities", color: "bg-milestones/15 text-milestones" },
  { id: "developmental", label: "Development", icon: Brain, description: "Motor, sensory & cognitive", color: "bg-accent/15 text-accent" },
  { id: "nutrition", label: "Nutrition", icon: Apple, description: "Feeding, solids & allergens", color: "bg-feeding/15 text-feeding" },
  { id: "sleep", label: "Sleep", icon: BedDouble, description: "Schedules, training & regressions", color: "bg-sleep/15 text-sleep" },
  { id: "financial", label: "Financial", icon: Wallet, description: "529s, tax credits & budgeting", color: "bg-finance/15 text-finance" },
];

export function getSkill(id?: SkillId) {
  return SKILLS.find((s) => s.id === id);
}
