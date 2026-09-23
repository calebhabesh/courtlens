import type { AnalyticsGame } from "@/lib/types";

type Series = { label: string; value: (game: AnalyticsGame) => number | null; className: string };

export function TrendChart({
  title,
  unit,
  games,
  series
}: {
  title: string;
  unit: string;
  games: AnalyticsGame[];
  series: Series[];
}) {
  const ordered = [...games].reverse();
  const values = ordered.flatMap((game) => series.map((item) => item.value(game))).filter(isNumber);
  if (values.length < 2) return <p className="chart-empty">Not enough observations to chart.</p>;
  const minimum = Math.min(...values, 0);
  const maximum = Math.max(...values);
  const spread = Math.max(maximum - minimum, 1);
  const x = (index: number) => 12 + (index * 276) / Math.max(ordered.length - 1, 1);
  const y = (value: number) => 92 - ((value - minimum) / spread) * 76;
  const chartId = title.toLowerCase().replaceAll(" ", "-");

  return (
    <figure className="trend-card">
      <figcaption id={`${chartId}-title`}><strong>{title}</strong><span>{unit}</span></figcaption>
      <svg viewBox="0 0 300 108" role="img" aria-labelledby={`${chartId}-title`}>
        <line className="chart-grid" x1="12" x2="288" y1="92" y2="92" />
        {series.map((item) => {
          const points = ordered
            .map((game, index) => {
              const value = item.value(game);
              return value === null ? null : `${x(index)},${y(value)}`;
            })
            .filter(Boolean)
            .join(" ");
          return <polyline className={item.className} key={item.label} points={points} />;
        })}
      </svg>
      <div className="chart-legend">
        {series.map((item) => <span className={item.className} key={item.label}>{item.label}</span>)}
      </div>
    </figure>
  );
}

function isNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}
