#!/usr/bin/env bash
# Wait for a main commit's CI and succeed only if it passed (docs/deployment.md#deploy).
#
#   scripts/wait_for_ci.sh <40-char sha>
#
# CI's last job publishes the commit's sha-<sha> images, so a passed run means the images exist.
# Uses the latest CI run on main for the commit (a push, or a hand-started run). A newer push
# cancels an older run on main, so a superseded commit fails here: deploy the newer one.
# Environment: GH_REPO (default calebhabesh/courtlens), CI_WAIT_SECONDS (default 2400).
set -euo pipefail

sha="${1:?usage: wait_for_ci.sh <sha>}"
repo="${GH_REPO:-calebhabesh/courtlens}"
deadline=$((SECONDS + ${CI_WAIT_SECONDS:-2400}))

latest_run() {
  gh api "repos/$repo/actions/workflows/ci.yml/runs?head_sha=$sha&branch=main&per_page=20" --jq \
    '[.workflow_runs[] | select(.event == "push" or .event == "workflow_dispatch")]
     | sort_by(.created_at) | last | select(. != null) | "\(.id) \(.status) \(.conclusion)"'
}

announced=""
while :; do
  read -r id status conclusion <<< "$(latest_run)" || true
  if [[ -z "${id:-}" ]]; then
    ((SECONDS < 120)) || { echo "No CI run on main for $sha. Is it pushed?" >&2; exit 1; }
  elif [[ "$status" == completed ]]; then
    if [[ "$conclusion" == success ]]; then
      echo "CI passed for $sha (run $id)."
      exit 0
    fi
    echo "CI for $sha ended $conclusion (https://github.com/$repo/actions/runs/$id)." >&2
    [[ "$conclusion" == cancelled ]] && echo "A newer push cancels older main runs; deploy the newer commit." >&2
    exit 1
  elif [[ "$announced" != "$id" ]]; then
    echo "Waiting for CI on $sha: https://github.com/$repo/actions/runs/$id"
    announced="$id"
  fi
  ((SECONDS < deadline)) || { echo "CI for $sha did not finish in time." >&2; exit 1; }
  sleep 20
done
