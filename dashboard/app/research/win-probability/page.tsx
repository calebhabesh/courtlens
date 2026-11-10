import type { Metadata } from "next";
import { Suspense } from "react";
import { GatedNote } from "@/components/ui/gated-note";
import { PlayerIdentity } from "@/components/ui/identity";
import { Badge } from "@/components/ui/badge";
import { ResearchLayout } from "@/components/ui/page-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { TeamLogo } from "@/components/team-logo";
import { CalibrationPlot, DriftPlot, SeasonSwitch, TestCalibration } from "@/components/win-probability-research";
import { getWinProbabilityAdded, getWinProbabilityPage } from "@/lib/workbench-api";
import { DRIFT_COPY, metric, PHASE_LABELS, PHASE_ORDER, signed, type Interval, type ScoreGroup, type WinProbabilityAdded, type WinProbabilityPage, type WpaRow } from "@/lib/win-probability";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Win Probability" };

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const interval = (value: Interval | null | undefined) => value ? `${signed(value.mean)} (${signed(value.low)} to ${signed(value.high)})` : "—";

function ScoreRow({ label, group }: { label: string; group: ScoreGroup }) {
  const same = group.same_events;
  return <tr>
    <th>{label}</th>
    <td className="num">{group.games}</td>
    <td className="num">{metric(same?.courtlens_log_loss)}</td>
    <td className="num">{metric(same?.espn_log_loss)}</td>
    <td className="num">{group.games ? (same?.log_loss_gap ? interval(same.log_loss_gap) : "Under 20 games") : "—"}</td>
    <td className="num">{metric(same?.courtlens_brier)}</td>
    <td className="num">{metric(same?.espn_brier)}</td>
    <td className="num">{metric(same?.courtlens_calibration_error)}</td>
    <td className="num">{metric(same?.espn_calibration_error)}</td>
  </tr>;
}

function WpaTable({ rows, season, metricKey, label }: { rows: WpaRow[]; season: string; metricKey: "wpa" | "clutch_wpa"; label: string }) {
  return <div className="table-wrapper research-table" role="region" aria-label={label} tabIndex={0}>
    <table className="data-table"><thead><tr><th>Player</th><th className="num">Games</th><th className="num">{metricKey === "wpa" ? "WPA" : "Clutch WPA"}</th><th className="num">{metricKey === "wpa" ? "Credited plays" : "Clutch plays"}</th></tr></thead>
      <tbody>{rows.slice(0, 15).map(row => <tr key={row.player}>
        <th><PlayerIdentity playerId={row.player_id ?? undefined} name={row.name} team={row.team} era={{ season, team: row.team }} size="sm" href={row.player_id ? `/players/${row.player_id}?season=${season}` : undefined} /></th>
        <td className="num">{row.games}</td>
        <td className="num">{signed(row[metricKey], 2)}</td>
        <td className="num">{metricKey === "wpa" ? row.events : row.clutch_events}</td>
      </tr>)}</tbody></table>
  </div>;
}

function Negative({ card }: { card: WinProbabilityPage["card"] }) {
  const pair = (name: string) => card.pairs.find(p => p.model === name && p.reference === "S2");
  const overall = card.espn.comparison.overall, tipoff = card.espn.tipoff;
  return <ul className="wp-findings">
    <li><strong>Lineups and rotation (S4) added nothing.</strong> It was expected to be the differentiator. Test log-loss gain over S2, where positive would mean it helped: {interval(pair("S4")?.overall.log_loss)}, so the frozen model has no live lineup tracker.</li>
    <li><strong>Momentum and shooting luck (S5) added nothing,</strong> as expected: {interval(pair("S5")?.overall.log_loss)}.</li>
    <li><strong>Volatility (S3) did not help comebacks:</strong> {interval(pair("S3")?.overall.log_loss)}.</li>
    <li><strong>Recalibration was fitted and not used.</strong> It made cross-validated log loss slightly worse.</li>
    <li><strong>The betting market is clearly better before tip-off.</strong> Closing spread RMSE {metric(card.market.market_rmse, 2)} points against {metric(card.market.courtlens_rmse, 2)} for CourtLens, on {card.market.games.toLocaleString("en-US")} games.</li>
    <li><strong>ESPN is not beaten overall.</strong> Log-loss gap {interval(overall.log_loss.espn_minus_courtlens)}, which includes zero. ESPN leads at tip-off without a clear gap ({signed(tipoff.log_loss.espn_minus_courtlens.mean)}); CourtLens is better after halftime. ESPN&apos;s model is a black box and its numbers were read after the games, which is why 2026-27 is the real test.</li>
    <li><strong>Overtime is the weak spot:</strong> calibration error {metric(card.phases.overtime.calibration_error, 3)} on {card.phases.overtime.log_loss.games} games.</li>
  </ul>;
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const data = await getWinProbabilityPage().catch(() => null);
  if (!data) return <div role="alert"><GatedNote tone="warning">Win probability is unavailable. Restore the local API connection.</GatedNote></div>;
  const { model, card, scorecard } = data;
  const wanted = typeof params.wpaSeason === "string" ? params.wpaSeason : data.wpa_seasons[0];
  const season = data.wpa_seasons.includes(wanted) ? wanted : data.wpa_seasons[0];
  const wpa: WinProbabilityAdded | null = season ? await getWinProbabilityAdded(season).catch(() => null) : null;
  const selected = card.models.selected;
  const drift = scorecard?.drift.latest;
  const driftCopy = DRIFT_COPY[drift?.status ?? "insufficient"];
  const prospective = scorecard?.prospective, replay = scorecard?.pre_freeze_replay;
  const liveCurves = prospective?.games ? prospective : replay;
  const basis = scorecard?.drift.basis === "prospective" ? "prospective games" : "pre-freeze replay, not prospective";
  return <ResearchLayout className="wp-page" findings={<>
    <StatTile label="Test log loss" value={metric(selected.log_loss.mean)} footnote={`Baseline ${metric(card.models.S0.log_loss.mean)}, ${card.test_games.toLocaleString("en-US")} games`} />
    <StatTile label="Test calibration error" value={metric(selected.calibration_error)} footnote="Registered limit 0.02" />
    <StatTile label="Prospective games" value={prospective?.games ?? 0} footnote={`Since the freeze, ${model.frozen_at.slice(0, 10)}`} />
    <StatTile label="Drift" value={drift?.status === "insufficient" ? "—" : metric(drift?.calibration_error)} footnote={driftCopy.label} />
  </>}>
    <section className="wp-section" aria-labelledby="wp-scorecard">
      <h2 id="wp-scorecard">Live scorecard, 2026-27</h2>
      <p>CourtLens and ESPN are scored on the same game states every night. Only games that tipped after the freeze, with inputs sealed before tip-off, count as prospective. A positive gap favours CourtLens. Pre-freeze replay games use hindsight on who played, so they test the pipeline, not the model.</p>
      {!scorecard ? <GatedNote>No games have been scored yet.</GatedNote> : <>
        <div className="table-wrapper research-table" role="region" aria-label="Season scorecard" tabIndex={0}>
          <table className="data-table"><thead>
            <tr><th rowSpan={2}>Scored games</th><th rowSpan={2} className="num">Games</th><th colSpan={2} className="num">Log loss</th><th rowSpan={2} className="num">Gap, 95% interval</th><th colSpan={2} className="num">Brier</th><th colSpan={2} className="num">Calibration error</th></tr>
            <tr><th className="num">CourtLens</th><th className="num">ESPN</th><th className="num">CourtLens</th><th className="num">ESPN</th><th className="num">CourtLens</th><th className="num">ESPN</th></tr>
          </thead>
            <tbody><ScoreRow label="Prospective" group={scorecard.prospective} /><ScoreRow label="Pre-freeze replay" group={scorecard.pre_freeze_replay} /></tbody></table>
        </div>
        <div className="wp-split">
          <div className="wp-section">
            <div className="wp-drift"><Badge variant={drift?.status === "above" ? "negative" : drift?.status === "within" ? "positive" : "default"}>{driftCopy.label}</Badge><span>{drift?.games ?? 0} games, 30-day window, {basis}</span></div>
            <DriftPlot series={scorecard.drift.series} basis={basis} />
          </div>
          <CalibrationPlot title="Calibration on 2026-27 games" source="CourtLens and ESPN, same states" sample={`${liveCurves?.games ?? 0} games · ${basis}`}
            series={[{ name: "CourtLens", curve: liveCurves?.curve_courtlens ?? [] }, { name: "ESPN Analytics", curve: liveCurves?.curve_espn ?? [] }]} />
        </div>
        <div className="table-wrapper research-table" role="region" aria-label="Recent scored games" tabIndex={0}>
          <table className="data-table"><thead><tr><th>Date</th><th>Game</th><th className="num">Final</th><th>Counted as</th><th className="num">CourtLens log loss</th><th className="num">ESPN log loss</th></tr></thead>
            <tbody>{scorecard.recent_games.slice(0, 15).map(game => <tr key={game.game_id}>
              <td>{game.date}</td>
              <th><span className="wp-matchup"><TeamLogo team={game.away} season="2026-27" size={20} />{game.away} at <TeamLogo team={game.home} season="2026-27" size={20} />{game.home}</span></th>
              <td className="num">{game.away_score}–{game.home_score}</td>
              <td>{game.prospective ? "Prospective" : "Replay"}</td>
              <td className="num">{metric(game.espn?.courtlens_log_loss)}</td>
              <td className="num">{metric(game.espn?.log_loss)}</td>
            </tr>)}</tbody></table>
        </div>
      </>}
    </section>

    <section className="wp-section" aria-labelledby="wp-test">
      <h2 id="wp-test">Final test, {card.test_seasons.join(" and ")}</h2>
      <div className="wp-split">
        <TestCalibration card={card} />
        <div className="table-wrapper research-table" role="region" aria-label="Against ESPN by phase" tabIndex={0}>
          <table className="data-table"><thead><tr><th>Phase</th><th className="num">Games</th><th className="num">CourtLens</th><th className="num">ESPN</th><th className="num">Gap, 95% interval</th></tr></thead>
            <tbody>{PHASE_ORDER.filter(name => card.espn.comparison[name]).map(name => ({ name, row: card.espn.comparison[name] })).map(({ name, row }) => <tr key={name}>
              <th>{PHASE_LABELS[name] ?? name}</th>
              <td className="num">{row.log_loss.courtlens.games.toLocaleString("en-US")}</td>
              <td className="num">{metric(row.log_loss.courtlens.mean)}</td>
              <td className="num">{metric(row.log_loss.espn.mean)}</td>
              <td className="num">{interval(row.log_loss.espn_minus_courtlens)}</td>
            </tr>)}</tbody></table>
        </div>
      </div>
    </section>

    <section className="wp-section" aria-labelledby="wp-negative">
      <h2 id="wp-negative">What did not work</h2>
      <Negative card={card} />
    </section>

    <section className="wp-section" id="wpa" aria-labelledby="wp-wpa">
      <h2 id="wp-wpa">Win probability added</h2>
      <p>Each play&apos;s swing in win probability goes to its first listed player. This is credit assignment, not causal value: the swing also holds time passing since the last play, and it gives nothing to the player who created the shot. Clutch means the last five minutes of the fourth quarter or overtime with the margin at five or fewer.</p>
      {season && <Suspense><SeasonSwitch seasons={data.wpa_seasons} season={season} /></Suspense>}
      {wpa ? <div className="wp-split">
        <WpaTable rows={wpa.leaders} season={wpa.season} metricKey="wpa" label="Season leaders" />
        <WpaTable rows={wpa.clutch_leaders} season={wpa.season} metricKey="clutch_wpa" label="Clutch leaders" />
      </div> : <GatedNote>No win probability added for this season yet.</GatedNote>}
    </section>

    <section className="wp-section" aria-labelledby="wp-card">
      <h2 id="wp-card">Model card</h2>
      <dl className="wp-card">
        <dt>Version</dt><dd><code>{model.version}</code></dd>
        <dt>Frozen</dt><dd>{model.frozen_at}. No refit or recalibration during the season; a new version is an offseason job.</dd>
        <dt>Manifest hash</dt><dd><code>{model.manifest_sha256}</code></dd>
        <dt>Model files</dt><dd>{Object.entries(model.models).map(([role, hash]) => <div key={role}>{role}: <code>{hash}</code></div>)}</dd>
        <dt>Selected</dt><dd>{model.selected}, trained through {model.trained_through}.</dd>
        <dt>Registration</dt><dd><code>{model.registration}</code> · <code>{model.registration_sha256.slice(0, 16)}</code></dd>
        <dt>Player ratings</dt><dd>{sentence(model.pregame.player_rating)}. Rule: {model.pregame.rating_rule}. Holding one snapshot all season cost +0.0039 log loss on the test seasons, so ratings keep updating monthly while the model stays fixed.</dd>
        <dt>Who is available</dt><dd>{sentence(model.pregame.availability)}. Training read each game&apos;s own box, so the test numbers assume the inactive list was known. Having no injury news at all cost +0.0034 log loss on the test seasons; Live sits between the two.</dd>
        <dt>Live inputs</dt><dd>Live replays ESPN&apos;s plays through the training code. On 2,439 test games that changed log loss by +0.0002 and left calibration at 0.0083.</dd>
        <dt>Scope</dt><dd>Regular season only. Other games show ESPN&apos;s line alone. Neutral sites other than the 2019-20 bubble are not identified.</dd>
        <dt>Drift flag</dt><dd>Rolling 30-day calibration error against a game-bootstrap 95% interval from the test seasons at the same window size, with at least 25 games.</dd>
      </dl>
    </section>
  </ResearchLayout>;
}
