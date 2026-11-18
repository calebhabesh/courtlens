#!/usr/bin/env bash
# Decide what a CI run must test (.github/workflows/ci.yml, job `plan`). Prints one of:
#
#   tests=full   every job runs (the default whenever anything is uncertain)
#   tests=docs   only Markdown changed, none of it read by code: run the tests that read
#                Markdown (the docs lane) and skip the rest
#   tests=none   push to main whose tree is byte-identical to a tree its pull request's
#                CI already passed: nothing new to test, so Images can start at once
#
# It also writes the tree this run tests to "$RUNNER_TEMP/tested-tree"; pull request runs
# upload it, and a later push to main compares its own tree with it.
#
# Inputs (environment): EVENT (pull_request | push | workflow_dispatch), GITHUB_SHA,
# REPO (owner/name), GH_TOKEN, RUNNER_TEMP, GITHUB_OUTPUT.
set -euo pipefail

out() { echo "$1" | tee -a "${GITHUB_OUTPUT:-/dev/null}"; }
note() { echo "$*" >&2; }

tree="$(git rev-parse 'HEAD^{tree}')"
mkdir -p "${RUNNER_TEMP:?}"
echo "$tree" > "$RUNNER_TEMP/tested-tree"
note "Tree under test: $tree"

# Markdown that no code, test or image reads, apart from the docs-lane tests: the README,
# AGENTS.md and other root notes, the plans and progress logs at the top of docs/, and the
# operations, decisions and research notes. docs/design and docs/evidence are hashed inputs
# and image contents, so any change there runs everything.
DOCS_LANE='^([^/]+|docs/[^/]+|docs/(operations|decisions|research)/[^/]+)\.md$'

# 1. A push to main that its pull request already tested: reuse that result.
if [[ "$EVENT" == push ]]; then
  pr_head="$(gh api "repos/$REPO/commits/$GITHUB_SHA/pulls" --jq \
    "[.[] | select(.merged_at != null and .head.repo.full_name == \"$REPO\")][0].head.sha // empty" \
    2>/dev/null || true)"
  # A merge commit's second parent must be that pull request's head.
  if [[ -n "$pr_head" ]] && second="$(git rev-parse -q --verify 'HEAD^2' 2>/dev/null)" \
    && [[ "$second" != "$pr_head" ]]; then
    note "Merge commit's second parent $second is not the pull request head $pr_head."
    pr_head=""
  fi
  if [[ -n "$pr_head" ]]; then
    # The latest CI run for the pull request's final commit, which ran this same workflow file
    # (the file is part of the tree being compared).
    run_id="$(gh api "repos/$REPO/actions/workflows/ci.yml/runs?head_sha=$pr_head&event=pull_request&per_page=50" \
      --jq '.workflow_runs | sort_by(.created_at) | last | select(. != null and .conclusion == "success") | .id // empty' \
      2>/dev/null || true)"
    if [[ -n "$run_id" ]] && gh run download "$run_id" --repo "$REPO" --name tested-tree \
      --dir "$RUNNER_TEMP/pull-request" >/dev/null 2>&1; then
      tested="$(cat "$RUNNER_TEMP/pull-request/tested-tree")"
      if [[ "$tested" == "$tree" ]]; then
        note "Pull request run $run_id passed on this exact tree; nothing new to test."
        out tests=none
        exit 0
      fi
      note "Pull request run $run_id tested tree $tested, not $tree (main moved after it ran)."
    else
      note "No successful pull request run with a recorded tree for $pr_head."
    fi
  else
    note "No merged same-repository pull request for $GITHUB_SHA."
  fi
fi

# 2. Which files does this change touch? A push to main compares with the newest main commit
# whose CI passed, not the commit before the push: pushes go straight to main, and a newer push
# cancels an older run, so the commits since then may never have been tested.
base=""
if [[ "$EVENT" == pull_request ]]; then
  base='HEAD^1' # the test merge commit's first parent is the base branch
elif [[ "$EVENT" == push ]]; then
  # Filter on the conclusion here, not with the API's status filter, which has missed runs.
  while read -r green; do
    if [[ -n "$green" && "$green" != "$GITHUB_SHA" ]] && git merge-base --is-ancestor "$green" HEAD 2>/dev/null; then
      base="$green"
      break
    fi
  done < <(gh api "repos/$REPO/actions/workflows/ci.yml/runs?branch=main&per_page=100" --jq \
    '.workflow_runs | sort_by(.created_at) | reverse | .[]
     | select(.conclusion == "success" and (.event == "push" or .event == "workflow_dispatch")) | .head_sha' \
    2>/dev/null || true)
  [[ -n "$base" ]] && note "Comparing with $base, the newest main commit whose CI passed."
fi
if [[ -z "$base" ]]; then
  note "No base commit to compare with; running everything."
  out tests=full
  exit 0
fi
mapfile -t changed < <(git diff --name-only "$base" HEAD)
if ((${#changed[@]} == 0)); then
  note "No changed files found; running everything."
  out tests=full
  exit 0
fi
for path in "${changed[@]}"; do
  if [[ ! "$path" =~ $DOCS_LANE ]]; then
    note "Runs everything: $path is outside the docs lane."
    out tests=full
    exit 0
  fi
done
note "Docs lane: ${#changed[@]} Markdown file(s), none read by code."
out tests=docs
