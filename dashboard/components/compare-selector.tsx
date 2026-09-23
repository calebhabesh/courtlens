"use client";

import { useState } from "react";
import { browserApi } from "@/lib/api";
import type { AnalyticsCatalog, AnalyticsSearch } from "@/lib/types";

type Selection = { id: string; name: string } | null;

export function CompareSelector({ catalog, initialA, initialB, date }: {
  catalog: AnalyticsCatalog;
  initialA: Selection;
  initialB: Selection;
  date: string;
}) {
  const [a, setA] = useState(initialA);
  const [b, setB] = useState(initialB);
  const [query, setQuery] = useState(["", ""]);
  const [matches, setMatches] = useState<[AnalyticsSearch["players"], AnalyticsSearch["players"]]>([[], []]);
  const [message, setMessage] = useState("");

  async function search(side: 0 | 1) {
    const term = query[side].trim();
    if (!term) return;
    setMessage("Searching players…");
    const params = new URLSearchParams({ query: term, snapshotId: catalog.snapshot_id });
    try {
      const response = await fetch(`${browserApi}/api/analytics/players?${params}`);
      if (!response.ok) throw new Error("search failed");
      const body = (await response.json()) as AnalyticsSearch;
      setMatches((current) => current.map((list, index) => index === side ? body.players : list) as typeof current);
      setMessage(body.players.length ? `${body.players.length} matches for player ${side === 0 ? "A" : "B"}.` : `No matches for “${term}”.`);
    } catch {
      setMessage("Search is unavailable. Try again.");
    }
  }

  function choose(side: 0 | 1, player: Selection) {
    if (side === 0) setA(player); else setB(player);
    setMatches((current) => current.map((list, index) => index === side ? [] : list) as typeof current);
  }

  return <form action="/compare" className="compare-controls" method="get">
    <input name="snapshotId" type="hidden" value={catalog.snapshot_id} />
    <input name="playerA" type="hidden" value={a?.id ?? ""} />
    <input name="playerB" type="hidden" value={b?.id ?? ""} />
    {([0, 1] as const).map((side) => <div className="compare-picker" key={side}>
      <label htmlFor={`compare-query-${side}`}>Player {side === 0 ? "A" : "B"}</label>
      <div className="compare-search-line">
        <input id={`compare-query-${side}`} onChange={(event) => setQuery((current) => current.map((value, index) => index === side ? event.target.value : value))} placeholder="Search by name" value={query[side]} />
        <button className="button button-small" onClick={() => search(side)} type="button">Search</button>
      </div>
      <p>Selected: <strong>{(side === 0 ? a : b)?.name ?? "None"}</strong></p>
      {matches[side].length > 0 && <ul className="compare-results">{matches[side].map((player) => <li key={player.id}><button onClick={() => choose(side, player)} type="button">{player.name}</button></li>)}</ul>}
    </div>)}
    <div className="compare-date"><label htmlFor="compare-date">Replay date</label><select defaultValue={date} id="compare-date" name="date">{!catalog.supported_replay_dates.includes(date) && <option value={date}>{date} · unsupported</option>}{catalog.supported_replay_dates.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
    <button className="button button-dark" disabled={!a || !b || a.id === b.id} type="submit">Compare players</button>
    <button className="button button-small" disabled={!a || !b} onClick={() => { setA(b); setB(a); }} type="button">Swap players</button>
    <p className="form-hint" role="status">{a?.id === b?.id && a ? "Choose two different players." : message}</p>
  </form>;
}
