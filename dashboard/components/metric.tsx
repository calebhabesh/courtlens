export function Metric({
  value,
  label,
  note
}: {
  value: string | number;
  label: string;
  note?: string;
}) {
  return (
    <div className="metric">
      <span className="metric-value">{value}</span>
      <span className="metric-label">{label}</span>
      {note ? <span className="metric-note">{note}</span> : null}
    </div>
  );
}
