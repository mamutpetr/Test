import { describe, expect, it } from "vitest";
import { parseIntent } from "@/server/assistant/parser";

describe("assistant parser (no LLM)", () => {
  it("parses the brief's example", () => {
    const r = parseIntent("Хочу поміняти 700 USDT TRC20 на гривні та отримати на українську картку");
    expect(r.request).toEqual({ fromAsset: "USDT", fromNetwork: "TRON", toAsset: "UAH", toNetwork: "CARD", amount: "700", country: "UA" });
  });
  it("parses English and destination networks", () => {
    const r = parseIntent("swap 0.5 BTC to USDT on ERC20");
    expect(r).toMatchObject({ fromAsset: "BTC", fromNetwork: "BITCOIN", toAsset: "USDT", toNetwork: "ETHEREUM", amount: "0.5" });
  });
  it("handles thousands shorthand", () => {
    expect(parseIntent("1.5k USDT trc20 в btc").amount).toBe("1500");
  });
  it("reports what is missing instead of guessing", () => {
    const r = parseIntent("хочу продати USDT");
    expect(r.request).toBeNull();
    expect(r.missing).toEqual(expect.arrayContaining(["fromNetwork", "toAsset", "amount"]));
  });
  it("never produces rates or addresses", () => {
    const r = parseIntent("700 USDT TRC20 на картку") as unknown as Record<string, unknown>;
    expect(Object.keys(r)).not.toContain("rate");
    expect(JSON.stringify(r)).not.toMatch(/address/i);
  });
});
