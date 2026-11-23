"use client";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Dictionary } from "@/i18n";
import { ASSETS, COUNTRIES, NETWORKS } from "@/lib/catalog";
import { formatAmount } from "@/lib/format";
import { applyFilters, lossVsBest, rankQuotes, type SortMode } from "@/server/aggregator/ranking";
import { Button } from "../ui/Button";
import { cn } from "../ui/cn";
import { AssetButton, AssetSheet, NetworkChips } from "./AssetPicker";
import { ConfirmRedirect } from "./ConfirmRedirect";
import { OfferCard } from "./OfferCard";
import { useNow } from "./useNow";
import { AssistantBox, type Intent } from "./AssistantBox";
import type { AggregateResult, NormalizedQuote } from "./types";

const AMOUNT_RE = /^(?:0|[1-9]\d*)(?:[.,]\d+)?$/;

function makeSchema(t: Dictionary) {
  return z
    .object({
      fromAsset: z.string(),
      fromNetwork: z.string(),
      toAsset: z.string(),
      toNetwork: z.string(),
      amount: z.string().trim().regex(AMOUNT_RE, t.form.errors.amount).refine((v) => Number(v.replace(",", ".")) > 0, t.form.errors.amount),
      country: z.string().optional(),
    })
    .superRefine((v, ctx) => {
      const prec = ASSETS[v.fromAsset]?.precision ?? 8;
      const frac = v.amount.replace(",", ".").split(".")[1] ?? "";
      if (frac.length > prec) ctx.addIssue({ code: "custom", path: ["amount"], message: t.form.errors.decimals });
      if (v.fromAsset === v.toAsset && v.fromNetwork === v.toNetwork) ctx.addIssue({ code: "custom", path: ["toAsset"], message: t.form.errors.same });
      if (ASSETS[v.fromAsset]?.kind === "fiat") ctx.addIssue({ code: "custom", path: ["fromAsset"], message: t.form.errors.fiatSource });
    });
}
type FormValues = z.infer<ReturnType<typeof makeSchema>>;

async function fetchQuotes(body: Record<string, string>): Promise<AggregateResult> {
  const res = await fetch("/api/v1/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
  return data as AggregateResult;
}

export function ExchangeWidget({ t, locale, defaults }: { t: Dictionary; locale: "uk" | "en"; defaults: FormValues }) {
  const schema = useMemo(() => makeSchema(t), [t]);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults, mode: "onSubmit" });
  const { register, handleSubmit, watch, setValue, formState } = form;
  const v = watch();
  const [picker, setPicker] = useState<null | "from" | "to">(null);
  const [sort, setSort] = useState<SortMode>("best");
  const [rateFilter, setRateFilter] = useState<"any" | "fixed" | "floating">("any");
  const [noKyc, setNoKyc] = useState(false);
  const [selected, setSelected] = useState<NormalizedQuote | null>(null);
  const [showProviders, setShowProviders] = useState(false);
  const now = useNow();

  const search = useMutation({ mutationFn: fetchQuotes });
  const toIsFiat = ASSETS[v.toAsset]?.kind === "fiat";

  const submit = handleSubmit((vals) => {
    const body: Record<string, string> = {
      fromAsset: vals.fromAsset,
      fromNetwork: vals.fromNetwork,
      toAsset: vals.toAsset,
      toNetwork: vals.toNetwork,
      amount: vals.amount.replace(",", "."),
      rateType: "any",
    };
    if (ASSETS[vals.toAsset]?.kind === "fiat" && vals.country && vals.country !== "OTHER") body.country = vals.country;
    search.mutate(body);
  });

  const pickAsset = (side: "from" | "to", assetId: string) => {
    const nets = ASSETS[assetId]!.networks;
    const netField = side === "from" ? "fromNetwork" : "toNetwork";
    setValue(side === "from" ? "fromAsset" : "toAsset", assetId);
    if (!nets.includes(side === "from" ? v.fromNetwork : v.toNetwork)) setValue(netField, nets[0]!);
    if (side === "to" && ASSETS[assetId]!.kind === "fiat" && !v.country) setValue("country", assetId === "UAH" ? "UA" : "OTHER");
  };

  const applyIntent = (i: Intent) => {
    if (i.fromAsset && ASSETS[i.fromAsset]?.kind === "crypto") pickAsset("from", i.fromAsset);
    if (i.fromNetwork && i.fromAsset && ASSETS[i.fromAsset]?.networks.includes(i.fromNetwork)) setValue("fromNetwork", i.fromNetwork);
    if (i.toAsset && ASSETS[i.toAsset]) pickAsset("to", i.toAsset);
    if (i.toNetwork && i.toAsset && ASSETS[i.toAsset]?.networks.includes(i.toNetwork)) setValue("toNetwork", i.toNetwork);
    if (i.amount) setValue("amount", i.amount);
    if (i.country) setValue("country", i.country);
  };

  const swap = () => {
    if (ASSETS[v.toAsset]?.kind === "fiat") return;
    setValue("fromAsset", v.toAsset);
    setValue("fromNetwork", v.toNetwork);
    setValue("toAsset", v.fromAsset);
    setValue("toNetwork", v.fromNetwork);
  };

  const data = search.data;
  const visible = useMemo(() => {
    if (!data) return [];
    return rankQuotes(applyFilters(data.quotes, { rateType: rateFilter, noExtraKyc: noKyc }), sort);
  }, [data, rateFilter, noKyc, sort]);
  const bestByAmount = useMemo(() => (visible.length ? rankQuotes(visible, "best")[0]! : null), [visible]);

  const amountError = formState.errors.amount?.message;
  const formError = formState.errors.toAsset?.message ?? formState.errors.fromAsset?.message;

  return (
    <div className="mx-auto w-full max-w-xl">
      <form onSubmit={submit} noValidate className="rounded-[28px] border border-line bg-surface p-3 shadow-card sm:p-4" data-testid="exchange-form">
        {/* Send */}
        <div className="rounded-3xl bg-surface-2 p-4">
          <label htmlFor="amount" className="text-sm text-muted">{t.form.give}</label>
          <div className="mt-1 flex items-center gap-3">
            <input
              id="amount"
              data-testid="amount-input"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="search"
              placeholder="0"
              aria-invalid={!!amountError}
              {...register("amount")}
              className="num min-w-0 flex-1 bg-transparent text-[34px] font-semibold outline-none placeholder:text-faint sm:text-[40px]"
            />
            <AssetButton assetId={v.fromAsset} networkId={v.fromNetwork} onClick={() => setPicker("from")} testId="from-asset" locale={locale} />
          </div>
          {amountError && <p className="mt-1 text-sm text-danger" role="alert">{amountError}</p>}
          <NetworkChips assetId={v.fromAsset} value={v.fromNetwork} onChange={(n) => setValue("fromNetwork", n)} label={t.form.network} locale={locale} testId="from-network" />
        </div>

        <div className="relative z-10 -my-3 flex justify-center">
          <button type="button" onClick={swap} aria-label={t.form.swap} disabled={toIsFiat} className="grid h-11 w-11 place-items-center rounded-2xl border-4 border-surface bg-surface-3 text-muted transition hover:rotate-180 hover:text-ink disabled:opacity-40">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M5 2v12M5 14l-3-3M11 14V2M11 2l3 3" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>

        {/* Receive */}
        <div className="rounded-3xl bg-surface-2 p-4">
          <div className="text-sm text-muted">{t.form.get}</div>
          <div className="mt-1 flex items-center gap-3">
            <div className="num min-w-0 flex-1 truncate text-[34px] font-semibold text-muted sm:text-[40px]" data-testid="best-receive">
              {bestByAmount && data && data.request.toAsset === v.toAsset && data.request.toNetwork === v.toNetwork
                ? formatAmount(bestByAmount.estimatedReceiveAmount, ASSETS[v.toAsset]!.precision, locale)
                : "—"}
            </div>
            <AssetButton assetId={v.toAsset} networkId={v.toNetwork} onClick={() => setPicker("to")} testId="to-asset" locale={locale} />
          </div>
          <NetworkChips assetId={v.toAsset} value={v.toNetwork} onChange={(n) => setValue("toNetwork", n)} label={toIsFiat ? t.form.payout : t.form.network} locale={locale} testId="to-network" />
          {toIsFiat && (
            <div className="mt-3">
              <label htmlFor="country" className="mb-1.5 block text-xs text-muted">{t.form.country}</label>
              <select id="country" {...register("country")} className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-accent">
                {COUNTRIES.map((c) => <option key={c} value={c}>{t.countries[c]}</option>)}
              </select>
            </div>
          )}
        </div>

        {formError && <p className="mt-2 px-1 text-sm text-danger" role="alert">{formError}</p>}
        {NETWORKS[v.fromNetwork]?.kind === "chain" && ASSETS[v.fromAsset]!.networks.length > 1 && (
          <p className="mt-3 flex gap-2 px-1 text-xs text-faint"><span aria-hidden>ⓘ</span>{t.form.networkWarning}</p>
        )}

        <Button type="submit" size="lg" className="mt-3 w-full" disabled={search.isPending} data-testid="search-button">
          {search.isPending ? (<><span className="h-4 w-4 animate-spin rounded-full border-2 border-on-accent border-t-transparent" /> {t.form.searching}</>) : t.form.search}
        </Button>
        <AssistantBox t={t} onApply={applyIntent} />
      </form>

      <AssetSheet open={picker === "from"} onClose={() => setPicker(null)} onSelect={(a) => pickAsset("from", a)} t={t} allowFiat={false} current={v.fromAsset} title={t.form.give} />
      <AssetSheet open={picker === "to"} onClose={() => setPicker(null)} onSelect={(a) => pickAsset("to", a)} t={t} allowFiat current={v.toAsset} title={t.form.get} />

      {/* Results */}
      <section aria-live="polite" className="mt-8" data-testid="results">
        {search.isPending && (
          <ul className="space-y-3">
            {[0, 1, 2].map((i) => <li key={i} className="h-36 animate-pulse rounded-[var(--radius-card)] border border-line bg-surface" />)}
          </ul>
        )}

        {search.isError && <p className="rounded-2xl bg-danger-soft p-4 text-sm text-danger" role="alert" data-testid="search-error">{(search.error as Error).message}</p>}

        {data && !search.isPending && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-lg font-semibold">{t.results.title} <span className="text-muted">{visible.length}</span></h2>
              <Segmented value={sort} onChange={(s) => setSort(s as SortMode)} options={[["best", t.results.sortBest], ["fastest", t.results.sortFast]]} testId="sort" />
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              <Segmented value={rateFilter} onChange={(s) => setRateFilter(s as typeof rateFilter)} options={[["any", t.results.filterAll], ["fixed", t.results.filterFixed], ["floating", t.results.filterFloating]]} testId="rate-filter" />
              <button type="button" onClick={() => setNoKyc((x) => !x)} aria-pressed={noKyc} data-testid="filter-nokyc" className={cn("rounded-xl border px-3 py-1.5 text-sm transition", noKyc ? "border-accent bg-accent-soft" : "border-line text-muted hover:text-ink")}>
                {t.results.filterNoKyc}
              </button>
            </div>

            {visible.length === 0 ? (
              <EmptyState data={data} t={t} locale={locale} filtered={data.quotes.length > 0} onUseMin={(m) => { setValue("amount", m); void submit(); }} />
            ) : (
              <ul className="space-y-3">
                <AnimatePresence initial={false}>
                  {visible.map((q, i) => (
                    <OfferCard key={q.quoteId} q={q} t={t} locale={locale} index={i} now={now} isBest={bestByAmount?.quoteId === q.quoteId} loss={bestByAmount ? lossVsBest(bestByAmount, q) : "0"} onSelect={setSelected} onRefresh={() => void submit()} />
                  ))}
                </AnimatePresence>
              </ul>
            )}

            <p className="mt-4 text-xs text-faint">{t.results.whoProvides} {t.results.kycNote}</p>

            <div className="mt-4">
              <button type="button" className="text-sm text-muted hover:text-ink" onClick={() => setShowProviders((s) => !s)} aria-expanded={showProviders}>
                {t.results.providersTitle} {showProviders ? "▴" : "▾"}
              </button>
              <AnimatePresence>
                {showProviders && (
                  <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-2 space-y-1 overflow-hidden text-sm" data-testid="provider-status">
                    {data.providers.map((p) => (
                      <li key={p.providerId} className="flex justify-between rounded-xl bg-surface px-3 py-2">
                        <span>{p.providerName}</span>
                        <span className={cn(p.status === "ok" ? "text-positive" : p.status === "error" ? "text-danger" : "text-muted")}>{t.results.providerStatus[p.status]}</span>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </section>

      <ConfirmRedirect quote={selected} onClose={() => setSelected(null)} onExpired={() => void submit()} t={t} locale={locale} />
    </div>
  );
}

function EmptyState({ data, t, locale, filtered, onUseMin }: { data: AggregateResult; t: Dictionary; locale: "uk" | "en"; filtered: boolean; onUseMin: (m: string) => void }) {
  const reason = filtered ? "filtered" : data.emptyReason ?? "all_providers_failed";
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-6 text-center" data-testid="empty-state" data-reason={reason}>
      <p className="text-muted">{t.results.empty[reason]}</p>
      {data.suggestedMinAmount && !filtered && (
        <p className="mt-3 text-sm">
          {t.results.minSuggestion} <b className="num">{formatAmount(data.suggestedMinAmount, 8, locale)} {data.request.fromAsset}</b>{" "}
          <button type="button" className="ml-1 text-accent underline-offset-4 hover:underline" onClick={() => onUseMin(data.suggestedMinAmount!)}>{t.results.useMin}</button>
        </p>
      )}
    </div>
  );
}

function Segmented({ value, onChange, options, testId }: { value: string; onChange: (v: string) => void; options: Array<[string, string]>; testId: string }) {
  return (
    <div role="radiogroup" className="inline-flex rounded-xl border border-line bg-surface p-0.5" data-testid={testId}>
      {options.map(([val, label]) => (
        <button key={val} type="button" role="radio" aria-checked={value === val} data-testid={`${testId}-${val}`} onClick={() => onChange(val)}
          className={cn("rounded-[10px] px-3 py-1.5 text-sm transition", value === val ? "bg-surface-3 font-medium text-ink" : "text-muted hover:text-ink")}>
          {label}
        </button>
      ))}
    </div>
  );
}
