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
            <p className="kicker">NBA fantasy week planning · Toronto</p>
            <h1>
              Win the week,
              <br />
              <span>not the schedule.</span>
            </h1>
            <p className="hero-lede">
              CourtLoad turns source-traceable schedules, your league rules, and transparent
              recent form into the games your roster can actually start.
            </p>
            <div className="hero-actions">
              <Link className="button" href="/planner">
                Plan a scoring week <span aria-hidden="true">→</span>
              </Link>
              <Link className="text-link" href="/methodology">
                Read the methodology
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
            <p className="kicker">The useful distinction</p>
            <h2>Four games on paper can be two games in your lineup.</h2>
          </div>
          <p>
            CourtLoad matches each scheduled player to your actual daily slot instances. Full
            compatible slots become visible conflicts instead of disappearing inside a weekly
            total.
          </p>
        </div>
        <div className="principle-grid">
          <article>
            <span className="principle-number">01</span>
            <h3>Traceable schedule</h3>
            <p>Loaded games retain source status, UTC tipoff, local date, and snapshot lineage.</p>
          </article>
          <article>
            <span className="principle-number">02</span>
            <h3>Your constraints</h3>
            <p>Daily slots, eligibility, acquisition limits, and scoring weights are versioned.</p>
          </article>
          <article>
            <span className="principle-number">03</span>
            <h3>Explainable delta</h3>
            <p>Scenarios separate scheduled games, usable games, conflicts, and recent production.</p>
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
