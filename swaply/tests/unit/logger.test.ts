import { describe, expect, it } from "vitest";
import { redact } from "@/lib/logger";
import { changellySign } from "@/server/providers/changelly/adapter";
import { parseDurationRange } from "@/server/providers/shared";
import crypto from "node:crypto";

describe("safe logging", () => {
  it("redacts secrets, addresses and query strings", () => {
    const out = redact({ apiKey: "k", headers: { "x-api-key": "secret", Authorization: "Bearer x" }, payoutAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", url: "https://api.x.io/v1/a?api_key=123" }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toMatch(/secret|Bearer x|123|qjeKQxGTCi8/);
    expect(out.apiKey).toBe("[redacted]");
  });
});

describe("Changelly request signing (per docs)", () => {
  it("produces X-Api-Key = sha256(pkcs1 public key) and a verifiable RSA-SHA256 signature", () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const hex = privateKey.export({ format: "der", type: "pkcs8" }).toString("hex");
    const body = JSON.stringify({ jsonrpc: "2.0", id: "test", method: "getCurrencies" });
    const s = changellySign(hex, body);
    expect(s.apiKey).toBe(crypto.createHash("sha256").update(publicKey.export({ type: "pkcs1", format: "der" })).digest("base64"));
    expect(crypto.verify("sha256", Buffer.from(body), publicKey, Buffer.from(s.signature, "base64"))).toBe(true);
  });
});

describe("duration parsing", () => {
  it("parses ChangeNOW transactionSpeedForecast", () => {
    expect(parseDurationRange("10-60")).toEqual({ minMinutes: 10, maxMinutes: 60 });
    expect(parseDurationRange(null)).toBeNull();
    expect(parseDurationRange("soon")).toBeNull();
    expect(parseDurationRange("60-10")).toBeNull();
  });
});
