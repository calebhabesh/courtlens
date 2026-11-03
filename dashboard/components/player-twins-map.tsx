"use client";

import { useMemo, useState } from "react";
import { anchoredTooltip } from "@/lib/chart-anchor";
import { axisEnds, dimName, mapFrame, type MapPoint, type TwinMap, type TwinsView } from "@/lib/player-twins";
import { Info } from "./player-twins-view";
import type { useUrlState } from "./stats-feed-ui";
import { Segmented } from "./ui/kit";

const WIDTH = 1000, HEIGHT = 560, PAD = 40;
// Shown twins past this rank are plain dots, so the numbers stay legible; the closest few are named.
const NUMBERED = 12;
const NAMED = 3;
// The close-up never zooms past this many standard units across, so a tight cluster keeps context.
const MIN_SPAN = 1.6;

type Hover = { point: MapPoint; role: "player" | "twin" | "other"; rank?: number };

/**
 * Twin map: the season's player-seasons on two summary axes (the two strongest directions of the
 * weighted measures), with the selected player and the shown twins (any season) on the same axes.
 */
export function TwinMapSection({ view, map, set }: { view: TwinsView; map: TwinMap; set: ReturnType<typeof useUrlState>["set"] }) {
  const [hover, setHover] = useState<Hover | null>(null);
  // Twins sit close to the player by construction; the zoom frames just them, cropping the rest.
  const [zoom, setZoom] = useState<"season" | "twins">("twins");
  const at = useMemo(() => zoom === "twins"
    ? mapFrame([map.player, ...map.twins], WIDTH, HEIGHT, PAD * 2, false, MIN_SPAN)
    : mapFrame([...map.points, map.player, ...map.twins], WIDTH, HEIGHT, PAD), [map, zoom]);
  const twinKey = view.twin ? `${view.twin.player_id}:${view.twin.season}` : null;
  const labels = new Map(view.dimensions.map(dim => [dim.key, dimName(dim)]));
  const axisText = (axis: TwinMap["axes"][number], index: number) =>
    `Axis ${index + 1} carries ${Math.round(axis.explained * 100)}% of the spread (${axis.loadings.map(entry => `${labels.get(entry.key)} ${entry.loading > 0 ? "+" : "−"}`).join(", ")}).`;
  const [across, upDown] = [axisEnds(map.axes[0].loadings), axisEnds(map.axes[1].loadings)];
  const origin = at({ x: 0, y: 0 });
  const twins = [...map.twins].reverse();
  const hoverAt = hover ? at(hover.point) : null;
  const pick = (point: MapPoint, role: Hover["role"]) => {
    if (role === "twin") set({ vs: `${point.player_id}:${point.season}` });
    else if (role === "other") set({ playerId: point.player_id, vs: null, rows: null });
  };

  return <section className="tw-map" aria-label="Twin map">
    <header className="tw-map-head">
      <div className="tw-title">
        <h2>Twin Map</h2>
        <Info label="How to read the map">
          {view.season} player-seasons on the two directions that best separate them across the {view.method.measures} measures; the shown twins (any season) sit on the same axes, joined to {view.player.name}. {axisText(map.axes[0], 0)} {axisText(map.axes[1], 1)} Points close together here are usually, not always, close twins; the Match column is the exact measure.
        </Info>
      </div>
      <Segmented size="sm" label="Map extent" value={zoom} onChange={setZoom}
        options={[{ value: "twins", label: "Twins Close-Up", title: `Frame ${view.player.name} and the shown twins` }, { value: "season", label: "Whole Season", title: `Every ${view.season} player-season` }]} />
    </header>
    <div className="tw-map-frame">
      <div className="chart-hover-frame tw-map-plot">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="tw-map-svg" role="img"
          aria-label={`Twin map of ${view.season}: ${view.player.name} and the ${map.twins.length} shown twins among ${map.points.length} other player-seasons`}
          onMouseLeave={() => setHover(null)}>
          <defs><clipPath id="tw-map-clip"><rect x={0} y={0} width={WIDTH} height={HEIGHT} /></clipPath></defs>
          <g clipPath="url(#tw-map-clip)">
          <line className="tw-map-zero" x1={origin.x} y1={PAD / 2} x2={origin.x} y2={HEIGHT - PAD / 2} />
          <line className="tw-map-zero" x1={PAD / 2} y1={origin.y} x2={WIDTH - PAD / 2} y2={origin.y} />
          <text className="tw-map-origin" x={origin.x + 6} y={origin.y - 6}>Season average</text>
          {(() => {
            const p = at(map.player);
            return map.twins.filter(point => point.rank <= NUMBERED).map(point => {
              const q = at(point);
              return <line key={`${point.player_id}:${point.season}`} className="tw-map-spoke" x1={p.x} y1={p.y} x2={q.x} y2={q.y} />;
            });
          })()}
          {map.points.map(point => {
            const p = at(point);
            return <circle key={point.player_id} className="tw-map-dot" cx={p.x} cy={p.y} r={4}
              onMouseEnter={() => setHover({ point, role: "other" })} onClick={() => pick(point, "other")} />;
          })}
          {twins.map(point => {
            const p = at(point), numbered = point.rank <= NUMBERED, key = `${point.player_id}:${point.season}`;
            return <g key={key} className="tw-map-twin" data-current={key === twinKey || undefined} tabIndex={0} role="button"
              aria-label={`#${point.rank} ${point.season} ${point.name}: show beside ${view.player.name}`}
              onMouseEnter={() => setHover({ point, role: "twin", rank: point.rank })} onFocus={() => setHover({ point, role: "twin", rank: point.rank })}
              onBlur={() => setHover(null)} onClick={() => pick(point, "twin")}
              onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pick(point, "twin"); } }}>
              <circle cx={p.x} cy={p.y} r={numbered ? 10 : 6} />
              {numbered && <text x={p.x} y={p.y} dy="0.35em">{point.rank}</text>}
              {point.rank <= NAMED && <text className="tw-map-name" x={p.x + (p.x > WIDTH * 0.75 ? -16 : 16)} y={p.y} dy="0.35em"
                data-side={p.x > WIDTH * 0.75 ? "left" : undefined}>{point.name.split(" ").at(-1)} {point.season}</text>}
            </g>;
          })}
          {(() => {
            const p = at(map.player);
            const left = p.x > WIDTH * 0.7;
            return <g className="tw-map-player" onMouseEnter={() => setHover({ point: map.player, role: "player" })}>
              <circle cx={p.x} cy={p.y} r={11} />
              <text x={p.x + (left ? -16 : 16)} y={p.y} dy="0.35em" textAnchor={left ? "end" : "start"}>{view.player.name}</text>
            </g>;
          })()}
          </g>
          {/* What each direction means, at the edges (not the origin, which a close-up can crop). */}
          <text className="tw-map-axis" x={WIDTH - 12} y={HEIGHT / 2 - 10} textAnchor="end">{across.high}</text>
          <text className="tw-map-axis" x={12} y={HEIGHT / 2 - 10}>{across.low}</text>
          <text className="tw-map-axis" x={WIDTH / 2} y={22} textAnchor="middle">{upDown.high}</text>
          <text className="tw-map-axis" x={WIDTH / 2} y={HEIGHT - 12} textAnchor="middle">{upDown.low}</text>
        </svg>
        {hover && hoverAt && <div className="scatter-tooltip" {...anchoredTooltip(hoverAt.x, hoverAt.y, WIDTH, HEIGHT)}>
          <div className="scatter-tooltip-title">{hover.rank ? `#${hover.rank} ` : ""}{hover.point.season} {hover.point.name}</div>
          <div className="scatter-tooltip-sub">{[hover.point.team, hover.point.position].filter(Boolean).join(" · ") || "NBA"}</div>
          {hover.role !== "player" && <div className="scatter-tooltip-footer">{hover.role === "twin" ? `Select to show beside ${view.player.name}` : `Select to find ${hover.point.name}'s twins`}</div>}
        </div>}
      </div>
    </div>
    <div className="tw-map-legend" aria-hidden="true">
      <span><span className="tw-map-key" data-role="player" />{view.season} {view.player.name}</span>
      <span><span className="tw-map-key" data-role="twin" />Twins by rank</span>
      <span><span className="tw-map-key" data-role="other" />Other {view.season} players</span>
    </div>
  </section>;
}
