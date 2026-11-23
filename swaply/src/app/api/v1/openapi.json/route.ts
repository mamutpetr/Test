import { NextResponse } from "next/server";
import { ASSET_IDS, NETWORK_IDS } from "@/lib/catalog";

export const dynamic = "force-static";

const err = { $ref: "#/components/schemas/Error" };
const errorResponses = {
  "422": { description: "Validation error", content: { "application/json": { schema: err } } },
  "429": { description: "Rate limited (see Retry-After)", content: { "application/json": { schema: err } } },
  "500": { description: "Internal error", content: { "application/json": { schema: err } } },
};

const spec = {
  openapi: "3.1.0",
  info: {
    title: "SWAPLY Public API",
    version: "1.0.0",
    description: "Non-custodial crypto exchange aggregator. All amounts are decimal strings. Offers come from partner APIs; SWAPLY never holds funds.",
  },
  servers: [{ url: "/api/v1" }],
  paths: {
    "/assets": { get: { summary: "Supported assets and their networks", responses: { "200": { description: "OK" } } } },
    "/networks": { get: { summary: "Networks and fiat payout rails", responses: { "200": { description: "OK" } } } },
    "/providers": { get: { summary: "Connected partners and their capabilities (no secrets)", responses: { "200": { description: "OK" } } } },
    "/health": { get: { summary: "Service health", responses: { "200": { description: "Healthy" }, "503": { description: "Degraded" } } } },
    "/quotes": {
      post: {
        summary: "Compare offers for a route",
        description: "Queries all enabled partners that support the route in parallel and returns offers ranked by the final amount received.",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/QuoteRequest" } } } },
        responses: { "200": { description: "Aggregated offers", content: { "application/json": { schema: { $ref: "#/components/schemas/AggregateResult" } } } }, ...errorResponses },
      },
    },
    "/referrals/redirect": {
      post: {
        summary: "Re-verify an offer and get the official partner link",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["quoteId"], additionalProperties: false, properties: { quoteId: { type: "string" }, acceptedReceiveAmount: { type: "string", description: "Amount the user confirmed after a 409 quote_changed" } } } } } },
        responses: {
          "200": { description: "Redirect URL; the click is tracked" },
          "404": { description: "Quote not found or expired", content: { "application/json": { schema: err } } },
          "409": { description: "quote_changed (body has previous and new quote) or redirect_not_configured" },
          "410": { description: "Partner no longer offers this", content: { "application/json": { schema: err } } },
          "503": { description: "Tracking unavailable; redirect refused", content: { "application/json": { schema: err } } },
          ...errorResponses,
        },
      },
    },
    "/exchanges": {
      post: {
        summary: "Create an embedded exchange via the partner API (phase 2, feature-flagged)",
        parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 16, maxLength: 128, pattern: "^[A-Za-z0-9_-]+$" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateExchange" } } } },
        responses: {
          "201": { description: "Created; deposit details are issued by the partner" },
          "200": { description: "Idempotent replay (header Idempotent-Replayed: true)" },
          "403": { description: "feature_disabled" },
          "409": { description: "quote_changed" },
          ...errorResponses,
          "422": { description: "Validation error or idempotency_conflict", content: { "application/json": { schema: err } } },
          "502": { description: "Partner failed to create the exchange" },
        },
      },
    },
    "/exchanges/{id}": {
      get: {
        summary: "Exchange status (refreshed from the partner)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
    "/assistant/parse": {
      post: {
        summary: "Parse free text into a structured search (no rates are generated)",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["text"], properties: { text: { type: "string", minLength: 2, maxLength: 500 } } } } } },
        responses: { "200": { description: "Parsed intent" }, ...errorResponses },
      },
    },
  },
  components: {
    schemas: {
      Error: { type: "object", properties: { error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" }, field: { type: "string" }, details: {} } } } },
      QuoteRequest: {
        type: "object",
        additionalProperties: false,
        required: ["fromAsset", "fromNetwork", "toAsset", "toNetwork", "amount"],
        properties: {
          fromAsset: { type: "string", enum: ASSET_IDS },
          fromNetwork: { type: "string", enum: NETWORK_IDS },
          toAsset: { type: "string", enum: ASSET_IDS },
          toNetwork: { type: "string", enum: NETWORK_IDS },
          amount: { type: "string", pattern: "^(?:0|[1-9]\\d*)(?:[.,]\\d+)?$", example: "1000" },
          rateType: { type: "string", enum: ["any", "fixed", "floating"], default: "any" },
          sort: { type: "string", enum: ["best", "fastest"], default: "best" },
          country: { type: "string", pattern: "^[A-Z]{2}$" },
        },
      },
      NormalizedQuote: {
        type: "object",
        properties: {
          providerId: { type: "string" }, providerName: { type: "string" },
          executingPartner: { type: ["object", "null"], properties: { id: { type: "string" }, name: { type: "string" } } },
          quoteId: { type: "string" }, sourceAsset: { type: "string" }, sourceNetwork: { type: "string" },
          destinationAsset: { type: "string" }, destinationNetwork: { type: "string" },
          sendAmount: { type: "string" }, estimatedReceiveAmount: { type: "string", description: "Net of all fees known to be deducted" },
          rateType: { type: "string", enum: ["fixed", "floating"] }, exchangeRate: { type: "string" },
          knownFees: { type: "array", items: { type: "object", properties: { type: { type: "string" }, amount: { type: ["string", "null"] }, currency: { type: "string" }, includedInReceive: { oneOf: [{ type: "boolean" }, { const: "unknown" }] } } } },
          feesCompleteness: { type: "string", enum: ["complete", "partial", "unknown"] },
          minAmount: { type: ["string", "null"] }, maxAmount: { type: ["string", "null"] },
          estimatedDuration: { type: ["object", "null"], properties: { minMinutes: { type: "number" }, maxMinutes: { type: "number" } } },
          kycRequirements: { type: "string", enum: ["none_declared", "may_be_required", "required", "unknown"] },
          expiresAt: { type: "string", format: "date-time" }, expiryGuaranteed: { type: "boolean" }, retrievedAt: { type: "string", format: "date-time" },
          executionModes: { type: "array", items: { type: "string", enum: ["redirect", "embedded"] } },
          providerReference: { type: ["string", "null"] }, warnings: { type: "array", items: { type: "string" } }, isDemo: { type: "boolean" },
        },
      },
      AggregateResult: {
        type: "object",
        properties: {
          searchId: { type: "string" }, mode: { type: "string", enum: ["demo", "live"] }, route: { type: "string" },
          quotes: { type: "array", items: { $ref: "#/components/schemas/NormalizedQuote" } },
          providers: { type: "array", items: { type: "object", properties: { providerId: { type: "string" }, status: { type: "string", enum: ["ok", "no_route", "out_of_range", "error", "not_configured", "disabled"] } } } },
          emptyReason: { type: ["string", "null"], enum: [null, "no_providers_configured", "route_not_supported", "amount_out_of_range", "all_providers_failed", "fiat_not_integrated"] },
          suggestedMinAmount: { type: ["string", "null"] }, generatedAt: { type: "string", format: "date-time" },
        },
      },
      CreateExchange: {
        type: "object",
        additionalProperties: false,
        required: ["quoteId", "payoutAddress"],
        properties: { quoteId: { type: "string" }, payoutAddress: { type: "string" }, payoutExtraId: { type: "string" }, refundAddress: { type: "string" }, refundExtraId: { type: "string" }, acceptedReceiveAmount: { type: "string" } },
      },
    },
  },
};

export function GET() {
  return NextResponse.json(spec, { headers: { "Cache-Control": "public, max-age=3600" } });
}
