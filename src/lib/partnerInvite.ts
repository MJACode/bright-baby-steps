// src/lib/partnerInvite.ts
// Helpers for creating + sharing partner invites.
// Used by OnboardingWizard and PartnerManagement.

import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { Clipboard } from "@capacitor/clipboard";
import { supabase } from "@/integrations/supabase/client";

// Match PartnerManagement.tsx — main uses window.location.origin for invite URLs.
const APP_URL = typeof window !== "undefined" ? window.location.origin : "";

export type PartnerRole = "coparent" | "caregiver" | "viewer";

export const ROLE_COPY: Record<PartnerRole, { title: string; desc: string; sub: string }> = {
  coparent: {
    title: "Co-parent",
    desc: "Full access. Logs, edits, manages everything.",
    sub: "1 person · same as you",
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

/**
 * Additional users (the 2nd and 3rd person on the account) are a Flare+
 * feature. Free tier gets zero seats. Mirrors `partner_seat_limit()` in
 * migration 20260828100000 — change both together.
 */
export const MAX_ADDITIONAL_USERS = 2;

export type PartnerAccessStatus = "active" | "paused" | "revoked";

export interface SeatSummary {
  /** Seats taken by active partners, paused partners, and outstanding invites. */
  used: number;
  limit: number;
  remaining: number;
  canInvite: boolean;
}

/**
 * Seat math, shared by PartnerManagement and the onboarding invite card.
 * A paused partner still holds their seat — only removing them frees one.
 */
export function seatSummary(opts: {
  isPremium: boolean;
  /** partner_access rows with status active or paused. */
  partnerCount: number;
  /** partner_invitations rows still pending and unexpired. */
  pendingInviteCount: number;
}): SeatSummary {
  const limit = opts.isPremium ? MAX_ADDITIONAL_USERS : 0;
  const used = opts.partnerCount + opts.pendingInviteCount;
  const remaining = Math.max(0, limit - used);
  return { used, limit, remaining, canInvite: remaining > 0 };
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

  if (message.includes("FLARE_PLUS_REQUIRED")) {
    return "This account needs an active Flare+ subscription to share access.";
  }
  if (message.includes("SEAT_LIMIT_REACHED")) {
    return `Flare+ includes ${MAX_ADDITIONAL_USERS} additional users. Remove someone to free up a spot.`;
  }
  if (message.includes("Invalid or expired")) {
    return "This invite has expired or has already been used.";
  }
  if (message.includes("Cannot accept your own")) {
    return "You can't accept your own invite.";
  }
  return fallback;
}

export interface CreateInviteArgs {
  ownerId: string;
  role: PartnerRole;
  /** A friendly label like "Mom" or "Lucia (nanny)" — surfaces in the family list. */
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
      invitee_label: label ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    inviteCode: data.invite_code,
    url: `${APP_URL}/invite/${data.invite_code}`,
  };
}

/** Build the SMS / share-sheet body. */
export function buildInviteMessage(opts: {
  babyName: string;
  inviterName?: string;
  role: PartnerRole;
  url: string;
}) {
  const r =
    opts.role === "coparent"
      ? "co-parent"
      : opts.role === "caregiver"
      ? "caregiver"
      : "view-only access";
  const inviter = opts.inviterName ?? "I";
  return `${inviter} just set up a profile for ${opts.babyName} on Grace Flare and added you as ${r}. Tap to join — takes about a minute. ${opts.url}`;
}

/**
 * Open the native share sheet (or fallback) for an invite.
 * Returns true if the share completed.
 */
export async function shareInvite(opts: {
  url: string;
  babyName: string;
  inviterName?: string;
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
      return false;
    }
  }

  // Web fallback — try Web Share API, else copy to clipboard
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
