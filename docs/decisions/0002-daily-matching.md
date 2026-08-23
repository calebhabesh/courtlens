# ADR 0002: Auditable mask-DP for daily lineup matching

Status: accepted

The planner models scheduled players and configured active slot instances as a bipartite graph. NBA
fantasy lineups have few active slots, so a slot-mask dynamic program is compact, deterministic, and
easy to test.

The objective order is:

1. maximize assigned players;
2. maximize a visible recent-production weight;
3. resolve full ties by stable player and slot identifiers.

The algorithm intentionally does not optimize multiple speculative transactions, predict health, or
submit a lineup. V1 rejects weekly-lock leagues explicitly.
