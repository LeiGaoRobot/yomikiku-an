#!/usr/bin/env bash
# Opt-in installer for the pre-push hook.
# Symlinks scripts/hooks/* into .git/hooks/* so they're versioned via the
# committed scripts/hooks/ tree. Re-run after pulling new hook changes.

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO/scripts/hooks"
DST="$REPO/.git/hooks"

if [ ! -d "$DST" ]; then
  echo "ERROR: $DST does not exist (not a git checkout?)"
  exit 1
fi

for hook_path in "$SRC"/*; do
  hook_name="$(basename "$hook_path")"
  case "$hook_name" in
    *.md|*.txt|README*) continue ;;
  esac
  ln -sf "../../scripts/hooks/$hook_name" "$DST/$hook_name"
  chmod +x "$hook_path"
  echo "installed: .git/hooks/$hook_name -> ../../scripts/hooks/$hook_name"
done

echo
echo "Done. Skip the hook for one push with: git push --no-verify"
