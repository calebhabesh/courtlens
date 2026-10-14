"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { buildPreservedContextUrl } from "@/lib/query-url";
import { useState } from "react";
import { formatDate } from "@/lib/format-date";
import { EntityField } from "./entity-picker";
import type { AnalyticsCatalog } from "@/lib/types";
import { Button } from "./ui/kit";

type Selection = { id: string; name: string } | null;

export function CompareSelector({ catalog, initialA, initialB, date, legacy = false }: {
  catalog: AnalyticsCatalog;
  initialA: Selection;
  initialB: Selection;
  date: string;
  legacy?: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  function apply(nextA: Selection, nextB: Selection, nextDate = date) {
    const sp = new URLSearchParams(searchParams.toString());
    if(nextA) sp.set("playerA",nextA.id); else sp.delete("playerA");
    if(nextB) sp.set("playerB",nextB.id); else sp.delete("playerB");
    const additional = (sp.get("players") ?? "").split(",").map(id => id.trim()).filter(Boolean).slice(2)
      .filter(id => id !== nextA?.id && id !== nextB?.id);
    if(nextA && nextB && additional.length) sp.set("players",[nextA.id,nextB.id,...additional].join(","));
    else sp.delete("players");
    if(legacy) {sp.set("date",nextDate);sp.set("snapshotId",catalog.snapshot_id);}
    router.push(`/compare?${sp.toString()}`);
  }
  const contextParams = new URLSearchParams(buildPreservedContextUrl("/compare", new URLSearchParams(searchParams.toString())).split("?")[1]);
  const [a, setA] = useState(initialA);
  const [b, setB] = useState(initialB);
  const initialKey = JSON.stringify([initialA,initialB]);
  const [previousInitial,setPreviousInitial] = useState(initialKey);
  if(initialKey !== previousInitial) {setPreviousInitial(initialKey);setA(initialA);setB(initialB);}
  return <form action="/compare" className="compare-controls fo11-selectors" method="get" onSubmit={event => {event.preventDefault();apply(a,b);}}>
    {Array.from(contextParams).map(([name, value]) => <input key={name} name={name} value={value} type="hidden" />)}
    <input name="snapshotId" type="hidden" value={catalog.snapshot_id} />
    <input name="playerA" type="hidden" value={a?.id ?? ""} />
    <input name="playerB" type="hidden" value={b?.id ?? ""} />
    {([0, 1] as const).map((side) => <div className="compare-picker" key={side}>
      <EntityField releaseId={searchParams.get("releaseId") || searchParams.get("release_id")} season={searchParams.get("season")} phase={searchParams.get("phase")} beforeDate={searchParams.get("beforeDate") || searchParams.get("before_date")} label={`Player ${side === 0 ? "A" : "B"}`} value={(side === 0 ? a : b)?.id ?? ""} initialName={(side === 0 ? a : b)?.name} required onChange={(id, items) => { const selection = id ? {id, name: items[0].display_name} : null; if(side === 0) {setA(selection);if(selection && b && selection.id !== b.id)apply(selection,b);} else {setB(selection);if(selection && a && selection.id !== a.id)apply(a,selection);} }} />
    </div>)}
    {legacy && <div className="compare-date"><label htmlFor="compare-date">Replay date</label><select value={date} onChange={event => apply(a,b,event.target.value)} id="compare-date" name="date">{!catalog.supported_replay_dates.includes(date) && <option value={date}>{formatDate(date)} · unsupported</option>}{catalog.supported_replay_dates.map((value) => <option key={value} value={value}>{formatDate(value)}</option>)}</select></div>}
    <Button size="lg" disabled={!a || !b} onClick={() => { setA(b); setB(a);apply(b,a); }}>Swap players</Button>
    <p className="form-hint" role="status">{a?.id === b?.id && a ? "Choose two different players." : ""}</p>
  </form>;
}
