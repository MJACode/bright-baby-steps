import { supabase } from "@/integrations/supabase/client";

export type VpcGateStatus =
  | { kind: "completed" }
  | { kind: "first_pending" }
  | { kind: "second_email_sent"; expiresAt: string }
  | { kind: "error"; message: string };

export async function checkAndRequestVpc(userId: string): Promise<VpcGateStatus> {
  type ProfileRow = {
    vpc_completed_at: string | null;
    vpc_first_confirmation_at: string | null;
    vpc_second_token_expires_at: string | null;
  };

  const { data, error } = await supabase
    .from("profiles")
    .select("vpc_completed_at, vpc_first_confirmation_at, vpc_second_token_expires_at")
    .eq("id", userId)
    .maybeSingle<ProfileRow>();

  if (error) return { kind: "error", message: error.message };
  if (!data) return { kind: "error", message: "Profile not found." };

  if (data.vpc_completed_at) return { kind: "completed" };
  if (!data.vpc_first_confirmation_at) return { kind: "first_pending" };

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { kind: "error", message: "You need to be signed in to continue." };

  const url = `${import.meta.env.VITE_SUPABASE_URL ?? "https://ieuznbvvwdvhtirzwkly.supabase.co"}/functions/v1/send-vpc-email`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const body = (await resp.json()) as {
      ok?: boolean;
      already_completed?: boolean;
      error?: string;
      expires_at?: string;
    };

    if (body.already_completed) return { kind: "completed" };
    if (resp.ok && body.ok && body.expires_at) {
      return { kind: "second_email_sent", expiresAt: body.expires_at };
    }
    return { kind: "error", message: body.error ?? `HTTP ${resp.status}` };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : "Network error" };
  }
}
