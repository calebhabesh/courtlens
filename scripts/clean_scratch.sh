#!/usr/bin/env bash
# Remove stale CourtLens scratch workspaces.
#
# /tmp is RAM-backed (tmpfs) on most desktop Linux installs, so abandoned agent
# workspaces (dashboard copies, browser-test sandboxes, stage builds) hold memory
# until reboot and push everything else into swap. This removes CourtLens scratch
# that nothing has touched for COURTLENS_SCRATCH_MAX_AGE_MIN minutes and that no
# running process is using. Usage: scripts/clean_scratch.sh [--dry-run]
set -euo pipefail

max_age_min="${COURTLENS_SCRATCH_MAX_AGE_MIN:-360}"
scratch_root="${COURTLENS_SCRATCH_DIR:-$HOME/.cache/courtlens-tmp}"
dry_run=0
[[ "${1:-}" == "--dry-run" ]] && dry_run=1

mkdir -p "$scratch_root"

# Paths that live processes hold as cwd, open files or mapped files.
in_use="$(
  for proc in /proc/[0-9]*; do
    readlink "$proc/cwd" 2>/dev/null || true
    for fd in "$proc"/fd/*; do readlink "$fd" 2>/dev/null || true; done
  done | grep -E "^(/tmp|${scratch_root})/" | sort -u || true
)"

shopt -s nullglob
candidates=(/tmp/courtlens-* /tmp/courtload-* "$scratch_root"/*)
freed_kib=0
for path in "${candidates[@]}"; do
  [[ -O "$path" ]] || continue
  if grep -qF -- "$path" <<<"$in_use"; then
    continue
  fi
  # Anything modified recently means a workspace is still active.
  if [[ -n "$(find "$path" -mmin "-$max_age_min" -print -quit 2>/dev/null)" ]]; then
    continue
  fi
  size_kib="$(du -sk "$path" 2>/dev/null | cut -f1)"
  freed_kib=$((freed_kib + ${size_kib:-0}))
  if ((dry_run)); then
    echo "would remove $path (${size_kib:-0} KiB)"
  else
    rm -rf -- "$path"
  fi
done

verb=$([[ $dry_run == 1 ]] && echo "would free" || echo "freed")
echo "courtlens scratch: $verb $((freed_kib / 1024)) MiB"

# Disposable test PostgreSQL containers (scripts/test_python.py) are removed with
# their anonymous data volume when the run ends, but a killed run leaves both
# behind. Remove any older than the scratch age limit; a full suite takes minutes.
if command -v docker >/dev/null 2>&1; then
  now="$(date +%s)"
  while read -r name created; do
    [[ -n "$name" ]] || continue
    age_min=$(((now - $(date -d "$created" +%s)) / 60))
    ((age_min >= max_age_min)) || continue
    if ((dry_run)); then
      echo "would remove container $name (${age_min} min old)"
    else
      docker rm -f -v "$name" >/dev/null && echo "removed container $name"
    fi
  done < <(
    docker ps -a --filter name=^courtlens-tests- --format '{{.Names}}' 2>/dev/null |
      xargs -r docker inspect --format '{{.Name}} {{.Created}}' 2>/dev/null |
      sed 's#^/##'
  )
fi
