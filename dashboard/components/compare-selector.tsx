"use client";

import { useSearchParams } from "next/navigation";
import { buildPreservedContextUrl } from "@/lib/query-url";
import { useState } from "react";
import { EntityField } from "./entity-picker";
import type { AnalyticsCatalog } from "@/lib/types";

type Selection = { id: string; name: string } | null;

export function CompareSelector({ catalog, initialA, initialB, date }: {
  catalog: AnalyticsCatalog;
  initialA: Selection;
  initialB: Selection;
  date: string;
}) {
  const searchParams = useSearchParams();
  const contextParams = new URLSearchParams(buildPreservedContextUrl("/compare", new URLSearchParams(searchParams.toString())).split("?")[1]);
  const [a, setA] = useState(initialA);
  const [b, setB] = useState(initialB);
  const initialKey = JSON.stringify([initialA,initialB]);
  const [previousInitial,setPreviousInitial] = useState(initialKey);
  if(initialKey !== previousInitial) {setPreviousInitial(initialKey);setA(initialA);setB(initialB);}
  return <form action="/compare" className="compare-controls" method="get">
    {Array.from(contextParams).map(([name, value]) => <input key={name} name={name} value={value} type="hidden" />)}
    <input name="snapshotId" type="hidden" value={catalog.snapshot_id} />
    <input name="playerA" type="hidden" value={a?.id ?? ""} />
    <input name="playerB" type="hidden" value={b?.id ?? ""} />
    {([0, 1] as const).map((side) => <div className="compare-picker" key={side}>
      <EntityField label={`Player ${side === 0 ? "A" : "B"}`} value={(side === 0 ? a : b)?.id ?? ""} initialName={(side === 0 ? a : b)?.name} required onChange={(id, items) => { const selection = id ? {id, name: items[0].display_name} : null; if(side === 0) setA(selection); else setB(selection); }} />
    </div>)}
    <div className="compare-date"><label htmlFor="compare-date">Replay date</label><select defaultValue={date} id="compare-date" name="date">{!catalog.supported_replay_dates.includes(date) && <option value={date}>{date} · unsupported</option>}{catalog.supported_replay_dates.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
    <button className="button button-dark" disabled={!a || !b || a.id === b.id} type="submit">Compare players</button>
    <button className="button button-small" disabled={!a || !b} onClick={() => { setA(b); setB(a); }} type="button">Swap players</button>
    <p className="form-hint" role="status">{a?.id === b?.id && a ? "Choose two different players." : ""}</p>
  </form>;
}
