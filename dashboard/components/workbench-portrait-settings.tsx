"use client";

import { useState } from "react";
import { enqueueJob } from "@/lib/workbench-api";
import { useToast } from "./ui/toast";
import { ArticleSection } from "./ui/article-layout";
import { Button, ButtonSummary } from "./ui/kit";

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
      const statusText = `Portrait acquisition job ${res.status}. Track it in Data Status.`;
      setMsg(statusText);
      toast({
        title: "Portrait Job Enqueued",
        description: statusText,
        variant: "positive",
      });
    } catch (err) {
      const errText = `Could not queue portraits: ${err instanceof Error ? err.message : "the job was not accepted"}`;
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

  const count = (value: number) => (available ? value.toLocaleString("en-US") : "Unknown");

  return (
    <ArticleSection
      id="portraits"
      title="Player portraits"
      actions={<Button size="xs" variant="primary" icon="camera" onClick={handleAcquire} loading={loading}>{loading ? "Queuing…" : "Acquire More Portraits"}</Button>}
    >
      <p>Headshots are cached locally on a best-effort basis. A missing photo never excludes a player from analytics.</p>
      <dl className="ui-article-facts">
        <div><dt>Cached portraits</dt><dd>{count(active)}</dd></div>
        <div><dt>Players in the research dataset</dt><dd>{count(totalPlayers)}</dd></div>
        <div><dt>Stored image files</dt><dd>{count(totalCached)}</dd></div>
      </dl>
      {msg && <p role="status">{msg}</p>}
      <details className="ui-why">
        <ButtonSummary>Source and Storage</ButtonSummary>
        <dl className="ui-why-body ui-article-facts">
          <div><dt>Local cache path</dt><dd className="font-mono">{storagePath}</dd></div>
          <div><dt>Source CDN</dt><dd className="font-mono">cdn.nba.com/headshots/nba/latest/1040x760/</dd></div>
          <div><dt>Serving route</dt><dd className="font-mono">/api/workbench/players/&#123;id&#125;/portrait?size=64…288</dd></div>
        </dl>
      </details>
    </ArticleSection>
  );
}
