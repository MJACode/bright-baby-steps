export function isRlsViewerDenied(err: unknown): boolean {
  return (err as { code?: string })?.code === "42501";
}

// Supabase PostgrestError is a plain object with `.message`, not an
// `Error` instance, so `instanceof Error` returns false. Catch blocks that
// gated on instanceof silently dropped the real error text and showed the
// generic fallback — making save-failure bugs un-debuggable from the
// destructive toast. Duck-type on `.message` instead.
export function getErrorMessage(err: unknown, fallback = ""): string {
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  return fallback;
}

export function rlsErrorToast(err: unknown): { title: string; description: string } | null {
  if (isRlsViewerDenied(err)) {
    return {
      title: "View-only access",
      description: "Ask the parent to upgrade your role to log entries.",
    };
  }
  return null;
}
