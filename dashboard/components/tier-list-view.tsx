"use client";

import { GatedNote } from "./ui/gated-note";
import { seasonEra, type PortraitEra } from "@/lib/portrait-source";
import { PageShell } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { LookupInput } from "./lookup-input";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useWorkspace } from "@/lib/workspace-context";
import { PlayerPortrait } from "./player-portrait";
import { useToast } from "./ui/toast";
import type { TierGroup, WorkbenchCatalog, WorkbenchQueryResponse } from "@/lib/types";
import { ExampleBoardsView } from "./example-boards-view";
import { EXAMPLE_BOARD_ID, exampleTierCopy } from "@/lib/example-boards";
import { executeWorkbenchQuery, getWorkbenchCatalog } from "@/lib/workbench-api";
import { resolveStatsQuery } from "@/lib/stats-query";
import { Button, IconButton, Segmented } from "./ui/kit";

const DEFAULT_TIER_COLORS = [
  "var(--color-category-1)", "var(--color-category-2)", "var(--color-category-3)",
  "var(--color-category-4)", "var(--color-category-5)", "var(--color-category-6)"
];

export function TierListView({ catalog, example = null }: { catalog?: WorkbenchCatalog | null; example?: WorkbenchQueryResponse | null } = {}) {
  const {
    tierLists,
    saveTierList,
    deleteTierList,
    favorites,
    isLoading,
    error: workspaceError
  } = useWorkspace();
  const { toast } = useToast();

  const [activeTierListId, setActiveTierListId] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");

  // Search state for adding players
  const [targetTier, setTargetTier] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Drag and drop state
  const [draggedPlayerId, setDraggedPlayerId] = useState<string | null>(null);
  const [draggedFromTierId, setDraggedFromTierId] = useState<string | null>(null);

  // Active Tier List
  const activeList = useMemo(() => {
    if (activeTierListId === EXAMPLE_BOARD_ID) return null;
    if (tierLists.length === 0) return null;
    if (activeTierListId) {
      const found = tierLists.find((t) => t.id === activeTierListId);
      if (found) return found;
    }
    return tierLists[0];
  }, [tierLists, activeTierListId]);

  const assignedIds = JSON.stringify((activeList?.tiers.flatMap(tier => tier.player_ids) ?? []).sort());
  const [identities, setIdentities] = useState<{ key: string; names: Record<string, string>; eras: Record<string, PortraitEra | null> } | null>(null);
  useEffect(() => {
    const ids: string[] = JSON.parse(assignedIds);
    if (!ids.length) return;
    let active = true;
    void (async () => {
      const resolved = catalog ?? await getWorkbenchCatalog();
      const query = resolveStatsQuery({ window: "season" }, resolved, "raw");
      query.page = { limit: 100 };
      let response = await executeWorkbenchQuery(query, { player_ids: ids });
      const players = [...response.items];
      while (active && response.has_more && response.next_cursor) {
        query.page = { limit: 100, cursor: response.next_cursor };
        response = await executeWorkbenchQuery(query, { player_ids: ids });
        players.push(...response.items);
      }
      if (active) setIdentities({ key: assignedIds, names: Object.fromEntries(players.map(player => [player.player_id, player.player_name])),
        // The reference season's team photo (Design Language, Identity).
        eras: Object.fromEntries(players.map(player => [player.player_id, seasonEra(query.season, player.teams)])) });
    })().catch(() => {});
    return () => { active = false; };
  }, [assignedIds, catalog]);
  const playerName = (id: string) => (identities?.key === assignedIds ? identities.names[id] : undefined) ?? example?.items.find(player => player.player_id === id)?.player_name ?? `Player #${id}`;

  const handleCopyExample = async () => {
    if (!example || copying || isLoading || workspaceError) return;
    setCopying(true);
    setCopyError(null);
    try {
      const res = await saveTierList(exampleTierCopy(example));
      if (res.tier_lists.length > 0) {
        setActiveTierListId(res.tier_lists[res.tier_lists.length - 1].id);
      }
    } catch (error) {
      setCopyError(error instanceof Error ? error.message : "Could not copy example. Try again.");
    } finally { setCopying(false); }
  };

  // Create new tier list
  const handleCreateListSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const defaultTiers: TierGroup[] = [
        ...["S", "A", "B", "C", "D"].map((label, index) => ({ tier_id: `tier-${label.toLowerCase()}`, label, color: DEFAULT_TIER_COLORS[index], player_ids: [] }))
      ];

      const res = await saveTierList({
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        tiers: defaultTiers
      });

      setIsCreatingList(false);
      setNewTitle("");
      setNewDescription("");
      if (res.tier_lists.length > 0) {
        setActiveTierListId(res.tier_lists[res.tier_lists.length - 1].id);
      }
      toast({
        title: "Tier List Created",
        description: `Created "${newTitle.trim()}".`,
        variant: "positive",
      });
    } catch (err) {
      toast({
        title: "Creation Error",
        description: err instanceof Error ? err.message : "Failed to create tier list",
        variant: "negative",
      });
    }
  };

  // Delete active tier list
  const handleDeleteActiveList = async () => {
    if (!activeList) return;
    if (!window.confirm(`Delete tier list "${activeList.title}"?`)) return;
    try {
      await deleteTierList(activeList.id);
      setActiveTierListId(null);
      toast({
        title: "Tier List Deleted",
        description: `Removed "${activeList.title}".`,
        variant: "info",
      });
    } catch (err) {
      toast({
        title: "Deletion Error",
        description: err instanceof Error ? err.message : "Failed to delete tier list",
        variant: "negative",
      });
    }
  };

  // Search input change


  // Add player to a tier
  const handleAddPlayerToTier = async (playerId: string, targetTierId: string) => {
    if (!activeList) return;

    // Check if player is already in any tier
    const allAssigned = activeList.tiers.flatMap((t) => t.player_ids);
    if (allAssigned.includes(playerId)) {
      toast({
        title: "Player Already Assigned",
        description: "This player is already assigned to a tier in this list.",
        variant: "negative",
      });
      return;
    }

    const updatedTiers = activeList.tiers.map((t) =>
      t.tier_id === targetTierId ? { ...t, player_ids: [...t.player_ids, playerId] } : t
    );

    try {
      await saveTierList({
        id: activeList.id,
        title: activeList.title,
        description: activeList.description,
        tiers: updatedTiers
      });
      setSearchQuery("");
      toast({
        title: "Player Added",
        description: "Added player to tier.",
        variant: "positive",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to add player to tier",
        variant: "negative",
      });
    }
  };

  // Move player from one tier to another (keyboard accessible or drag-and-drop)
  const handleMovePlayer = async (playerId: string, fromTierId: string, toTierId: string) => {
    if (!activeList || fromTierId === toTierId) return;

    const updatedTiers = activeList.tiers.map((t) => {
      if (t.tier_id === fromTierId) {
        return { ...t, player_ids: t.player_ids.filter((id) => id !== playerId) };
      }
      if (t.tier_id === toTierId) {
        return { ...t, player_ids: [...t.player_ids, playerId] };
      }
      return t;
    });

    try {
      await saveTierList({
        id: activeList.id,
        title: activeList.title,
        description: activeList.description,
        tiers: updatedTiers
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to move player");
    }
  };

  // Remove player completely from tier list
  const handleRemovePlayer = async (playerId: string, tierId: string) => {
    if (!activeList) return;

    const updatedTiers = activeList.tiers.map((t) =>
      t.tier_id === tierId
        ? { ...t, player_ids: t.player_ids.filter((id) => id !== playerId) }
        : t
    );

    try {
      await saveTierList({
        id: activeList.id,
        title: activeList.title,
        description: activeList.description,
        tiers: updatedTiers
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove player");
    }
  };

  // Add new tier row
  const handleAddTierRow = async () => {
    if (!activeList) return;
    const label = window.prompt("Enter new tier label (e.g. S+, A-, Role Players):", "Tier");
    if (!label?.trim()) return;

    const newTierId = `tier-${Date.now()}`;
    const color = DEFAULT_TIER_COLORS[activeList.tiers.length % DEFAULT_TIER_COLORS.length];
    const newTier: TierGroup = {
      tier_id: newTierId,
      label: label.trim(),
      color,
      player_ids: []
    };

    const updatedTiers = [...activeList.tiers, newTier];
    try {
      await saveTierList({
        id: activeList.id,
        title: activeList.title,
        description: activeList.description,
        tiers: updatedTiers
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add tier row");
    }
  };

  // Move tier row up
  const handleMoveTierUp = async (tierIdx: number) => {
    if (!activeList || tierIdx <= 0) return;
    const tiers = [...activeList.tiers];
    const temp = tiers[tierIdx];
    tiers[tierIdx] = tiers[tierIdx - 1];
    tiers[tierIdx - 1] = temp;

    try {
      await saveTierList({
        id: activeList.id,
        title: activeList.title,
        description: activeList.description,
        tiers
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to reorder tier");
    }
  };

  // Move tier row down
  const handleMoveTierDown = async (tierIdx: number) => {
    if (!activeList || tierIdx >= activeList.tiers.length - 1) return;
    const tiers = [...activeList.tiers];
    const temp = tiers[tierIdx];
    tiers[tierIdx] = tiers[tierIdx + 1];
    tiers[tierIdx + 1] = temp;

    try {
      await saveTierList({
        id: activeList.id,
        title: activeList.title,
        description: activeList.description,
        tiers
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to reorder tier");
    }
  };

  // Delete a tier row
  const handleDeleteTierRow = async (tierId: string) => {
    if (!activeList) return;
    const tier = activeList.tiers.find((t) => t.tier_id === tierId);
    if (!tier) return;
    if (
      tier.player_ids.length > 0 &&
      !window.confirm(`Delete tier "${tier.label}"? ${tier.player_ids.length} player(s) will be unassigned.`)
    ) {
      return;
    }

    const updatedTiers = activeList.tiers.filter((t) => t.tier_id !== tierId);
    try {
      await saveTierList({
        id: activeList.id,
        title: activeList.title,
        description: activeList.description,
        tiers: updatedTiers
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete tier row");
    }
  };

  // Drag event handlers
  const handleDragStart = (playerId: string, fromTierId: string) => {
    setDraggedPlayerId(playerId);
    setDraggedFromTierId(fromTierId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (targetTierId: string) => {
    if (draggedPlayerId && draggedFromTierId && draggedFromTierId !== targetTierId) {
      await handleMovePlayer(draggedPlayerId, draggedFromTierId, targetTierId);
    }
    setDraggedPlayerId(null);
    setDraggedFromTierId(null);
  };

  return (
    <PageShell template="board" className="tier-workspace-wrapper">
      <PageHeader
        title="Tier Lists"
        subtitle="Your own player tiers, arranged by drag and drop or keyboard."
        actions={<>
          {activeList && <Button size="sm" variant="secondary" icon="plus" onClick={handleAddTierRow}>Add Tier Row</Button>}
          <Button size="sm" variant="primary" icon="plus" onClick={() => setIsCreatingList(true)}>New Tier List</Button>
        </>}
      />

      {tierLists.length > 0 && <Button size="sm" variant="secondary" pressed={!activeList} onClick={() => setActiveTierListId(activeList ? EXAMPLE_BOARD_ID : null)}>{activeList ? "View Minutes Example" : "My tier lists"}</Button>}
      {activeList && <GatedNote why="Tier allocations reflect personal subjective categorizations. Cards support HTML5 drag-and-drop as well as accessible keyboard controls (move up/down buttons or tier dropdown).">
        Tiers are personal categorizations.
      </GatedNote>}

      {/* CREATE MODAL */}
      {isCreatingList && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsCreatingList(false);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-card tier-modal-card">
            <div className="modal-header">
              <h2 className="modal-title">Create New Tier List</h2>
              <IconButton size="xs" icon="close" label="Close create tier list dialog" onClick={() => setIsCreatingList(false)} />
            </div>
            <form onSubmit={handleCreateListSubmit} className="modal-body tier-modal-body">
              <div>
                <label htmlFor="new-tier-title" className="tier-modal-label">
                  Tier List Title *
                </label>
                <input
                  id="new-tier-title"
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. 2024-25 Playoff Scorers, Shot Creators"
                  required
                  className="tier-modal-input"
                />
              </div>

              <div>
                <label htmlFor="new-tier-desc" className="tier-modal-label">
                  Description / Criteria (optional)
                </label>
                <textarea
                  id="new-tier-desc"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Subjective criteria or scoring rationale..."
                  rows={3}
                  className="tier-modal-textarea"
                />
              </div>

              <div className="modal-footer tier-modal-footer">
                <Button size="lg"
                  onClick={() => setIsCreatingList(false)}>
                  Cancel
                </Button>
                <Button size="lg" variant="primary"
                  type="submit"
                  disabled={!newTitle.trim()}>
                  Create Tier List
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TIER LIST TABS & CONTENT */}
      {!activeList ? (
        <ExampleBoardsView data={example} kind="tiers" onCopy={() => void handleCopyExample()} copying={copying} copyError={copyError ?? workspaceError} copyDisabled={isLoading || !!workspaceError} />
      ) : (
        <div className="tier-list-container">
          {/* Tabs Row */}
          <div className="stats-preset-tabs-wrapper tier-tabs-bar">
            <Segmented size="lg" label="Personal Tier Lists" value={activeList?.id ?? ""} onChange={setActiveTierListId}
              options={tierLists.map((tl) => ({ value: tl.id, title: tl.description || tl.title,
                label: <>{tl.title}<span className="tier-tab-count">({tl.tiers.reduce((acc, t) => acc + t.player_ids.length, 0)})</span></> }))} />

            {/* Actions for active tier list */}
            {activeList && (
              <div className="tier-header-actions">
                <Button size="lg" variant="danger" onClick={handleDeleteActiveList} title="Delete this tier list">
                  Delete List
                </Button>
              </div>
            )}
          </div>

          {/* ACTIVE TIER LIST CONTENT */}
          {activeList && (
            <div className="tier-content-col">
              {/* Title & Description */}
              <div className="tier-active-header">
                <div>
                  <h2 className="tier-active-title">
                    {activeList.title}
                  </h2>
                  {activeList.description && (
                    <p className="tier-active-desc">
                      {activeList.description}
                    </p>
                  )}
                </div>
                <div className="font-mono text-xs text-muted">
                  {activeList.tiers.reduce((acc, t) => acc + t.player_ids.length, 0)} total assigned player(s)
                </div>
              </div>

              {/* SEARCH & ADD PLAYER BAR */}
              <div className="tier-add-bar">
                <div className="tier-add-input-wrap"><label>Assign to tier<select value={activeList.tiers.some(t=>t.tier_id === targetTier) ? targetTier : activeList.tiers[0]?.tier_id ?? ""} onChange={event=>setTargetTier(event.target.value)}>{activeList.tiers.map(t=><option key={t.tier_id} value={t.tier_id}>{t.label}</option>)}</select></label><LookupInput label="Add player to tier" value={searchQuery} onChange={setSearchQuery} kinds={["player"]} excludedIds={activeList.tiers.flatMap(t=>t.player_ids)} disabled={!activeList.tiers.length} onSelect={item=>{setSearchQuery("");void handleAddPlayerToTier(item.canonical_id,activeList.tiers.some(t=>t.tier_id === targetTier) ? targetTier : activeList.tiers[0].tier_id);}} /></div>

                {/* Quick Add from Favorites */}
                {favorites.length > 0 && (
                  <div className="tier-quick-favorites">
                    <span className="text-xs text-muted">Favorites:</span>
                    {favorites.slice(0, 4).map((favId) => {
                      const isAssigned = activeList.tiers.some((t) => t.player_ids.includes(favId));
                      return (
                        <Button key={favId} size="xs" variant="ghost" icon={isAssigned ? "check" : "plus"} disabled={isAssigned}
                          onClick={() => {
                            const firstTier = activeList.tiers[0]?.tier_id;
                            if (firstTier) handleAddPlayerToTier(favId, firstTier);
                          }}
                          title={isAssigned ? "Already in a tier" : `Add to ${activeList.tiers[0]?.label || "first tier"}`}>
                          #{favId}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* TIER ROWS CONTAINER */}
              <div className="tier-rows-list">
                {activeList.tiers.map((tier, tierIdx) => {
                  const isDragTarget = draggedPlayerId && draggedFromTierId !== tier.tier_id;

                  return (
                    <div
                      key={tier.tier_id}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(tier.tier_id)}
                      className={`tier-row-card ${isDragTarget ? "drag-target" : ""}`}
                    >
                      {/* Tier Label Box */}
                      <div
                        className="tier-label-box"
                        style={{ "--tier-color": tier.color || "var(--color-status-unknown)" } as React.CSSProperties}
                      >
                        <span>{tier.label}</span>
                        <span className="tier-label-count">
                          ({tier.player_ids.length})
                        </span>

                        {/* Tier Row Controls (Reorder / Delete) */}
                        <div className="tier-row-controls">
                          <IconButton size="xs" variant="secondary" icon="chevron-up" onClick={() => handleMoveTierUp(tierIdx)} disabled={tierIdx === 0}
                            label={`Move tier ${tier.label} up`} title="Move tier row up" />
                          <IconButton size="xs" variant="secondary" icon="chevron-down" onClick={() => handleMoveTierDown(tierIdx)}
                            disabled={tierIdx === activeList.tiers.length - 1} label={`Move tier ${tier.label} down`} title="Move tier row down" />
                          <IconButton size="xs" variant="secondary" icon="close" onClick={() => handleDeleteTierRow(tier.tier_id)}
                            label={`Delete tier ${tier.label}`} title="Delete this tier row" />
                        </div>
                      </div>

                      {/* Tier Cards Area */}
                      <div className="tier-cards-area">
                        {tier.player_ids.length === 0 ? (
                          <div className="tier-empty-slot">
                            Drag players here or use keyboard controls from search.
                          </div>
                        ) : (
                          tier.player_ids.map((pid) => (
                            <div
                              key={pid}
                              draggable
                              onDragStart={() => handleDragStart(pid, tier.tier_id)}
                              className="tier-player-chip"
                            >
                              <PlayerPortrait playerId={pid} name={playerName(pid)} size="sm" era={identities?.key === assignedIds ? identities.eras[pid] : null} />
                              <div>
                                <Link
                                  href={`/players/${pid}`}
                                  className="tier-player-link"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {playerName(pid)}
                                </Link>
                              </div>

                              {/* Accessible Keyboard Move Selector */}
                              <select
                                aria-label={`Move ${playerName(pid)} to tier`}
                                value={tier.tier_id}
                                onChange={(e) => handleMovePlayer(pid, tier.tier_id, e.target.value)}
                                className="tier-move-select"
                              >
                                {activeList.tiers.map((t) => (
                                  <option key={t.tier_id} value={t.tier_id}>
                                    {t.label}
                                  </option>
                                ))}
                              </select>

                              {/* Remove button */}
                              <IconButton size="xs" variant="danger" icon="close" onClick={() => handleRemovePlayer(pid, tier.tier_id)}
                                label={`Remove ${playerName(pid)} from tier list`} title="Remove player from tier list" />
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
