import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Methodology" };

const definitions = [
  ["Replay cutoff", "Midnight at the start of the selected NBA game date in America/New_York. Every game on that date is excluded from history."],
  ["Reference points", "PTS + 1.2 REB + 1.5 AST + 3 STL + 3 BLK − TOV. This fixed CourtLoad metric is not a claim about every fantasy platform."],
  ["Reconstructed target", "The next recorded team game within six days, using the player’s last observed team when that association is no more than 30 days old."],
  ["Conditional estimate", "Estimated reference points if the player appears in that reconstructed team game. It does not estimate availability or a guaranteed next appearance."],
  ["Empirical interval", "The point estimate plus or minus an absolute-error quantile calibrated on the separate 2022–23 calibration block."],
  ["Opponent allowance", "Prior production recorded by opponents against that team over as many as ten eligible team games. It is not defensive efficiency or position defense."]
];

export default function MethodologyPage() {
  return <section className="page shell reading-shell">
    <div className="page-heading"><div><p className="kicker">Historical replay · baseline-v1</p><h1>Methodology</h1><p>How CourtLoad creates comparable, cutoff-safe player evidence and where its claims stop.</p></div></div>
    <article className="prose">
      <h2>One snapshot and cutoff</h2>
      <p>Both sides of a comparison resolve one immutable published snapshot and one replay date. Summaries use completed appearances strictly before that date. Shared URLs keep the snapshot, date, and both player IDs so the same retained inputs reproduce the view.</p>
      <div className="definition-list">{definitions.map(([term, definition]) => <div key={term}><h3>{term}</h3><p>{definition}</p></div>)}</div>

      <h2>Descriptive windows</h2>
      <p>Last-5, last-10, and season-to-date values are calculated in the warehouse from prior appearances. Shooting percentages use summed makes and attempts. Sample counts stay beside each value, and missing opponent coverage remains missing rather than becoming zero.</p>

      <div className="code-rule"><span>Temporal invariant</span><code>source_game_date &lt; replay_date</code><p>A selected date’s outcomes cannot contribute to its profile, matchup context, or estimate features.</p></div>

      <h2>Serving policy</h2>
      <p>Players with fewer than five valid same-season appearances receive no numeric estimate. Five to nine appearances receive a labeled available-history mean without a calibrated interval. With ten or more appearances, CourtLoad serves EWMA over as many as 20 appearances with a five-appearance half-life when a registered out-of-time replay artifact exists for the cutoff.</p>
      <p>The boosted player-plus-context challenger was evaluated once on the untouched 2023–24 final season and was not promoted. EWMA had lower error overall and in the required comparison gates. The evaluation page reports the measured result and artifact identity.</p>

      <h2>Historical reconstruction limits</h2>
      <ul>
        <li>The archive contains revised historical records rather than contemporaneous pregame observations.</li>
        <li>Team association and target schedules are reconstructed from completed records; they are not verified historical rosters or original schedule publications.</li>
        <li>The estimate does not model injuries, availability, trades after the cutoff, or appearance probability.</li>
        <li>Empirical coverage on held-out history is not a guarantee for a future live setting.</li>
        <li>M6 did not count observed final-season appearances for which no candidate existed, so total player coverage is unknown.</li>
      </ul>

      <div className="prose-cta"><div><h2>Inspect the measured result.</h2><p>See validation, final-test metrics, promotion gates, data health, and the immutable run hash.</p></div><Link className="button button-dark" href="/evaluation">Open evaluation</Link></div>
    </article>
  </section>;
}
