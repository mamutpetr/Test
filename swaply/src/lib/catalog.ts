/**
 * Canonical SWAPLY catalog. A tradeable "instrument" is always the pair (asset, network):
 * USDT on TRON and USDT on ETHEREUM are different instruments and are never compared as equal.
 * Which instruments a partner really supports is decided by the adapter from the partner's own
 * currency list — this file only defines identifiers and display data.
 */
export type AssetKind = "crypto" | "fiat";

export interface AssetDef {
  id: string;
  symbol: string;
  name: string;
  kind: AssetKind;
  /** Display precision (amounts are floored to this). */
  precision: number;
  networks: string[];
  color: string;
}

export interface NetworkDef {
  id: string;
  name: string;
  /** Token standard label users recognise, e.g. "TRC20". */
  standard?: string;
  chainIdentifier?: string;
  kind: "chain" | "fiat_rail";
  /** Plain-language hints, keyed by locale, shown in the network picker. */
  hint: { uk: string; en: string };
  /** True when the network requires a memo/extra id for some assets. */
  memoCommon?: boolean;
}

export const NETWORKS: Record<string, NetworkDef> = {
  TRON: { id: "TRON", name: "Tron", standard: "TRC20", kind: "chain", hint: { uk: "Низькі комісії, адреси починаються з T", en: "Low fees, addresses start with T" } },
  ETHEREUM: { id: "ETHEREUM", name: "Ethereum", standard: "ERC20", chainIdentifier: "1", kind: "chain", hint: { uk: "Найпоширеніша, але комісії вищі. Адреси 0x…", en: "Most common, higher fees. Addresses 0x…" } },
  BSC: { id: "BSC", name: "BNB Smart Chain", standard: "BEP20", chainIdentifier: "56", kind: "chain", hint: { uk: "Адреси 0x…, не плутати з Ethereum", en: "0x… addresses — not the same as Ethereum" } },
  TON: { id: "TON", name: "TON", kind: "chain", memoCommon: true, hint: { uk: "Біржі часто вимагають memo/comment", en: "Exchanges often require a memo/comment" } },
  SOLANA: { id: "SOLANA", name: "Solana", standard: "SPL", kind: "chain", hint: { uk: "Швидка мережа, низькі комісії", en: "Fast network, low fees" } },
  BITCOIN: { id: "BITCOIN", name: "Bitcoin", kind: "chain", hint: { uk: "Основна мережа Bitcoin", en: "Bitcoin mainnet" } },
  LITECOIN: { id: "LITECOIN", name: "Litecoin", kind: "chain", hint: { uk: "Основна мережа Litecoin", en: "Litecoin mainnet" } },
  CARD: { id: "CARD", name: "Bank card", kind: "fiat_rail", hint: { uk: "Виплата на банківську картку", en: "Payout to a bank card" } },
  BANK_TRANSFER: { id: "BANK_TRANSFER", name: "Bank transfer", kind: "fiat_rail", hint: { uk: "Банківський переказ (IBAN)", en: "Bank transfer (IBAN)" } },
};

export const ASSETS: Record<string, AssetDef> = {
  USDT: { id: "USDT", symbol: "USDT", name: "Tether", kind: "crypto", precision: 6, networks: ["TRON", "ETHEREUM", "TON", "SOLANA", "BSC"], color: "#26A17B" },
  USDC: { id: "USDC", symbol: "USDC", name: "USD Coin", kind: "crypto", precision: 6, networks: ["ETHEREUM", "SOLANA", "BSC"], color: "#2775CA" },
  BTC: { id: "BTC", symbol: "BTC", name: "Bitcoin", kind: "crypto", precision: 8, networks: ["BITCOIN"], color: "#F7931A" },
  ETH: { id: "ETH", symbol: "ETH", name: "Ethereum", kind: "crypto", precision: 8, networks: ["ETHEREUM"], color: "#8A92B2" },
  SOL: { id: "SOL", symbol: "SOL", name: "Solana", kind: "crypto", precision: 6, networks: ["SOLANA"], color: "#14F195" },
  LTC: { id: "LTC", symbol: "LTC", name: "Litecoin", kind: "crypto", precision: 8, networks: ["LITECOIN"], color: "#345D9D" },
  TRX: { id: "TRX", symbol: "TRX", name: "TRON", kind: "crypto", precision: 6, networks: ["TRON"], color: "#EF0027" },
  UAH: { id: "UAH", symbol: "UAH", name: "Українська гривня", kind: "fiat", precision: 2, networks: ["CARD", "BANK_TRANSFER"], color: "#FFD500" },
  USD: { id: "USD", symbol: "USD", name: "US Dollar", kind: "fiat", precision: 2, networks: ["CARD", "BANK_TRANSFER"], color: "#85BB65" },
  EUR: { id: "EUR", symbol: "EUR", name: "Euro", kind: "fiat", precision: 2, networks: ["CARD", "BANK_TRANSFER"], color: "#3B5BDB" },
};

export const ASSET_IDS = Object.keys(ASSETS);
export const NETWORK_IDS = Object.keys(NETWORKS);

export function isValidInstrument(assetId: string, networkId: string): boolean {
  return !!ASSETS[assetId]?.networks.includes(networkId);
}

export function instrumentKey(assetId: string, networkId: string) {
  return `${assetId}:${networkId}`;
}

export function routeKey(fromAsset: string, fromNetwork: string, toAsset: string, toNetwork: string) {
  return `${instrumentKey(fromAsset, fromNetwork)}->${instrumentKey(toAsset, toNetwork)}`;
}

export function networkLabel(networkId: string): string {
  const n = NETWORKS[networkId];
  if (!n) return networkId;
  return n.standard ? `${n.name} (${n.standard})` : n.name;
}

/** Fiat payout countries we plan for. Availability is decided per partner, never assumed. */
export const COUNTRIES = ["UA", "PL", "DE", "US", "GB", "OTHER"] as const;
export type Country = (typeof COUNTRIES)[number];
