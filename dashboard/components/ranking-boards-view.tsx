"use client";

import { Icon } from "./ui/icon";
import { Button } from "./ui/button";
import { GatedNote } from "./ui/gated-note";
import { PageShell } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { LookupInput } from "./lookup-input";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useWorkspace } from "@/lib/workspace-context";
import { PlayerPortrait } from "./player-portrait";
import { aggregateRankingBoards } from "@/lib/workspace-client";
import { executeWorkbenchQuery, getWorkbenchCatalog } from "@/lib/workbench-api";
import { resolveStatsQuery } from "@/lib/stats-query";
import { scopeContextLine } from "@/lib/scope-labels";
import { PercentileCell } from "./charts/percentile-cell";
import { TablePercentileLegend } from "./table-percentile-legend";
import { Skeleton } from "./ui/skeleton";
import type {
  AggregationMethod,
  BoardAggregationResult,
  RankingBoardType,
  RankingEntry, WorkbenchCatalog, WorkbenchQueryResponse
} from "@/lib/types";

const BOARD_TYPES: Array<{ id: RankingBoardType; label: string }> = [
  { id: "overall", label: "Overall" },
  { id: "offense", label: "Offense" },
  { id: "defense", label: "Defense" },
  { id: "position", label: "Position" },
  { id: "custom", label: "Custom" }
];

export function RankingBoardsView({ catalog }: { catalog?: WorkbenchCatalog | null } = {}) {
  const {
    rankingBoards,
    saveRankingBoard,
    deleteRankingBoard,
    favorites
  } = useWorkspace();

  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [isCreatingBoard, setIsCreatingBoard] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBoardType, setNewBoardType] = useState<RankingBoardType>("overall");
  const [newNotes, setNewNotes] = useState("");

  // Player search for adding
  const [searchQuery, setSearchQuery] = useState("");

  // Aggregation state
  const [selectedBoardsForAgg, setSelectedBoardsForAgg] = useState<string[]>([]);
  const [aggMethod, setAggMethod] = useState<AggregationMethod>("borda");
  const [aggPenalty, setAggPenalty] = useState<number | "">("");
  const [aggResult, setAggResult] = useState<BoardAggregationResult | null>(null);
  const [isAggregating, setIsAggregating] = useState(false);
  const [showAggSection, setShowAggSection] = useState(false);

  // Active board
  const activeBoard = useMemo(() => {
    if (rankingBoards.length === 0) return null;
    if (activeBoardId) {
      const found = rankingBoards.find((b) => b.id === activeBoardId);
      if (found) return found;
    }
    return rankingBoards[0];
  }, [rankingBoards, activeBoardId]);

  const referenceIds = JSON.stringify((activeBoard?.entries.map(entry => entry.player_id) ?? []).sort());
  const [reference, setReference] = useState<{ key: string; data?: WorkbenchQueryResponse; error?: boolean } | null>(null);
  const [retryReference, setRetryReference] = useState(0);
  useEffect(() => {
    const ids: string[] = JSON.parse(referenceIds);
    if (!ids.length) return;
    let active = true;
    void (async () => {
      const resolved = catalog ?? await getWorkbenchCatalog();
      const query = resolveStatsQuery({ window: "season" }, resolved, "per_game");
      query.view_state = { columns: ["gp", "min_per_game", "pts_per_game"] };
      query.page = { limit: 100 };
      let result = await executeWorkbenchQuery(query, { table_percentiles: true, player_ids: ids });
      const items = [...result.items];
      while (result.has_more && result.next_cursor && active) {
        query.page = { limit: 100, cursor: result.next_cursor };
        result = await executeWorkbenchQuery(query, { table_percentiles: true, player_ids: ids });
        items.push(...result.items);
      }
      if (active) setReference({ key: referenceIds, data: { ...result, items } });
    })().catch(() => { if (active) setReference({ key: referenceIds, error: true }); });
    return () => { active = false; };
  }, [catalog, referenceIds, retryReference]);
  const referenceData = reference?.key === referenceIds ? reference.data : undefined;
  const referenceError = reference?.key === referenceIds && reference.error;
  const referencePlayers = new Map(referenceData?.items.map(player => [player.player_id, player]) ?? []);

  // Handle Search Input


  // Create new board
  const handleCreateBoardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const updated = await saveRankingBoard({
        title: newTitle.trim(),
        board_type: newBoardType,
        notes: newNotes.trim() || null,
        entries: []
      });
      setIsCreatingBoard(false);
      setNewTitle("");
      setNewNotes("");
      if (updated.ranking_boards.length > 0) {
        const created = updated.ranking_boards[updated.ranking_boards.length - 1];
        setActiveBoardId(created.id);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create ranking board");
    }
  };

  // Delete active board
  const handleDeleteActiveBoard = async () => {
    if (!activeBoard) return;
    if (!window.confirm(`Delete ranking board "${activeBoard.title}"?`)) return;
    try {
      await deleteRankingBoard(activeBoard.id);
      setActiveBoardId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete board");
    }
  };

  // Add player to active board
  const handleAddPlayer = async (player: { id: string; name: string }) => {
    if (!activeBoard) return;
    if (activeBoard.entries.some((e) => e.player_id === player.id)) {
      alert(`${player.name} is already on this board.`);
      return;
    }

    const nextRank = activeBoard.entries.length + 1;
    const newEntry: RankingEntry = {
      rank: nextRank,
      player_id: player.id,
      player_name: player.name,
      notes: null,
      tags: []
    };

    const nextEntries = [...activeBoard.entries, newEntry];
    try {
      await saveRankingBoard({
        id: activeBoard.id,
        title: activeBoard.title,
        board_type: activeBoard.board_type,
        scope: activeBoard.scope,
        notes: activeBoard.notes,
        entries: nextEntries
      });
      setSearchQuery("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add player");
    }
  };

  // Move entry up (accessible keyboard alternative to drag)
  const handleMoveUp = async (entryIdx: number) => {
    if (!activeBoard || entryIdx <= 0) return;
    const entries = [...activeBoard.entries];
    const temp = entries[entryIdx];
    entries[entryIdx] = entries[entryIdx - 1];
    entries[entryIdx - 1] = temp;

    // Re-index contiguous ranks 1..N
    const reindexed = entries.map((e, idx) => ({ ...e, rank: idx + 1 }));
    try {
      await saveRankingBoard({
        id: activeBoard.id,
        title: activeBoard.title,
        board_type: activeBoard.board_type,
        scope: activeBoard.scope,
        notes: activeBoard.notes,
        entries: reindexed
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to reorder player");
    }
  };

  // Move entry down
  const handleMoveDown = async (entryIdx: number) => {
    if (!activeBoard || entryIdx >= activeBoard.entries.length - 1) return;
    const entries = [...activeBoard.entries];
    const temp = entries[entryIdx];
    entries[entryIdx] = entries[entryIdx + 1];
    entries[entryIdx + 1] = temp;

    // Re-index contiguous ranks 1..N
    const reindexed = entries.map((e, idx) => ({ ...e, rank: idx + 1 }));
    try {
      await saveRankingBoard({
        id: activeBoard.id,
        title: activeBoard.title,
        board_type: activeBoard.board_type,
        scope: activeBoard.scope,
        notes: activeBoard.notes,
        entries: reindexed
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to reorder player");
    }
  };

  // Remove player from active board
  const handleRemoveEntry = async (playerId: string) => {
    if (!activeBoard) return;
    const filtered = activeBoard.entries.filter((e) => e.player_id !== playerId);
    // Re-index contiguous ranks 1..N
    const reindexed = filtered.map((e, idx) => ({ ...e, rank: idx + 1 }));
    try {
      await saveRankingBoard({
        id: activeBoard.id,
        title: activeBoard.title,
        board_type: activeBoard.board_type,
        scope: activeBoard.scope,
        notes: activeBoard.notes,
        entries: reindexed
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove player");
    }
  };

  // Update notes on a player
  const handleUpdatePlayerNotes = async (playerId: string, notes: string) => {
    if (!activeBoard) return;
    const updated = activeBoard.entries.map((e) =>
      e.player_id === playerId ? { ...e, notes: notes || null } : e
    );
    try {
      await saveRankingBoard({
        id: activeBoard.id,
        title: activeBoard.title,
        board_type: activeBoard.board_type,
        scope: activeBoard.scope,
        notes: activeBoard.notes,
        entries: updated
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update notes");
    }
  };

  // Run Board Aggregation (F16)
  const handleRunAggregation = async () => {
    if (selectedBoardsForAgg.length === 0) {
      alert("Select at least 1 ranking board to aggregate.");
      return;
    }

    setIsAggregating(true);
    setAggResult(null);
    try {
      const penaltyNum = typeof aggPenalty === "number" ? aggPenalty : undefined;
      const res = await aggregateRankingBoards(selectedBoardsForAgg, aggMethod, penaltyNum);
      setAggResult(res);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Aggregation failed");
    } finally {
      setIsAggregating(false);
    }
  };

  return (
    <PageShell template="explorer" className="ranking-boards-container">
      <PageHeader
        title="Ranking Boards"
        subtitle="Your own player rankings, with notes, reordering and aggregation."
        actions={<>
          <Button variant="secondary" icon="scale" aria-pressed={showAggSection} onClick={() => setShowAggSection((prev) => !prev)}>
            {showAggSection ? "Hide aggregator" : "Aggregate boards"}
          </Button>
          <Button variant="primary" icon="plus" onClick={() => setIsCreatingBoard(true)}>New board</Button>
        </>}
      />

      <GatedNote why={<>Ranking boards represent personal subjective evaluations. CourtLens never fabricates a &quot;global community consensus&quot; or automated public authority from subjective inputs.</>}>
        Boards are personal rankings, never a consensus.
      </GatedNote>

      {/* CREATE NEW BOARD MODAL / DRAWER */}
      {isCreatingBoard && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsCreatingBoard(false);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-card ranking-modal-card">
            <div className="modal-header">
              <h2 className="modal-title">Create Personal Ranking Board</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsCreatingBoard(false)}
                aria-label="Close create ranking board dialog"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            <form onSubmit={handleCreateBoardSubmit} className="modal-body ranking-modal-form">
              <div>
                <label htmlFor="new-board-title" className="ranking-field-label">
                  Board Title *
                </label>
                <input
                  id="new-board-title"
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. 2024-25 MVP Candidates, Top Wing Defenders"
                  required
                  className="ranking-field-input"
                />
              </div>

              <div>
                <label htmlFor="new-board-type" className="ranking-field-label">
                  Board Category / Type
                </label>
                <select
                  id="new-board-type"
                  value={newBoardType}
                  onChange={(e) => setNewBoardType(e.target.value as RankingBoardType)}
                  className="ranking-field-input"
                >
                  {BOARD_TYPES.map((bt) => (
                    <option key={bt.id} value={bt.id}>
                      {bt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="new-board-notes" className="ranking-field-label">
                  Evaluation Scope &amp; Notes (optional)
                </label>
                <textarea
                  id="new-board-notes"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Declared criteria, temporal scope (e.g. Regular Season 2024-25), or subjective methodology..."
                  rows={3}
                  className="ranking-field-textarea"
                />
              </div>

              <div className="modal-footer ranking-modal-footer">
                <button
                  type="button"
                  onClick={() => setIsCreatingBoard(false)}
                  className="button button-small"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-small button-primary"
                  disabled={!newTitle.trim()}
                >
                  Create Board
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BOARD AGGREGATION SECTION (F16) */}
      {showAggSection && (
        <div className="ranking-consensus-card">
          <div className="ranking-consensus-header">
            <div>
              <strong className="ranking-consensus-title">
                Mathematical Board Aggregation
              </strong>
              <p className="text-xs text-muted mt-1">
                Combine selected personal boards into an aggregate ranking with explicit missing-rank penalty rules.
              </p>
            </div>
          </div>

          {/* Board multi-select */}
          <div className="ranking-chips-row">
            <span className="text-xs text-muted font-semibold">Select Boards to Aggregate:</span>
            {rankingBoards.map((b) => {
              const isChecked = selectedBoardsForAgg.includes(b.id);
              return (
                <label
                  key={b.id}
                  className={`ranking-chip-btn ${isChecked ? "is-selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedBoardsForAgg([...selectedBoardsForAgg, b.id]);
                      } else {
                        setSelectedBoardsForAgg(selectedBoardsForAgg.filter((id) => id !== b.id));
                      }
                    }}
                  />
                  <span>{b.title} ({b.entries.length})</span>
                </label>
              );
            })}
          </div>

          {/* Method and Penalty controls */}
          <div className="ranking-board-controls">
            <div className="ranking-board-filter-group">
              <span className="text-xs text-muted">Scoring Method:</span>
              <select
                value={aggMethod}
                onChange={(e) => setAggMethod(e.target.value as AggregationMethod)}
                className="ranking-board-select"
              >
                <option value="borda">Borda Count (points = max_rank - rank + 1)</option>
                <option value="average_rank">Average Rank (lower is better)</option>
              </select>
            </div>

            <div className="ranking-board-filter-group">
              <span className="text-xs text-muted">Missing Rank Penalty:</span>
              <input
                type="number"
                min={1}
                placeholder="Auto (max + 1)"
                value={aggPenalty}
                onChange={(e) => setAggPenalty(e.target.value ? Number(e.target.value) : "")}
                className="ranking-board-select ranking-board-select-w90"
              />
            </div>

            <button
              type="button"
              onClick={handleRunAggregation}
              disabled={isAggregating || selectedBoardsForAgg.length === 0}
              className="button button-small button-primary"
            >
              {isAggregating ? "Computing…" : "Compute Aggregate"}
            </button>
          </div>

          {/* Aggregation Results Table */}
          {aggResult && (
            <div className="ranking-board-meta-col">
              <div className="ranking-consensus-header">
                <span className="text-xs text-muted font-mono">
                  Methodology: {aggResult.methodology_notes}
                </span>
                <span className="text-xs text-accent font-mono">
                  Penalty Rank: {aggResult.missing_rank_penalty}
                </span>
              </div>

              <div className="table-wrapper density-compact">
                <table className="data-table" aria-label="Aggregated ranking table">
                  <thead>
                    <tr>
                      <th className="th-rank-center">Rank</th>
                      <th className="text-left">Player</th>
                      <th className="num th-w100">Borda Pts</th>
                      <th className="num th-w100">Avg Rank</th>
                      <th className="num th-w100">Present</th>
                      <th className="num th-w80">Best</th>
                      <th className="num th-w80">Worst</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggResult.ranked_players.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center p-6 text-muted">
                          No players found across selected boards.
                        </td>
                      </tr>
                    ) : (
                      aggResult.ranked_players.map((item) => (
                        <tr key={item.player_id}>
                          <td className="font-mono text-muted text-center">
                            {item.aggregated_rank}
                          </td>
                          <td>
                            <strong className="text-accent">{item.player_name || item.player_id}</strong>
                          </td>
                          <td className="font-mono num font-semibold text-accent">
                            {item.borda_score}
                          </td>
                          <td className="font-mono num">
                            {item.average_rank.toFixed(2)}
                          </td>
                          <td className="font-mono num text-muted">
                            {item.boards_present_count} / {item.total_boards_count}
                          </td>
                          <td className="font-mono num">
                            #{item.best_rank}
                          </td>
                          <td className="font-mono num">
                            #{item.worst_rank}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* BOARDS TABS & SELECTOR */}
      {rankingBoards.length === 0 ? (
        <div className="ranking-empty-state">
          <h3 className="ranking-empty-title">No Ranking Boards Yet</h3>
          <p className="text-muted text-xs ranking-empty-desc">
            Create personal boards to rank NBA players overall, by defense, offense, or custom categories.
            All boards persist locally with atomic version protection.
          </p>
          <button
            type="button"
            onClick={() => setIsCreatingBoard(true)}
            className="button button-primary"
          >
            Create Your First Board
          </button>
        </div>
      ) : (
        <div className="ranking-active-container">
          {/* Boards Tabs */}
          <div className="stats-preset-tabs-wrapper ranking-tabs-wrapper">
            <div className="stats-preset-tabs" role="tablist" aria-label="Personal Ranking Boards">
              {rankingBoards.map((b) => {
                const isActive = b.id === activeBoard?.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveBoardId(b.id)}
                    className={`stats-preset-tab ${isActive ? "active" : ""}`}
                    title={b.notes || b.title}
                  >
                    <span>{b.title}</span>
                    <span className="font-mono text-xs text-muted ml-1">
                      ({b.entries.length})
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Board Actions */}
            {activeBoard && (
              <div className="ranking-header-actions ml-2">
                <button
                  type="button"
                  onClick={handleDeleteActiveBoard}
                  className="button button-small ranking-delete-btn"
                  title="Delete this ranking board"
                >
                  Delete Board
                </button>
              </div>
            )}
          </div>

          {/* ACTIVE BOARD DETAIL & ENTRIES */}
          {activeBoard && (
            <div className="ranking-board-panel">
              {/* Board Meta */}
              <div className="ranking-board-panel-header">
                <div>
                  <div className="ranking-board-title-group">
                    <h2 className="ranking-board-title">
                      {activeBoard.title}
                    </h2>
                    <span className="replica-badge-active capitalize">
                      {activeBoard.board_type}
                    </span>
                  </div>
                  {activeBoard.notes && (
                    <p className="text-xs text-muted mt-1">
                      {activeBoard.notes}
                    </p>
                  )}
                </div>

                <div className="font-mono text-xs text-muted">
                  {activeBoard.entries.length} player(s) ranked · Contiguous 1..N
                </div>
              </div>

              {/* Add Player Search Box */}
              <div className="ranking-add-player-bar">
                <div className="flex-1"><LookupInput label="Add player to board" value={searchQuery} onChange={setSearchQuery} kinds={["player"]} excludedIds={activeBoard.entries.map(entry=>entry.player_id)} onSelect={item=>{setSearchQuery("");void handleAddPlayer({id:item.canonical_id,name:item.display_name});}} /></div>

                {/* Quick-add from favorites */}
                {favorites.length > 0 && (
                  <div className="ranking-add-meta-group">
                    <span className="text-xs text-muted">Favorites:</span>
                    {favorites.slice(0, 4).map((favId) => {
                      const isAdded = activeBoard.entries.some((e) => e.player_id === favId);
                      return (
                        <button
                          key={favId}
                          type="button"
                          disabled={isAdded}
                          onClick={() => handleAddPlayer({ id: favId, name: `Player #${favId}` })}
                          className="button button-small ranking-meta-btn"
                          title={isAdded ? "Already on board" : `Add player ${favId}`}
                        >
                          {isAdded ? <Icon name="check" size={14} /> : <Icon name="plus" size={14} />}#{favId}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Table of Entries */}
              <TablePercentileLegend cohort={referenceData?.table_cohort} />
              {referenceError && <GatedNote action={<Button variant="secondary" onClick={() => setRetryReference(value => value + 1)}>Retry reference</Button>}>Statistical reference unavailable.</GatedNote>}
              <div className="table-wrapper density-standard research-table-scroll" role="region" aria-label="Ranking table scroll area" tabIndex={0}>
                <table className="data-table percentile-table rankings-table" aria-label={`Rankings for ${activeBoard.title}`}>
                  <caption>{referenceData ? `Statistical reference: ${scopeContextLine(referenceData.query.season, referenceData.query.phase, referenceData.query.before_date)}. Personal board order remains subjective.` : "Statistical reference uses the latest published season. Personal board order remains subjective."}</caption>
                  <thead>
                    <tr className="table-column-groups"><th scope="colgroup" colSpan={2}>Personal order</th><th scope="colgroup" colSpan={2}>Participation</th><th scope="colgroup">Scoring</th><th scope="colgroup" colSpan={3}>Your notes & controls</th></tr>
                    <tr>
                      <th className="th-rank-center">#</th>
                      <th className="th-player-col">Player</th>
                      <th scope="col" className="num">GP</th><th scope="col" className="num">MPG</th><th scope="col" className="num">PPG</th>
                      <th className="th-notes-col">Evaluation Notes</th>
                      <th className="th-reorder-col">Reorder</th>
                      <th className="th-action-col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeBoard.entries.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center p-8 text-muted">
                          No players ranked on this board yet. Use the search bar above to add players.
                        </td>
                      </tr>
                    ) : (
                      activeBoard.entries.map((entry, idx) => (
                        <tr key={entry.player_id}>
                          {/* Rank # */}
                          <td className="font-mono text-accent font-bold text-center text-sm">
                            {entry.rank}
                          </td>

                          {/* Player Identity */}
                          <td>
                            <div className="ranking-player-cell">
                              <PlayerPortrait
                                playerId={entry.player_id}
                                name={entry.player_name || `Player #${entry.player_id}`}
                                size="sm"
                              />
                              <div>
                                <Link
                                  href={`/players/${entry.player_id}`}
                                  className="text-accent font-semibold text-sm"
                                >
                                  {entry.player_name || `Player #${entry.player_id}`}
                                </Link>
                                {referencePlayers.get(entry.player_id)?.table_qualified === false && <span className="table-small-sample">Small sample</span>}
                              </div>
                            </div>
                          </td>

                          {["gp", "min_per_game", "pts_per_game"].map(key => {
                            const player = referencePlayers.get(entry.player_id);
                            const value = player?.metrics[key];
                            return <td key={key} className="num">{!referenceData && !referenceError ? <Skeleton variant="text" width={60} /> : <PercentileCell compact value={value == null ? null : key === "gp" ? value : value.toFixed(1)} percentile={player?.table_percentiles?.[key] ?? null} qualified={player?.table_qualified === true} label={key} cohort={`${player?.table_cohort_sample_sizes?.[key] ?? "Unknown"} valid league players; 500+ season minutes`} />}</td>;
                          })}

                          {/* Notes input */}
                          <td>
                            <input
                              type="text"
                              defaultValue={entry.notes || ""}
                              placeholder="Add subjective note or scouting context..."
                              onBlur={(e) => handleUpdatePlayerNotes(entry.player_id, e.target.value.trim())}
                              className="ranking-notes-input"
                            />
                          </td>

                          {/* Accessible Reorder Controls */}
                          <td className="text-center">
                            <div className="ranking-reorder-group">
                              <button
                                type="button"
                                onClick={() => handleMoveUp(idx)}
                                disabled={idx === 0}
                                className="button button-small ranking-reorder-btn"
                                title="Move up 1 rank"
                                aria-label={`Move ${entry.player_name || entry.player_id} up`}
                              >
                                <Icon name="chevron-up" size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveDown(idx)}
                                disabled={idx === activeBoard.entries.length - 1}
                                className="button button-small ranking-reorder-btn"
                                title="Move down 1 rank"
                                aria-label={`Move ${entry.player_name || entry.player_id} down`}
                              >
                                <Icon name="chevron-down" size={14} />
                              </button>
                            </div>
                          </td>

                          {/* Remove action */}
                          <td className="text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveEntry(entry.player_id)}
                              className="button button-small ranking-delete-btn"
                              title="Remove from board"
                              aria-label={`Remove ${entry.player_name || entry.player_id} from board`}
                            >
                              <Icon name="close" size={14} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
