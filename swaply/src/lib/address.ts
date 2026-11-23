/**
 * Format-level address checks. They catch typos and wrong-network addresses
 * (e.g. an 0x… address for TRON). Final validation is done by the partner.
 */
const PATTERNS: Record<string, RegExp> = {
  TRON: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  ETHEREUM: /^0x[a-fA-F0-9]{40}$/,
  BSC: /^0x[a-fA-F0-9]{40}$/,
  BITCOIN: /^(bc1[ac-hj-np-z02-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/,
  LITECOIN: /^(ltc1[ac-hj-np-z02-9]{11,87}|[LM3][a-km-zA-HJ-NP-Z1-9]{26,33})$/,
  SOLANA: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  TON: /^(?:[EUk0]Q[A-Za-z0-9_-]{46}|-?[01]:[a-fA-F0-9]{64})$/,
};

export type AddressCheck = { valid: true } | { valid: false; reason: "empty" | "unsupported_network" | "format" | "too_long" };

export function validateAddressFormat(networkId: string, address: string): AddressCheck {
  const a = address.trim();
  if (!a) return { valid: false, reason: "empty" };
  if (a.length > 128) return { valid: false, reason: "too_long" };
  const re = PATTERNS[networkId];
  if (!re) return { valid: false, reason: "unsupported_network" };
  return re.test(a) ? { valid: true } : { valid: false, reason: "format" };
}

/** Memo/extra id: printable, short, no control chars. */
export function validateExtraId(value: string | undefined | null): boolean {
  if (value === undefined || value === null || value === "") return true;
  return /^[\x20-\x7E]{1,64}$/.test(value);
}
