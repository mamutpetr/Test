"use client";
import { motion } from "motion/react";
import { useState } from "react";
import type { Dictionary } from "@/i18n";
import { ASSETS } from "@/lib/catalog";
import { decimalsFor, formatAmount, formatCountdown } from "@/lib/format";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { cn } from "../ui/cn";
import type { NormalizedQuote } from "./types";

export function OfferCard({ q, t, locale, isBest, loss, now, onSelect, onRefresh, index }: {
  q: NormalizedQuote; t: Dictionary; locale: "uk" | "en"; isBest: boolean; loss: string; now: number; index: number;
  onSelect: (q: NormalizedQuote) => void; onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const r = t.results;
  const remaining = new Date(q.expiresAt).getTime() - now;
  const expired = remaining <= 0;
  const prec = ASSETS[q.destinationAsset]?.precision ?? 8;
  const canRedirect = q.executionModes.includes("redirect");
  const kycTone = q.kycRequirements === "required" ? "warning" : q.kycRequirements === "none_declared" ? "positive" : "neutral";

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 6) * 0.04, type: "spring", damping: 26, stiffness: 300 }}
      data-testid="offer-card"
      data-provider={q.providerId}
      className={cn("rounded-[var(--radius-card)] border bg-surface p-4 shadow-card sm:p-5", isBest ? "border-accent/50" : "border-line", expired && "opacity-60")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {isBest && <Badge tone="accent">★ {r.best}</Badge>}
            <Badge tone={q.rateType === "fixed" ? "positive" : "neutral"} title={q.rateType === "fixed" ? r.fixedHint : r.floatingHint}>{r.rateType[q.rateType]}</Badge>
            {q.isDemo && <Badge tone="warning">{r.demoQuote}</Badge>}
          </div>
          <div className="mt-2 text-[15px] font-semibold" data-testid="offer-provider">
            {q.executingPartner ? (
              <>
                {q.executingPartner.name} <span className="font-normal text-muted">· {r.via} {q.providerName}</span>
              </>
            ) : (
              q.providerName
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted">{r.youGet}</div>
          <div className="num text-2xl font-semibold sm:text-[28px]" data-testid="offer-receive" data-value={q.estimatedReceiveAmount}>
            {formatAmount(q.estimatedReceiveAmount, prec, locale)}
            <span className="ml-1 text-base font-medium text-muted">{q.destinationAsset}</span>
          </div>
          {!isBest && <div className="num text-xs text-danger">−{loss}% {r.lessThanBest}</div>}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Fact label={r.rate} value={`1 ${q.sourceAsset} ≈ ${formatAmount(q.exchangeRate, decimalsFor(q.exchangeRate), locale)} ${q.destinationAsset}`} />
        <Fact label={r.duration} value={q.estimatedDuration ? `${q.estimatedDuration.minMinutes}–${q.estimatedDuration.maxMinutes} ${r.minutes}` : r.durationUnknown} muted={!q.estimatedDuration} />
        <Fact label={r.kyc} value={<Badge tone={kycTone}>{r.kycValues[q.kycRequirements]}</Badge>} />
        <Fact
          label={expired ? r.expired : r.validFor}
          value={expired ? "—" : <span className="num" title={q.expiryGuaranteed ? r.fixedHint : r.floatingHint}>{formatCountdown(remaining)}{!q.expiryGuaranteed && " *"}</span>}
        />
      </div>

      {q.warnings.length > 0 && (
        <div className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">
          <b>{r.warnings}:</b> {q.warnings.join(" ")}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
          {r.fees} & {r.limits.toLowerCase()} {open ? "▴" : "▾"}
        </button>
        <div className="flex-1" />
        {expired ? (
          <Button variant="secondary" onClick={onRefresh}>{r.refresh}</Button>
        ) : canRedirect ? (
          <Button data-testid="offer-exchange" onClick={() => onSelect(q)}>{r.exchange} →</Button>
        ) : (
          <Button variant="secondary" disabled title={r.unavailableCta}>{r.unavailableCta}</Button>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-2 border-t border-line pt-3 text-sm" data-testid="offer-details">
          {q.knownFees.length === 0 ? (
            <p className="text-muted">{r.feesNotReported}</p>
          ) : (
            <ul className="space-y-1">
              {q.knownFees.map((f, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="text-muted">{r.feeTypes[f.type]}{f.note ? ` · ${f.note}` : ""}</span>
                  <span className="num text-right">
                    {f.amount ? `${formatAmount(f.amount, 8, locale)} ${f.currency}` : "—"}{" "}
                    <span className="text-xs text-faint">({f.includedInReceive === true ? r.feesIncluded : f.includedInReceive === "unknown" ? r.feesUnknownInclusion : "+"})</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {q.feesCompleteness !== "complete" && q.knownFees.length > 0 && <p className="text-xs text-faint">{r.feesNotReported}</p>}
          <div className="flex justify-between">
            <span className="text-muted">{r.limits}</span>
            <span className="num">{q.minAmount ? formatAmount(q.minAmount, 8, locale) : "—"} – {q.maxAmount ? formatAmount(q.maxAmount, 8, locale) : r.noLimit} {q.sourceAsset}</span>
          </div>
          <p className="text-xs text-faint">{q.rateType === "fixed" && q.expiryGuaranteed ? r.fixedHint : r.floatingHint}</p>
        </div>
      )}
    </motion.li>
  );
}

function Fact({ label, value, muted }: { label: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-faint">{label}</div>
      <div className={cn("truncate", muted && "text-muted")}>{value}</div>
    </div>
  );
}
