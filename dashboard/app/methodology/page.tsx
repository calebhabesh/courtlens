import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Methodology" };

const definitions = [
  [
    "Scheduled player-game",
    "The player’s observed or current team has a non-cancelled game in the selected league-local range. It does not assert that the player will be active or appear."
  ],
  [
    "Startable player-game",
    "A scheduled player-game assigned to one compatible active slot by the deterministic daily matcher. Real-world availability remains external."
  ],
  [
    "Lineup conflict",
    "A scheduled roster player is left unassigned because other scheduled players consume all compatible active slot instances."
  ],
  [
    "Recent production",
    "Descriptive fantasy output from final games strictly before the displayed as-of cutoff, with the sample size and window completeness shown."
  ],
  [
    "Watchlist candidate",
    "A player the user wants to compare. CourtLoad does not claim the player is available, healthy, or eligible for a transaction."
  ],
  [
    "Light-slate day",
    "A league-local date with no more than the visible threshold of NBA games. It is schedule context, not medical rest analysis."
  ]
];

export default function MethodologyPage() {
  return (
    <section className="page shell reading-shell">
      <div className="page-heading">
        <div>
          <p className="kicker">Version 1.0.0</p>
          <h1>Methodology</h1>
          <p>What CourtLoad calculates, what it deliberately refuses to infer, and why.</p>
        </div>
      </div>

      <article className="prose">
        <h2>Fantasy planning before prediction</h2>
        <p>
          CourtLoad is useful without an ML model. It combines a source-backed operational
          schedule—or an explicitly labeled fixture schedule—with user-owned league configuration,
          manually supplied fantasy eligibility, and time-correct recent form. No projection is
          promoted in v1 because a projection must first beat transparent rolling baselines in
          held-out time windows and match the league&apos;s scoring-rule hash.
        </p>

        <div className="definition-list">
          {definitions.map(([term, definition]) => (
            <div key={term}>
              <h3>{term}</h3>
              <p>{definition}</p>
            </div>
          ))}
        </div>

        <h2>Daily matching</h2>
        <ol>
          <li>Resolve each roster player&apos;s team for the selected local date.</li>
          <li>Keep non-cancelled team games and respect only user-entered inactive overrides.</li>
          <li>Create individual slot instances from the league configuration.</li>
          <li>Connect players only to slots allowed by user-supplied fantasy eligibility.</li>
          <li>Maximize assigned players, then use trailing fantasy points as a visible tie-break.</li>
          <li>Apply a stable identifier tie-break so the same inputs always produce the same plan.</li>
        </ol>
        <p>
          The same algorithm and source snapshot are used before and after an add/drop scenario.
          The product does not optimize a speculative chain of transactions or submit a lineup.
        </p>

        <div className="code-rule">
          <span>Temporal invariant</span>
          <code>source_game.tipoff_utc &lt; feature.calculated_as_of</code>
          <p>A game&apos;s own minutes and stats cannot contribute to its pregame feature row.</p>
        </div>

        <h2>Known limits</h2>
        <ul>
          <li>Daily-lineup points leagues only in v1; weekly-lock behavior is rejected explicitly.</li>
          <li>Eligibility, injuries, waiver availability, and transaction acceptance remain authoritative in the fantasy platform.</li>
          <li>An absent box-score row is shown as unknown, never silently converted into a DNP.</li>
          <li>Provider data is best effort, can be corrected, and is not an official league feed.</li>
          <li>Schedule and rest context is not medical, injury, betting, or financial advice.</li>
        </ul>

        <div className="prose-cta">
          <div><h2>Inspect the evidence.</h2><p>See coverage, freshness, quality checks, and the latest source run.</p></div>
          <Link className="button button-dark" href="/data-status">Open data status</Link>
        </div>
      </article>
    </section>
  );
}
