"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useWorkspace } from "@/lib/workspace-context";
import { PlayerPortrait } from "./player-portrait";
import { queryLookup } from "@/lib/workbench-api";
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

  const [activeTierListId, setActiveTierListId] = useState<string | null>(null);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");

  // Search state for adding players
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; team?: string; portraitUrl?: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);

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
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create default tier list");
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
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create tier list");
    }
  };

  // Delete active tier list
  const handleDeleteActiveList = async () => {
    if (!activeList) return;
    if (!window.confirm(`Delete tier list "${activeList.title}"?`)) return;
    try {
      await deleteTierList(activeList.id);
      setActiveTierListId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete tier list");
    }
  };

  // Search input change
  const handleSearchChange = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim() || q.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const res = await queryLookup({ query: q.trim(), kinds: ["player"], limit: 6 });
      const mapped = res.items.map((item) => ({
        id: item.canonical_id || item.id,
        name: item.display_name,
        team:
          typeof item.metadata?.team_id === "string"
            ? item.metadata.team_id
            : item.availability?.latest_team_id || undefined,
        portraitUrl: item.portrait_url || undefined
      }));
      setSearchResults(mapped);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Add player to a tier
  const handleAddPlayerToTier = async (playerId: string, targetTierId: string) => {
    if (!activeList) return;

    // Check if player is already in any tier
    const allAssigned = activeList.tiers.flatMap((t) => t.player_ids);
    if (allAssigned.includes(playerId)) {
      alert("This player is already assigned to a tier in this list.");
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
      setSearchResults([]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add player to tier");
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
    <div className="workbench-content" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Header */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 className="page-title">Tier List Builder</h1>
          <p className="page-subtitle">
            F27 Tier Lists · Interactive personal tier lists with drag-and-drop, full keyboard accessibility, and local persistence.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
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
      <div className="notice-box" style={{ borderLeftColor: "var(--accent)", margin: 0 }}>
        <strong className="text-accent text-xs">Subjective Categorization Notice:</strong>
        <p className="text-xs text-muted" style={{ margin: "0.2rem 0 0" }}>
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
          <div className="modal-card" style={{ maxWidth: "480px" }}>
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
            <form onSubmit={handleCreateListSubmit} className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label htmlFor="new-tier-title" className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: "0.3rem" }}>
                  Tier List Title *
                </label>
                <input
                  id="new-tier-title"
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. 2024-25 Playoff Scorers, Shot Creators"
                  required
                  style={{ width: "100%", padding: "0.45rem 0.65rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--text)" }}
                />
              </div>

              <div>
                <label htmlFor="new-tier-desc" className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: "0.3rem" }}>
                  Description / Criteria (optional)
                </label>
                <textarea
                  id="new-tier-desc"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Subjective criteria or scoring rationale..."
                  rows={3}
                  style={{ width: "100%", padding: "0.45rem 0.65rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--text)", resize: "vertical" }}
                />
              </div>

              <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
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
        <div
          style={{
            padding: "3.5rem 1.5rem",
            textAlign: "center",
            background: "var(--surface)",
            borderRadius: "var(--radius)",
            border: "1px dashed var(--border)"
          }}
        >
          <h3 style={{ margin: "0 0 0.5rem", color: "var(--text)" }}>No Tier Lists Created Yet</h3>
          <p className="text-muted text-xs" style={{ margin: "0 0 1rem", maxWidth: "460px", marginInline: "auto" }}>
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
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Tabs Row */}
          <div className="stats-preset-tabs-wrapper" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
                    <span className="font-mono text-xs text-muted" style={{ marginLeft: "0.3rem" }}>
                      ({totalPlayers})
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Actions for active tier list */}
            {activeList && (
              <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", marginLeft: "0.5rem" }}>
                <button
                  type="button"
                  onClick={handleDeleteActiveList}
                  className="button button-small"
                  style={{ color: "var(--negative)", fontSize: "0.75rem" }}
                  title="Delete this tier list"
                >
                  Delete List
                </button>
              </div>
            )}
          </div>

          {/* ACTIVE TIER LIST CONTENT */}
          {activeList && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* Title & Description */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "1.15rem", color: "var(--text)" }}>
                    {activeList.title}
                  </h2>
                  {activeList.description && (
                    <p className="text-xs text-muted" style={{ margin: "0.25rem 0 0" }}>
                      {activeList.description}
                    </p>
                  )}
                </div>
                <div className="font-mono text-xs text-muted">
                  {activeList.tiers.reduce((acc, t) => acc + t.player_ids.length, 0)} total assigned player(s)
                </div>
              </div>

              {/* SEARCH & ADD PLAYER BAR */}
              <div
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  alignItems: "center",
                  padding: "0.75rem 1rem",
                  background: "var(--surface)",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  flexWrap: "wrap"
                }}
              >
                <div style={{ flex: 1, minWidth: "220px", position: "relative" }}>
                  <input
                    type="text"
                    placeholder="Search player to assign to tier (e.g. Tatum, Edwards)..."
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.45rem 0.65rem",
                      background: "var(--surface-raised)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      color: "var(--text)",
                      fontSize: "0.85rem"
                    }}
                  />
                  {isSearching && (
                    <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      Searching…
                    </span>
                  )}

                  {/* Autocomplete dropdown */}
                  {searchResults.length > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        zIndex: 50,
                        marginTop: "4px",
                        background: "var(--surface-raised)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius)",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                        maxHeight: "220px",
                        overflowY: "auto"
                      }}
                    >
                      {searchResults.map((p) => {
                        const isAssigned = activeList.tiers.some((t) => t.player_ids.includes(p.id));
                        return (
                          <div
                            key={p.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "0.45rem 0.75rem",
                              borderBottom: "1px solid var(--border)",
                              opacity: isAssigned ? 0.5 : 1
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <PlayerPortrait playerId={p.id} name={p.name} portraitUrl={p.portraitUrl} size="sm" />
                              <span style={{ fontSize: "0.85rem", color: "var(--text)" }}>{p.name}</span>
                              {p.team && (
                                <span className="font-mono text-xs text-muted">({p.team})</span>
                              )}
                            </div>

                            {isAssigned ? (
                              <span className="text-xs text-muted font-mono">Assigned</span>
                            ) : (
                              <div style={{ display: "flex", gap: "0.25rem" }}>
                                {activeList.tiers.map((t) => (
                                  <button
                                    key={t.tier_id}
                                    type="button"
                                    onClick={() => handleAddPlayerToTier(p.id, t.tier_id)}
                                    className="button button-small"
                                    style={{
                                      fontSize: "0.72rem",
                                      padding: "0.15rem 0.4rem",
                                      backgroundColor: t.color ? `${t.color}22` : undefined,
                                      borderColor: t.color || undefined
                                    }}
                                    title={`Add to ${t.label}`}
                                  >
                                    +{t.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Quick Add from Favorites */}
                {favorites.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
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
                          className="button button-small"
                          style={{ fontSize: "0.72rem", padding: "0.15rem 0.45rem" }}
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
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {activeList.tiers.map((tier, tierIdx) => {
                  const isDragTarget = draggedPlayerId && draggedFromTierId !== tier.tier_id;

                  return (
                    <div
                      key={tier.tier_id}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(tier.tier_id)}
                      style={{
                        display: "flex",
                        minHeight: "84px",
                        background: isDragTarget ? "var(--surface-raised)" : "var(--surface)",
                        border: `1px solid ${isDragTarget ? "var(--accent)" : "var(--border)"}`,
                        borderRadius: "var(--radius)",
                        overflow: "hidden",
                        transition: "border-color 150ms ease"
                      }}
                    >
                      {/* Tier Label Box */}
                      <div
                        style={{
                          width: "90px",
                          minWidth: "90px",
                          background: tier.color || "#323b49",
                          color: "#111",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "0.5rem 0.25rem",
                          fontWeight: 800,
                          fontSize: "1.3rem",
                          letterSpacing: "0.02em",
                          position: "relative"
                        }}
                      >
                        <span>{tier.label}</span>
                        <span style={{ fontSize: "0.68rem", fontWeight: 600, opacity: 0.85, marginTop: "0.2rem" }}>
                          ({tier.player_ids.length})
                        </span>

                        {/* Tier Row Controls (Reorder / Delete) */}
                        <div style={{ display: "flex", gap: "0.2rem", marginTop: "0.3rem" }}>
                          <button
                            type="button"
                            onClick={() => handleMoveTierUp(tierIdx)}
                            disabled={tierIdx === 0}
                            style={{ background: "rgba(0,0,0,0.2)", border: 0, borderRadius: "2px", color: "#111", cursor: "pointer", fontSize: "0.65rem", padding: "0.1rem 0.25rem" }}
                            title="Move tier row up"
                            aria-label={`Move tier ${tier.label} up`}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveTierDown(tierIdx)}
                            disabled={tierIdx === activeList.tiers.length - 1}
                            style={{ background: "rgba(0,0,0,0.2)", border: 0, borderRadius: "2px", color: "#111", cursor: "pointer", fontSize: "0.65rem", padding: "0.1rem 0.25rem" }}
                            title="Move tier row down"
                            aria-label={`Move tier ${tier.label} down`}
                          >
                            ▼
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTierRow(tier.tier_id)}
                            style={{ background: "rgba(0,0,0,0.2)", border: 0, borderRadius: "2px", color: "#111", cursor: "pointer", fontSize: "0.65rem", padding: "0.1rem 0.25rem" }}
                            title="Delete this tier row"
                            aria-label={`Delete tier ${tier.label}`}
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* Tier Cards Area */}
                      <div
                        style={{
                          flex: 1,
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.5rem",
                          padding: "0.6rem 0.85rem",
                          alignItems: "center",
                          alignContent: "flex-start"
                        }}
                      >
                        {tier.player_ids.length === 0 ? (
                          <div style={{ color: "var(--text-muted)", fontSize: "0.78rem", fontStyle: "italic" }}>
                            Drag players here or use keyboard controls from search.
                          </div>
                        ) : (
                          tier.player_ids.map((pid) => (
                            <div
                              key={pid}
                              draggable
                              onDragStart={() => handleDragStart(pid, tier.tier_id)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.45rem",
                                padding: "0.3rem 0.5rem",
                                background: "var(--surface-raised)",
                                border: "1px solid var(--border)",
                                borderRadius: "var(--radius)",
                                cursor: "grab",
                                userSelect: "none"
                              }}
                            >
                              <PlayerPortrait playerId={pid} name={`#${pid}`} size="sm" />
                              <div>
                                <Link
                                  href={`/players/${pid}`}
                                  className="text-accent font-semibold"
                                  style={{ fontSize: "0.82rem" }}
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
                                style={{
                                  fontSize: "0.7rem",
                                  padding: "0.1rem 0.2rem",
                                  background: "var(--surface)",
                                  border: "1px solid var(--border)",
                                  borderRadius: "2px",
                                  color: "var(--text)"
                                }}
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
                                style={{
                                  background: "transparent",
                                  border: 0,
                                  color: "var(--text-muted)",
                                  cursor: "pointer",
                                  fontSize: "0.75rem",
                                  padding: "0 0.15rem"
                                }}
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
