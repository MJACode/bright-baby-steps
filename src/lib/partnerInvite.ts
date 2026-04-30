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
