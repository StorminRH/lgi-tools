#!/usr/bin/env bash
# Per-boot Cloud Agent sync for host-level Cursor seats.
#
# Skills are committed at `.cursor/skills/` and are discovered from the
# checkout. Custom agents cannot live at `.cursor/agents/` (forbidden by
# tools/policy/policy-manifest.json), so the tracked copies in
# tools/cursor-runtime/agents/ are mirrored into ~/.cursor/agents/ here.
# Start runs on every boot from a build, so the seats match the checked-out
# branch rather than a stale snapshot copy.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_SRC="$REPO_ROOT/tools/cursor-runtime/agents"
AGENT_DST="$HOME/.cursor/agents"
SKILL_SRC="$REPO_ROOT/.cursor/skills"
SKILL_DST="$HOME/.cursor/skills"
NPM_PREFIX="${NPM_CONFIG_PREFIX:-$HOME/.npm-global}"
export PATH="$NPM_PREFIX/bin:$PATH"

mkdir -p "$AGENT_DST" "$SKILL_DST"

if [ -d "$AGENT_SRC" ]; then
  find "$AGENT_SRC" -maxdepth 1 -type f -name '*.md' -exec cp -f {} "$AGENT_DST/" \;
fi

if [ -d "$SKILL_SRC" ]; then
  for skill_md in "$SKILL_SRC"/*/SKILL.md; do
    [ -f "$skill_md" ] || continue
    name="$(basename "$(dirname "$skill_md")")"
    mkdir -p "$SKILL_DST/$name"
    cp -f "$skill_md" "$SKILL_DST/$name/SKILL.md"
  done
fi

# Reconcile Convex AUTH_JWKS once Next and the anonymous backend are up.
# Backgrounded: start must return; the waiter polls and then exits.
nohup bash "$REPO_ROOT/.cursor/configure-convex-auth.sh" \
  >/tmp/lgi-convex-auth.log 2>&1 &

echo "start.sh complete: synced Cursor skills/agents into \$HOME/.cursor."
