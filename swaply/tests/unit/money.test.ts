import { describe, expect, it } from "vitest";
import { D, floorTo, parseUserAmount, percentDiff, subtractFees, toDecimal } from "@/lib/money";
import { formatAmount } from "@/lib/format";

describe("decimal money maths", () => {
  it("avoids floating point errors", () => {
    expect(new D("0.1").plus("0.2").toFixed()).toBe("0.3");
    expect(0.1 + 0.2).not.toBe(0.3); // the reason we use decimals
    expect(new D("1000").times("0.000010457891").toFixed()).toBe("0.010457891");
  });
  it("parses user amounts strictly", () => {
    expect(parseUserAmount("1000")?.toFixed()).toBe("1000");
    expect(parseUserAmount("0,5")?.toFixed()).toBe("0.5");
    for (const bad of ["", "0", "-1", "1e3", "01", "1.2.3", "abc", " "]) expect(parseUserAmount(bad)).toBeNull();
  });
  it("parses provider values without inventing", () => {
    expect(toDecimal(3434.835033)?.toFixed()).toBe("3434.835033");
    expect(toDecimal("0.0001302")?.toFixed()).toBe("0.0001302");
    expect(toDecimal(null)).toBeNull();
    expect(toDecimal(undefined)).toBeNull();
    expect(toDecimal("n/a")).toBeNull();
    expect(toDecimal(Number.NaN)).toBeNull();
  });
  it("floors to asset precision (never rounds up what the user receives)", () => {
    expect(floorTo(new D("1.23456789"), 6).toFixed()).toBe("1.234567");
    expect(floorTo(new D("40975.109"), 2).toFixed()).toBe("40975.1");
  });
  it("subtracts known fees and percent diff", () => {
    expect(subtractFees(new D("0.1085994"), [new D("0.00180019"), null]).toFixed()).toBe("0.10679921");
    expect(percentDiff(new D("100"), new D("99.5")).toFixed()).toBe("-0.5");
  });
  it("formats without float conversion", () => {
    expect(formatAmount("40975.10", 2, "uk")).toBe("40 975,1");
    expect(formatAmount("1234567.123456789", 8, "en")).toBe("1,234,567.12345678");
    expect(formatAmount("0.00001000", 8, "en")).toBe("0.00001");
  });
});
