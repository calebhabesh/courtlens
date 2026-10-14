"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { exampleParams, loadExampleSubject, type ExampleKind, type ExampleSubject } from "@/lib/example-subject";
import { PlayerIdentity } from "./ui/identity";
import { StatTile } from "./ui/stat-tile";
import { GatedNote } from "./ui/gated-note";
import { ValueBar } from "./charts";
import { Skeleton } from "./ui/skeleton";
import { Button } from "./ui/kit";

export function useExampleSubject(parameter: string, aliases: string[] = [], kind: ExampleKind = "player", enabled = true) {
  const params = useSearchParams(), path = usePathname();
  const serialized = params.toString();
  const aliasKey = aliases.join(",");
  const selection = [parameter, ...aliases].map(key => params.get(key)).find(Boolean);
  const [hasSeenSelection, setHasSeenSelection] = useState(Boolean(selection));
  if (selection && !hasSeenSelection) setHasSeenSelection(true);
  const [example, setExample] = useState<ExampleSubject | null>(null);
  const [error, setError] = useState("");
  const applied = useRef("");
  const manual = useRef(false);
  const cancelDefault = useCallback(() => {
    manual.current = true;
    setHasSeenSelection(true);
  }, []);
  useEffect(() => {
    if (!enabled || selection || hasSeenSelection) return;
    const onFocus = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.closest("main") && target.matches(".entity-picker input, .lookup-input input, input[role=combobox]")) cancelDefault();
    };
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, [enabled, selection, hasSeenSelection, cancelDefault]);
  useEffect(() => {
    if (!enabled) return;
    const source = new URLSearchParams(serialized);
    const selection = [parameter, ...aliasKey.split(",").filter(Boolean)].map(key => source.get(key)).find(Boolean);
    if (!selection && hasSeenSelection) return;
    if (selection && source.get("exampleSubject") !== selection) return;
    const key = JSON.stringify([source.get("releaseId") || source.get("release_id"), source.get("season"), source.get("phase"), source.get("beforeDate") || source.get("before_date"), source.get("team_id"), selection]);
    if (applied.current === key) return;
    let active = true;
    loadExampleSubject(source, kind).then(value => {
      if (!active || (!selection && manual.current)) return;
      if (!value) { setError("No observed example in this scope."); return; }
      const next = selection ? source : exampleParams(source, value, parameter, kind);
      applied.current = JSON.stringify([next.get("releaseId") || next.get("release_id"), next.get("season"), next.get("phase"), next.get("beforeDate") || next.get("before_date"), next.get("team_id"), next.get(parameter)]);
      setExample(value); setError("");
      if (!selection) window.history.replaceState(null, "", `${path}?${next}`);
    }).catch(() => { if (active) setError("Example unavailable. Choose a player or retry."); });
    return () => { active = false; };
  }, [serialized, parameter, aliasKey, kind, path, enabled, hasSeenSelection]);
  const matchesScope = example && params.get("season") === example.scope.season && params.get("phase") === example.scope.phase && (params.get("beforeDate") || params.get("before_date")) === example.scope.beforeDate && (params.get("releaseId") || params.get("release_id")) === example.scope.releaseId;
  const visible = matchesScope && selection && params.get("exampleSubject") === selection && example?.players.some(player => selection.split(",").includes(player.player_id));
  return { example: visible ? example : null, error: !selection ? error : "", loading: enabled && !selection && !hasSeenSelection && !error, loadingKind: kind, cancelDefault };
}

/** Real box-score context remains useful when a PBP source is pending PC07. It is not a substitute for that operation. */
export function ExampleSubjectCard({ example, error, loading = false, loadingKind = "player" }: { example: ExampleSubject | null; error?: string; loading?: boolean; loadingKind?: ExampleKind }) {
  const rule = example?.team || loadingKind !== "player" ? "Season minutes rule / observed team’s top duo." : "Season minutes rule.";
  const provenance = <p className="chart-provenance">{rule} These box-score values are separate from the operation below.</p>;
  if (loading) return <section className="pc04-example" role="status" aria-label="Loading observed example">
    <div className="pc04-example-heading"><Skeleton height={40} /></div>
    <div className="pc04-example-players">{Array.from({length:loadingKind === "player" ? 1 : 2},(_,index)=><div key={index}>
      <Skeleton height={48} /><div className="pc04-example-stats" aria-hidden="true"><StatTile label="Points / Game" value={null} /><StatTile label="Rebounds / Game" value={null} /><StatTile label="Assists / Game" value={null} /></div>
      <ValueBar title={`Subject ${index === 0 ? "A" : "B"} · Points / Game`} value={null} domain={[0,40]} source="Published box scores" sample="Resolving" state="loading" />
    </div>)}</div>{provenance}
  </section>;
  if (!example) return error ? <GatedNote why={error} action={<Button size="lg" onClick={() => window.location.reload()}>Retry</Button>}>Example unavailable.</GatedNote> : null;
  return <section className="pc04-example" aria-label="Observed example context">
    <div className="pc04-example-heading"><strong>Example: {example.players.map(player => player.player_name).join(" · ")}</strong>
      <Button size="lg" onClick={() => document.querySelector<HTMLInputElement>(".entity-picker input, .lookup-input input, input[role=combobox]")?.focus()}>Change</Button>
    </div>
    <div className="pc04-example-players">{example.players.map((player,index) => <div key={player.player_id}>
      <PlayerIdentity playerId={player.player_id} name={player.player_name} team={player.teams[0]} subtitle={`${index === 0 ? "A" : "B"} · ${player.games_played} GP · ${Math.round(player.total_minutes).toLocaleString("en-US")} MIN`} />
      <div className="pc04-example-stats"><StatTile label="Points / Game" value={player.metrics.pts_per_game?.toFixed(1) ?? null} /><StatTile label="Rebounds / Game" value={player.metrics.reb_per_game?.toFixed(1) ?? null} /><StatTile label="Assists / Game" value={player.metrics.ast_per_game?.toFixed(1) ?? null} /></div>
      <ValueBar title={`Subject ${index === 0 ? "A" : "B"} · Points / Game`} tone={index === 0 ? "identity-a" : "identity-b"} source="Published box scores" sample={`n=${player.sample_sizes.pts_per_game ?? player.games_played} appearances`} value={player.metrics.pts_per_game} domain={[0,Math.max(40,...example.players.map(row=>row.metrics.pts_per_game ?? 0))]} />
    </div>)}</div>
    {provenance}
  </section>;
}
