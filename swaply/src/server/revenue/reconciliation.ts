/**
 * Partner report import for revenue reconciliation.
 * Partners export reports in their own formats; admins map them to this neutral CSV:
 *   provider_transaction_id,date,volume,volume_currency,commission,commission_currency,status
 * status: confirmed | paid | rejected. Amounts are decimal strings (dot separator).
 */
import { D, toDecimal } from "@/lib/money";

export interface ReportRow {
  providerTransactionId: string;
  date: Date;
  volume: string | null;
  commission: string;
  currency: string;
  status: "CONFIRMED" | "PAID" | "REJECTED";
}

export interface ParseResult {
  rows: ReportRow[];
  errors: Array<{ line: number; message: string }>;
}

const REQUIRED = ["provider_transaction_id", "date", "commission", "commission_currency", "status"];

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parsePartnerReport(csv: string, maxRows = 10_000): ParseResult {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  const errors: ParseResult["errors"] = [];
  const rows: ReportRow[] = [];
  if (!lines.length) return { rows, errors: [{ line: 0, message: "Empty file" }] };
  const header = splitCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const missing = REQUIRED.filter((r) => !header.includes(r));
  if (missing.length) return { rows, errors: [{ line: 1, message: `Missing columns: ${missing.join(", ")}` }] };
  const col = (cells: string[], name: string) => cells[header.indexOf(name)] ?? "";
  const seen = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    if (rows.length >= maxRows) { errors.push({ line: i + 1, message: `Row limit ${maxRows} reached` }); break; }
    const cells = splitCsvLine(lines[i]!);
    const id = col(cells, "provider_transaction_id");
    const date = new Date(col(cells, "date"));
    const commission = toDecimal(col(cells, "commission"));
    const volumeRaw = header.includes("volume") ? col(cells, "volume") : "";
    const volume = volumeRaw ? toDecimal(volumeRaw) : null;
    const currency = col(cells, "commission_currency").toUpperCase();
    const status = col(cells, "status").toLowerCase();
    const line = i + 1;
    if (!id || id.length > 128) { errors.push({ line, message: "Invalid provider_transaction_id" }); continue; }
    if (seen.has(id)) { errors.push({ line, message: `Duplicate transaction ${id}` }); continue; }
    if (Number.isNaN(date.getTime())) { errors.push({ line, message: "Invalid date" }); continue; }
    if (!commission || commission.lt(0)) { errors.push({ line, message: "Invalid commission" }); continue; }
    if (volumeRaw && (!volume || volume.lt(0))) { errors.push({ line, message: "Invalid volume" }); continue; }
    if (!/^[A-Z0-9]{2,10}$/.test(currency)) { errors.push({ line, message: "Invalid currency" }); continue; }
    if (!["confirmed", "paid", "rejected"].includes(status)) { errors.push({ line, message: "Status must be confirmed|paid|rejected" }); continue; }
    seen.add(id);
    rows.push({ providerTransactionId: id, date, volume: volume ? volume.toFixed() : null, commission: commission.toFixed(), currency, status: status.toUpperCase() as ReportRow["status"] });
  }
  return { rows, errors };
}

/** Sums decimal strings grouped by currency (never mixes currencies). */
export function sumByCurrency(items: Array<{ amount: string | null; currency: string }>): Record<string, string> {
  const acc: Record<string, InstanceType<typeof D>> = {};
  for (const i of items) {
    if (!i.amount) continue;
    acc[i.currency] = (acc[i.currency] ?? new D(0)).plus(i.amount);
  }
  return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, v.toFixed()]));
}
