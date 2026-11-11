# F01 Ask answers history questions directly

Prompt `courtlens-agent-prompt-v3` (finish plan F01) against v2, run with the demo's configuration: no web search, `gemini-3.5-flash-lite`, a 45 s turn limit and the local warehouse. Script: [`history_eval.py`](history_eval.py). Outputs: [`f01-v2.json`](f01-v2.json), [`f01-v3.json`](f01-v3.json), with answers truncated to 600 characters. One run per question per version, on 2026-11-11.

| Question | Calls v2 / v3 | Seconds v2 / v3 | Failed tool calls v2 / v3 |
| --- | --- | --- | --- |
| Who won the 2016 NBA Finals, and what made it historic? | 6 / 2 | 41.5 / 17.9 | 3 / 0 |
| Who won MVP in 1998? | 5 / 2 | 14.1 / 15.0 | 3 / 0 |
| Which team won the 1986 NBA championship? | 5 / 2 | 39.2 / 12.2 | 3 / 0 |
| What was the Malice at the Palace? | 2 / 2 | 9.0 / 9.1 | 0 / 0 |
| When was the three-point line introduced in the NBA? | 2 / 2 | 7.7 / 9.3 | 0 / 0 |
| Who holds the record for most points in a single NBA game? | 2 / 2 | 16.4 / 3.3 | 0 / 0 |
| **Total** | **22 / 12** | **128 / 67** | **9 / 0** |

- **Correctness.** Both versions answered all six correctly: Cleveland 2016 from 3–1 down, Jordan 1997-98, Boston 1986, the 2004 Pacers–Pistons brawl, the three-point line in 1979–80, and Chamberlain.
- **Calls and time.** v3 used about half the provider calls and time. Under v2 the awards registry, which doesn't cover these seasons, and the stats tools were searched first.
- **The first v3 draft.** It refused two of the six: it read "cite every source" as impossible without a tool. The final v3 says general-knowledge answers carry no markers and history is never refused. Only the final v3 run is recorded here.
- **Numbers from model knowledge.** In v3, unverified numbers such as series scores appear bracketed. That is the existing non-blocking marking for unsourced numbers. v3 doesn't state statistics from model knowledge, so it named Chamberlain's record without "100 points".
- **Limits of this check.** Six questions, one run each, on one day's free quota. It shows the routing change, not a measured accuracy rate.
- **Replays.** v2 stays byte-identical, so the frozen replays keep passing. The v2 prompt's SHA-256 is unchanged against `main`.
