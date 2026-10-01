"use client";

import { useState } from "react";
import { enqueueJob } from "@/lib/workbench-api";

interface PortraitSettingsProps {
  totalCached: number;
  active: number;
  totalPlayers: number;
  storagePath: string;
}

export function WorkbenchPortraitSettings({
  totalCached,
  active,
  totalPlayers,
  storagePath
}: PortraitSettingsProps) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const handleAcquire = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await enqueueJob("portraits", { limit: 200 });
      setMsg(`Portrait acquisition job enqueued: ${res.job_id.slice(0, 8)}... (${res.status})`);
    } catch (err) {
      setMsg(`Error: ${err instanceof Error ? err.message : "Failed to enqueue job"}`);
    } finally {
      setLoading(false);
    }
  };

  const coveragePct = totalPlayers > 0 ? ((active / totalPlayers) * 100).toFixed(1) : "0.0";

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Player Headshot Portrait Cache</h2>
          <p className="text-muted text-xs" style={{ margin: "0.2rem 0 0" }}>
            Best-effort headshots cached locally by cryptographic SHA-256 hash. Missing photos never exclude players from analytics.
          </p>
        </div>
        <button
          type="button"
          className="button button-small button-primary"
          onClick={handleAcquire}
          disabled={loading}
        >
          {loading ? "Acquiring…" : "📸 Acquire More Portraits"}
        </button>
      </div>

      {msg && (
        <div className="notice-box" style={{ marginBottom: "1rem" }}>
          {msg}
        </div>
      )}

      <div className="grid-4" style={{ marginBottom: "1rem" }}>
        <div className="stat-card">
          <span className="stat-value font-mono">{active}</span>
          <span className="stat-label">Active Cached</span>
          <span className="stat-subtext">Verified image files</span>
        </div>
        <div className="stat-card">
          <span className="stat-value font-mono">{totalPlayers}</span>
          <span className="stat-label">Total Players</span>
          <span className="stat-subtext">In research dataset</span>
        </div>
        <div className="stat-card">
          <span className="stat-value font-mono text-accent">{coveragePct}%</span>
          <span className="stat-label">Measured Coverage</span>
          <span className="stat-subtext">Best-effort coverage</span>
        </div>
        <div className="stat-card">
          <span className="stat-value font-mono">{totalCached}</span>
          <span className="stat-label">Total Assets</span>
          <span className="stat-subtext">PNG format</span>
        </div>
      </div>

      <div className="lineage-meta-box">
        <div className="meta-row">
          <span className="meta-label">Local Cache Path</span>
          <span className="meta-value font-mono text-xs">{storagePath}</span>
        </div>
        <div className="meta-row">
          <span className="meta-label">Source CDN</span>
          <span className="meta-value font-mono text-xs">cdn.nba.com/headshots/nba/latest/260x190/</span>
        </div>
        <div className="meta-row">
          <span className="meta-label">Serving Route</span>
          <span className="meta-value font-mono text-xs">/api/workbench/players/&#123;id&#125;/portrait</span>
        </div>
      </div>
    </div>
  );
}
