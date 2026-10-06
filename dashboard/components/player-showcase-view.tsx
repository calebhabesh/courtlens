"use client";
import { Icon } from "./ui/icon";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PlayerPortrait } from "./player-portrait";
import { buildPreservedContextUrl } from "@/lib/query-url";
import { LookupInput } from "./lookup-input";
import { useWorkspace } from "@/lib/workspace-context";
import { exportSvgAsPng, exportSvgFile } from "@/lib/image-export";
import {
  SHOWCASE_PRESETS,
  type ShowcasePresetId
} from "@/lib/player-pages";
import type { PlayerResearchItem } from "@/lib/types";

interface PlayerShowcaseViewProps {
  initialPlayers: PlayerResearchItem[];
  season: string;
  phase: string;
  beforeDate: string;
  releaseId?: string;
}

export function PlayerShowcaseView({
  initialPlayers,
  season,
  phase,
  beforeDate,
  releaseId
}: PlayerShowcaseViewProps) {
  const searchParams = useSearchParams();
  const [lookupText, setLookupText] = useState("");
  const router = useRouter();
  const [playersList] = useState<PlayerResearchItem[]>(initialPlayers);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activePresetId, setActivePresetId] = useState<ShowcasePresetId>("overall");
  const [isPlaying, setIsPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);

  const cardSvgRef = useRef<SVGSVGElement | null>(null);

  const { favorites, toggleFavorite, compareTray, toggleCompare } = useWorkspace();

  const currentPlayer = playersList[currentIndex] || playersList[0];
  const isFavorite = currentPlayer ? favorites.includes(currentPlayer.player_id) : false;
  const inTray = currentPlayer ? compareTray.includes(currentPlayer.player_id) : false;

  const activePreset = useMemo(() => {
    return SHOWCASE_PRESETS.find((p) => p.id === activePresetId) || SHOWCASE_PRESETS[0];
  }, [activePresetId]);

  // Keyboard navigation (ArrowLeft / ArrowRight)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === "ArrowLeft") {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : playersList.length - 1));
      } else if (e.key === "ArrowRight") {
        setCurrentIndex((prev) => (prev < playersList.length - 1 ? prev + 1 : 0));
      } else if (e.key === " " && !e.repeat) {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playersList.length]);

  // Slideshow timer (auto-advance every 5s if playing)
  useEffect(() => {
    if (!isPlaying || playersList.length <= 1) return;

    // Honor prefers-reduced-motion
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev < playersList.length - 1 ? prev + 1 : 0));
    }, 5000);

    return () => clearInterval(interval);
  }, [isPlaying, playersList.length]);

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : playersList.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < playersList.length - 1 ? prev + 1 : 0));
  };

  const handleExportPng = async () => {
    if (!cardSvgRef.current || !currentPlayer) return;
    setExporting(true);
    try {
      await exportSvgAsPng(cardSvgRef.current, {
        title: `${currentPlayer.player_name} — CourtLoad Showcase Card`,
        subtitle: `${activePreset.label} · ${currentPlayer.teams.join("/")} · ${season} ${phase}`,
        context: {
          season,
          phase,
          before_date: beforeDate,
          release_id: releaseId
        },
        filename: `${currentPlayer.player_name.toLowerCase().replace(/\s+/g, "_")}-showcase-card.png`
      });
    } finally {
      setExporting(false);
    }
  };

  const handleExportSvg = () => {
    if (!cardSvgRef.current || !currentPlayer) return;
    exportSvgFile(
      cardSvgRef.current,
      `${currentPlayer.player_name.toLowerCase().replace(/\s+/g, "_")}-showcase-card.svg`,
      {
        title: `${currentPlayer.player_name} — Showcase Card`,
        context: {
          season,
          phase,
          before_date: beforeDate,
          release_id: releaseId
        },
        filename: `${currentPlayer.player_name.toLowerCase().replace(/\s+/g, "_")}-showcase-card.svg`
      }
    );
  };

  if (!currentPlayer) {
    return (
      <div className="empty-panel">
        <p className="text-muted">No players available in this showcase view.</p>
      </div>
    );
  }

  return (
    <div className="showcase-container">
      {/* Header & Controls Toolbar */}
      <div className="panel" style={{ padding: "0.75rem 1rem", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
          <div>
            <h1 className="panel-title" style={{ fontSize: "1.25rem", margin: 0 }}>
              Player Showcase & Cards
            </h1>
            <p className="text-muted text-xs" style={{ margin: "0.2rem 0 0" }}>
              High-density statistical player cards with manually controlled slideshow and context-stamped export.
            </p>
          </div>

          {/* Quick Lookup to Add Player */}
          <div style={{ width: "240px" }}>
            <LookupInput label="Add or jump to player" value={lookupText} onChange={setLookupText}
              kinds={["player"]}
              releaseId={releaseId}
              season={season}
              placeholder="Add or jump to player..."
              onSelect={(item) => {
                setLookupText("");
                if (item.kind === "player") {
                  router.push(buildPreservedContextUrl(
                    `/showcase?playerId=${item.canonical_id}&season=${season}&phase=${phase}&beforeDate=${beforeDate}`, searchParams)
                  );
                }
              }}
            />
          </div>
        </div>

        {/* Preset & Carousel Toolbar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
          {/* Preset Focus Selector */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className="text-xs text-muted uppercase font-mono font-semibold">Focus:</span>
            <div className="segmented-control showcase-focus" role="group" aria-label="Showcase metric focus">
              {SHOWCASE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`segmented-button ${activePresetId === preset.id ? "active" : ""}`}
                  onClick={() => setActivePresetId(preset.id)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Carousel Controls */}
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.4rem" }}>
            <button
              type="button"
              className="button button-small"
              onClick={handlePrev}
              aria-label="Previous player card (ArrowLeft)"
              title="Previous card (ArrowLeft)"
            >
              <Icon name="left" />Previous
            </button>

            <button
              type="button"
              className={`button button-small ${isPlaying ? "button-accent" : ""}`}
              onClick={() => setIsPlaying(!isPlaying)}
              aria-label={isPlaying ? "Pause slideshow" : "Play auto-advance slideshow"}
              title="Auto-advance slideshow (Spacebar to toggle)"
            >
              <Icon name={isPlaying ? "pause" : "play"} />{isPlaying ? "Pause" : "Play"}
            </button>

            <button
              type="button"
              className="button button-small"
              onClick={handleNext}
              aria-label="Next player card (ArrowRight)"
              title="Next card (ArrowRight)"
            >
              Next<Icon name="right" />
            </button>

            <span className="text-xs font-mono text-muted" style={{ margin: "0 0.4rem" }}>
              {currentIndex + 1} / {playersList.length}
            </span>
          </div>

          {/* Export Actions */}
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.4rem" }}>
            <button
              type="button"
              className="button button-small"
              onClick={handleExportPng}
              disabled={exporting}
              title="Export high-DPI card PNG"
            >
              {exporting ? "Exporting…" : "Export PNG"}
            </button>

            <button
              type="button"
              className="button button-small"
              onClick={handleExportSvg}
              title="Export SVG card"
            >
              Export SVG
            </button>
          </div>
        </div>
      </div>

      {/* Main Showcase Stage */}
      <div className="responsive-pair" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: "1.5rem", alignItems: "start" }}>
        {/* Visual SVG Card Stage */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div
            style={{
              background: "var(--surface)",
              borderRadius: "12px",
              border: "1px solid var(--border)",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
              padding: "1.25rem",
              width: "100%",
              maxWidth: "480px"
            }}
          >
            {/* Embedded Rendered SVG Card (Used for presentation & pure client-side rasterization) */}
            <svg
              ref={cardSvgRef}
              viewBox="0 0 460 580"
              style={{ width: "100%", height: "auto", display: "block" }}
              role="img"
              aria-label={`Showcase card for ${currentPlayer.player_name}`}
            >
              {/* Card Canvas Background */}
              <rect width="460" height="580" fill="#282f3b" rx="10" />
              <rect width="460" height="580" fill="none" stroke="#465160" strokeWidth="1.5" rx="10" />

              {/* Card Header Top Pattern */}
              <path d="M 0 10 Q 0 0 10 0 L 450 0 Q 460 0 460 10 L 460 90 L 0 90 Z" fill="#20252e" />
              <line x1="0" y1="90" x2="460" y2="90" stroke="#ffd166" strokeWidth="2" />

              {/* Brand & Kicker */}
              <text x="24" y="28" fill="#ffd166" fontSize="13" fontWeight="bold" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">
                COURTLOAD
              </text>
              <text x="110" y="28" fill="#b4bdca" fontSize="11" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">
                SHOWCASE · {season} {phase.replace("_", " ")}
              </text>

              {/* Player Name & Team */}
              <text x="24" y="58" fill="#f1f3f6" fontSize="22" fontWeight="bold" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">
                {currentPlayer.player_name}
              </text>
              <text x="24" y="78" fill="#ffd166" fontSize="12" fontFamily="monospace" fontWeight="bold">
                {currentPlayer.teams.join(" / ")} · NBA ID: {currentPlayer.player_id}
              </text>

              {/* Badge Pills */}
              <rect x="330" y="44" width="105" height="26" fill="#323b49" rx="13" stroke="#465160" strokeWidth="1" />
              <text x="382" y="61" fill="#f1f3f6" fontSize="11" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                {currentPlayer.games_played} GAMES
              </text>

              {/* Focus Preset Banner */}
              <rect x="24" y="105" width="412" height="28" fill="#323b49" rx="4" />
              <text x="36" y="123" fill="#b4bdca" fontSize="11" fontFamily="monospace" textAnchor="start">
                FOCUS:
              </text>
              <text x="85" y="123" fill="#ffd166" fontSize="11" fontFamily="monospace" fontWeight="bold">
                {activePreset.label.toUpperCase()}
              </text>
              <text x="424" y="123" fill="#b4bdca" fontSize="10" fontFamily="monospace" textAnchor="end">
                MIN: {currentPlayer.total_minutes.toFixed(0)}
              </text>

              {/* Metric Grid Tiles (2 columns x 3 rows) */}
              {activePreset.metrics.slice(0, 6).map((metric, i) => {
                const col = i % 2;
                const row = Math.floor(i / 2);
                const tileX = 24 + col * 212;
                const tileY = 145 + row * 92;
                const val = currentPlayer.metrics[metric.key];
                const formatted = metric.format(val);

                return (
                  <g key={metric.key}>
                    <rect
                      x={tileX}
                      y={tileY}
                      width="200"
                      height="80"
                      fill="#20252e"
                      rx="6"
                      stroke="#323b49"
                      strokeWidth="1"
                    />
                    <text
                      x={tileX + 16}
                      y={tileY + 24}
                      fill="#b4bdca"
                      fontSize="10"
                      fontFamily="monospace"
                      fontWeight="bold"
                      letterSpacing="0.05em"
                    >
                      {metric.label}
                    </text>
                    <text
                      x={tileX + 16}
                      y={tileY + 60}
                      fill="#f1f3f6"
                      fontSize="24"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      {formatted}
                    </text>
                  </g>
                );
              })}

              {/* Card Footer With Temporal Rule & Proof */}
              <line x1="24" y1="435" x2="436" y2="435" stroke="#323b49" strokeWidth="1" />

              {/* Stint / Traded Note */}
              <text x="24" y="460" fill="#b4bdca" fontSize="11" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">
                {currentPlayer.stints_count > 1
                  ? `Observed ${currentPlayer.stints_count} team stints (${currentPlayer.teams.join(", ")}) during ${season}.`
                  : `Single team affiliation (${currentPlayer.teams[0]}) observed in ${season}.`}
              </text>

              {/* Temporal Guarantee Notice */}
              <rect x="24" y="480" width="412" height="42" fill="#20252e" rx="4" stroke="#465160" strokeWidth="0.5" />
              <text x="34" y="497" fill="#7b8798" fontSize="10" fontFamily="monospace">
                TEMPORAL DISCIPLINE: game_date &lt; {beforeDate}
              </text>
              <text x="34" y="512" fill="#7b8798" fontSize="9" fontFamily="monospace">
                Strictly historical replay · Zero inferred claims · Admitted coverage
              </text>

              {/* Watermark Bottom */}
              <text x="230" y="555" fill="#465160" fontSize="10" fontFamily="monospace" textAnchor="middle">
                COURTLOAD NBA REPLICA · VERIFIED RECORD
              </text>
            </svg>
          </div>
        </div>

        {/* Side Details & Actions Sidebar */}
        <div>
          <div className="panel" style={{ padding: "1.25rem", marginBottom: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
              <PlayerPortrait
                playerId={currentPlayer.player_id}
                name={currentPlayer.player_name}
                portraitUrl={currentPlayer.portrait_url}
                size="md"
              />
              <div>
                <strong className="block" style={{ fontSize: "1.1rem" }}>{currentPlayer.player_name}</strong>
                <span className="text-xs text-muted font-mono">{currentPlayer.teams.join(" / ")}</span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <button
                type="button"
                className={`button ${isFavorite ? "button-accent" : ""}`}
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => toggleFavorite(currentPlayer.player_id)}
              >
                {isFavorite ? "★ In Workspace Favorites" : "☆ Add to Favorites"}
              </button>

              <button
                type="button"
                className={`button ${inTray ? "button-accent" : ""}`}
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => toggleCompare(currentPlayer.player_id)}
              >
                {inTray ? "✓ In Compare Tray" : "+ Add to Compare Tray"}
              </button>

              <Link
                href={`/last-games?playerId=${currentPlayer.player_id}&season=${season}&phase=${phase}&beforeDate=${beforeDate}`}
                className="button button-dark"
                style={{ width: "100%", justifyContent: "center" }}
              >
                Recent Games Log →
              </Link>

              <Link
                href={`/players/${currentPlayer.player_id}?season=${season}&phase=${phase}&beforeDate=${beforeDate}`}
                className="button button-dark"
                style={{ width: "100%", justifyContent: "center" }}
              >
                Full Player Dashboard →
              </Link>

              <Link
                href={`/compare?playerA=${currentPlayer.player_id}&season=${season}&phase=${phase}&beforeDate=${beforeDate}`}
                className="button"
                style={{ width: "100%", justifyContent: "center" }}
              >
                Compare in PvP →
              </Link>
            </div>
          </div>

          {/* Roster Thumbnail Strip */}
          <div className="panel" style={{ padding: "1rem" }}>
            <h3 className="panel-title" style={{ fontSize: "0.85rem", marginBottom: "0.6rem" }}>
              Showcase Roster ({playersList.length})
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", maxHeight: "280px", overflowY: "auto" }}>
              {playersList.map((p, idx) => {
                const active = idx === currentIndex;
                return (
                  <button
                    key={p.player_id}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.4rem 0.6rem",
                      borderRadius: "var(--radius)",
                      background: active ? "var(--surface-raised)" : "transparent",
                      border: active ? "1px solid var(--accent)" : "1px solid transparent",
                      color: active ? "var(--text)" : "var(--text-muted)",
                      cursor: "pointer",
                      textAlign: "left"
                    }}
                  >
                    <span style={{ fontSize: "0.82rem", fontWeight: active ? "bold" : "normal" }}>
                      {p.player_name}
                    </span>
                    <span className="font-mono text-xs text-muted">{p.teams.join("/")}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
