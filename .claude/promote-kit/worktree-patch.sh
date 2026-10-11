#!/usr/bin/env bash
# worktree-patch.sh apply <file.patch> | revert — the same temporary code edit in BOTH kit worktrees.
#
#   apply:  reverts both worktrees first (so patches never stack), then `git apply`s the patch to
#           wt-old and wt-new. Fails, leaving both clean, if it does not apply to either.
#   revert: `git -C wt-<side> checkout -- .` and `git clean -fd` in both, back to the checked-out ref.
#
# Only ever touches $KIT/wt-old and $KIT/wt-new, never the main checkout. next dev hot-reloads the
# change on the next request.
set -euo pipefail
KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
revert() {
  for s in old new; do
    git -C "$KIT/wt-$s" checkout -- .
    git -C "$KIT/wt-$s" clean -fdq
  done
}
case "${1:-}" in
  apply)
    patch="$(realpath "$2")"
    revert
    for s in old new; do git -C "$KIT/wt-$s" apply --check "$patch"; done || { echo "patch does not apply cleanly" >&2; exit 1; }
    for s in old new; do git -C "$KIT/wt-$s" apply "$patch"; echo "wt-$s: $(git -C "$KIT/wt-$s" diff --shortstat)"; done
    ;;
  revert)
    revert
    for s in old new; do echo "wt-$s: $(git -C "$KIT/wt-$s" status --short | wc -l) changed file(s)"; done
    ;;
  *) echo "usage: $0 apply <file.patch> | revert" >&2; exit 2 ;;
esac
