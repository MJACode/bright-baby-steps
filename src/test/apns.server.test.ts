import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_APNS_TOPIC,
  JWT_TTL_MS,
  buildApnsJwt,
  getApnsJwt,
  importApnsKey,
  readApnsConfig,
  resetApnsJwtCache,
  sendApns,
  type ApnsConfig,
  type ApnsPayload,
} from "../../supabase/functions/_shared/apns";

// Server-side APNs sender, imported straight from supabase/functions/_shared
// (same pattern as signPlan.server.test.ts).

const TOKEN = "a".repeat(64);
const PAYLOAD: ApnsPayload = { aps: { alert: { title: "T", body: "B" }, sound: "default" } };

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

async function generateP8(): Promise<{ pem: string; publicKey: CryptoKey }> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const b64 = Buffer.from(der).toString("base64").replace(/(.{64})/g, "$1\n");
  return { pem: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`, publicKey: pair.publicKey };
}

let p8: { pem: string; publicKey: CryptoKey };
let config: ApnsConfig;

beforeEach(async () => {
  resetApnsJwtCache();
  p8 ??= await generateP8();
  config = { keyPem: p8.pem, keyId: "ABC123DEFG", teamId: "TEAM123456", topic: DEFAULT_APNS_TOPIC };
});

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

describe("readApnsConfig", () => {
  it("returns null when any required secret is missing", () => {
    const env: Record<string, string> = { APNS_KEY: "k", APNS_KEY_ID: "id" };
    expect(readApnsConfig((k) => env[k])).toBeNull();
  });

  it("defaults the topic and honours APNS_TOPIC", () => {
    const env: Record<string, string> = { APNS_KEY: "k", APNS_KEY_ID: "id", APNS_TEAM_ID: "team" };
    expect(readApnsConfig((k) => env[k])?.topic).toBe("com.graceflare.app");
    env.APNS_TOPIC = "com.example.other";
    expect(readApnsConfig((k) => env[k])?.topic).toBe("com.example.other");
  });
});

describe("ES256 provider token", () => {
  it("has the APNs header/claims shape and a valid P-256 signature", async () => {
    const key = await importApnsKey(p8.pem);
    const jwt = await buildApnsJwt(key, "ABC123DEFG", "TEAM123456", 1_760_000_000_123);
    const [h, c, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(b64urlDecode(h)).toString())).toEqual({ alg: "ES256", kid: "ABC123DEFG" });
    expect(JSON.parse(Buffer.from(b64urlDecode(c)).toString())).toEqual({ iss: "TEAM123456", iat: 1_760_000_000 });
    const sig = b64urlDecode(s);
    expect(sig.length).toBe(64); // raw r||s, not DER
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      p8.publicKey,
      sig,
      new TextEncoder().encode(`${h}.${c}`),
    );
    expect(ok).toBe(true);
  });

  it("accepts a PEM stored with literal \\n escapes", async () => {
    await expect(importApnsKey(p8.pem.replace(/\n/g, "\\n"))).resolves.toBeDefined();
  });

  it("caches the token for under the TTL and reissues after it", async () => {
    const t0 = 1_760_000_000_000;
    const a = await getApnsJwt(config, t0);
    expect(await getApnsJwt(config, t0 + JWT_TTL_MS - 1)).toBe(a);
    expect(await getApnsJwt(config, t0 + JWT_TTL_MS)).not.toBe(a);
  });
});

describe("sendApns", () => {
  it("is disabled, without fetching, when secrets are missing", async () => {
    const fetchImpl = vi.fn();
    expect(await sendApns(TOKEN, "production", PAYLOAD, { config: null, fetchImpl })).toEqual({
      status: "disabled",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("is disabled when Deno env has no APNS_* (default config path)", async () => {
    expect(await sendApns(TOKEN, "production", PAYLOAD, { fetchImpl: vi.fn() })).toEqual({ status: "disabled" });
  });

  it("posts to the production host with APNs headers", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200));
    const nowMs = 1_760_000_000_000;
    const res = await sendApns(TOKEN, "production", PAYLOAD, { config, fetchImpl, nowMs });
    expect(res).toEqual({ status: "sent" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.push.apple.com/3/device/${TOKEN}`);
    const headers = init.headers as Record<string, string>;
    expect(headers["apns-topic"]).toBe("com.graceflare.app");
    expect(headers["apns-push-type"]).toBe("alert");
    expect(headers["apns-priority"]).toBe("10");
    expect(headers["apns-expiration"]).toBe(String(nowMs / 1000 + 3 * 60 * 60));
    expect(headers.authorization).toMatch(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    expect(JSON.parse(init.body as string)).toEqual(PAYLOAD);
  });

  it("uses the sandbox host for sandbox tokens", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200));
    await sendApns(TOKEN, "sandbox", PAYLOAD, { config, fetchImpl });
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(
      `https://api.sandbox.push.apple.com/3/device/${TOKEN}`,
    );
  });

  it.each([
    [410, { reason: "Unregistered" }],
    [410, undefined],
    [400, { reason: "BadDeviceToken" }],
    [400, { reason: "DeviceTokenNotForTopic" }],
    [400, { reason: "Unregistered" }],
  ])("prunes on %i %j", async (status, body) => {
    const fetchImpl = vi.fn(async () => jsonResponse(status, body));
    expect((await sendApns(TOKEN, "production", PAYLOAD, { config, fetchImpl })).status).toBe("prune");
  });

  it.each([
    [400, { reason: "BadTopic" }],
    [429, { reason: "TooManyRequests" }],
    [500, { reason: "InternalServerError" }],
    [403, { reason: "ExpiredProviderToken" }],
  ])("keeps the token on %i %j", async (status, body) => {
    const fetchImpl = vi.fn(async () => jsonResponse(status, body));
    const res = await sendApns(TOKEN, "production", PAYLOAD, { config, fetchImpl });
    expect(res).toEqual({ status: "failed", httpStatus: status, reason: body.reason });
  });

  it("reports a network error as failed without throwing", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("connection reset");
    });
    expect(await sendApns(TOKEN, "production", PAYLOAD, { config, fetchImpl })).toEqual({
      status: "failed",
      httpStatus: null,
      reason: "network:TypeError",
    });
  });

  it("reports a malformed key as failed without throwing", async () => {
    const res = await sendApns(TOKEN, "production", PAYLOAD, {
      config: { ...config, keyPem: "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----" },
      fetchImpl: vi.fn(),
    });
    expect(res.status).toBe("failed");
  });
});
