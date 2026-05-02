export function isRlsViewerDenied(err: unknown): boolean {
  return (err as { code?: string })?.code === "42501";
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
