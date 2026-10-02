// src/lib/partnerInvite.ts
// Helpers for creating + sharing partner invites, and the seat / on-hold math
// behind the "Your team" page. Used by OnboardingWizard, TeamPage and useTeam.

import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { Clipboard } from "@capacitor/clipboard";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

const APP_URL = typeof window !== "undefined" ? window.location.origin : "";

export type PartnerRole = "coparent" | "caregiver" | "viewer";

export const PARTNER_ROLES: PartnerRole[] = ["coparent", "caregiver", "viewer"];

export const ROLE_COPY: Record<PartnerRole, { title: string; desc: string; sub: string }> = {
  coparent: {
    title: "Co-parent",
    desc: "Full access. Logs, edits, manages everything.",
    sub: "Same access as you",
  },
  caregiver: {
    title: "Caregiver",
    desc: "Logs feeds, sleep, diapers — but not finance or settings.",
    sub: "Nanny · Grandparent · Daycare",
  },
  viewer: {
    title: "View-only",
    desc: "Sees the rhythm. Cannot log or change anything.",
    sub: "Pediatrician · Family",
  },
};

export function inviteUrl(inviteCode: string): string {
  return `${APP_URL}/invite/${inviteCode}`;
}

/**
 * Additional people on the account (beyond the owner). Mirrors
 * `partner_seat_limit()` in migration 20260930100000 — change both together.
 */
export const FREE_SEATS = 1;
export const PLUS_SEATS = 2;

export function seatLimit(isPremium: boolean): number {
  return isPremium ? PLUS_SEATS : FREE_SEATS;
}

export type PartnerAccessStatus = "active" | "paused" | "revoked";

export interface SeatSummary {
  /** Seats taken by active partners, paused partners, and outstanding invites. */
  used: number;
  limit: number;
  remaining: number;
  canInvite: boolean;
}

/**
 * Seat math for the team page and the onboarding invite card.
 * A paused partner still holds their seat — only removing them frees one.
 */
export function seatSummary(opts: {
  isPremium: boolean;
  /** partner_access rows with status active or paused. */
  partnerCount: number;
  /** partner_invitations rows still pending and unexpired. */
  pendingInviteCount: number;
}): SeatSummary {
  const limit = seatLimit(opts.isPremium);
  const used = opts.partnerCount + opts.pendingInviteCount;
  const remaining = Math.max(0, limit - used);
  return { used, limit, remaining, canInvite: remaining > 0 };
}

export interface SeatHolder {
  id: string;
  status: string;
  created_at: string;
}

/**
 * Seniority among one owner's seat-holding rows (active + paused), oldest
 * first by created_at then id — the same order `partner_within_entitlement()`
 * uses. Returns row id -> 1-based rank. Revoked rows are not ranked.
 */
export function rankSeatHolders(rows: SeatHolder[]): Map<string, number> {
  const ranked = rows
    .filter((r) => r.status === "active" || r.status === "paused")
    .sort((a, b) => {
      const t = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (t !== 0) return t;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  return new Map(ranked.map((r, i) => [r.id, i + 1]));
}

/**
 * "On hold": the row is active, but RLS suspends it because its seniority is
 * beyond the owner's current seat limit (Flare+ lapsed). The row is unchanged
 * and comes back the moment Flare+ restarts. Paused rows are never on hold —
 * the owner already shut them off, and they keep the "Paused" label.
 */
export function onHoldIds(rows: SeatHolder[], ownerIsPremium: boolean): Set<string> {
  const limit = seatLimit(ownerIsPremium);
  const ranks = rankSeatHolders(rows);
  const held = new Set<string>();
  for (const r of rows) {
    const rank = ranks.get(r.id);
    if (r.status === "active" && rank !== undefined && rank > limit) held.add(r.id);
  }
  return held;
}

/** Rows that currently resolve as having access: active and within the limit. */
export function entitledRows<T extends SeatHolder>(rows: T[], ownerIsPremium: boolean): T[] {
  const held = onHoldIds(rows, ownerIsPremium);
  return rows.filter((r) => r.status === "active" && !held.has(r.id));
}

/** The spots line at the top of the team page. Says "spots", never "seats". */
export function spotsLine(opts: {
  isPremium: boolean;
  used: number;
  limit: number;
  waiting: number;
}): string {
  // After a lapse more people can hold a seat than the free plan has; the
  // on-hold banner explains that, so the count never reads "2 of 1".
  const used = Math.min(opts.used, opts.limit);
  const base = opts.isPremium
    ? `${used} of ${opts.limit} spots used`
    : `${used} of ${opts.limit} free spot used`;
  if (opts.waiting === 0) return base;
  return `${base} · ${opts.waiting} ${opts.waiting === 1 ? "invite" : "invites"} waiting`;
}

/** Second half of a member row's line 2: on hold > paused > added date. */
export function memberStatusText(m: {
  onHold: boolean;
  status: string;
  createdAt: string;
}): string {
  if (m.onHold) return "On hold until Flare+ restarts";
  if (m.status === "paused") return "Paused";
  return `Added ${format(new Date(m.createdAt), "MMM d")}`;
}

/** Profile → Your team row subline. */
export function teamSummaryLine(memberCount: number, waiting: number): string {
  if (memberCount === 0 && waiting === 0) return "Invite a co-parent or caregiver";
  const people = memberCount + 1;
  const parts = [`${people} ${people === 1 ? "person" : "people"}`];
  if (waiting > 0) parts.push(`${waiting} ${waiting === 1 ? "invite" : "invites"} waiting`);
  return parts.join(" · ");
}

/**
 * The seat triggers and RPCs raise machine-readable prefixes so the UI can say
 * something useful instead of "Something went wrong". Anything unrecognized
 * falls back to `fallback`.
 */
export function describePartnerError(err: unknown, fallback: string): string {
  const message =
    typeof err === "string"
      ? err
      : ((err as { message?: string } | null)?.message ?? "");

  if (message.includes("SEAT_LIMIT_REACHED")) {
    // Only the free-tier variant of the trigger message says "free plan".
    return message.includes("free plan")
      ? "Your free spot is in use. Flare+ adds a second person."
      : "Your team is full. Remove someone or cancel a waiting invite to free a spot.";
  }
  if (message.includes("INVALID_ROLE")) {
    return "That role isn't available. Pick co-parent, caregiver, or view-only.";
  }
  if (message.includes("Invalid or expired")) {
    return "This invite has expired or has already been used.";
  }
  if (message.includes("Cannot accept your own")) {
    return "You can't accept your own invite.";
  }
  return fallback;
}

export function isSeatLimitError(err: unknown): boolean {
  const message = (err as { message?: string } | null)?.message ?? "";
  return message.includes("SEAT_LIMIT_REACHED");
}

export interface CreateInviteArgs {
  ownerId: string;
  role: PartnerRole;
  /** What the owner calls them ("Grandma", "Lucia") — shown on the team list. */
  label?: string;
}

export interface InviteResult {
  inviteCode: string;
  url: string;
}

export async function createPartnerInvite({
  ownerId,
  role,
  label,
}: CreateInviteArgs): Promise<InviteResult> {
  const { data, error } = await supabase
    .from("partner_invitations")
    .insert({
      owner_id: ownerId,
      role,
      invitee_label: label?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    inviteCode: data.invite_code,
    url: inviteUrl(data.invite_code),
  };
}

/** Build the SMS / share-sheet body. */
export function buildInviteMessage(opts: {
  babyName: string;
  role: PartnerRole;
  url: string;
}) {
  const r =
    opts.role === "coparent"
      ? "a co-parent"
      : opts.role === "caregiver"
      ? "a caregiver"
      : "view-only";
  return `I'm tracking ${opts.babyName} on Grace Flare and added you as ${r}. Tap to join — takes about a minute. ${opts.url}`;
}

/**
 * Open the native share sheet (or fallback) for an invite.
 * Returns true if the share completed.
 */
export async function shareInvite(opts: {
  url: string;
  babyName: string;
  role: PartnerRole;
}): Promise<boolean> {
  const text = buildInviteMessage(opts);

  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({
        title: `Tracking ${opts.babyName} together`,
        text,
        url: opts.url,
        dialogTitle: "Send invite",
      });
      return true;
    } catch {
      // The user dismissing the native share sheet rejects too.
      return false;
    }
  }

  if (navigator.share) {
    try {
      await navigator.share({ title: opts.babyName, text, url: opts.url });
      return true;
    } catch {
      /* fall through to copy */
    }
  }
  await navigator.clipboard.writeText(text);
  return true;
}

/** Copy just the URL — used by the QR / "show on screen" path. */
export async function copyInviteUrl(url: string) {
  if (Capacitor.isNativePlatform()) {
    await Clipboard.write({ string: url });
  } else {
    await navigator.clipboard.writeText(url);
  }
}
