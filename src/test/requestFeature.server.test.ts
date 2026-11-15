import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_TO_EMAIL,
  escapeHtml,
  feedbackMessage,
  handleRequestFeature,
  type RequestFeatureDeps,
  type UserClientLike,
} from "../../supabase/functions/_shared/requestFeature";

// Locks the request-feature edge function contract (same import-from-_shared
// pattern as storagePurge.server.test.ts). A fake supabase client models
// auth.getUser and the feedback table; a fake fetch models Resend.

const UID = "11111111-2222-4333-8444-555555555555";
const NOW = new Date("2026-11-15T12:00:00.000Z");

type Row = { user_id: string; message: string; created_at: string };

function fakeClient(opts: {
  user?: { id: string; email?: string | null } | null;
  insertError?: string;
  rows?: Row[];
}) {
  const rows: Row[] = opts.rows ?? [];
  const inserts: { user_id: string; message: string }[] = [];
  const client: UserClientLike = {
    auth: {
      async getUser() {
        return opts.user
          ? { data: { user: opts.user }, error: null }
          : { data: { user: null }, error: { message: "invalid JWT" } };
      },
    },
    from() {
      return {
        async insert(row) {
          if (opts.insertError) return { error: { message: opts.insertError } };
          inserts.push(row);
          rows.push({ ...row, created_at: NOW.toISOString() });
          return { error: null };
        },
        select() {
          const f: Record<string, string> = {};
          return {
            eq(c1, v1) {
              f[c1] = v1;
              return {
                eq(c2, v2) {
                  f[c2] = v2;
                  return {
                    gte(_c, since) {
                      return {
                        async limit(n) {
                          const data = rows
                            .filter((r) => r.user_id === f.user_id && r.message === f.message && r.created_at >= since)
                            .slice(0, n);
                          return { data, error: null };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, inserts, rows };
}

function deps(
  client: UserClientLike,
  over: { env?: Record<string, string | undefined>; fetch?: RequestFeatureDeps["fetch"] } = {},
) {
  const env: Record<string, string | undefined> = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon",
    RESEND_API_KEY: "re_test",
    VPC_FROM_EMAIL: "Grace Flare <noreply@graceflare.com>",
    ...over.env,
  };
  const fetchMock = vi.fn(over.fetch ?? (async () => new Response("{}", { status: 200 })));
  const createUserClient = vi.fn(() => client);
  const d: RequestFeatureDeps = {
    env: (k) => env[k],
    createUserClient,
    fetch: fetchMock as unknown as RequestFeatureDeps["fetch"],
    now: () => NOW,
  };
  return { d, fetchMock, createUserClient };
}

function post(body: unknown, auth: string | null = "Bearer user.jwt"): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = auth;
  return new Request("https://fn.local/request-feature", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

afterEach(() => vi.restoreAllMocks());

describe("request-feature", () => {
  it("OPTIONS returns CORS preflight", async () => {
    const { client } = fakeClient({ user: { id: UID } });
    const res = await handleRequestFeature(
      new Request("https://fn.local/request-feature", { method: "OPTIONS" }),
      deps(client).d,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("no Authorization header -> 401, nothing saved or sent", async () => {
    const { client, inserts } = fakeClient({ user: { id: UID } });
    const { d, fetchMock } = deps(client);
    const res = await handleRequestFeature(post({ feature: "baby-signs" }, null), d);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(inserts).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("invalid JWT (getUser fails) -> 401", async () => {
    const { client, inserts } = fakeClient({ user: null });
    const res = await handleRequestFeature(post({ feature: "baby-signs" }), deps(client).d);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(inserts).toHaveLength(0);
  });

  it.each([
    [{ feature: "speech-class" }],
    [{ feature: "constructor" }],
    [{ feature: "__proto__" }],
    [{}],
    [{ feature: 1 }],
    ["not json"],
  ])("unknown feature %j -> 400", async (body) => {
    const { client, inserts } = fakeClient({ user: { id: UID } });
    const { d, fetchMock } = deps(client);
    const res = await handleRequestFeature(post(body), d);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "unknown_feature" });
    expect(inserts).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("happy path: inserts as the user and emails the founder", async () => {
    const { client, inserts } = fakeClient({ user: { id: UID, email: "parent@example.com" } });
    const { d, fetchMock, createUserClient } = deps(client);
    const res = await handleRequestFeature(post({ feature: "baby-signs" }), d);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, emailed: true });
    // User-scoped client: anon key + caller's JWT, never the service role.
    expect(createUserClient).toHaveBeenCalledWith("https://example.supabase.co", "anon", "Bearer user.jwt");
    expect(inserts).toEqual([{ user_id: UID, message: "[Feature request] baby-signs" }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    const sent = JSON.parse(init.body as string);
    expect(sent.to).toEqual([DEFAULT_TO_EMAIL]);
    expect(sent.reply_to).toBe("parent@example.com");
    expect(sent.subject).toBe("Early-access request: Sign Language");
    for (const part of [sent.text, sent.html]) {
      expect(part).toContain("Sign Language");
      expect(part).toContain("parent@example.com");
      expect(part).toContain(UID);
      expect(part).toContain("2026-11-15T12:00:00.000Z");
    }
  });

  it("FEATURE_REQUEST_TO_EMAIL overrides the recipient", async () => {
    const { client } = fakeClient({ user: { id: UID, email: "p@example.com" } });
    const { d, fetchMock } = deps(client, { env: { FEATURE_REQUEST_TO_EMAIL: "ops@graceflare.com" } });
    await handleRequestFeature(post({ feature: "baby-signs" }), d);
    const sent = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(sent.to).toEqual(["ops@graceflare.com"]);
  });

  it("escapes the account email in the HTML part", async () => {
    const nasty = `x"<a href="https://evil">y</a>@example.com`;
    const { client } = fakeClient({ user: { id: UID, email: nasty } });
    const { d, fetchMock } = deps(client);
    await handleRequestFeature(post({ feature: "baby-signs" }), d);
    const sent = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(sent.html).not.toContain("<a href");
    expect(sent.html).toContain(escapeHtml(nasty));
  });

  it("Resend failure -> 200 emailed:false, record still saved, no email in logs", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, inserts } = fakeClient({ user: { id: UID, email: "parent@example.com" } });
    const { d } = deps(client, {
      fetch: async () => new Response('{"message":"bad to: parent@example.com"}', { status: 422 }),
    });
    const res = await handleRequestFeature(post({ feature: "baby-signs" }), d);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, emailed: false });
    expect(inserts).toHaveLength(1);
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain("parent@example.com");
  });

  it("Resend network error -> 200 emailed:false", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, inserts } = fakeClient({ user: { id: UID } });
    const { d } = deps(client, {
      fetch: async () => {
        throw new Error("network");
      },
    });
    const res = await handleRequestFeature(post({ feature: "baby-signs" }), d);
    expect(await res.json()).toEqual({ ok: true, emailed: false });
    expect(inserts).toHaveLength(1);
  });

  it("RESEND_API_KEY unset -> 200 emailed:false, no fetch", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, inserts } = fakeClient({ user: { id: UID } });
    const { d, fetchMock } = deps(client, { env: { RESEND_API_KEY: undefined } });
    const res = await handleRequestFeature(post({ feature: "baby-signs" }), d);
    expect(await res.json()).toEqual({ ok: true, emailed: false });
    expect(inserts).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("insert failure -> 500 save_failed, no email", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient({ user: { id: UID }, insertError: "new row violates row-level security" });
    const { d, fetchMock } = deps(client);
    const res = await handleRequestFeature(post({ feature: "baby-signs" }), d);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "save_failed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("repeat request within 24h -> ok, no second row, no second email", async () => {
    const { client, inserts } = fakeClient({
      user: { id: UID },
      rows: [{ user_id: UID, message: feedbackMessage("baby-signs"), created_at: "2026-11-15T01:00:00.000Z" }],
    });
    const { d, fetchMock } = deps(client);
    const res = await handleRequestFeature(post({ feature: "baby-signs" }), d);
    expect(await res.json()).toEqual({ ok: true, emailed: false });
    expect(inserts).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("request older than 24h does not suppress a new one", async () => {
    const { client, inserts } = fakeClient({
      user: { id: UID },
      rows: [{ user_id: UID, message: feedbackMessage("baby-signs"), created_at: "2026-11-14T11:00:00.000Z" }],
    });
    const res = await handleRequestFeature(post({ feature: "baby-signs" }), deps(client).d);
    expect(await res.json()).toEqual({ ok: true, emailed: true });
    expect(inserts).toHaveLength(1);
  });
});
