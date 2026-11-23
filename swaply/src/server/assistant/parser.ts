/**
 * Deterministic natural-language → search request parser (no LLM, no network).
 * It only extracts structure. All amounts/rates shown to the user come from the aggregation engine.
 * An LLM-backed parser can implement the same interface later (see ROADMAP.md); this one stays as fallback.
 */
import { ASSETS } from "@/lib/catalog";

export interface ParsedIntent {
  fromAsset: string | null;
  fromNetwork: string | null;
  toAsset: string | null;
  toNetwork: string | null;
  amount: string | null;
  country: string | null;
  missing: Array<"fromAsset" | "fromNetwork" | "toAsset" | "toNetwork" | "amount">;
  /** Ready to pass to POST /api/v1/quotes when `missing` is empty. */
  request: null | { fromAsset: string; fromNetwork: string; toAsset: string; toNetwork: string; amount: string; country?: string };
}

const ASSET_WORDS: Array<[RegExp, string]> = [
  [/\b(usdt|tether|теther|тезер|юсдт)\b/i, "USDT"],
  [/\b(usdc)\b/i, "USDC"],
  [/\b(btc|bitcoin|біткоін\w*|біткоїн\w*|биткоин\w*)\b/i, "BTC"],
  [/\b(eth|ether|ethereum|ефір\w*|эфир\w*)\b/i, "ETH"],
  [/\b(sol|solana|солан\w*)\b/i, "SOL"],
  [/\b(ltc|litecoin|лайткоін\w*|лайткоин\w*)\b/i, "LTC"],
  [/\b(trx|tron|трон\w*)\b/i, "TRX"],
  [/(\buah\b|гривн\w*|гривень|грн\b|₴)/i, "UAH"],
  [/(\busd\b|долар\w*|доллар\w*|\$)/i, "USD"],
  [/(\beur\b|євро|евро|€)/i, "EUR"],
];

const NETWORK_WORDS: Array<[RegExp, string]> = [
  [/\b(trc[- ]?20|tron)\b/i, "TRON"],
  [/\b(erc[- ]?20|ethereum)\b/i, "ETHEREUM"],
  [/\b(bep[- ]?20|bsc|bnb)\b/i, "BSC"],
  [/\b(ton)\b/i, "TON"],
  [/\b(spl|solana)\b/i, "SOLANA"],
];

const CARD_RE = /(карт\w*|card)/i;
const BANK_RE = /(iban|банківськ\w* переказ|bank transfer|рахун\w*)/i;
const UA_RE = /(україн\w*|ukrain\w*|укр\w*)/i;

interface Hit {
  asset: string;
  index: number;
}

function findAssets(text: string): Hit[] {
  const hits: Hit[] = [];
  for (const [re, asset] of ASSET_WORDS) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = g.exec(text))) {
      // "tron" as a network word next to USDT must not become TRX
      if (asset === "TRX" && /tron/i.test(m[0]) && /usdt|usdc/i.test(text)) continue;
      hits.push({ asset, index: m.index });
    }
  }
  return hits.sort((a, b) => a.index - b.index).filter((h, i, arr) => i === 0 || arr[i - 1]!.asset !== h.asset);
}

export function parseIntent(input: string): ParsedIntent {
  const text = input.slice(0, 500);
  const amountMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(k|к|тис\.?|тисяч\w*)?/i);
  let amount: string | null = null;
  if (amountMatch) {
    const base = Number(amountMatch[1]!.replace(",", "."));
    const mult = amountMatch[2] ? 1000 : 1;
    if (base > 0 && Number.isFinite(base)) amount = String(+(base * mult).toFixed(8));
  }

  const assets = findAssets(text);
  // "на"/"to"/"into" marks the destination
  const toMarker = text.search(/\s(на|в|to|into|for)\s/i);
  let fromAsset: string | null = null;
  let toAsset: string | null = null;
  if (assets.length >= 2) {
    fromAsset = assets[0]!.asset;
    toAsset = assets.find((a) => a.asset !== fromAsset)!.asset;
  } else if (assets.length === 1) {
    const only = assets[0]!;
    if (toMarker >= 0 && only.index > toMarker) toAsset = only.asset;
    else fromAsset = only.asset;
  }

  let fromNetwork: string | null = null;
  if (fromAsset) {
    const def = ASSETS[fromAsset]!;
    if (def.networks.length === 1) fromNetwork = def.networks[0]!;
    else for (const [re, n] of NETWORK_WORDS) if (re.test(text) && def.networks.includes(n)) { fromNetwork = n; break; }
  }

  let toNetwork: string | null = null;
  if (toAsset) {
    const def = ASSETS[toAsset]!;
    if (def.kind === "fiat") toNetwork = BANK_RE.test(text) ? "BANK_TRANSFER" : CARD_RE.test(text) ? "CARD" : null;
    else if (def.networks.length === 1) toNetwork = def.networks[0]!;
    else {
      // network words after the destination marker apply to the destination
      const tail = toMarker >= 0 ? text.slice(toMarker) : "";
      for (const [re, n] of NETWORK_WORDS) if (re.test(tail) && def.networks.includes(n)) { toNetwork = n; break; }
    }
  }

  const country = UA_RE.test(text) || toAsset === "UAH" ? "UA" : null;
  const missing: ParsedIntent["missing"] = [];
  if (!fromAsset) missing.push("fromAsset");
  if (!fromNetwork) missing.push("fromNetwork");
  if (!toAsset) missing.push("toAsset");
  if (!toNetwork) missing.push("toNetwork");
  if (!amount) missing.push("amount");

  return {
    fromAsset,
    fromNetwork,
    toAsset,
    toNetwork,
    amount,
    country,
    missing,
    request: missing.length === 0 ? { fromAsset: fromAsset!, fromNetwork: fromNetwork!, toAsset: toAsset!, toNetwork: toNetwork!, amount: amount!, ...(country ? { country } : {}) } : null,
  };
}
