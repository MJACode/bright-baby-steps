// Shared time-display helpers for session timers and "last logged" hints.

// Compact elapsed duration for a running timer: "5m", "1h 23m".
export function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Compact relative time since an ISO/date string: "just now", "8m ago",
// "3h ago", "2d ago". Tuned to fit the tight quick-nav tiles.
export function formatAgo(iso: string): string {
  // Date-only values (YYYY-MM-DD, e.g. a Postgres DATE column) carry no time or
  // timezone — `new Date("2026-06-06")` parses as UTC midnight and would skew
  // the result by the local offset (showing "8h ago" for something logged
  // today). Compare calendar days in local time instead.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    const then = new Date(y, m - 1, d).getTime();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const days = Math.floor((todayStart - then) / 86_400_000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    return `${days}d ago`;
  }
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}
