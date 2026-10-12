# PC06 unblock — BRef identity rule, source decisions, broad salary coverage

Owner decisions D1–D5 (2026-10-12) are recorded in the
[presentation clarity plan](../../presentation-clarity-plan.md#owner-decisions-after-pc07-2026-10-12)
and the [finance refresh contract](../../design/finance-refresh-v1.md).

## Result

Refresh `95b5fe42-79b2-4be5-bb8c-187b66e10634` ([detail](refresh-detail.json),
[verification](verify.json)) pins the same PC05 index `027dff96…` and official threshold
`bac24901…` as PC06. **464 of 622 active players now have a reported 2026-27 salary** (PC06: 3).
The other 158 keep explicit reasons: 126 `salary_blank_in_source` (listed and mapped, but BRef
leaves the 2026-27 cell blank, typically minimum or non-guaranteed camp deals) and 32
`salary_missing_or_identity_unresolved` (mostly two-way and camp players BRef does not list).
No unknown became $0. Top reported salaries: Stephen Curry $62,587,158; Nikola Jokić $59,033,114.
`verify-finance-refresh` returns `verified` (30 acquisitions, book membership, coverage).

This refresh's stored state is `verification_blocked`: it was admitted before the state rule
stopped requiring free-agent observations (D3). The rule now gives `partial`; the stored state
of an admitted refresh is immutable, and BRef was not fetched a third time just to relabel it.

## Identity rule (D1)

`courtlens map-bref-identities` over PC06's 30 retained pages ([report](mapping-report.json)):
608 BRef players, **590 mapped, 18 unresolved, 0 ties, 0 conflicts**. The rule reproduced all
three manually verified BRef mappings present (kept, not duplicated); 587 new crosswalks carry
confidence `name_team_unique`. The 23 mappings whose raw names differ were each reviewed:
suffixes (Bobby Portis / Bobby Portis Jr.), accents (Alperen Şengün / Sengun), initials
(A.J. Green / AJ Green) and capitalization only. Unresolved players are absent from the same
current team in the index (waived/dead money, moved players) or differ by nickname
(Ron Holland / Ronald Holland II), which the rule deliberately does not equate.

115 active index players were missing from the identity registry (rookies and new signings
never seen in box scores). They were registered from the pinned index with its dataset ID and
hash as provenance; the finance book requires registry identities.

## Acquisitions

Mappings must predate an acquisition to apply to it, so BRef was fetched again after mapping:
[superseded run](acquisition-superseded.json) then [final run](acquisition.json), each 30/30
HTTP 200 at the robots crawl delay. The first admission attempt failed on the registry check and
rolled back, but its staged book files remained, and the importer correctly refuses to overwrite
a differing staged candidate. Those orphaned files were kept, not deleted; the second fetch was
admitted instead.

## Source decisions (D2, D3)

- Spotrac: unchanged, stopped after its robots 403. Free Agency is removed (D3); PC08 removes
  the page.
- HoopsHype: one probe (robots.txt, one salary page redirect, one 404). Its robots.txt disallows
  `anthropic-ai`, `Claude`, `ClaudeBot` and `Claude-Web`. No further requests were made and
  neither response was used. It is not a source for this project's development.
- Basketball-Reference's retained robots.txt disallows other agents (e.g. GPTBot) but no
  Anthropic agent; fetching continues under its crawl delay.

## Checks

13 new tests (normalization, uniqueness, ties, conflicts never overwritten, mapping applies only
to later acquisitions, registry provenance) plus all existing PC06 finance tests: 60 passed.
Full suite: [python.log](python.log). Ruff/format and strict mypy: [lint.log](lint.log).
All 161 publication pointers are unchanged ([read-only check](read-only-check.json)).
