"use client";

import { Fragment, useState } from "react";
import { getExportUrl, reproduceInvestigation } from "@/lib/workbench-api";
import { formatDate } from "@/lib/format-date";
import { humanLabel } from "@/lib/route-availability";
import type { InvestigationReproduce, SavedInvestigation } from "@/lib/types";
import { DataDetailsButton } from "./ui/data-details";
import { GatedNote } from "./ui/gated-note";
import { Button, ButtonLink } from "./ui/kit";

/** Legacy archive investigations: original IDs, result signatures and export contracts are kept. */
export function WorkbenchInvestigationsList({ items }: { items: SavedInvestigation[] }) {
  const [reproduceState, setReproduceState] = useState<Record<string, { loading: boolean; result?: InvestigationReproduce; error?: string }>>({});

  const handleReproduce = async (id: string) => {
    setReproduceState(prev => ({ ...prev, [id]: { loading: true } }));
    try {
      const res = await reproduceInvestigation(id);
      setReproduceState(prev => ({ ...prev, [id]: { loading: false, result: res } }));
    } catch (err) {
      setReproduceState(prev => ({ ...prev, [id]: { loading: false, error: err instanceof Error ? err.message : "Reproduction check failed" } }));
    }
  };

  if (items.length === 0) {
    return <GatedNote action={<ButtonLink size="lg" href="/stats">Open Stats</ButtonLink>}>No legacy investigations. Save reproducible queries from Stats.</GatedNote>;
  }

  return (
    <div className="table-wrapper research-table" role="region" aria-label="Legacy investigations table" tabIndex={0}>
      <table className="data-table">
        <thead><tr><th>Title</th><th>Scope</th><th>Sort</th><th className="num">Rows</th><th>Saved</th><th>Actions</th></tr></thead>
        <tbody>{items.map(item => {
          const q = (item.query ?? {}) as Record<string, string>;
          const rep = reproduceState[item.id];
          const sp = new URLSearchParams();
          for (const [k, v] of Object.entries(q)) if (v) sp.set(k, String(v));
          return <Fragment key={item.id}>
            <tr>
              <th scope="row">{item.title}</th>
              <td>{q.season || "2025-26"} · {humanLabel(q.phase || "regular_season")}</td>
              <td>{(q.sort_metric || "pts").toUpperCase()}</td>
              <td className="num">{item.total_rows.toLocaleString("en-US")}</td>
              <td>{formatDate(item.created_at.slice(0, 10))}</td>
              <td><div className="research-row-actions">
                <Button size="lg" onClick={() => handleReproduce(item.id)} disabled={rep?.loading} title="Verify exact SHA-256 match against bound dataset">{rep?.loading ? "Verifying…" : "Verify Reproduction"}</Button>
                <ButtonLink size="lg" href={getExportUrl(item.id, "csv")} download={`investigation-${item.id}.csv`}>Export CSV</ButtonLink>
                <ButtonLink size="lg" href={getExportUrl(item.id, "json")} download={`investigation-${item.id}.json`}>Export JSON</ButtonLink>
                <ButtonLink size="lg" href={`/players?${sp.toString()}`}>Open in Explorer</ButtonLink>
                <DataDetailsButton label="Details" rows={[{ label: "Catalog", value: item.metric_version, mono: true }, { label: "Manifest SHA-256", value: item.manifest_sha256, mono: true }, { label: "Result SHA-256", value: item.result_sha256, mono: true }, { label: "ID", value: item.id, mono: true }]} />
              </div></td>
            </tr>
            {rep && (rep.error || rep.result) && <tr className="research-row-note"><td colSpan={6}>
              {rep.error && <div role="alert"><GatedNote tone="warning">Reproduction verification error: {rep.error}</GatedNote></div>}
              {rep.result && <div role="status"><GatedNote tone={rep.result.match ? "neutral" : "warning"}>{rep.result.match ? "PASS · Recomputed result hash matches the stored signature." : `MISMATCH: ${rep.result.reason}`}</GatedNote></div>}
            </td></tr>}
          </Fragment>;
        })}</tbody>
      </table>
    </div>
  );
}
