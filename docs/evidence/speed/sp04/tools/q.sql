\timing on
-- original
CREATE TEMP TABLE a AS SELECT season, season_type, count(*) AS n, md5(string_agg(DISTINCT dataset_id::text, ',')) AS h FROM analytics_marts.mart_stats_player_tracking GROUP BY season, season_type;
-- two-level
CREATE TEMP TABLE b AS SELECT season, season_type, sum(n)::bigint AS n, md5(string_agg(dataset_id::text, ',' ORDER BY dataset_id::text)) AS h FROM (SELECT season, season_type, dataset_id, count(*) AS n FROM analytics_marts.mart_stats_player_tracking GROUP BY season, season_type, dataset_id) per_dataset GROUP BY season, season_type;
SELECT count(*) AS rows_a FROM a; SELECT count(*) AS mismatches FROM a FULL JOIN b USING (season, season_type) WHERE a.n IS DISTINCT FROM b.n OR a.h IS DISTINCT FROM b.h;
EXPLAIN (ANALYZE, BUFFERS) SELECT season, season_type, sum(n)::bigint AS n, md5(string_agg(dataset_id::text, ',' ORDER BY dataset_id::text)) AS h FROM (SELECT season, season_type, dataset_id, count(*) AS n FROM analytics_marts.mart_stats_player_tracking GROUP BY season, season_type, dataset_id) per_dataset GROUP BY season, season_type;
