import { describe, expect, it } from "vitest";
import { parsePartnerReport, sumByCurrency } from "@/server/revenue/reconciliation";

describe("partner report import", () => {
  it("parses valid rows and reports bad ones", () => {
    const csv = [
      "provider_transaction_id,date,volume,volume_currency,commission,commission_currency,status",
      "tx1,2026-11-01,1000,USDT,4.0,USDT,confirmed",
      '"tx,2",2026-11-02,500,USDT,2,USDT,paid',
      "tx3,not-a-date,1,USDT,1,USDT,paid",
      "tx4,2026-11-02,1,USDT,-1,USDT,paid",
      "tx1,2026-11-02,1,USDT,1,USDT,paid",
      "tx5,2026-11-02,1,USDT,1,USDT,pending",
    ].join("\n");
    const r = parsePartnerReport(csv);
    expect(r.rows.map((x) => [x.providerTransactionId, x.status, x.commission])).toEqual([["tx1", "CONFIRMED", "4"], ["tx,2", "PAID", "2"]]);
    expect(r.errors.map((e) => e.line)).toEqual([4, 5, 6, 7]);
  });
  it("requires columns", () => {
    expect(parsePartnerReport("a,b\n1,2").errors[0]!.message).toMatch(/Missing columns/);
  });
  it("never mixes currencies when summing", () => {
    expect(sumByCurrency([{ amount: "0.1", currency: "USDT" }, { amount: "0.2", currency: "USDT" }, { amount: "0.001", currency: "BTC" }, { amount: null, currency: "EUR" }])).toEqual({ USDT: "0.3", BTC: "0.001" });
  });
});
