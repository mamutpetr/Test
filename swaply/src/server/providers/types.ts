import type { Dec } from "@/lib/money";

export type RateType = "fixed" | "floating";
export type ExecutionMode = "redirect" | "embedded";
/**
 * KYC as declared by the partner. "none_declared" means the partner states no verification for
 * regular operations — it is NOT a guarantee that no checks will happen (AML holds are possible).
 */
export type KycRequirement = "none_declared" | "may_be_required" | "required" | "unknown";

export type FeeType = "network" | "deposit" | "withdrawal" | "exchange" | "partner_extra";

export interface KnownFee {
  type: FeeType;
  /** Decimal string, or null when the partner says a fee exists but not how much. */
  amount: string | null;
  currency: string;
  /** Whether the fee is already deducted from estimatedReceiveAmount. "unknown" = partner does not say. */
  includedInReceive: boolean | "unknown";
  note?: string;
}

export interface ProviderInstrument {
  assetId: string;
  networkId: string;
  providerAssetCode: string;
  providerNetworkCode: string | null;
  fixedRate: boolean | null;
  canSend: boolean;
  canReceive: boolean;
  memoSupported: boolean | null;
}

export interface ProviderCapabilities {
  rateTypes: RateType[];
  /** Modes SWAPLY can technically offer right now with the current configuration. */
  executionModes: ExecutionMode[];
  /** The partner API officially supports creating exchanges for third-party platforms. */
  embeddedSupportedByApi: boolean;
  statusTracking: boolean;
  fiatPayout: boolean;
  referral: { supported: boolean; configured: boolean; format: string };
  requiresApiKey: boolean;
  configured: boolean;
  /** Partner itself aggregates other exchange services (e.g. Swapzone). */
  isAggregator: boolean;
  docsUrl: string;
  notes: string[];
}

export interface QuoteRequest {
  fromAsset: string;
  fromNetwork: string;
  toAsset: string;
  toNetwork: string;
  /** Amount the user sends, in fromAsset units. */
  amount: Dec;
  rateType: RateType | "any";
  /** ISO 3166 alpha-2 of the user's country, when known (used for partner availability filters). */
  country?: string;
}

/** Normalised offer. Every value comes from the partner response or is null — never invented. */
export interface NormalizedQuote {
  providerId: string;
  providerName: string;
  /** Service that actually performs the exchange when the provider is an aggregator. */
  executingPartner: { id: string; name: string } | null;
  quoteId: string;
  sourceAsset: string;
  sourceNetwork: string;
  destinationAsset: string;
  destinationNetwork: string;
  sendAmount: string;
  /** Amount the user is expected to receive after all fees known to be deducted. Used for ranking. */
  estimatedReceiveAmount: string;
  rateType: RateType;
  /** estimatedReceiveAmount / sendAmount. */
  exchangeRate: string;
  knownFees: KnownFee[];
  feesCompleteness: "complete" | "partial" | "unknown";
  minAmount: string | null;
  maxAmount: string | null;
  estimatedDuration: { minMinutes: number; maxMinutes: number } | null;
  kycRequirements: KycRequirement;
  expiresAt: string;
  /** true only when the partner guarantees the amount until expiresAt (fixed rate with rate id). */
  expiryGuaranteed: boolean;
  retrievedAt: string;
  executionModes: ExecutionMode[];
  /** Partner-side reference such as rateId / quotaId. */
  providerReference: string | null;
  warnings: string[];
  isDemo: boolean;
}

/** Provider-specific fields kept server-side to re-verify or execute a quote. Never sent to clients. */
export type QuoteInternals = Record<string, string | number | boolean | null>;

export interface ProviderQuote {
  quote: Omit<NormalizedQuote, "quoteId">;
  internals: QuoteInternals;
}

export interface ExchangeRequest {
  quote: NormalizedQuote;
  internals: QuoteInternals;
  payoutAddress: string;
  payoutExtraId?: string;
  refundAddress?: string;
  refundExtraId?: string;
}

export type CanonicalExchangeStatus =
  | "CREATED"
  | "AWAITING_DEPOSIT"
  | "CONFIRMING"
  | "EXCHANGING"
  | "SENDING"
  | "COMPLETED"
  | "FAILED"
  | "EXPIRED"
  | "REFUNDED"
  | "VERIFICATION_REQUIRED"
  | "UNKNOWN";

export interface ExchangeResult {
  externalId: string;
  /** Deposit details issued by the partner — SWAPLY never creates them. */
  payinAddress: string;
  payinExtraId: string | null;
  payoutAddress: string;
  sendAmount: string;
  expectedReceive: string;
  payTill: string | null;
  status: CanonicalExchangeStatus;
  providerStatus: string | null;
}

export interface ExchangeStatusResult {
  status: CanonicalExchangeStatus;
  providerStatus: string;
  actualReceive: string | null;
  payinHash: string | null;
  payoutHash: string | null;
}

export interface ExchangeProvider {
  id: string;
  name: string;
  websiteUrl: string;
  isDemo: boolean;
  getCapabilities(): Promise<ProviderCapabilities>;
  getSupportedAssets(): Promise<ProviderInstrument[]>;
  getQuotes(request: QuoteRequest): Promise<ProviderQuote[]>;
  /** Builds the official partner link. Returns null when attribution is not configured. */
  buildReferralUrl?(quote: NormalizedQuote, internals: QuoteInternals): string | null;
  /** Hosts a referral redirect may point to (redirect URL validation). */
  readonly redirectHosts: readonly string[];
  createExchange?(request: ExchangeRequest): Promise<ExchangeResult>;
  getExchangeStatus?(externalId: string): Promise<ExchangeStatusResult>;
  validateAddress?(assetId: string, networkId: string, address: string): Promise<boolean | null>;
  healthCheck(): Promise<{ ok: boolean; message: string }>;
}
