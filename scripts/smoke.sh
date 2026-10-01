#!/usr/bin/env sh
set -eu

api_url="${COURTLOAD_SMOKE_API_URL:-http://localhost:8000}"
dashboard_url="${COURTLOAD_SMOKE_DASHBOARD_URL:-http://localhost:${COURTLOAD_DASHBOARD_PORT:-3000}}"

printf 'Running CourtLoad smoke verification against %s and %s\n' "$api_url" "$dashboard_url"

# 1. Basic HTTP health and legacy data status
curl --fail --silent --show-error "$api_url/api/health" >/dev/null
curl --fail --silent --show-error "$api_url/api/data-status" >/dev/null
curl --fail --silent --show-error "$api_url/api/methodology" >/dev/null

# 2. Workbench catalog, metrics, and pipeline status
python3 -c "
import urllib.request, json
res = json.load(urllib.request.urlopen('${api_url}/api/workbench/catalog'))
assert res.get('release_id'), 'Workbench catalog has no release_id'
assert res.get('semantic_signature'), 'Workbench catalog has no semantic_signature'
"

python3 -c "
import urllib.request, json
res = json.load(urllib.request.urlopen('${api_url}/api/workbench/metrics'))
assert res.get('version') == 'v1', f'Expected metric version v1, got {res.get(\"version\")}'
assert len(res.get('metrics', [])) >= 30, 'Metric catalog missing required metrics'
"

python3 -c "
import urllib.request, json
res = json.load(urllib.request.urlopen('${api_url}/api/workbench/status'))
assert 'release' in res, 'Status missing release metadata'
assert 'worker' in res, 'Status missing worker metadata'
"

# 3. Assert populated analytics: players and teams exist and return valid stats
python3 -c "
import urllib.request, json
res = json.load(urllib.request.urlopen('${api_url}/api/workbench/players?limit=5'))
items = res.get('items', [])
assert len(items) > 0, 'No players found in published analytics'
player = items[0]
assert 'player_name' in player and 'metrics' in player, 'Player record malformed'
assert 'pts' in player['metrics'], 'Player metrics missing pts'
"

python3 -c "
import urllib.request, json
res = json.load(urllib.request.urlopen('${api_url}/api/workbench/teams'))
items = res.get('items', [])
assert len(items) > 0, 'No teams found in published analytics'
team = items[0]
assert 'team_id' in team and 'games_finalized' in team, 'Team record malformed'
"

# 4. Dashboard views
curl --fail --silent --show-error "$dashboard_url" >/dev/null
curl --fail --silent --show-error "$dashboard_url/data-status" >/dev/null

printf 'CourtLoad smoke checks passed: verified populated analytics and workbench health\n'
