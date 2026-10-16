// src/lib/partnerInvite.ts
// Helpers for creating + sharing partner invites.
// Used by OnboardingWizard and PartnerManagement.

import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { Clipboard } from "@capacitor/clipboard";
import { supabase } from "@/integrations/supabase/client";
import { APP_URL } from "@/lib/appUrl";

export type PartnerRole = "coparent" | "caregiver";

export const PARTNER_ROLES: PartnerRole[] = ["coparent", "caregiver"];

export const ROLE_COPY: Record<PartnerRole, { title: string; desc: string; sub: string }> = {
  coparent: {
    title: "Co-parent",
    desc: "Full access. Logs and edits everything.",
    sub: "Same access as you",
  },
  caregiver: {
    title: "Caregiver",
    desc: "Logs feeds, sleep, diapers — but not finance or settings.",
    sub: "Nanny · Sitter · Grandparent",
  },
};

/** The two options a Flare+ owner picks between for a caregiver. */
export const CAREGIVER_COACH_COPY = {
  off: { title: "Log only", desc: "Logs feeds, sleep and diapers." },
  on: { title: "Log + sleep & feed coach", desc: "Also sees when the next nap and feed are likely." },
} as const;

/**
 * Defensive: the column is NOT NULL DEFAULT 'coparent' and new viewer rows are
 * blocked by a CHECK. A legacy 'viewer' maps to caregiver, the remaining role
 * with the least access, so the UI never overstates what someone can do.
 */
export function toPartnerRole(raw: string | null | undefined): PartnerRole {
  return raw === "caregiver" || raw === "viewer" ? "caregiver" : "coparent";
}

/** "a@b.com is now a Caregiver." */
export function roleChangedMessage(who: string, role: PartnerRole): string {
  return `${who} is now a ${ROLE_COPY[role].title}.`;
}

/**
 * Whether a caregiver should see the sleep & feed coach. The stored flag is
 * kept when Flare+ lapses and applies again on renewal, so the owner's plan is
 * checked separately at read time.
 */
export function caregiverSeesCoach(opts: {
  role: string | null | undefined;
  caregiverCoach: boolean;
  isChildOwnerPremium: boolean;
}): boolean {
  return opts.role === "caregiver" && opts.caregiverCoach && opts.isChildOwnerPremium;
}

/**
 * Additional users beyond the account owner. Free: 1 (typically the co-parent).
 * Flare+: 4 (a co-parent plus up to three caregivers). When Flare+ lapses, the longest-standing partner keeps access and
 * anyone beyond the free seat is on hold until renewal. Mirrors
 * `partner_seat_limit()` in migration 20261016000000 — change both together.
 */
export const FREE_ADDITIONAL_USERS = 1;
export const MAX_ADDITIONAL_USERS = 4;

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
  const limit = opts.isPremium ? MAX_ADDITIONAL_USERS : FREE_ADDITIONAL_USERS;
  const used = opts.partnerCount + opts.pendingInviteCount;
  const remaining = Math.max(0, limit - used);
  return { used, limit, remaining, canInvite: remaining > 0 };
}

/**
 * The seat triggers and RPCs raise machine-readable prefixes so the UI can say
 * something useful instead of "Something went wrong". Anything unrecognized
 * falls back to `fallback`.
 */
export function describePartnerError(
  err: unknown,
  fallback: string,
  /** The invitee can't free a seat or upgrade, so they get different advice. */
  audience: "owner" | "invitee" = "owner",
): string {
  const message =
    typeof err === "string"
      ? err
      : ((err as { message?: string } | null)?.message ?? "");

  if (message.includes("FLARE_PLUS_REQUIRED")) {
    return "This account can't add more people right now.";
  }
  if (message.includes("SEAT_LIMIT_REACHED")) {
    if (audience === "invitee") {
      return "This account has no free seats right now. Ask the person who invited you to free one up, then try the link again.";
    }
    // The server says which plan's limit was hit; the free-plan message
    // mentions "free plan".
    return message.includes("free plan")
      ? `The free plan includes ${FREE_ADDITIONAL_USERS} additional person. Remove someone, or upgrade to Flare+ for ${MAX_ADDITIONAL_USERS}.`
      : `Flare+ includes ${MAX_ADDITIONAL_USERS} additional people. Remove someone to free up a spot.`;
  }
  if (message.includes("CONSENT_REQUIRED")) {
    return "Check the box to confirm you agree before joining.";
  }
  if (message.includes("Invalid or expired")) {
    return "This invite has expired or has already been used.";
  }
  if (message.includes("Cannot accept your own")) {
    return "You can't accept your own invite.";
  }
  return fallback;
}

/**
 * An invite link opened while signed out stashes its code here, and Auth
 * sends the user back to /invite/:code after login. localStorage (not
 * sessionStorage) so it survives a Capacitor WebView cold-start from a deep
 * link. Both sides go through these helpers so the key and storage can't drift.
 *
 * Signup also copies the code into user_metadata.pending_invite, because the
 * confirmation email is often opened in a different browser (Gmail's in-app
 * browser) whose localStorage never saw the stash.
 */
const PENDING_INVITE_KEY = "pending_invite";
/** Matches the invite lifetime; an older stash is a dead link, not an intent. */
const PENDING_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function stashPendingInvite(code: string, now: number = Date.now()): void {
  try {
    localStorage.setItem(PENDING_INVITE_KEY, JSON.stringify({ code, at: now }));
    // The invite is the user's newest intent; an older post-login redirect
    // would otherwise fire on some later login.
    localStorage.removeItem("post_login_redirect");
  } catch {
    // Storage unavailable (private mode); the user can reopen the link.
  }
}

/**
 * Reads the stashed invite code without clearing it — safe to call during
 * render. AcceptInvite clears it once a signed-in user reaches the invite.
 */
export function peekPendingInvite(now: number = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(PENDING_INVITE_KEY);
    if (!raw) return null;
    const { code, at } = JSON.parse(raw) as { code?: unknown; at?: unknown };
    if (typeof code !== "string" || !code || typeof at !== "number") return null;
    return now - at > PENDING_INVITE_TTL_MS ? null : code;
  } catch {
    // Unavailable storage, or a pre-JSON value from an older build.
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    localStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // Nothing to clear.
  }
}

/**
 * Pulls the invite code out of whatever an invitee pastes: a full invite URL
 * (web or the graceflare:// deep link, with or without a trailing slash or
 * query), the whole share-sheet message that contains one, or a bare code.
 * Deliberately loose about the code itself; AcceptInvite owns telling an
 * invalid or expired code apart from a good one.
 */
const INVITE_PATH_CODE = /\/invite\/([A-Za-z0-9_-]+)/;
const BARE_INVITE_CODE = /^[A-Za-z0-9_-]+$/;

export function parseInviteCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const fromPath = trimmed.match(INVITE_PATH_CODE);
  if (fromPath) return fromPath[1];
  return BARE_INVITE_CODE.test(trimmed) ? trimmed : null;
}

export interface CreateInviteArgs {
  ownerId: string;
  role: PartnerRole;
  /** Only stored for a caregiver; callers pass true only when the owner has Flare+. */
  caregiverCoach?: boolean;
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
  caregiverCoach = false,
  label,
}: CreateInviteArgs): Promise<InviteResult> {
  const { data, error } = await supabase
    .from("partner_invitations")
    .insert({
      owner_id: ownerId,
      role,
      caregiver_coach: role === "caregiver" && caregiverCoach,
      invitee_label: label ?? null,
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
  inviterName?: string;
  role: PartnerRole;
  url: string;
}) {
  const r = opts.role === "coparent" ? "co-parent" : "caregiver";
  const inviter = opts.inviterName ?? "I";
  return `${inviter} just set up a profile for ${opts.babyName} on Grace Flare and added you as ${r}. Tap to join — takes about a minute. ${opts.url}`;
}

export function inviteUrl(inviteCode: string): string {
  return `${APP_URL}/invite/${inviteCode}`;
}

/**
 * Open the native share sheet (or fallback) for an invite.
 * "copied" means no share sheet was available and the full message went to
 * the clipboard instead, so the caller must tell the user to paste it.
 */
export type ShareInviteResult = "shared" | "copied" | "dismissed";

export async function shareInvite(opts: {
  url: string;
  babyName: string;
  inviterName?: string;
  role: PartnerRole;
}): Promise<ShareInviteResult> {
  const text = buildInviteMessage(opts);

  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({
        title: `Tracking ${opts.babyName} together`,
        text,
        url: opts.url,
        dialogTitle: "Send invite",
      });
      return "shared";
    } catch {
      return "dismissed";
    }
  }

  // Web fallback — try Web Share API, else copy to clipboard
  if (navigator.share) {
    try {
      await navigator.share({ title: opts.babyName, text, url: opts.url });
      return "shared";
    } catch (err) {
      // The user closed the share sheet — don't copy behind their back.
      if (err instanceof DOMException && err.name === "AbortError") return "dismissed";
      /* any other failure: fall through to copy */
    }
  }
  await navigator.clipboard.writeText(text);
  return "copied";
}

/** Copy just the URL — used by the QR / "show on screen" path. */
export async function copyInviteUrl(url: string) {
  if (Capacitor.isNativePlatform()) {
    await Clipboard.write({ string: url });
  } else {
    await navigator.clipboard.writeText(url);
  }
}
