import Decimal from "decimal.js";

// Dedicated Decimal clone so global config changes elsewhere cannot affect money maths.
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_DOWN, toExpNeg: -30, toExpPos: 40 });
export type Dec = InstanceType<typeof D>;

const DECIMAL_RE = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

/** Parses a provider/user value into Decimal. Returns null for missing or malformed values (never guesses). */
export function toDecimal(value: unknown): Dec | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    // Numbers coming from JSON: use their shortest round-trip string representation.
    return new D(value.toString());
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (!/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(s)) return null;
    return new D(s);
  }
  return null;
}

/** Validates a user-entered positive amount string ("1000", "0.5"). Comma is accepted as decimal separator. */
export function parseUserAmount(input: string): Dec | null {
  const s = input.trim().replace(",", ".");
  if (!DECIMAL_RE.test(s)) return null;
  const d = new D(s);
  return d.gt(0) ? d : null;
}

/** Round down to asset precision — we never display more than the user can actually receive. */
export function floorTo(value: Dec, precision: number): Dec {
  return value.toDecimalPlaces(precision, D.ROUND_DOWN);
}

export function toPlainString(value: Dec): string {
  return value.toFixed();
}

export function subtractFees(gross: Dec, fees: Array<Dec | null | undefined>): Dec {
  return fees.reduce<Dec>((acc, f) => (f ? acc.minus(f) : acc), gross);
}

/** Percent difference (b relative to a), e.g. 0.5 means b is 0.5% bigger than a. */
export function percentDiff(a: Dec, b: Dec): Dec {
  if (a.isZero()) return new D(0);
  return b.minus(a).div(a).times(100);
}
