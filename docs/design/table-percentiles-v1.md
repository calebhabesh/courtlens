# PC12 table percentiles v1

This is presentation metadata, separate from retained PF01a cohort percentiles and metric
arithmetic. Version: `courtlens-table-percentiles-v1`. Opt in with
`presentation.table_percentiles=true` on the read-only Workbench query endpoint.

The reference contains all players in the same release, season, phase, exclusive cutoff and
selected window. Qualification uses at least **500 recorded season minutes through that cutoff**,
fixed in `domain/metrics.py`. Recent-window ranks therefore still use season qualification.
Search, favorites, team selection, sample filters, predicates, sort and output paging never reduce
the league reference. A team-filtered player's displayed team-only value is evaluated against
league values in that window; its season-wide participation qualifies it. This comparison is
descriptive, not an equivalence between team-only and full-season samples.

For each non-null metric, rank against qualified players with a known value. Impact metrics also
retain their sealed per-metric qualification rules. Formula: `100 * (less + equal / 2) / n`;
orient lower-is-better using the serving catalog, round and clamp to 1–99. Metrics without a
declared favorable direction describe larger values, never a judgment. Fewer than two valid
reference values gives an unknown percentile. An unqualified observed value can still be evaluated
against the qualified distribution, but its numeric percentile is muted and its player has a
visible **Small sample** badge. Missing values stay unknown, never zero.

The response adds `table_qualified`, `table_percentiles` (already oriented),
`table_cohort_sample_sizes`, and `table_cohort` (version, scope hash, qualified count, threshold,
reference and formula). The complete reference is bounded at 2,000 players; exceeding the bound
fails instead of silently ranking a truncated cohort. Existing query cursors, legacy percentiles,
metric values, formulas and frozen identifiers retain their definitions.

Teams use all league teams with a known value in the selected season/phase/cutoff; the player
minutes rule does not apply. Team percentile metadata is calculated before client search,
conference/division grouping or sorting. Lower-is-better applies to opponent scoring/shooting/
offensive rebounding/free-throw rate, own turnover rate and defensive rating. Opponent turnover
rate is higher-is-better; pace is descriptive. Each table shows team game counts.

Stats, Player Directory, Team Stats and saved Rankings reuse `PercentileCell`, the five blue
percentile tokens and a numeric legend. Stats' preview uses the same reference as its cells.
Rankings' GP/MPG/PPG columns are a labeled latest-published-season statistical reference; personal
ordering and consensus arithmetic are never converted into league percentiles.

Player Directory defaults to name order, season scope and per-game production independently of
saved Stats views. It keeps name search, team filtering, sorting, paging, scoped profile links and
an explicit link to the full Stats workspace. All first-load defaults pin their resolved scope in
the URL. Empty personal-tool defaults remain PC12 batch D.
