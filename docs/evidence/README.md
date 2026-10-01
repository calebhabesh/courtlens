# Evidence Directory

Status: **Milestone P9 complete — portfolio evidence and disaster recovery packaged**, 2026-10-01.  
All required workbench deliverables, reproducible evaluations, disaster recovery procedures, and flagship case studies are fully evidenced with measured data, verified checksums, and executable tests.

---

## 1. Workbench Evidence Index (Milestones P1–P9)

| Deliverable / Asset | Document / Location | Scope / Highlights | Verification Status |
| :--- | :--- | :--- | :--- |
| **Workbench Case Studies** | [workbench-case-studies.md](workbench-case-studies.md) | Three real-data flagship case studies: (1) Siakam mid-season trade & stint tracking, (2) Barnes prospective forecasting & DNP conditionality, (3) Raptors defensive box stats & conference placement guardrails | Verified against PostgreSQL 17 |
| **Workbench Demo Walkthrough** | [workbench-demo-walkthrough.md](workbench-demo-walkthrough.md) | Comprehensive step-by-step user journey across Explorer, Profile, Comparison, Teams, Forecasting Ledger, Assistant, Saved Investigations, and Disaster Recovery | Verified against running services |
| **Performance & Storage Benchmarks** | [performance.md](performance.md) | Rigorous hardware specs, 15 API latency benchmarks (all p50 < 60ms core), database and on-disk footprints, AI query budgets | 450 requests benchmarked (0.0% error rate) |
| **Raw Benchmark Payload** | [workbench-benchmarks.json](workbench-benchmarks.json) | Complete machine-readable benchmark results with min/p50/p95/p99/max/mean latencies and table storage statistics | Generated via `scripts/benchmark_workbench.py` |
| **Retained Evidence Checksums** | [retained-evidence-checksums.sha256](retained-evidence-checksums.sha256) | SHA-256 cryptographic signatures of 26 historical M5 baseline and M6 challenger evaluation artifacts and split manifests | 26 of 26 files passed `OK` |
| **Disaster Recovery & Fresh DB Restore** | [test_restore_postgres.py](../../tests/integration/test_restore_postgres.py) | Full backup bundle creation under mutation lock and automated restore verification into a fresh disposable PostgreSQL database | Automated test passed |
| **Tool-Backed Assistant Verification** | [smoke.py](../../src/courtload/services/assistant/smoke.py) | 6 curated benchmark queries enforcing domain guardrails, verified evidence references, and ungrounded claim stripping | All 6 passed in `courtload smoke-assistant` |

---

## 2. Retained Historical Evidence (Milestones M1–M8)

The following historical documents and artifacts are preserved to document the original development progression:

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
| **M8** | [Interactive demo recording](../assets/demo.webm) | Video capture: Search $\rightarrow$ Context $\rightarrow$ Compare $\rightarrow$ Evaluation | 25s, 1280x720 25fps VP8 WebM |
| **M8** | [Restore verification](../../scripts/restore.sh) | Automated backup bundle, database drop/restore, hash verification, live comparison check | Verified via `courtload verify-restore` |

---

## 3. Visual Artifacts and Captures

- [Real player profile (desktop)](../assets/real-player-profile.png)
- [Real player profile (375 px mobile)](../assets/real-player-profile-mobile.png)
- [Two-player comparison (desktop)](../assets/real-comparison.png)
- [Two-player comparison (375 px mobile)](../assets/real-comparison-mobile.png)
- [Evaluation & methodology view](../assets/real-evaluation.png)
- [Demonstration recording](../assets/demo.webm)
- [Fixture home (legacy reference)](../assets/fixture-home.png)
- [Fixture planner (legacy reference)](../assets/fixture-planner.png)
- [Fixture mobile (legacy reference)](../assets/fixture-mobile.png)
