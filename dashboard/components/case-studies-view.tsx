"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FilterBar } from "./ui/filter-bar";
import { DataDetailsButton } from "./ui/data-details";
import { GatedNote } from "./ui/gated-note";
import { PlayerIdentity, TeamIdentity } from "./ui/identity";
import { PageShell, ResearchLayout } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { SegmentedControl } from "./ui/segmented-control";
import { StatTile } from "./ui/stat-tile";
import { TeamLogo } from "./team-logo";

interface CaseStudy {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  subject: string;
  /** Canonical player ID, or the team tricode for a team subject. */
  subjectId: string;
  subjectKind: "player" | "team";
  /** Team for the identity accent and logo badge. */
  subjectTeam: string;
  season: string;
  evidenceHash: string;
  problemSummary: string;
  dataEvidence: Array<{
    label: string;
    team: string;
    games: number;
    minG: number;
    ptsG: number;
    rebG: number;
    astG: number;
    fgPct: string;
    threePct: string;
    ftPct: string;
  }>;
  guarantees: string[];
  manualAnswerSteps: string[];
  actionLinks: Array<{ label: string; href: string; primary?: boolean }>;
}

const CASE_STUDIES: CaseStudy[] = [
  {
    id: "siakam-trade",
    number: 1,
    title: "Mid-Season Trade & Jersey Stint Tracking",
    subtitle: "Tracking multi-team stints without team total cross-wiring or formula discrepancy.",
    subject: "Pascal Siakam",
    subjectId: "1627783",
    subjectKind: "player",
    subjectTeam: "IND",
    season: "2023–24",
    evidenceHash: "5b14b7ed353b499db92e21b79f2ea69d27f8a7e0a8b94f1c1f4e1d3b0a9e2f4a",
    problemSummary:
      "When a player is traded mid-season, naive systems either attribute whole-season stats to their latest team (distorting team defense and historical research), cross-wire games across different team contexts, or fail to reconcile stint averages with season totals.",
    dataEvidence: [
      {
        label: "Stint 1 (Raptors)",
        team: "TOR",
        games: 39,
        minG: 34.7,
        ptsG: 22.23,
        rebG: 6.33,
        astG: 4.87,
        fgPct: "52.2%",
        threePct: "31.7%",
        ftPct: "75.8%"
      },
      {
        label: "Stint 2 (Pacers)",
        team: "IND",
        games: 41,
        minG: 31.8,
        ptsG: 21.27,
        rebG: 7.80,
        astG: 3.68,
        fgPct: "54.9%",
        threePct: "38.6%",
        ftPct: "69.9%"
      },
      {
        label: "Combined Season Total",
        team: "TOT",
        games: 80,
        minG: 33.2,
        ptsG: 21.74,
        rebG: 7.09,
        astG: 4.26,
        fgPct: "53.6%",
        threePct: "34.6%",
        ftPct: "73.2%"
      }
    ],
    guarantees: [
      "Zero Cross-Wiring: Querying the Toronto Raptors' 2023–24 roster counts only Siakam's 39 games wearing a Raptors jersey. His subsequent 41 games for Indiana never contaminate Toronto totals.",
      "Single-Formula Arithmetic Reconciliation: Total Points = 867 (TOR) + 872 (IND) = 1,739 PTS; PPG = 1,739 / 80 = 21.7375 ≈ 21.74 PPG. Shared canonical formula in domain/metrics.py.",
      "Descriptive Discipline: Increased three-point accuracy in Indiana (38.6% vs 31.7%) is recorded as an empirical fact, without inventing an unsupported causal narrative about teammate spacing."
    ],
    manualAnswerSteps: [
      "Navigate to Workload Trends (/research/trends?playerId=1627783&season=2023-24) to compare Siakam's distinct appearance windows.",
      "Open the Player Profile (/players/1627783?season=2023-24) to inspect the Stints table, confirming 39 GP for TOR and 41 GP for IND.",
      "Check the Teams view for Toronto (/teams/1610612761?season=2023-24) to verify that only 39 games and 867 points enter the Raptors team statistics."
    ],
    actionLinks: [
      { label: "Analyze in Trends", href: "/research/trends?playerId=1627783&season=2023-24", primary: true },
      { label: "View Siakam Profile", href: "/players/1627783?season=2023-24" },
      { label: "Inspect Raptors Roster", href: "/teams/1610612761?season=2023-24" }
    ]
  },
  {
    id: "barnes-forecast",
    number: 2,
    title: "Prospective Forecasting & DNP Conditionality",
    subtitle: "Calibrated dispersion intervals and truthful non-appearance (DNP) handling.",
    subject: "Scottie Barnes",
    subjectId: "1630567",
    subjectKind: "player",
    subjectTeam: "TOR",
    season: "2025–26",
    evidenceHash: "bbf90110097c4421865841b158c83b8b17251a08a4eb4f46b356999fcf37c65d",
    problemSummary:
      "Sports forecast evaluations frequently fabricate errors by treating injured or rested players who do not dress (DNP) as 'predicted 20 points, scored 0 points', severely skewing error distributions and calibration curves.",
    dataEvidence: [
      {
        label: "Prospective Issuance",
        team: "TOR vs CLE",
        games: 1,
        minG: 35.2,
        ptsG: 19.4,
        rebG: 8.2,
        astG: 6.1,
        fgPct: "—",
        threePct: "—",
        ftPct: "—"
      },
      {
        label: "Observed Appearance",
        team: "TOR vs CLE",
        games: 1,
        minG: 35.2,
        ptsG: 22.0,
        rebG: 9.0,
        astG: 7.0,
        fgPct: "50.0%",
        threePct: "33.3%",
        ftPct: "80.0%"
      },
      {
        label: "Non-Appearance (DNP)",
        team: "TOR vs ORL",
        games: 0,
        minG: 0.0,
        ptsG: 0.0,
        rebG: 0.0,
        astG: 0.0,
        fgPct: "—",
        threePct: "—",
        ftPct: "—"
      }
    ],
    guarantees: [
      "Strict Cutoff Discipline: Prospective issuance occurs strictly before the game date. Point estimate: 19.4 PTS; 80% Calibrated Interval: [12.0, 26.8] PTS.",
      "Scored Appearance: Barnes played 35:12, scoring 22 PTS. Absolute Error = |22.0 - 19.4| = 2.6 PTS. Covered in [12.0, 26.8]. Status: scored_appearance.",
      "Truthful DNP Segregation: In a subsequent game vs ORL (sidelined with injury), Barnes was absent from the box score. Recorded as status: unscored_dnp, reason: absent_from_box_score_unknown. Never scored as 0 PTS."
    ],
    manualAnswerSteps: [
      "Open the Forecasts Explorer (/forecasts?playerId=1630567) to inspect Barnes' active point estimates and calibrated intervals.",
      "View Quantile Distributions (/research/distributions?playerId=1630567&metric=pts) to verify his empirical median and IQR dispersion.",
      "Open the Player Profile (/players/1630567) to view the forecast card displaying conditionality notices."
    ],
    actionLinks: [
      { label: "View Barnes Forecasts", href: "/forecasts?playerId=1630567", primary: true },
      { label: "View Empirical Distribution", href: "/research/distributions?playerId=1630567&metric=pts" },
      { label: "View Barnes Profile", href: "/players/1630567" }
    ]
  },
  {
    id: "raptors-defense-guardrails",
    number: 3,
    title: "Defensive Box Events vs. Inferred Placement Guardrails",
    subtitle: "Server guardrails answering subjective and out-of-scope inquiries with verified facts.",
    subject: "Toronto Raptors",
    subjectId: "TOR",
    subjectKind: "team",
    subjectTeam: "TOR",
    season: "2023–24",
    evidenceHash: "17251a08a4eb4f46b356999fcf37c65d6f7af9e63f27aada910d3cf4ae8eb331",
    problemSummary:
      "Users frequently ask inquiries that box-score data cannot substantiate: (1) 'Who is the best defender on the team?' and (2) 'Will they win the conference or make the playoffs?' LLMs hallucinate composite numbers or fabricate betting odds.",
    dataEvidence: [
      {
        label: "Steals Leaders",
        team: "TOR",
        games: 60,
        minG: 34.9,
        ptsG: 19.9,
        rebG: 8.2,
        astG: 6.1,
        fgPct: "47.5%",
        threePct: "34.1%",
        ftPct: "78.0%"
      },
      {
        label: "Blocks Leaders",
        team: "TOR",
        games: 61,
        minG: 26.4,
        ptsG: 11.1,
        rebG: 8.6,
        astG: 2.5,
        fgPct: "65.6%",
        threePct: "—",
        ftPct: "55.1%"
      },
      {
        label: "Conference Placement",
        team: "TOR",
        games: 82,
        minG: 48.0,
        ptsG: 112.4,
        rebG: 42.7,
        astG: 28.5,
        fgPct: "47.1%",
        threePct: "34.7%",
        ftPct: "75.4%"
      }
    ],
    guarantees: [
      "No Fabricated Composite Defender Rating: When asked for 'best defender', CourtLens presents verified box-score event counts: Steals (Barnes 1.29 SPG, Trent Jr 1.07 SPG), Blocks (Barnes 1.47 BPG, Poeltl 1.52 BPG), Rebounds (Barnes 6.02 DRPG).",
      "Explicit Domain Limitation: Appends mandatory notice: 'CourtLens does not provide an inferred composite best defender rating. Defensive production is presented as factual box-score event totals.'",
      "Playoff Odds Rejection: When asked 'Can Toronto win the Eastern Conference?', CourtLens server returns status='model_not_available'. CourtLens never fabricates playoff probabilities or simulates future brackets from regular-season records."
    ],
    manualAnswerSteps: [
      "Open Opponent Context (/research/distributions?tab=opponent) to see where Toronto ranks in points and shooting allowed relative to all 30 NBA teams.",
      "Open Stats Explorer (/stats?teamId=1610612761&preset=defense) to sort Raptors players by steals, blocks, and defensive rebounds.",
      "Test the conversational agent (/research/ask) with 'Who will win the Eastern Conference?' to observe the typed guardrail in action."
    ],
    actionLinks: [
      { label: "View Opponent Defense", href: "/research/distributions?tab=opponent", primary: true },
      { label: "Explore Defense in Stats", href: "/stats?teamId=1610612761&preset=defense" },
      { label: "Test Assistant Guardrails", href: "/research/ask" }
    ]
  }
];

const ruleRow = { label: "Cutoff rule", value: "Prospective issuance and every feature use only games dated before the target (game_date < replay_date)." };

/** Case Studies on the Research template: one sealed case at a time, chosen in the URL. */
export function CaseStudiesView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const selected = CASE_STUDIES.find(c => c.id === params.get("case")) ?? CASE_STUDIES[0];
  const choose = (id: string) => {
    const next = new URLSearchParams(params.toString());
    if (id === CASE_STUDIES[0].id) next.delete("case"); else next.set("case", id);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  const known = (value: number) => value > 0 ? value : "—";
  return (
    <PageShell template="research" className="research-view case-studies-view">
      <PageHeader title="Case Studies" subtitle="Reproducible investigations of stints, forecast conditionality and defensive guardrails." actions={<>
        <Link href="/investigations" className="button">Saved Investigations</Link>
        <Link href="/stats" className="button button-primary">Open in Stats</Link>
      </>} />
      <FilterBar collapsible={false} label="Case study" summary={`Case ${selected.number}: ${selected.subject}`} scope={<span className="research-scope-label">Sealed case studies · CourtLens release evidence</span>}
        modes={<SegmentedControl name="Case study" value={selected.id} onChange={choose} options={CASE_STUDIES.map(c => ({ value: c.id, label: `Case ${c.number}: ${c.subject}` }))} />}
        details={<DataDetailsButton rows={[{ label: "Case", value: `${selected.number} · ${selected.id}`, mono: true }, { label: "Artifact hash", value: selected.evidenceHash, mono: true }, ruleRow, { label: "Provenance", value: "Sealed under CourtLens temporal verification contracts. Recomputed from frozen source acquisitions; reconciled fact rows from PostgreSQL 17 materialized marts." }]} />} />
      <ResearchLayout findings={selected.dataEvidence.map(row => <StatTile key={row.label} label={row.label} value={known(row.ptsG)} unit={row.ptsG > 0 ? (row.games > 1 ? " PTS/G" : " PTS") : undefined} footnote={`${row.games} ${row.games === 1 ? "game" : "games"} · ${row.team}`} />)}>
        <section className="panel research-section case-study-hero" aria-label={`Case ${selected.number}`}>
          {selected.subjectKind === "player"
            ? <PlayerIdentity playerId={selected.subjectId} name={selected.subject} team={selected.subjectTeam} subtitle={selected.season} size="lg" href={`/players/${selected.subjectId}`} />
            : <TeamIdentity team={selected.subjectId} name={selected.subject} subtitle={selected.season} size="lg" />}
          <div className="case-study-heading">
            <h2>{selected.title}</h2>
            <p className="research-caption">{selected.subtitle}</p>
          </div>
          <div className="research-result-actions">{selected.actionLinks.map(link => <Link key={link.label} href={link.href} className={`button ${link.primary ? "button-primary" : ""}`}>{link.label}</Link>)}</div>
        </section>
        <div className="table-wrapper research-table" role="region" aria-label="Case study observations" tabIndex={0}>
          <table className="data-table"><caption>Observed real-data evidence</caption>
            <thead><tr><th>Observation Scope</th><th>Team</th><th className="num">Games</th><th className="num">MIN/G</th><th className="num">PTS/G</th><th className="num">REB/G</th><th className="num">AST/G</th><th className="num">FG%</th><th className="num">3P%</th><th className="num">FT%</th></tr></thead>
            <tbody>{selected.dataEvidence.map(row => <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td><span className="research-team">{/^[A-Z]{3}$/.test(row.team.slice(0, 3)) && row.team !== "TOT" && <TeamLogo team={row.team.slice(0, 3)} size={16} />}{row.team}</span></td>
              <td className="num">{row.games}</td><td className="num">{known(row.minG)}</td><td className="num">{known(row.ptsG)}</td><td className="num">{known(row.rebG)}</td><td className="num">{known(row.astG)}</td>
              <td className="num">{row.fgPct}</td><td className="num">{row.threePct}</td><td className="num">{row.ftPct}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <GatedNote why={<p>{selected.problemSummary}</p>}>The problem this case guards against.</GatedNote>
        <section className="panel research-section" aria-label="Architectural guarantees">
          <h3>Guarantees</h3>
          <ul className="case-study-guarantees-list">{selected.guarantees.map(text => <li key={text} className="case-study-guarantee-item">{text}</li>)}</ul>
        </section>
        <section className="panel research-section" aria-label="Manual verification">
          <h3>Verify It Yourself</h3>
          <p className="research-caption">Every finding can be reproduced without calling third-party LLMs or AI providers.</p>
          <ol className="case-study-steps-list">{selected.manualAnswerSteps.map(step => <li key={step}>{step}</li>)}</ol>
        </section>
      </ResearchLayout>
    </PageShell>
  );
}
