import { Capacitor } from "@capacitor/core";

export const PRODUCTION_APP_URL = "https://graceflare.com";

/**
 * The public URL used for anything a user shares or pastes elsewhere (invite
 * links, the Claude MCP URL). Inside the iOS app window.location.origin is
 * graceflare://localhost, which nobody else can open, so native builds use the
 * production domain unless VITE_APP_URL overrides it.
 */
export function resolveAppUrl(opts: {
  envUrl: string | undefined;
  isNative: boolean;
  origin: string;
}): string {
  if (opts.envUrl) return opts.envUrl;
  return opts.isNative ? PRODUCTION_APP_URL : opts.origin;
}

export const APP_URL = resolveAppUrl({
  envUrl: import.meta.env.VITE_APP_URL,
  isNative: Capacitor.isNativePlatform(),
  origin: typeof window !== "undefined" ? window.location.origin : "",
});
