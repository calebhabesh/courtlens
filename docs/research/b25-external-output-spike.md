# B25 external-output access spike

Checked **2026-10-03 10:39:55–10:43:00 UTC**. This is a bounded source inspection, not output admission. No CSV was downloaded, ratings retained, source dataset acquired, account created or person contacted. Public HTML and three public JavaScript assets were inspected in memory; only schema/access metadata and hashes are recorded here. No model fitting occurred.

**Decision: DARKO remains `source_blocked` for CourtLoad import and serving.** Public output access is credible, but independent identity binding, dated immutable output/version evidence, historical observation evidence and admissible reuse are not all established. This decision applies the [analytics contract](../design/replica-analytics-contract.md); it does not assert that access or reuse is prohibited.

## Primary-source observations

The [first-party leaderboard](https://www.darko.app/) displayed a CSV control and a June 3, 2026 ratings cutoff. Its public HTML embedded `ratingsThrough:"2026-06-03"`, `asOf:null` and `selectedSeason:null`. The compact player schema included `nba_id`, `player_name`, `team_name`, `tm_id`, `season`, `dpm`, `o_dpm`, `d_dpm`, `box_dpm` and `on_off_dpm`. A field named `nba_id` is identity evidence; it does not independently validate every row or a CourtLoad crosswalk. No homepage policy/license link was found by the bounded link inspection.

The [first-party explanation](https://www.darko.app/about) defines DPM as a next-game forecast in points per 100 possessions, including offensive and defensive components. It describes updates after games, history since 1996–97, CSV downloads and Time Machine/Rewind views of prior dates. It also explains that offseason displays retain the projection entering the last game. These statements establish model meaning and available interface features. They do not establish an immutable archive of what was publicly published on each historical date. No reuse license was identified in that explanation.

The [leaderboard JavaScript](https://www.darko.app/_app/immutable/nodes/2.DOTbHt9_.js) calls a CSV helper with filename `darko-dpm-leaderboard.csv` and board rows/columns. Its current column selection excludes `bayes_rapm_total` and `tr_minutes`; historical selection can add `DPM now` and `Since`. No versioned CSV endpoint or download SLA was established from this code inspection.

The [CSV helper JavaScript](https://www.darko.app/_app/immutable/chunks/BqIT6x5K.js) builds a browser Blob with `text/csv;charset=utf-8;`, UTF-8 BOM, CRLF separators and an object URL. The current leaderboard column definition, after the exclusions above, yields: `#`, `Player`, `Team`, `Pos`, `DPM`, `ODPM`, `DDPM`, `Box`, `On/Off DPM`, `MPG`, `Pace`, `Pts per 100`, `Ast per 100`, `FG%`, `3P%`, `FT%`, `$ Value`, `Salary`, `Surplus Value`. It omits NBA identity and date/version fields. Values use display formatting, including percentages, rounded monetary millions and missing-value glyphs. This is a presentation export, not a proven full-precision machine schema.

## Metadata retained from ordinary public requests

| Resource | HTTP / size | SHA-256 of inspected response |
| --- | --- | --- |
| [Leaderboard HTML](https://www.darko.app/) | 200 / 398,749 bytes | `844a1d007faba183c6c900baa14a06e4fef82479efdab6199cb8e2c797b1157c` |
| [App entry](https://www.darko.app/_app/immutable/entry/app.DHESLsNk.js) | 200 / 13,090 bytes | `63999a7eed924c770c2b87e1cbd4e6f6dd08f5793c8b0a087b932ba9bec28fa2` |
| [Leaderboard node](https://www.darko.app/_app/immutable/nodes/2.DOTbHt9_.js) | 200 / 65,873 bytes | `f559410322dc386102ff16f11b0c68238260af897b09b8906620acd5bbfc94cb` |
| [CSV helper](https://www.darko.app/_app/immutable/chunks/BqIT6x5K.js) | 200 / 16,839 bytes | `1c22589106e4d8d31bb64aeca6e966c1abe04a920900481acbe555061623b8c3` |

The HTML request was observed at **2026-10-03T10:40:14.620310+00:00**; its HTTP Date was `Sat, 03 Oct 2026 10:40:14 GMT`, ETag was `"cvxg6"`, content type was `text/html`, and no Last-Modified header was returned. These are inspection/request metadata. The assets were read later within the stated inspection window. The app-entry asset identifies the leaderboard node path, which in turn imports the helper. Response hashes and fingerprinted JavaScript filenames identify inspected website bytes; they are **not** DARKO model versions or retained rating artifacts. Responses were not saved, so these hashes are inspection notes rather than reproducible acquisition evidence.

## Exact admission gates

| Gate | B25 finding | Evidence needed before admission |
| --- | --- | --- |
| Legitimate access | Public UI export mechanism verified by first-party code; actual exported file, refresh stability and machine endpoint untested. | Obtain an authorized export through its documented/public mechanism; retain original bytes, URL, acquisition UTC time, byte count, hash and parser/schema version. Any automated path needs separately verified legitimate access. |
| NBA identity | Public HTML has `nba_id`; current leaderboard CSV omits it. No row-level mapping validation was performed. | Retain provider namespace/ID and independently verify each NBA player identity; reject duplicates, ambiguous name-only joins and unverified identities. Record covered/unmapped rows. |
| Output effective date | Provider reports ratings through June 3, 2026; this is not an exact issuance timestamp or universal per-row effective date. | Preserve provider rating/effective dates and their documented semantics. Keep source cutoff, model fit horizon, issuance time and local observation time separate. Unknown fields remain unknown. |
| Model/output version | Metric names and website asset versions available; immutable model/output version not established. | Establish provider model/version evidence and an immutable hashed output binding. Website code fingerprints must not substitute for a model version. |
| Historical observation | Rewind/Time Machine functionality described; no publication-time observations or immutable issuance history verified. | For historical availability, require dated retained observations or a documented immutable historical publication archive with revision semantics. A present-day retrieval cannot populate earlier `observed_at` or prove contemporaneous availability. |
| Reuse/attribution | CSV offered; local-use, derivative-use and redistribution terms not identified in the bounded pages. This is an unresolved gate, not a legal conclusion. | Record applicable first-party terms or explicit rights evidence, attribution and allowed uses separately for local storage, derived displays and public redistribution. Public download alone does not close the repository's reuse gate. |
| Salary conversion | Value fields exist in the presentation schema; no financial model/output admitted. | Separately establish conversion/model identity, version/date and mapped salary coverage under the financial contract. DPM admission alone must not unlock financial value/surplus/ROI. |

## Handoff limits

B25 may register a versioned binding schema and blocked manifest that records these independent gates. Such a record must contain no imported ratings and must not claim that the current CSV exists locally. If legitimate outputs are later admitted, label them **external DARKO forecasts**, preserve source attribution and use their actual effective/observed dates. Never present them as locally trained CourtLoad RAPM or backdate a current observation into historical profiles.

No alternative external-output provider was admitted by this spike. Vendor ShotQuality, NBA optical/spatial tracking and verified video availability have no new evidence here. The expected-shot, RAPM, six-factor and adjusted-shooting protocols remain separate CourtLoad experiments governed by their own source and chronological evaluation gates.
