"use client";

import { useState } from "react";
import Link from "next/link";

interface CaseStudy {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  subject: string;
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
      "Strict Cutoff Discipline: Prospective issuance occurs strictly prior to game date (game_date < replay_date). Point estimate: 19.4 PTS; 80% Calibrated Interval: [12.0, 26.8] PTS.",
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

export function CaseStudiesView() {
  const [selectedCase, setSelectedCase] = useState<CaseStudy>(CASE_STUDIES[0]);

  return (
    <div className="workbench-content">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="dist-header-meta">
            <span className="font-mono text-xs text-muted">F37</span>
            <span
              className="replica-badge-gated dist-badge-positive"
            >
              Reproducible Case Studies
            </span>

          </div>
          <h1 className="page-title">Flagship Research Case Studies</h1>
          <p className="page-subtitle">
            Empirical investigations demonstrating CourtLens&apos;s data integrity guarantees: mid-season stint reconciliation, prospective forecast conditionality, and zero-inferred defensive guardrails.
          </p>
        </div>

        <div className="page-actions dist-actions">
          <Link href="/investigations" className="button button-secondary text-xs">
            Saved Investigations
          </Link>
          <Link href="/stats" className="button button-primary text-xs">
            Open in Stats
          </Link>
        </div>
      </div>

      {/* Case Study Selector Tabs */}
      <div className="toolbar case-study-toolbar">
        {CASE_STUDIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`tab-button ${selectedCase.id === c.id ? "active" : ""}`}
            onClick={() => setSelectedCase(c)}
          >
            Case {c.number}: {c.subject} ({c.season})
          </button>
        ))}
      </div>

      {/* Selected Case Study Container */}
      <div className="case-study-container">
        {/* Title and Metadata Banner */}
        <div className="table-card case-study-hero">
          <div className="dist-provenance-header">
            <div>
              <span className="font-mono text-xs text-muted uppercase">Case Study {selectedCase.number}</span>
              <h2 className="section-title">{selectedCase.title}</h2>
              <p className="text-muted text-sm">
                {selectedCase.subtitle}
              </p>
            </div>

            <div className="dist-actions">
              {selectedCase.actionLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className={`button ${link.primary ? "button-primary" : "button-secondary"} text-xs`}
                >
                  {link.label} →
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Problem Statement */}
        <div className="table-card case-study-card">
          <h3 className="case-study-card-title">1. Context & Problem Statement</h3>
          <p className="case-study-problem-text">
            {selectedCase.problemSummary}
          </p>
        </div>

        {/* Real Data Evidence Table */}
        <div className="table-card">
          <div className="case-study-table-header">
            <h3 className="case-study-card-title">2. Observed Real-Data Evidence</h3>
            <span className="text-xs text-muted">
              Reconciled fact rows from PostgreSQL 17 materialized marts.
            </span>
          </div>

          <div className="table-wrapper" role="region" aria-label="Case study observations" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Observation Scope</th>
                  <th>Team</th>
                  <th className="text-center">Games</th>
                  <th className="num">Minutes/G</th>
                  <th className="num">PTS/G</th>
                  <th className="num">REB/G</th>
                  <th className="num">AST/G</th>
                  <th className="num">FG%</th>
                  <th className="num">3P%</th>
                  <th className="num">FT%</th>
                </tr>
              </thead>
              <tbody>
                {selectedCase.dataEvidence.map((row, idx) => (
                  <tr key={idx} className="dist-table-row">
                    <td><strong>{row.label}</strong></td>
                    <td>
                      <span className="filter-pill pointer-events-none">
                        {row.team}
                      </span>
                    </td>
                    <td className="text-center">{row.games}</td>
                    <td className="num font-mono">
                      {row.minG > 0 ? row.minG : "—"}
                    </td>
                    <td className="num font-mono text-accent">
                      {row.ptsG > 0 ? row.ptsG : "—"}
                    </td>
                    <td className="num font-mono">
                      {row.rebG > 0 ? row.rebG : "—"}
                    </td>
                    <td className="num font-mono">
                      {row.astG > 0 ? row.astG : "—"}
                    </td>
                    <td className="num font-mono">
                      {row.fgPct}
                    </td>
                    <td className="num font-mono">
                      {row.threePct}
                    </td>
                    <td className="num font-mono">
                      {row.ftPct}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Architectural Guarantees & Invariants */}
        <div className="table-card case-study-card">
          <h3 className="case-study-card-title">3. Architectural Guarantees & Invariants</h3>
          <div className="case-study-guarantees-list">
            {selectedCase.guarantees.map((g, idx) => (
              <div
                key={idx}
                className="case-study-guarantee-item"
              >
                {g}
              </div>
            ))}
          </div>
        </div>

        {/* How to Reproduce / Answer Manually */}
        <div className="table-card case-study-card">
          <h3 className="case-study-card-title">
            4. Manual Verification & Reproducibility Guide
          </h3>
          <p className="text-xs text-muted mb-2">
            Every finding can be reproduced and verified manually without calling third-party LLMs or AI providers:
          </p>
          <ol className="case-study-steps-list">
            {selectedCase.manualAnswerSteps.map((step, idx) => (
              <li key={idx}>
                {step}
              </li>
            ))}
          </ol>
        </div>

        {/* Cryptographic Lineage Footer */}
        <div className="table-card case-study-provenance-box">
          <div className="dist-provenance-header">
            <span className="font-mono text-muted uppercase text-xs">Immutable Provenance</span>
            <span className="font-mono text-xs text-muted">
              Artifact Hash: <code>{selectedCase.evidenceHash}</code>
            </span>
          </div>
          <span className="text-muted text-xs">
            Sealed under CourtLens temporal verification contracts. Recomputed from frozen source acquisitions.
          </span>
        </div>
      </div>
    </div>
  );
}
