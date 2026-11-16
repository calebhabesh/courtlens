# Site links: handoff for SL06 (links in Ask answers)

You are continuing the [site links plan](site-links-plan.md). SL01–SL05 are built and both owner
gates are decided (D1–D16 in the plan). SL06 is the last block. Read in this order:

1. The plan: decisions D1–D16, "Rules every block follows", and the **SL06** section with its
   "Done when".
2. The newest entries of the [progress log](site-links-progress.md): "SL05 built" and "SL05 gate
   decided".
3. The [assistant agent handoff](assistant-agent-plan.md), only for how Ask answers are shaped.

Don't reopen D1–D16. Only the owner marks ✅. Record evidence in the progress log, newest last.

## Where things are

Branch `feat/site-improvements`, nothing committed. Commit or push only when the owner asks. The
working tree also holds the **owner's** unfinished work: player pages, contracts, Wikipedia
contracts, college schools, deploy files, `player-bio-header.css`, `player-reference-sections.*`,
`win-probability-v4.*`, `e2e/mock-api.mjs`, `lib/types.ts`. The owner edits some of these while
you work. Leave them alone and keep them out of any commit.

What the site-links work added (all uncommitted), in short:

- `dashboard/lib/entity-links.ts`: `playerHref`, `teamHref` (franchise id, D6), `gameHref`,
  `seriesHref`, `scopeFromQuery`, `isSelfLink`; `EntityScope.section` (`#schedule`, SL05).
- `dashboard/components/entity-link.tsx` + `.css`: `PlayerLink`, `TeamLink`, `GameLink`,
  `SeriesLink`, `EntityAnchor`; variants `entity`, `prose` (accent, always underlined: the one Ask
  prose should use, D1), `block`, `stretched`.
- SL05: `lib/related-links.ts`, `components/related-row.{tsx,css}`, `components/hash-target.tsx`,
  `components/replace-url.tsx` keeps `location.hash`.
- The ESLint rule bans literal `/players/`, `/teams/`, `/live/games/`, `/live/open`, `/playoffs/`
  paths outside `lib/entity-links.ts`.
- Specs: `e2e/site-links-crawl.spec.ts`, `e2e/site-links-gate.spec.ts` (both real data),
  `e2e/site-links-prefetch.spec.ts`. Evidence in `docs/evidence/site-links/`.

## SL06 in this code

**The spec in the plan wins.** Its points, located:

- **Dashboard only.** The agent's tool declarations are frozen and pinned byte for byte by the
  replay tests. Don't touch anything under `src/courtlens` for this block. Run these unchanged
  before and after and log the result: `tests/unit/test_assistant.py::test_tool_declarations_allowlisted`,
  `tests/unit/test_agent_loop.py`, `tests/unit/test_assistant_streaming.py`,
  `tests/unit/test_revamp_routing_replay.py`. Eight Anthropic provider tests are known red; don't
  chase them.
- **Result tables:** `AgentResult` in `dashboard/components/agent-answer.tsx`. Cells render through
  `agentCellText(row[key])` from `agentResultView(result)`. A row with `player_id` (or `team_id`)
  links its name cell. Find which column is the name per operation from real results, not by guessing.
- **Prose:** `InlineProse` in the same file. It walks code points with a `positions` map, so the
  unverified-sentence spans (`provenance.unverified_sentences`, positions in the original text) keep
  working. Link names inside `plain()` without breaking those positions. A name split by an
  unverified boundary needs a decision; record it. Rules: link only after the answer has finished
  streaming, only the first exact full-name mention per name, only when the name maps to exactly one
  id among this turn's results, and use the `prose` variant. Everything else stays plain; names are
  never matched by similarity.
- **Scope:** the result's own season (`block.context`, see `pinnedContext`/`scopeChipLabel`) when
  it has one; otherwise no season, and SL02 picks one on the destination page.
- **Streaming state:** find how `threaded-assistant.tsx` passes a still-streaming answer to
  `AgentAnswer`/`AgentProse` (answer `status`) and gate the prose links on "finished".
- **Done when:** Vitest (`components/agent-answer.test.tsx`) covers a linked row, a first mention
  linked once, two players sharing a name (both plain), a name with no result (plain) and an
  unverified sentence containing a link. One real question on the owner's dev stack shows working
  links; the frozen replay tests pass unchanged.

## Things that cost time before

- **Servers.** The owner's panes own :8000 (API) and :3100 (dashboard dev). Use them for real-data
  checks and never restart them. Ask on the dev stack uses the free Gemini+Groq pool; Groq's 8K
  tokens-per-minute limit can rate-limit a long question, so ask a short one ("LeBron James and
  Anthony Davis points per game 2019-20").
- **Production sandbox** (needed for the full suite): copy `dashboard/` (without `node_modules`,
  `.next`, `test-results`) and `docs/` into `~/.cache/courtlens-tmp/<name>/` (`$TMPDIR` is unset in
  Claude's shell; never `/tmp`). Hard-link `node_modules` (`cp -al`). `sed` the sandbox's
  `e2e/f04-accounts.spec.ts` from 4100 to 4180. Build with `COURTLENS_API_INTERNAL_URL` and
  `NEXT_PUBLIC_COURTLENS_API_URL` = `http://localhost:4180` (`npm run build -- --webpack`). Start
  `PORT=4180 node e2e/mock-api.mjs` and
  `HOSTNAME=127.0.0.1 PORT=3180 node e2e/start-dashboard.mjs`. Run with
  `PLAYWRIGHT_EXTERNAL_SERVER=true PLAYWRIGHT_BASE_URL=http://localhost:3180 PW_CHROMIUM_PATH=$(command -v chromium)`.
  Stop servers by port (`ss -ltnp`), never with `pkill -f`. Delete the sandbox when done.
- **Real-data specs** need `SITE_LINKS_REAL=1 PLAYWRIGHT_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3100`.
- **zsh traps.** `echo ===` fails (`=cmd` expansion); `ls` is aliased to `eza` (use `command ls`);
  `--include=*.ts` globs fail unquoted.
- **Playwright traps.** Client navigations never fire `load`: pass `{ waitUntil: "commit" }` to
  `waitForURL` and `goBack`. A locator `click()` scrolls first and hangs on an element covered by
  a stretched link. `text-decoration` reads `none` on the child of an underlined link.
- **Known Playwright failures not from this work** (last full run after SL05: 656 passed, 6 failed):
  `visual-baselines` player profile ×2 and `player-career` "TOR" (owner's player-page work);
  `visual-baselines` phone search modal (fails on `HEAD`). Under full-suite load, `last-games:70`
  and `table-interactions:63` can flake (pass alone ×3). There is also an `f04-accounts` Escape
  flake (1 in 3 on `HEAD`).

## Checks

Targeted Vitest and the touched Playwright specs (the Ask specs: `grep -l "ask\|assistant" e2e/*.spec.ts`).
Lint (`npm --prefix dashboard run lint`) and typecheck at zero. The frozen replay tests unchanged.
Run the full Playwright suite once before merge. SL06 has no owner gate in the plan. When it is
done, record the evidence and tell the owner the plan is finished, pending their ✅ on SL01–SL06.
