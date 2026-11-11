# Finish progress

Measured evidence for the [finish plan](finish-plan.md). Newest last.

## 2026-11-10 — Plan written; docs-only items done

The owner cut RD19 ("Yes cut it"), approved Stats follow-up 84 ("Approve this."), and put RD18 suggestions 3 and 6, simple accounts with a demo account, and Ask's direct history answers in scope. Alignment catalog rows 18–29 now point to their Research design rows (RD00–RD18, all owner ✅) instead of their stale build-phase notes. Row 29 stays ⬜ for Win Probability (RD14), the one Research page left.

## 2026-11-11 — F00 first live check

Deployed 9a651112 (PR #81 public Ask, PR #82 https origin behind TLS and Caddy restart on config change). Through the public site: the question was accepted, the counter went 3 → 2, the asker lists their own thread, a stranger lists none, a cross-site write gets 403, deletes are refused. The answer itself timed out: production used the agent's default `gemini-3.8-flash` (Google returned a 504 on its second call), and the first stats query took 15.5 s on a cold VPS cache. The 60 s turn limit also outlasted the proxy's 55 s, so the browser got an empty error rather than the partial answer. Fix: pin `gemini-3.5-flash-lite` and a 45 s turn limit in the production compose.
