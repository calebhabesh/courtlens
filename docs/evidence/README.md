# Evidence directory

Status: **Complete through Milestone 8 (M8)**, 2026-09-23.  
All required portfolio readiness gates are fully evidenced with measured data, reproducible commands, and cryptographic hashes.

---

## 1. Verified Evidence Index

| Milestone | Document / Asset | Scope / Highlights | Verification Status |
| :--- | :--- | :--- | :--- |
| **M1** | [Historical source spike](historical-source-spike.md) | Pinned archive hashes, 3-season schedule reconciliation, 30 joined games, 184 quarantined rows | Verified (95.1% complete game coverage) |
| **M2** | [Alembic revision `8ffd4c5912e2`](../../migrations/versions/8ffd4c5912e2_archive_lineage_and_facts.py) | Immutable observations, external identities, atomicity, quarantine locators | Verified against PostgreSQL 17 |
| **M3** | [dbt facts & marts](../../warehouse/models/) | 90,609 player facts, 7,022 team facts, 220,942 profiles, candidate isolation, advisory locks | 25 models & tests passed in 162.7s |
| **M4** | [Real player analytics](real-player-analytics.md) | Published M4 snapshot, LeBron James reconciliation, matchup context, desktop/mobile captures | Verified against normalized source rows |
| **M5** | [Baseline evaluation](baseline-evaluation.md) | Frozen evaluation protocol, S1/S2 splits, rolling baseline selection, empirical calibration | EWMA-20 MAE 7.7095 vs. Last-10 7.8264 |
| **M6** | [Model evaluation & model card](model-evaluation.md) | GBDT player-only and context challengers, single S3 opening, 4 frozen promotion gates | Verified no-promotion decision (3 of 4 failed) |
| **M7** | [Comparison & evaluation](comparison-evaluation.md) | Snapshot-bound 2-player API/UI, registered EWMA replay estimates, empirical intervals | Verified LeBron vs. Curry at 2023-11-15 |
| **M8** | [Historical case studies](case-studies.md) | Two validation-era case studies (Thomas Bryant role surge; Chris Paul vs. Scottie Barnes context) | Verified on snapshot `5b14b7ed-353b-499d` |
| **M8** | [Performance evidence](performance.md) | Hardware description, pipeline timings, storage footprint, API latency benchmarks (p50/p95) | Sub-80ms p50 comparison, 0.0% error rate |
| **M8** | [Interactive demo recording](../assets/demo.webm) | Video capture: Search $\rightarrow$ Context $\rightarrow$ Compare $\rightarrow$ Evaluation | 25s, 1280x720 25fps VP8 WebM |
| **M8** | [Restore verification](../../scripts/restore.sh) | Automated backup bundle, database drop/restore, hash verification, live comparison check | Verified via `courtload verify-restore` |

---

## 2. Visual Artifacts and Captures

- [Real player profile (desktop)](../assets/real-player-profile.png)
- [Real player profile (375 px mobile)](../assets/real-player-profile-mobile.png)
- [Two-player comparison (desktop)](../assets/real-comparison.png)
- [Two-player comparison (375 px mobile)](../assets/real-comparison-mobile.png)
- [Evaluation & methodology view](../assets/real-evaluation.png)
- [Demonstration recording](../assets/demo.webm)
- [Fixture home (legacy reference)](../assets/fixture-home.png)
- [Fixture planner (legacy reference)](../assets/fixture-planner.png)
- [Fixture mobile (legacy reference)](../assets/fixture-mobile.png)

---

## 3. Retained Legacy Evidence

The following files are preserved as historical artifacts from earlier design phases:
- [`live-source-spike.md`](live-source-spike.md): BallDontLie provider viability spike (superseded by ADR 0003 zero-cost archive).
- [`real-week-1.md`](real-week-1.md) and [`real-week-2.md`](real-week-2.md): Deferred fantasy league tracking templates (superseded by player comparison core).
- [`fixture-verification.md`](fixture-verification.md): Initial fixture-backed baseline verification.
