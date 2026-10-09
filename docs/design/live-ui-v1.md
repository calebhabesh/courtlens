# B32 Live interface v1

The [B31 shared service](shared-live-v1.md) remains authoritative for source facts,
leases and upstream budgets. The interface does not establish genuine in-game acceptance.
Implementation choice: current Codex session, no delegated agents or model override,
instead of the handoff's Flash assignment.

## Routes and context

- `/live` opens today's Eastern slate; `date` selects another date.
- `/live/[date]` uses the path's ISO date.
- `/live/games/[id]?date=YYYY-MM-DD` uses an explicitly selected source game.
- `live_mode=history`, or a date outside the seven-day lease window, opens finalized
  research. Historical game IDs belong to the NBA namespace; Live IDs belong to ESPN.
  Changing mode from a selected game returns to the slate rather than reusing an ID
  across namespaces. No heuristic crosswalk is fabricated.
- The existing basketball query parameters survive Live navigation. Provisional reads
  ignore them. Historical reads use `releaseId`, `season`, `phase`, `beforeDate`; defaults
  are the current public pointer, the slate's season and the day after the slate.
  A caller's explicit exclusive cutoff is never relaxed. The resolved historical release
  is pinned in the URL on first successful read and used by links/reload. Historical
  context controls change that view's URL without publishing or editing personal state.
- The B18 playoff explorer is linked with the retained basketball parameters. No game
  to series association is inferred from source IDs or names.

## Browser demand

The visible unpaused view initially reads cache and activates one lease. It repeats
cached reads and heartbeats after 60 seconds, with bounded ten-second fetch timeouts.
Pause/hidden/offline/pagehide/unmount stop timers and release that generation's lease.
A late activation response releases its own capability rather than updating the new
view. Visibility/online/pageshow reactivate. Failed cleanup is recovered by B31's
150-second TTL. Expired-heartbeat 404 starts a new lease on the next tick; 429 waits
for the next tick, with a capacity message. No retry loop bursts requests.

Reads and heartbeat completion have independent error messages. Read errors preserve
last-good observations for the current selection. A date/game/context change clears
that selection's data; old asynchronous results cannot overwrite the new view.
Local pause and shared feed idle are displayed separately. Observation age is labelled
as age at the last read and accompanied by the immutable acquisition timestamp, so a
paused view does not claim continuously measured freshness.

## Credential boundary and history API

`/api/live/[[...path]]` is a fixed server proxy. GET only permits slate, numeric game
and historical routes, with an allowlist of query parameters. POST only permits lease
activation/UUID heartbeat with a <=1,024-character strict selection body. DELETE only
permits UUID release. Mutations require exact same-origin Origin against the incoming Host (Next may
normalize its internal hostname; forwarded Host is ignored) before attaching the
server-only operator token. Arbitrary paths/targets and redirecting upstreams fail closed;
reads omit credentials. Error bodies are sanitized while retaining HTTP status, and
204 deletion stays bodyless. All responses use `Cache-Control: no-store`.

`GET /api/live/historical?slate_date=...&game_id=...` resolves the ordinary research
context, then queries only retained dataset/season/phase/date rows before the cutoff.
No Live demand, provider I/O, publication, jobs or reconciliation occurs. It checks
paired home/away identities and (for workbench facts) final flags and reciprocal scores.
Incomplete team pairs remain unavailable. Queries cap team rows at 61 to enforce a
30-game limit and selected player rows at 81 to enforce an 80-row limit. Archive facts
support regular season only. Explicit Pydantic output labels these as finalized
research and preserves nullable tipoff time, statistics and appearance evidence.
Canonical identity names are display labels; source IDs remain available.

## Presentation and acceptance

Game cards show status/source clock/period, side, actual event time/slate and nullable
scores. Selected boxes retain source statistic keys and values; missing values display
an em dash, reported nonappearance suppresses source placeholders, absent rows imply
nothing about injury or participation. Historical team statistics and player rows remain
separate from provisional ESPN boxes. Tables scroll inside labelled keyboard-focusable
regions. Native links/buttons/inputs preserve keyboard navigation and narrow layouts.

Fixture browser tests cover in-progress/overtime, last-good/source-error, missingness,
visibility, pause, offline, capacity, stale responses, history and mobile/landscape.
The real-browser harness uses production Next/FastAPI/PostgreSQL, three genuine browser
leases and bounded opt-in real source polling, then retained historical finals. Its
scheduled source observations do not prove changing in-game freshness or a real final
reconciliation. Existing source rights/reliability, populated active-box resource/storage,
broad-browser and fresh restore gates remain open.

The preceding measurements are dated B32 interface evidence. Later
[B32a acceptance](../evidence/b32-active-acceptance.md) verifies actual changing preseason
scores/clocks through four shared browser clients and two populated selected boxes.
The Live notice now describes provisional source values and independent final admission
without a dated "changing freshness not observed" assertion. Independent final
reconciliation, real corrections, full three-box load and the other source gates remain
open; this does not mark the parent B32 or full replica complete.

## FO08 presentation (frontend overhaul, 2026-10-09)

The behaviour above is unchanged: routes, lease generations, pause/hidden/offline/pagehide
handling, the credential boundary, historical reads and pinning, em dashes for missing values and
the separation of provisional and admitted values. FO08 changed presentation only:

- The page is the Board template titled "Live" with Live · Finals · Playoffs tabs. The research
  release/season/phase/cutoff form is gone: Finals uses the shared filter bar (Season · Phase plus
  the slate date) and the resolved release, dataset, exclusive cutoff, status and warnings are in
  Data details. An explicit `beforeDate` in the URL still applies and is never relaxed.
- Observation provenance (acquisition, last success, source time, next fetch, namespace,
  observation ID, SHA-256, HTTP date, last poll) moved into Data details. The status line keeps the
  connection state, observation status, stale and shared-feed-idle flags and the age at last read;
  source and read errors stay `role="alert"` in the main flow, including inside the selected game.
- The date strip's counts come from `GET /api/workbench/schedule/dates` (retained schedule rows and
  admitted finals for the release; no Live demand or provider I/O). Live demand is unchanged.
- Game cards drop the visible side and identity labels (away is listed first; identity remains in
  the selected game detail) and show an Eastern tipoff time, or nothing when the time is unknown
  (stated in the card's accessible name). Logos appear only for verified canonical team IDs.
- The provisional-values notice and empty-slate explanations are one line each with the original
  wording behind Why?.
