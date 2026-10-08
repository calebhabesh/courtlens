# IM02 real regression inputs

These are bounded, curated source fields for portable offline tests. The compressed
fixture documents include SHA-256 signatures; individual inputs retain the original
source SHA-256 and row ordinal. They are not a serving dataset or an API raw export.

- `b19d.json.gz`: the four retained B19d candidate games (`0022500007`,
  `0022500013`, `0022500025`, `0022501045`), their 23 conflicting starter observations,
  independent player boxes and the observed `25:60` minutes value. Native observation
  manifest: `data/raw/b19d-native-accepted-20261005/manifest.json`, revision
  `000610d46d149ebb45db4f5ae6f80b16d5e2fb6b`. Full raw bundle replay and reproduction of
  the original v1 candidate hashes are verified by the IM02 audit CLI separately.
- `archive-failures.json.gz`: actual v3/CDN rows for `0022501221` (multiple substitution
  runs separated by free throws at one clock) and `0022500149` (neither source
  conserves the independent scoring box). Correct run pairing avoids false missing
  substitutions and false minute errors in the first game.
- `legacy-v3-shots.json`: the first 12 rows of `nbastatsv3_2023`; its made three-pointer
  has cumulative `pointsTotal=5`, no `shotValue`, and an explicit `3PT` marker. This
  verifies three points for that event rather than two or five.
- `repair-rules.json.gz`: `0022500568` (two real missing substitutions, exact box
  minutes after repair), `0022300167` (one missing substitution and 23.2 s maximum
  minute error), and `0022400542` (shooter finishes free throws, leaves after a timeout
  and returns after a violation, all at 6.6 s remaining). The last game verifies that
  a later same-clock re-entry is not moved ahead of earlier legitimate attempts.

Archive fixtures bind revision `e829d4678be1e075f99e5d41a1c5f97089be446b` and the
independent SportsDataverse player/team boxes retained in IM01's source context.
CSV locators are zero-based data-row ordinals, excluding the header; native locators
are zero-based indices in `/game/actions`. Source bytes and notices remain in the
content-addressed IM01 store. No test needs network access or an owner database.

- `im03-game.json.gz`: the accepted archive candidate for `0022500007`, immutable
  v3 row locators and selected source fields, independent player/team boxes and
  schedule, plus its IM03 possession/stint result. The candidate hash is selected
  from the accepted IM02 report, never a development candidate. Its portable tests
  reproduce the result hash, shooting/point conservation, exact accepted seconds,
  player ORB totals, 104 counted possessions per side, and the retained +1 team
  turnover diagnostics. The file has its own content signature. PostgreSQL tests
  use these actual rows in a bounded test membership with a unique fixture nonce;
  production bundles require their entire accepted season/phase membership.
