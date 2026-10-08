# Impact archive source admission review v2

Reviewed 2026-10-07 for IM01. This review permits acquisition and coverage inspection for the
owner's local noncommercial research workbench. It does not certify lineups, possessions,
ratings or any B26 experiment. The v1 review and all sealed memberships remain unchanged.

Acquire NBA Stats v3 and NBA CDN play-by-play, defensive matchups and shot detail from the
revision-pinned `shufinskiy/nba_data` archive for starting years 2023–2025, separately for regular
season and playoffs. Retain pbpstats regular-season and playoff archives for 2023 and 2024 as
cross-check inputs; no 2025 pbpstats archive exists. Attribute NBA Stats, NBA CDN, pbpstats and
archive publisher Sergey Shufinskiy. Retain the archive's Apache 2.0 LICENSE, README, field
descriptions and file index at the same full Git revision. This archive license is not a grant
of NBA redistribution rights.

Independently acquire SportsDataverse NBA Stats schedule releases for ending years 2024–2026.
Retain its revision-pinned README (data labeled CC BY 4.0) and LICENSE (software MIT). Attribute
SportsDataverse and NBA Stats. Schedule release URLs are mutable; bind their actual received
bytes, rather than claiming that a release is Git-pinned. Validate finalized game identities,
season, dates, two teams, scores and reciprocal W/L. Regular-season denominators require 1,230
games and 82 per team across 30 teams. Playoff denominators are the observed finalized schedule
membership, not a fixed expected playoff length. Play-in, preseason, All-Star and Cup-final
games stay outside both requested phases and are explicitly listed when present in archives.

Every fetch retains exact bytes under a SHA-256 address, a deterministic content-version UUID,
an actual timezone-aware `observed_at` and a separate observation UUID. Complete observation
manifests bind notices, schedule bytes, coverage, policy hash and parser version. Re-fetch every
URL for a new observation: identical bytes reuse the object; changed bytes create a new object
and version. Never overwrite an object or an observation. Partial failed acquisitions do not
produce a completed receipt. A later observation does not prove historical availability.

Bound downloads (32 MiB per archive, 2 MiB per notice/schedule, 120 seconds per fetch), disk
headroom and decoding (512 MiB per archive, one exact regular CSV member, 1 million rows,
64 KiB fields, at most 150 unique columns). Read archive members without extracting filesystem
paths. Reject malformed identities, wrong seasons, malformed rows and corrupt/truncated
compression; report expected/observed games, all missing and unexpected IDs, and row counts.
Coverage is source availability, not analytical admission. Missing games remain unknown.

IM02 must establish and test possession-policy-v2 before reconstruction admission. IM03 must
seal new memberships through the existing warehouse path. No raw source dumps enter API
responses; no IM input/output enters forecasting features. Do not fetch Databallr or compare
against its stored outputs. No publication pointer, existing dataset or frozen artifact changes
as part of IM01.
