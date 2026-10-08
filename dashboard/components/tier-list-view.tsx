"use client";
import { LookupInput } from "./lookup-input";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useWorkspace } from "@/lib/workspace-context";
import { PlayerPortrait } from "./player-portrait";
import { useToast } from "./ui/toast";
import type { TierGroup } from "@/lib/types";

const DEFAULT_TIER_COLORS = [
  "#ff4d4f", // S - Red
  "#fa8c16", // A - Orange
  "#fadb14", // B - Yellow
  "#52c41a", // C - Green
  "#1890ff", // D - Blue
  "#722ed1"  // F / Custom - Purple
];

export function TierListView() {
  const {
    tierLists,
    saveTierList,
    deleteTierList,
    favorites
  } = useWorkspace();
  const { toast } = useToast();

  const [activeTierListId, setActiveTierListId] = useState<string | null>(null);
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
    if (tierLists.length === 0) return null;
    if (activeTierListId) {
      const found = tierLists.find((t) => t.id === activeTierListId);
      if (found) return found;
    }
    return tierLists[0];
  }, [tierLists, activeTierListId]);

  // Create default tier list if none exists
  const handleCreateDefaultList = async () => {
    try {
      const defaultTiers: TierGroup[] = [
        { tier_id: "tier-s", label: "S", color: "#ff4d4f", player_ids: [] },
        { tier_id: "tier-a", label: "A", color: "#fa8c16", player_ids: [] },
        { tier_id: "tier-b", label: "B", color: "#fadb14", player_ids: [] },
        { tier_id: "tier-c", label: "C", color: "#52c41a", player_ids: [] },
        { tier_id: "tier-d", label: "D", color: "#1890ff", player_ids: [] }
      ];

      const res = await saveTierList({
        title: "2024-25 Player Tiers",
        description: "Personal subjective tier ranking of NBA players across tiers S through D.",
        tiers: defaultTiers
      });

      if (res.tier_lists.length > 0) {
        setActiveTierListId(res.tier_lists[res.tier_lists.length - 1].id);
      }
      toast({
        title: "Default Tiers Created",
        description: "Created default 2024-25 player tiers.",
        variant: "positive",
      });
    } catch (err) {
      toast({
        title: "Creation Error",
        description: err instanceof Error ? err.message : "Failed to create default tier list",
        variant: "negative",
      });
    }
  };

  // Create new tier list
  const handleCreateListSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const defaultTiers: TierGroup[] = [
        { tier_id: "tier-s", label: "S", color: "#ff4d4f", player_ids: [] },
        { tier_id: "tier-a", label: "A", color: "#fa8c16", player_ids: [] },
        { tier_id: "tier-b", label: "B", color: "#fadb14", player_ids: [] },
        { tier_id: "tier-c", label: "C", color: "#52c41a", player_ids: [] },
        { tier_id: "tier-d", label: "D", color: "#1890ff", player_ids: [] }
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
    <div className="workbench-content tier-workspace-wrapper">
      {/* Header */}
      <div className="page-header tier-header">
        <div>
          <h1 className="page-title">Tier List Builder</h1>
          <p className="page-subtitle">
            F27 Tier Lists · Interactive personal tier lists with drag-and-drop, full keyboard accessibility, and local persistence.
          </p>
        </div>
        <div className="tier-header-actions">
          {activeList && (
            <button
              type="button"
              onClick={handleAddTierRow}
              className="button button-small"
              title="Add a new tier row"
            >
              + Add Tier Row
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsCreatingList(true)}
            className="button button-primary button-small"
          >
            + New Tier List
          </button>
        </div>
      </div>

      {/* Notice */}
      <div className="notice-box tier-notice">
        <strong className="text-accent text-xs">Subjective Categorization Notice:</strong>
        <p className="text-xs text-muted tier-notice-text">
          Tier allocations reflect personal subjective categorizations. Cards support HTML5 drag-and-drop as well as accessible keyboard controls (▲/▼ or tier dropdown).
        </p>
      </div>

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
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsCreatingList(false)}
              >
                ✕
              </button>
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
                <button
                  type="button"
                  onClick={() => setIsCreatingList(false)}
                  className="button button-small"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-small button-primary"
                  disabled={!newTitle.trim()}
                >
                  Create Tier List
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TIER LIST TABS & CONTENT */}
      {tierLists.length === 0 ? (
        <div className="tier-empty-box">
          <h3 className="tier-empty-title">No Tier Lists Created Yet</h3>
          <p className="tier-empty-desc">
            Create an S/A/B/C/D tier list to categorize NBA players with local persistence, drag-and-drop, and accessible keyboard assignment.
          </p>
          <button
            type="button"
            onClick={handleCreateDefaultList}
            className="button button-primary"
          >
            Create Default S/A/B/C/D Tier List
          </button>
        </div>
      ) : (
        <div className="tier-list-container">
          {/* Tabs Row */}
          <div className="stats-preset-tabs-wrapper tier-tabs-bar">
            <div className="stats-preset-tabs" role="tablist" aria-label="Personal Tier Lists">
              {tierLists.map((tl) => {
                const isActive = tl.id === activeList?.id;
                const totalPlayers = tl.tiers.reduce((acc, t) => acc + t.player_ids.length, 0);
                return (
                  <button
                    key={tl.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTierListId(tl.id)}
                    className={`stats-preset-tab ${isActive ? "active" : ""}`}
                    title={tl.description || tl.title}
                  >
                    <span>{tl.title}</span>
                    <span className="tier-tab-count">
                      ({totalPlayers})
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Actions for active tier list */}
            {activeList && (
              <div className="tier-header-actions">
                <button
                  type="button"
                  onClick={handleDeleteActiveList}
                  className="button button-small tier-delete-btn"
                  title="Delete this tier list"
                >
                  Delete List
                </button>
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
                        <button
                          key={favId}
                          type="button"
                          disabled={isAssigned}
                          onClick={() => {
                            const firstTier = activeList.tiers[0]?.tier_id;
                            if (firstTier) handleAddPlayerToTier(favId, firstTier);
                          }}
                          className="button button-small tier-quick-fav-btn"
                          title={isAssigned ? "Already in a tier" : `Add to ${activeList.tiers[0]?.label || "first tier"}`}
                        >
                          {isAssigned ? "✓" : "+"} #{favId}
                        </button>
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
                        style={{ "--tier-color": tier.color || "#323b49" } as React.CSSProperties}
                      >
                        <span>{tier.label}</span>
                        <span className="tier-label-count">
                          ({tier.player_ids.length})
                        </span>

                        {/* Tier Row Controls (Reorder / Delete) */}
                        <div className="tier-row-controls">
                          <button
                            type="button"
                            onClick={() => handleMoveTierUp(tierIdx)}
                            disabled={tierIdx === 0}
                            className="tier-reorder-btn"
                            title="Move tier row up"
                            aria-label={`Move tier ${tier.label} up`}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveTierDown(tierIdx)}
                            disabled={tierIdx === activeList.tiers.length - 1}
                            className="tier-reorder-btn"
                            title="Move tier row down"
                            aria-label={`Move tier ${tier.label} down`}
                          >
                            ▼
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTierRow(tier.tier_id)}
                            className="tier-reorder-btn"
                            title="Delete this tier row"
                            aria-label={`Delete tier ${tier.label}`}
                          >
                            ✕
                          </button>
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
                              <PlayerPortrait playerId={pid} name={`#${pid}`} size="sm" />
                              <div>
                                <Link
                                  href={`/players/${pid}`}
                                  className="tier-player-link"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Player #{pid}
                                </Link>
                              </div>

                              {/* Accessible Keyboard Move Selector */}
                              <select
                                aria-label={`Move Player #${pid} to tier`}
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
                              <button
                                type="button"
                                onClick={() => handleRemovePlayer(pid, tier.tier_id)}
                                className="tier-remove-btn"
                                title="Remove player from tier list"
                                aria-label={`Remove Player #${pid} from tier list`}
                              >
                                ✕
                              </button>
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
    </div>
  );
}
