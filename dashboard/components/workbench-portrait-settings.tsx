"use client";

import { useState } from "react";
import { enqueueJob } from "@/lib/workbench-api";
import { useToast } from "./ui/toast";

interface PortraitSettingsProps {
  available?: boolean;
  totalCached: number;
  active: number;
  totalPlayers: number;
  storagePath: string;
}

export function WorkbenchPortraitSettings({
  available = true,
  totalCached,
  active,
  totalPlayers,
  storagePath
}: PortraitSettingsProps) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const { toast } = useToast();

  const handleAcquire = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await enqueueJob("portraits", { limit: 200 });
      const shortId = res.job_id ? res.job_id.slice(0, 8) : "job";
      const statusText = `Portrait acquisition job enqueued: ${shortId}... (${res.status})`;
      setMsg(statusText);
      toast({
        title: "Portrait Job Enqueued",
        description: statusText,
        variant: "positive",
      });
    } catch (err) {
      const errText = `Error: ${err instanceof Error ? err.message : "Failed to enqueue job"}`;
      setMsg(errText);
      toast({
        title: "Acquisition Error",
        description: err instanceof Error ? err.message : "Failed to enqueue job",
        variant: "negative",
      });
    } finally {
      setLoading(false);
    }
  };

  const coveragePct = totalPlayers > 0 ? ((active / totalPlayers) * 100).toFixed(1) : "0.0";

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Player portraits</h2>
          <p className="text-muted text-xs portrait-settings-desc">
            Best-effort headshots cached locally by cryptographic SHA-256 hash. Missing photos never exclude players from analytics.
          </p>
        </div>
        <button
          type="button"
          className="button button-small button-primary"
          onClick={handleAcquire}
          disabled={loading}
        >
          {loading ? "Queuing…" : "Acquire more portraits"}
        </button>
      </div>

      {msg && (
        <div className="notice-box portrait-settings-notice">
          {msg}
        </div>
      )}

      <div className="grid-4 portrait-settings-grid">
        <div className="stat-card">
          <span className="stat-value font-mono">{available ? active : "Unknown"}</span>
          <span className="stat-label">Active Cached</span>
          <span className="stat-subtext">Verified image files</span>
        </div>
        <div className="stat-card">
          <span className="stat-value font-mono">{available ? totalPlayers : "Unknown"}</span>
          <span className="stat-label">Total Players</span>
          <span className="stat-subtext">In research dataset</span>
        </div>
        <div className="stat-card">
          <span className="stat-value font-mono text-accent">{available ? `${coveragePct}%` : "Unknown"}</span>
          <span className="stat-label">Measured Coverage</span>
          <span className="stat-subtext">Best-effort coverage</span>
        </div>
        <div className="stat-card">
          <span className="stat-value font-mono">{available ? totalCached : "Unknown"}</span>
          <span className="stat-label">Total Assets</span>
          <span className="stat-subtext">PNG format</span>
        </div>
      </div>

      <details><summary>Portrait source and storage</summary><div className="lineage-meta-box">
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
      </div></details>
    </div>
  );
}
