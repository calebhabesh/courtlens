"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DataDetailsButton, type DataDetailRow } from "./ui/data-details";
import { Field } from "./ui/field";
import { GatedNote } from "./ui/gated-note";
import { Button } from "./ui/kit";
import { LookupInput } from "./lookup-input";
import { Select } from "./ui/select";
import { Skeleton } from "./ui/skeleton";
import { formatDate } from "@/lib/format-date";
import { PHASE_LABELS, type FeedEnvelope, type FeedPhase, type FeedScope, type FeedSource } from "@/lib/stats-feeds";

/** URL state for the PC11 pages: one setter that replaces the query without scrolling. */
export function useUrlState() {
  const params = useSearchParams(), router = useRouter(), pathname = usePathname();
  const set = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [name, value] of Object.entries(updates)) { if (value) next.set(name, value); else next.delete(name); }
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  return { params, get: (name: string) => params.get(name), set };
}

/** Fetch keyed by its inputs; a stale response never replaces a newer request's result. */
export function useFeed<T>(inputs: readonly (string | null)[], load: (signal: AbortSignal) => Promise<T>) {
  const key = JSON.stringify(inputs);
  const [state, setState] = useState<{ key: string; data?: T; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    load(abort.signal).then(data => { if (!abort.signal.aborted) setState({ key, data }); })
      .catch(error => { if (!abort.signal.aborted) setState({ key, error: (error as Error).message }); });
    return () => abort.abort();
    // `key` covers every input of `load`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);
  const current = state?.key === key ? state : null;
  return { data: current?.data ?? null, error: current?.error ?? "", loading: current === null, retry: () => setAttempt(n => n + 1) };
}

/** Season and phase pickers limited to the scopes the source actually observed. */
export function FeedScopeFields({ scopes, season, phase, onChange }: {
  scopes: FeedScope[]; season: string; phase: FeedPhase; onChange: (scope: { season: string; phase: FeedPhase }) => void;
}) {
  const seasons = [...new Set(scopes.map(scope => scope.season))];
  const phases = scopes.filter(scope => scope.season === season).map(scope => scope.phase);
  return <>
    <Field label="Season" layout="inline">
      <Select aria-label="Season" value={season} onChange={event => {
        const next = event.target.value;
        const available = scopes.filter(scope => scope.season === next).map(scope => scope.phase);
        onChange({ season: next, phase: available.includes(phase) ? phase : available[0] });
      }}>{seasons.map(value => <option key={value} value={value}>{value}</option>)}</Select>
    </Field>
    <Field label="Phase" layout="inline">
      <Select aria-label="Phase" value={phase} onChange={event => onChange({ season, phase: event.target.value as FeedPhase })}>
        {phases.map(value => <option key={value} value={value}>{PHASE_LABELS[value]}</option>)}
      </Select>
    </Field>
  </>;
}

export function sourceRows(sources: FeedSource[]): DataDetailRow[] {
  return sources.map(source => ({
    label: `${source.feed} · ${source.variant}`,
    value: `${source.dataset_id} · observed ${formatDate(source.observed_at)}${source.upstream_revision ? ` · mirror ${source.upstream_revision.slice(0, 12)}` : ""}`,
    mono: true,
  }));
}

/** Scope, sample rule, source datasets and limitations, behind the Data details button. */
export function FeedDetails({ envelope, rows = [], children }: { envelope: FeedEnvelope; rows?: DataDetailRow[]; children?: ReactNode }) {
  const rule = Object.entries(envelope.qualification).map(([key, value]) => `${key.replaceAll("_", " ")} ≥ ${value.toLocaleString("en-US")}`).join(" · ");
  return <DataDetailsButton rows={[
    { label: "Scope", value: envelope.label },
    { label: "Source", value: envelope.source },
    { label: "Sample rules", value: rule },
    ...rows,
    ...sourceRows(envelope.sources),
  ]}>
    <ul className="feed-limitations">{envelope.limitations.map(item => <li key={item}>{item}</li>)}</ul>
    {children}
  </DataDetailsButton>;
}

export function FeedFailure({ error, retry, what }: { error: string; retry: () => void; what: string }) {
  return <div role="alert"><GatedNote tone="warning" why={error} action={<Button size="lg" onClick={retry}>Retry</Button>}>{what} is unavailable right now.</GatedNote></div>;
}

export function FeedSkeleton({ label }: { label: string }) {
  return <div role="status" aria-busy="true" aria-label={label} className="feed-loading"><Skeleton height={96} /><Skeleton height={360} /></div>;
}

/** C3: a default subject chosen by a fixed rule says so, with the rule, beside a way to change it. */
export function ExampleNote({ name, rule, change }: { name: string; rule: string | null; change?: ReactNode }) {
  if (!rule) return null;
  return <p className="feed-example"><span>Example: <strong>{name}</strong></span><span className="feed-example-rule">{rule}</span>{change}</p>;
}

/** Players listed for picking, alphabetically, with qualified players first. */
export function PlayerPicker({ label, value, players, onChange }: {
  label: string; value: string | null; players: { player_id: string; player_name: string; qualified?: boolean }[]; onChange: (id: string) => void;
}) {
  const sorted = [...players].sort((a, b) => Number(b.qualified ?? true) - Number(a.qualified ?? true) || a.player_name.localeCompare(b.player_name));
  return <Field label={label} layout="inline">
    <Select aria-label={label} value={value ?? ""} onChange={event => onChange(event.target.value)}>
      {sorted.map(player => <option key={player.player_id} value={player.player_id}>{player.player_name}{player.qualified === false ? " (small sample)" : ""}</option>)}
    </Select>
  </Field>;
}

/** Player search that commits the canonical NBA id; the text clears after a pick. */
export function PlayerLookup({ label, onPick }: { label: string; onPick: (playerId: string) => void }) {
  const [text, setText] = useState("");
  return <LookupInput label={label} value={text} onChange={setText} kinds={["player"]} placeholder="Find a player" compactResults portalDropdown
    onSelect={item => { setText(""); onPick(item.canonical_id); }} />;
}
