# PF07c registered free public sources

Verified 2026-10-06 by the actual server fetcher, with no account, API key, provider tool,
subscription or billable request. This is a small source-specific lookup registry, not a web
search service. Runtime records and bytes: [source evidence](../evidence/pf07c-retrieval/sources.json).
Parent: [hybrid assistant contract](polish-assistant-contract.md).

| Source / authority | Supported binding | Observed HTML body | Update / cache policy |
| --- | --- | --- | --- |
| [NBA Communications 2023-24 announcement](https://pr.nba.com/2023-24-nba-regular-season-schedule/) — primary official release | Announced regular-season opening date; period marker and opening clause must both parse | 123,683 bytes | Published 2023-08-17; publisher can change page; TTL 24 hours |
| [NBA Communications 2026-27 announcement](https://pr.nba.com/2026-27-nba-regular-season-schedule/) — primary official release | Announced regular-season opening date, explicitly a published announcement | 128,365 bytes | Published 2026-08-13; not a live schedule; TTL one hour |
| [NBA Video Rulebook assist explanation](https://videorulebook.nba.com/archive/assist-pass-leads-directly-to-made-field-goal-pass-and-jump-shot-2/) — primary official explanation | Direct scoring pass and immediate reaction toward the basket; prose in `entry-excerpt` | 133,532 bytes | Publication/update date unknown; retrieval date never substitutes for it; TTL 24 hours; official rulebook takes precedence |

Examples routed without a model: “When did NBA 2023-24 regular season start?”, “When does NBA
2026-27 regular season start?”, and “What is an assist?” Specific known templates are intentional;
unmatched compound questions cannot receive a partial answer presented as full verification.
Multiple supported clauses use typed blocks and the same turn budget. General site/metric guidance
continues through the versioned local knowledge registry.

The current-day roster/injury question and position-qualified leader request have no supported
adapter. They receive specific inability responses, with no source requests or memory-derived
facts. No general discovery engine, user-supplied URL, partial ranking, historical position
inference, injury inference or roster claim is enabled. Broader language/integration evaluation
is PF07d, and rendered threads/citation controls are PF08.

## Access, attribution and retained support

Each adapter uses an unauthenticated HTTPS GET to one exact registered page and reads only its
known article container. No browser, JavaScript, subresources, video, PDF, follow-on links or
cookies are needed. The fetcher sends an identifying CourtLens user agent and bypasses ambient
proxy configuration. A failure/429 is terminal; there is no retry loop or access-control bypass.
The initial NBA.com glossary/history probes exceeded 256 KiB and are **not enabled**. Guessed
article endpoints that returned 404 are also excluded; no larger-body fallback is authorized.

The [NBA terms](https://www.nba.com/termsofuse) require restricted reuse and attribution.
This registry's implementation policy is private local research with publisher/title/link
attribution and short supporting excerpts; it does not grant a redistribution licence. Whole
articles, media and downloaded analytical datasets are not retained. Source explanations are
not imported into the warehouse. Terms/source access must be reviewed again before expanding
this registry or deploying it beyond the established local scope.

A verified source retains the body SHA-256, source/adapter version, publisher/title/canonical
URL, publisher date when known, actual retrieval timestamp, period, paragraph locator, exact
supporting excerpt, and entity/metric/value/unit/qualifier/parser tuple. Fixed server templates
render only those tuples. Public content never becomes a tool instruction or model extraction
candidate. The frozen v2 validator rejects mismatched entity, value, period, locator, excerpt
or source facts. The whole accepted envelope, including supporting facts, survives durable
replay and backup/restore separately from saved analytical findings.

The process cache holds at most 32 deep-copied structured source records, never full articles.
Cache hits preserve the original retrieval identity and use zero source requests. Expired records
require a fresh fetch/parse; failure returns `external_stale` with labelled prior support and no
verified facts. Conflicting parsed values return `external_conflict`; they are not averaged or
silently selected. Changed markup, absent bindings, unsafe addresses, large bodies and transport
failures produce a sanitized inability and a failed/stale source record when attempted. Failure
records with no acquired support use the SHA-256 of empty bytes and `no-verified-extraction`,
never a fabricated content digest.

## Work and trust bounds

- All mixed clauses share a 45-second turn deadline, four total source requests and 128 KiB
  extracted-text allowance. Every redirect counts as another source request; each fetch permits
  at most two redirects. Redirects must retain the exact source identity; other approved pages
  are also rejected as redirect targets. No separate discovery/retry budget exists.
- A source read, including DNS/TLS/body/parse, returns within eight seconds or the remaining turn
  time. At most four process worker slots can remain in flight; saturated slots fail promptly.
  Late worker completions cannot publish answers or populate the cache after caller timeout.
- Accepted response bodies are at most 256 KiB each; excessive declared lengths, streamed bodies,
  compression and non-HTML responses fail. Text extraction is cumulative and fails rather than
  trimming evidence. No retrieved text is sent to a provider; its existing 64 KiB input ceiling
  and four-provider/eight-analytical-call limits remain unchanged.
- Exact HTTPS URLs/hosts/paths, every resolved address and each redirect are validated. Any
  non-public/multicast address, including a mixed public/private DNS answer, fails. The connection
  pins the validated numeric IP while TLS verifies the original hostname, preventing a second
  DNS lookup from substituting a private address. No proxy, key, cookie or workspace credential
  is sent to sources. Active and explicitly hidden markup are excluded; only fixed bindings
  and safe source links reach responses.

The [provider pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite)
and [URL context documentation](https://ai.google.dev/gemini-api/docs/url-context) were rechecked
2026-10-06. Free-tier Search grounding remains unavailable for the configured Flash-Lite model;
URL context needs supplied URLs. Neither provider tool is used. Search performed during source
investigation is separate from the application's capabilities and request accounting.
