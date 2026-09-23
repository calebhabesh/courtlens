import Link from "next/link";
import { DataBadge } from "@/components/data-badge";
import { Metric } from "@/components/metric";
import { ScheduleGrid } from "@/components/schedule-grid";
import { getDataStatus, getSchedule, mondayFor } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const status = await getDataStatus();
  const previewWeek = status.classification === "fixture" ? "2025-02-03" : mondayFor();
  const schedule = await getSchedule(previewWeek);
  const games = schedule.days.reduce((sum, day) => sum + day.game_count, 0);

  return (
    <>
      <section className="hero court-lines">
        <div className="shell hero-grid">
          <div className="hero-copy">
            <DataBadge status={status} />
            <p className="kicker">NBA player intelligence · fantasy decision support</p>
            <h1>
              Understand the player.
              <br />
              <span>Plan the week.</span>
            </h1>
            <p className="hero-lede">
              CourtLoad turns source-traceable box scores into understandable recent form, then
              applies that evidence with schedules and league rules to the games a roster can
              actually start.
            </p>
            <div className="hero-actions">
              <Link className="button" href="/players">
                Explore player form <span aria-hidden="true">→</span>
              </Link>
              <Link className="text-link" href="/planner">
                Open the fantasy planner
              </Link>
            </div>
          </div>
          <div className="hero-panel" aria-label="CourtLoad product summary">
            <div className="panel-topline">
              <span>WEEK LOAD</span>
              <span>{previewWeek}</span>
            </div>
            <div className="load-visual">
              {[76, 34, 62, 28, 88, 48, 30].map((height, index) => (
                <div className="load-day" key={index}>
                  <span style={{ height: `${height}%` }} />
                  <small>{["M", "T", "W", "T", "F", "S", "S"][index]}</small>
                </div>
              ))}
            </div>
            <div className="panel-callout">
              <span className="callout-number">1</span>
              <div>
                <strong>Startable games gained</strong>
                <small>Included fixture scenario—not a pickup score</small>
              </div>
            </div>
            <div className="panel-footnote">Same snapshot · same rules · explainable matching</div>
          </div>
        </div>
      </section>

      <section className="metrics-band">
        <div className="shell metrics-grid">
          <Metric value={status.coverage.games ?? 0} label="games loaded" note="source-backed or labeled fixture" />
          <Metric value={status.coverage.player_games ?? 0} label="player game lines" note="full-game grain" />
          <Metric value={games} label="games this week" note={`${schedule.timezone} calendar`} />
          <Metric
            value={status.quality?.failed ?? "—"}
            label="failed checks"
            note={status.quality ? `${status.quality.passed} passing` : "not run"}
          />
        </div>
      </section>

      <section className="section shell">
        <div className="section-heading split-heading">
          <div>
            <p className="kicker">Statistics with context</p>
            <h2>Understand the evidence before acting on the number.</h2>
          </div>
          <p>
            CourtLoad keeps the sample, cutoff, scoring rules, and source trace visible—then adds
            schedule and lineup constraints when you want to apply that evidence to fantasy.
          </p>
        </div>
        <div className="principle-grid">
          <article>
            <span className="principle-number">01</span>
            <h3>Traceable form</h3>
            <p>Recent production links back to its game-level stats, source object, and checksum.</p>
          </article>
          <article>
            <span className="principle-number">02</span>
            <h3>Visible context</h3>
            <p>Samples, as-of cutoffs, scoring weights, schedule, and freshness stay explicit.</p>
          </article>
          <article>
            <span className="principle-number">03</span>
            <h3>Applied decisions</h3>
            <p>Fantasy scenarios separate scheduled games, usable games, conflicts, and form.</p>
          </article>
        </div>
      </section>

      <section className="section section-ink">
        <div className="shell">
          <div className="section-heading split-heading">
            <div>
              <p className="kicker">Schedule pulse</p>
              <h2>Find the quiet nights.</h2>
            </div>
            <Link className="text-link light" href={`/schedule?start=${previewWeek}`}>
              Explore the full week →
            </Link>
          </div>
          <ScheduleGrid schedule={schedule} />
        </div>
      </section>

      <section className="section shell">
        <div className="lineage-card">
          <div>
            <p className="kicker">Trace, don&apos;t trust</p>
            <h2>Every useful number keeps its receipt.</h2>
            <p>
              A scenario points back to a roster version, scoring-rule hash, source run, immutable
              JSON checksum, and the pre-cutoff games used for recent form.
            </p>
            <Link href="/data-status" className="button button-dark">
              Inspect source health
            </Link>
          </div>
          <ol className="lineage-flow">
            <li><span>01</span>Provider response</li>
            <li><span>02</span>Raw checksum</li>
            <li><span>03</span>Tested marts</li>
            <li><span>04</span>Planner decision</li>
          </ol>
        </div>
      </section>
    </>
  );
}
