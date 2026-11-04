"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChartData, ChartFrame } from "@/components/charts/chart-frame";
import { Segmented } from "@/components/ui/kit";
import { metric, PHASE_LABELS, PHASE_ORDER, type CurvePoint, type DriftPoint, type WinProbabilityPage } from "@/lib/win-probability";

const PLOT = { left: 64, right: 448, top: 16, bottom: 224 };
const px = (value: number) => PLOT.left + value * (PLOT.right - PLOT.left);
const py = (value: number) => PLOT.bottom - value * (PLOT.bottom - PLOT.top);
const pathOf = (curve: CurvePoint[]) => curve.map(p => `${px(p.predicted).toFixed(1)},${py(p.observed).toFixed(1)}`).join(" L ");

/** Predicted win chance against how often that side won. Measured bins only, no interpolation past them. */
export function CalibrationPlot({ series, title, source, sample }: { series: { name: string; curve: CurvePoint[] }[]; title: string; source: string; sample: string }) {
  const state = series.some(s => s.curve.length) ? "ready" : "empty";
  return <ChartFrame title={title} source={source} sample={sample} state={state}>
    <ChartData fingerprint={JSON.stringify(series.map(s => s.curve.length))}>
      <ul className="chart-legend chart-legend-inline">
        {series.map((s, i) => <li key={s.name}><span className={`chart-key chart-key-${i ? "b" : "a"}`} aria-hidden="true" />{s.name}</li>)}
        <li>Dashed line: predicted = observed</li>
      </ul>
      <svg className="wp-plot chart-graphic" viewBox="0 0 480 272" role="img" aria-label={`${title}: predicted win probability against how often that team won`}>
        {[0, .25, .5, .75, 1].map(t => <g key={t}>
          <line className="wp-plot-grid" x1={PLOT.left} x2={PLOT.right} y1={py(t)} y2={py(t)} />
          <text x={PLOT.left - 8} y={py(t) + 4} textAnchor="end">{t * 100}%</text>
          <text x={px(t)} y={PLOT.bottom + 18} textAnchor="middle">{t * 100}%</text>
        </g>)}
        <line className="wp-plot-ideal" x1={px(0)} y1={py(0)} x2={px(1)} y2={py(1)} />
        <text x={(PLOT.left + PLOT.right) / 2} y={PLOT.bottom + 40} textAnchor="middle">Predicted</text>
        <text transform={`translate(14,${(PLOT.top + PLOT.bottom) / 2}) rotate(-90)`} textAnchor="middle">Observed</text>
        {series.map((s, i) => s.curve.length > 0 && <g key={s.name}>
          <path className="wp-plot-line" data-series={i} d={`M ${pathOf(s.curve)}`} />
          {s.curve.map(p => <circle key={p.predicted} className="wp-plot-dot" data-series={i} cx={px(p.predicted)} cy={py(p.observed)} r="4">
            <title>{`${s.name}: predicted ${(p.predicted * 100).toFixed(1)}%, observed ${(p.observed * 100).toFixed(1)}%, ${(p.share * 100).toFixed(1)}% of states`}</title>
          </circle>)}
        </g>)}
      </svg>
    </ChartData>
  </ChartFrame>;
}

/** Final-test calibration by phase of the game. */
export function TestCalibration({ card }: { card: WinProbabilityPage["card"] }) {
  const [phase, setPhase] = useState("overall");
  const block = card.phases[phase];
  return <div className="wp-section">
    <Segmented label="Phase" size="sm" value={phase} onChange={setPhase} options={PHASE_ORDER.filter(value => card.phases[value]).map(value => ({ value, label: PHASE_LABELS[value] ?? value }))} />
    <CalibrationPlot title={`Calibration on the final test: ${PHASE_LABELS[phase] ?? phase}`} source="CourtLens frozen model, read once after every choice was fixed"
      sample={`${card.test_seasons.join(" and ")} · calibration error ${metric(block.calibration_error)}`}
      series={[{ name: "Selected model", curve: block.curve }, ...(phase === "overall" ? [{ name: "Baseline S0", curve: card.baseline_curve }] : [])]} />
  </div>;
}

/** Rolling 30-day calibration error against the test seasons' interval for a window that size. */
export function DriftPlot({ series, basis }: { series: DriftPoint[]; basis: string }) {
  // Windows under the minimum are not comparable: calibration error is inflated at small samples.
  const known = series.filter(p => p.calibration_error != null && p.interval);
  const judged = known;
  if (!known.length) return <ChartFrame title="Rolling 30-day calibration error" source="CourtLens nightly scorecard" sample={basis} state="empty"><span /></ChartFrame>;
  const top = Math.max(.05, ...known.map(p => p.calibration_error!), ...judged.map(p => p.interval!.high)) * 1.1;
  const count = known.length;
  const x = (i: number) => count === 1 ? (PLOT.left + PLOT.right) / 2 : PLOT.left + (i / (count - 1)) * (PLOT.right - PLOT.left);
  const y = (value: number) => PLOT.bottom - (value / top) * (PLOT.bottom - PLOT.top);
  const index = new Map(known.map((p, i) => [p.date, i]));
  const band = judged.length > 1 ? [...judged.map(p => `${x(index.get(p.date)!).toFixed(1)},${y(p.interval!.high).toFixed(1)}`), ...[...judged].reverse().map(p => `${x(index.get(p.date)!).toFixed(1)},${y(p.interval!.low).toFixed(1)}`)].join(" L ") : null;
  const line = known.map((p, i) => `${x(i).toFixed(1)},${y(p.calibration_error!).toFixed(1)}`).join(" L ");
  return <ChartFrame title="Rolling 30-day calibration error" source="CourtLens nightly scorecard" sample={`${known.at(-1)!.games} games in the latest window · ${basis}`} note="Shaded: the test seasons' 95% interval for a window this size. Drawn from 25 games, the smallest window it can judge.">
    <ChartData fingerprint={String(count)}>
      <svg className="wp-plot chart-graphic" viewBox="0 0 480 252" role="img" aria-label={`Rolling calibration error, latest ${metric(known.at(-1)!.calibration_error)}`}>
        {[0, top / 2, top].map(t => <g key={t}>
          <line className="wp-plot-grid" x1={PLOT.left} x2={PLOT.right} y1={y(t)} y2={y(t)} />
          <text x={PLOT.left - 8} y={y(t) + 4} textAnchor="end">{t.toFixed(3)}</text>
        </g>)}
        {band && <path className="wp-plot-band" d={`M ${band} Z`} />}
        <text x={PLOT.left} y={PLOT.bottom + 18}>{known[0].date}</text>
        <text x={PLOT.right} y={PLOT.bottom + 18} textAnchor="end">{known.at(-1)!.date}</text>
        <path className="wp-plot-line" data-series="0" d={`M ${line}`} />
        {known.map((p, i) => <circle key={p.date} className="wp-plot-dot" data-series="0" cx={x(i)} cy={y(p.calibration_error!)} r="4">
          <title>{`${p.date}: ${metric(p.calibration_error)} on ${p.games} games`}</title>
        </circle>)}
      </svg>
    </ChartData>
  </ChartFrame>;
}

export function SeasonSwitch({ seasons, season }: { seasons: string[]; season: string }) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  return <Segmented label="Season" size="sm" value={season} options={seasons.map(value => ({ value, label: value }))} onChange={value => {
    const next = new URLSearchParams(params.toString());
    next.set("wpaSeason", value);
    router.replace(`${pathname}?${next}#wpa`, { scroll: false });
  }} />;
}
