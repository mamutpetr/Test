import { describe, expect, it } from "vitest";
import { validateAddressFormat, validateExtraId } from "@/lib/address";
import { rejectReason, validateRequest, ValidationError } from "@/server/aggregator/engine";
import { isSafeRedirect } from "@/server/referral/service";
import { isValidInstrument } from "@/lib/catalog";
import { D } from "@/lib/money";
import { q } from "./ranking.test";

describe("route validation", () => {
  it("treats token and network as separate dimensions", () => {
    expect(isValidInstrument("USDT", "TRON")).toBe(true);
    expect(isValidInstrument("USDT", "BITCOIN")).toBe(false);
    expect(isValidInstrument("USDC", "SOLANA")).toBe(true);
    expect(isValidInstrument("BTC", "ETHEREUM")).toBe(false);
  });
  it("accepts the main scenario", () => {
    const v = validateRequest({ fromAsset: "USDT", fromNetwork: "TRON", toAsset: "UAH", toNetwork: "CARD", amount: "1000", country: "UA" });
    expect(v.amountDec.toFixed()).toBe("1000");
    expect(v.rateType).toBe("any");
  });
  it.each([
    [{ fromAsset: "USDT", fromNetwork: "BITCOIN", toAsset: "BTC", toNetwork: "BITCOIN", amount: "1" }, "fromNetwork"],
    [{ fromAsset: "XXX", fromNetwork: "TRON", toAsset: "BTC", toNetwork: "BITCOIN", amount: "1" }, "fromAsset"],
    [{ fromAsset: "USDT", fromNetwork: "TRON", toAsset: "USDT", toNetwork: "TRON", amount: "1" }, "toAsset"],
    [{ fromAsset: "USDT", fromNetwork: "TRON", toAsset: "BTC", toNetwork: "BITCOIN", amount: "-5" }, "amount"],
    [{ fromAsset: "USDT", fromNetwork: "TRON", toAsset: "BTC", toNetwork: "BITCOIN", amount: "1.1234567" }, "amount"],
    [{ fromAsset: "UAH", fromNetwork: "CARD", toAsset: "BTC", toNetwork: "BITCOIN", amount: "1" }, "fromAsset"],
    [{ fromAsset: "USDT", fromNetwork: "TRON", toAsset: "BTC", toNetwork: "BITCOIN", amount: "1", evil: "x" }, "body"],
  ])("rejects invalid request %#", (input, field) => {
    try {
      validateRequest(input);
      throw new Error("expected failure");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      if (field !== "body") expect((e as ValidationError).field).toBe(field);
    }
  });
  it("drops invalid, mismatched, expired and out-of-range quotes", () => {
    const req = { fromAsset: "USDT", fromNetwork: "TRON", toAsset: "BTC", toNetwork: "BITCOIN", amount: new D("1000"), rateType: "any" as const };
    expect(rejectReason(q({ id: "ok", receive: "0.01" }), req)).toBeNull();
    expect(rejectReason(q({ id: "x", receive: "0" }), req)).toBe("non_positive_receive");
    expect(rejectReason(q({ id: "x", receive: "0.01", destinationNetwork: "ETHEREUM" }), req)).toBe("destination_mismatch");
    expect(rejectReason(q({ id: "x", receive: "0.01", sendAmount: "999" }), req)).toBe("amount_mismatch");
    expect(rejectReason(q({ id: "x", receive: "0.01", expiresAt: new Date(Date.now() - 1000).toISOString() }), req)).toBe("expired");
    expect(rejectReason(q({ id: "x", receive: "0.01", minAmount: "2000" }), req)).toBe("below_min");
    expect(rejectReason(q({ id: "x", receive: "0.01", maxAmount: "500" }), req)).toBe("above_max");
  });
});

describe("addresses", () => {
  it.each([
    ["TRON", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", true],
    ["TRON", "0x57f31ad4b64095347F87eDB1675566DAfF5EC886", false],
    ["ETHEREUM", "0x57f31ad4b64095347F87eDB1675566DAfF5EC886", true],
    ["BITCOIN", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", true],
    ["BITCOIN", "3M7QKsJDKbVZAhFPpFSVtVQv6Nzon3Lwtv", true],
    ["SOLANA", "So11111111111111111111111111111111111111112", true],
    ["TON", "EQD__________________________________________0vo", true],
    ["LITECOIN", "ltc1qg82h4m6nrfpd4dzw4ty6y5cwz2wfwg7d0q8h8z", true],
    ["ETHEREUM", "", false],
    ["CARD", "4111111111111111", false],
  ])("%s %s → %s", (net, addr, ok) => {
    expect(validateAddressFormat(net, addr).valid).toBe(ok);
  });
  it("validates memo", () => {
    expect(validateExtraId("123456")).toBe(true);
    expect(validateExtraId("a\nb")).toBe(false);
    expect(validateExtraId(undefined)).toBe(true);
  });
});

describe("redirect URL safety", () => {
  const hosts = ["swapzone.io"];
  it("only allows https on the provider's hosts", () => {
    expect(isSafeRedirect("https://swapzone.io/?refId=abc", hosts)).toBe(true);
    expect(isSafeRedirect("http://swapzone.io/?refId=abc", hosts)).toBe(false);
    expect(isSafeRedirect("https://swapzone.io.evil.com/", hosts)).toBe(false);
    expect(isSafeRedirect("https://user:pass@swapzone.io/", hosts)).toBe(false);
    expect(isSafeRedirect("javascript:alert(1)", hosts)).toBe(false);
    expect(isSafeRedirect("//swapzone.io", hosts)).toBe(false);
    expect(isSafeRedirect("http://localhost:3000/uk/demo-partner", ["localhost"], true)).toBe(true);
  });
});
