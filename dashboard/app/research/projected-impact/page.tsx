import type { Metadata } from "next";
import { GatedNote } from "@/components/ui/gated-note";
import { StatTile } from "@/components/ui/stat-tile";
import { PlayerIdentity } from "@/components/ui/identity";
import { ResearchLayout } from "@/components/ui/page-shell";
import { AgingCurve, ContributionBars, Leaderboard } from "@/components/projected-impact-research";
import { getProjectedImpactPage, getProjectedImpactPlayer } from "@/lib/workbench-api";
import { blockRows, BUCKET_LABELS, featureRows, fixed, gapText, gapTone, percent, RATING_LABELS, RATING_ORDER, signed, type Gap, type PlayerDetail, type ProjectedImpactPage, type ScoreGroup } from "@/lib/projected-impact";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Projected Impact" };

function GapCell({ gap }: { gap: Gap | undefined }) {
  const tone = gapTone(gap);
  return <td className={`num pi-interval ${tone === "better" ? "pi-better" : tone === "worse" ? "pi-worse" : ""}`}>{gapText(gap)}</td>;
}

function TestTable({ card, selected }: { card: ProjectedImpactPage["card"]; selected: string }) {
  const { player, game } = card.test.pooled;
  return <div className="table-wrapper research-table" role="region" aria-label="Final test by rating" tabIndex={0}>
    <table className="data-table"><thead>
      <tr><th rowSpan={2}>Rating</th><th colSpan={3} className="num">{player.players} player seasons, weighted by minutes</th><th colSpan={3} className="num">{game.games.toLocaleString("en-US")} games, final margin</th></tr>
      <tr><th className="num">RMSE</th><th className="num">Correlation</th><th className="num">Gain over carry-forward, 95%</th><th className="num">RMSE</th><th className="num">Winner picked</th><th className="num">Gain over carry-forward, 95%</th></tr>
    </thead>
      <tbody>{RATING_ORDER.map(name => <tr key={name}>
        <th>{RATING_LABELS[name]}{name === selected ? " (selected)" : ""}</th>
        <td className="num">{fixed(player.models[name].rmse)}</td>
        <td className="num">{fixed(player.models[name].correlation)}</td>
        {name === "carry_forward" ? <td className="num">Baseline</td> : name === "time_decay" ? <td className="num">—</td> : <GapCell gap={player.gaps[`${name}_over_carry_forward`]} />}
        <td className="num">{fixed(game.ratings[name].rmse)}</td>
        <td className="num">{percent(game.ratings[name].winner_accuracy)}</td>
        {name === "carry_forward" ? <td className="num">Baseline</td> : name === "time_decay" ? <td className="num">—</td> : <GapCell gap={game.gaps[`${name}_over_carry_forward`]} />}
      </tr>)}</tbody></table>
  </div>;
}

function ScoreTable({ scorecard, selected }: { scorecard: NonNullable<ProjectedImpactPage["scorecard"]>; selected: string }) {
  const row = (label: string, group: ScoreGroup) => <tr key={label}>
    <th>{label}</th>
    <td className="num">{group.games}</td>
    <td className="num">{fixed(group.ratings?.[selected]?.rmse)}</td>
    <td className="num">{fixed(group.ratings?.carry_forward?.rmse)}</td>
    <td className="num">{fixed(group.ratings?.time_decay?.rmse)}</td>
    {group.gaps ? <GapCell gap={group.gaps[`${selected}_over_carry_forward`]} /> : <td className="num">{group.games ? "Under 20 games" : "—"}</td>}
    {group.gaps ? <GapCell gap={group.gaps[`${selected}_over_time_decay`]} /> : <td className="num">{group.games ? "Under 20 games" : "—"}</td>}
  </tr>;
  return <div className="table-wrapper research-table" role="region" aria-label="Weekly score" tabIndex={0}>
    <table className="data-table"><thead><tr><th>Scored games</th><th className="num">Games</th><th className="num">{RATING_LABELS[selected]} RMSE</th><th className="num">Carry-forward</th><th className="num">Time-decay</th><th className="num">Gain over carry-forward, 95%</th><th className="num">Gain over time-decay, 95%</th></tr></thead>
      <tbody>{row("Prospective, after the freeze", scorecard.prospective)}{row("Hindsight, before the freeze", scorecard.hindsight)}</tbody></table>
  </div>;
}

function Findings({ card, selected }: { card: ProjectedImpactPage["card"]; selected: string }) {
  const { player, game, groups, coverage } = card.test.pooled;
  return <ul className="wp-findings">
    <li><strong>The registered selection did not pick the best test model.</strong> {RATING_LABELS[selected]} won on 2023-24 and stays frozen, but ridge did better on the test seasons: margin RMSE {fixed(game.ratings.ridge.rmse)} against {fixed(game.ratings[selected].rmse)}, player RMSE {fixed(player.models.ridge.rmse)} against {fixed(player.models[selected].rmse)}. The freeze keeps ridge&apos;s values and the weekly score reports them.</li>
    <li><strong>The age curve adds almost nothing.</strong> Gain over carry-forward: players {gapText(player.gaps.age_curve_over_carry_forward)}; games {gapText(game.gaps.age_curve_over_carry_forward)}, which is worse.</li>
    <li><strong>Rookies have no clear gain.</strong> Against the group-mean rule on {groups.rookie.players} rookies: {RATING_LABELS.lightgbm} {gapText(groups.rookie.models.lightgbm.gap_over_group_mean)}, ridge {gapText(groups.rookie.models.ridge.gap_over_group_mean)}. Most features need a prior season.</li>
    <li><strong>Returners have no clear gain,</strong> on only {groups.returner.players} players: {RATING_LABELS.lightgbm} {gapText(groups.returner.models.lightgbm.gap_over_group_mean)}.</li>
    <li><strong>The intervals ran wide and failed their registered check.</strong> They covered {percent(coverage.overall.coverage)} of players against a nominal 80%. The owner waived that check for over-coverage only; they were not tuned on the test seasons.</li>
  </ul>;
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const data = await getProjectedImpactPage().catch(() => null);
  if (!data) return <div role="alert"><GatedNote tone="warning">Projected Impact is unavailable: the API could not be reached, or the frozen projections failed their hash check.</GatedNote></div>;
  const { model, card, scorecard, players } = data;
  const selected = model.selected;
  const label = RATING_LABELS[selected] ?? selected;
  const { player: test, game, coverage } = card.test.pooled;
  const wanted = typeof params.player === "string" ? params.player : players.find(p => p.on_roster)?.player_id;
  const detail: PlayerDetail | null = wanted ? await getProjectedImpactPlayer(wanted).catch(() => null) : null;
  const overTimeDecay = gapText(test.gaps[`${selected}_over_time_decay`]);
  return <ResearchLayout className="wp-page" findings={<>
    <StatTile label="Player error, test" value={fixed(test.models[selected].rmse)} footnote={`Carry-forward ${fixed(test.models.carry_forward.rmse)}, ${test.players} player seasons`} />
    <StatTile label="Game margin error, test" value={fixed(game.ratings[selected].rmse)} footnote={`Carry-forward ${fixed(game.ratings.carry_forward.rmse)}, ${game.games.toLocaleString("en-US")} games`} />
    <StatTile label="Prospective games" value={scorecard?.prospective.games ?? 0} footnote={`Since the freeze, ${model.frozen_at.slice(0, 10)}`} />
    <StatTile label="80% interval coverage" value={percent(coverage.overall.coverage)} footnote="Ran wide: registered limit 77–83%, waived" />
  </>}>
    <section className="wp-section" aria-labelledby="pi-result">
      <h2 id="pi-result">Does it beat carrying last season forward?</h2>
      <p>Yes, on 2024-25 and 2025-26, read once after every choice was fixed. {label} lowers the minutes-weighted squared error of next season&apos;s RAPM by {gapText(test.gaps[`${selected}_over_carry_forward`])} and the squared error of game margins by {gapText(game.gaps[`${selected}_over_carry_forward`])}. Against the harder comparison, time-decay RAPM, the gains are {overTimeDecay} and {gapText(game.gaps[`${selected}_over_time_decay`])}. CourtLens makes no claim about which of two players is better when their intervals overlap.</p>
      <TestTable card={card} selected={selected} />
    </section>

    <section className="wp-section" aria-labelledby="pi-board">
      <h2 id="pi-board">2026-27 projections</h2>
      <p>Points per 100 possessions above an average player, frozen {model.frozen_at} and never updated. Every input ends before the {model.feature_cutoff} opener. The interval describes next season&apos;s one-year RAPM, a noisy estimate, and not the player&apos;s true ability.</p>
      <Leaderboard players={players} />
    </section>

    <section className="wp-section" id="contributions" aria-labelledby="pi-why">
      <h2 id="pi-why">Why a player is projected there</h2>
      {detail ? <>
        <PlayerIdentity playerId={detail.player.player_id} name={detail.player.name} team={detail.player.tricode ?? detail.player.last_tricode} era={detail.player.tricode ? { season: "2026-27", team: detail.player.tricode } : detail.player.last_tricode ? { season: "2025-26", team: detail.player.last_tricode } : null} size="md" subtitle={`Projected ${fixed(detail.player.projection)}, interval ${fixed(detail.player.low, 1)} to ${fixed(detail.player.high, 1)}`} />
        <p>Starting from the training average of {fixed(detail.base)}, these sources add up to the projection.</p>
        <div className="wp-split">
          <ContributionBars title="By source" rows={blockRows(detail.player.contributions.blocks)} sample={detail.player.name} />
          <ContributionBars title="Largest single inputs" rows={featureRows(detail.player.contributions.top)} sample={detail.player.name} />
        </div>
      </> : <GatedNote>No contributions for this player.</GatedNote>}
    </section>

    <section className="wp-section" aria-labelledby="pi-weekly">
      <h2 id="pi-weekly">Weekly score, 2026-27</h2>
      <p>The season-long target will not exist until the season ends, so the frozen numbers are scored each week on real games: predicted margin = a + b × (home minus away of box minutes ÷ 48 × rating), with a and b fixed on 2023-24, against the actual final margin. It uses actual minutes on purpose, so it tests the ratings and is not a game forecast. Only games that tipped after the freeze count as prospective; earlier games are hindsight.</p>
      {scorecard ? <ScoreTable scorecard={scorecard} selected={selected} /> : <GatedNote>No games have been scored yet.</GatedNote>}
      {scorecard && !scorecard.prospective.games && <p className="pi-note">No prospective game has been scored yet. Last scored {scorecard.written_at.slice(0, 10)}, through {scorecard.scored_through ?? "no games"}.</p>}
    </section>

    <section className="wp-section" aria-labelledby="pi-age">
      <h2 id="pi-age">The aging curve</h2>
      <p>The age-curve candidate learns a clear rise and fall, but it adds almost nothing over carry-forward. The selected model barely moves with age once it has seen a player&apos;s record, so age is not where its gain comes from.</p>
      <AgingCurve aging={card.aging} selectedLabel={label} />
    </section>

    <section className="wp-section" aria-labelledby="pi-coverage">
      <h2 id="pi-coverage">Do the intervals hold?</h2>
      <p>Split-conformal, nominal 80%, one width per bucket from 2023-24 residuals. Players with 500 or more minutes in the target season; {coverage.overall.players} on the test seasons.</p>
      <div className="table-wrapper research-table" role="region" aria-label="Interval coverage" tabIndex={0}>
        <table className="data-table"><thead><tr><th>Bucket, known before the season</th><th className="num">Players</th><th className="num">± points</th><th className="num">Coverage</th></tr></thead>
          <tbody>
            <tr><th>All</th><td className="num">{coverage.overall.players}</td><td className="num">—</td><td className="num">{percent(coverage.overall.coverage)}</td></tr>
            {Object.entries(coverage.by_prior_minutes).map(([bucket, row]) => <tr key={bucket}><th>{BUCKET_LABELS[bucket] ?? bucket}</th><td className="num">{row.players}</td><td className="num">{fixed(row.half_width)}</td><td className="num">{percent(row.coverage)}</td></tr>)}
          </tbody></table>
      </div>
    </section>

    <section className="wp-section" aria-labelledby="pi-negative">
      <h2 id="pi-negative">What did not work</h2>
      <Findings card={card} selected={selected} />
    </section>

    <section className="wp-section" aria-labelledby="pi-card">
      <h2 id="pi-card">Model card</h2>
      <dl className="wp-card">
        <dt>Version</dt><dd><code>{model.version}</code></dd>
        <dt>Projections hash</dt><dd><code>{model.projections_sha256}</code>. Checked each time the file is loaded.</dd>
        <dt>Frozen</dt><dd>{model.frozen_at}. No refit, recalibration or update during the season; a new version is an offseason job.</dd>
        <dt>Registration</dt><dd><code>{model.registration}</code> · <code>{model.registration_sha256.slice(0, 16)}</code>. Committed before any fit.</dd>
        <dt>Target</dt><dd>RAPM from the target season&apos;s games alone. The plan&apos;s two-year centred window would share games with the prior-RAPM feature or reach into unfinished seasons, so it was replaced; one season is noisier.</dd>
        <dt>Splits</dt><dd>Train targets 2016-17 to {model.trained_through}, select and calibrate {model.calibrated_on}, final test 2024-25 and 2025-26. 2015-16 is excluded because its prior season has no play types.</dd>
        <dt>Selected</dt><dd>{label}: {card.lightgbm.num_leaves} leaves, {card.lightgbm.rounds} rounds, chosen on training seasons. On 2023-24 it beat carry-forward by {gapText(card.selection.gaps_over_carry_forward_90[selected])} (90%).</dd>
        <dt>Rookies and returners</dt><dd>Kept, predicted from whatever exists, reported separately. Unlisted players later in the season take the rookie average of {signed(model.fallback_rating)}.</dd>
        <dt>Interval waiver</dt><dd>{model.f1_waiver ?? "None."}</dd>
        <dt>Limits</dt><dd>Minutes, role and team changes are not modelled. The player test population is who played, which is hindsight. Regular season only.</dd>
        <dt>Credit</dt><dd>In the style of published player projections such as DARKO (Kostya Medvedovsky) and EPM (Taylor Snarr). It replicates neither and uses neither as an input.</dd>
      </dl>
    </section>
  </ResearchLayout>;
}
