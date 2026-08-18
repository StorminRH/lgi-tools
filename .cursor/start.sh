#!/usr/bin/env bash
# Per-boot Cloud Agent sync for host-level Cursor seats.
#
# Skills are committed at `.cursor/skills/` and custom agents at
# `.cursor/agents/`. Both are discovered from the checkout. Start also
# mirrors them into ~/.cursor/ so Task can launch seats by name. Start
# runs on every boot from a build, so the seats match the checked-out
# branch rather than a stale snapshot copy.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_SRC="$REPO_ROOT/.cursor/agents"
AGENT_DST="$HOME/.cursor/agents"
SKILL_SRC="$REPO_ROOT/.cursor/skills"
SKILL_DST="$HOME/.cursor/skills"
NPM_PREFIX="${NPM_CONFIG_PREFIX:-$HOME/.npm-global}"
export PATH="$NPM_PREFIX/bin:$PATH"

mkdir -p "$AGENT_DST" "$SKILL_DST"

# Only remove seats this script previously copied. Leave the operator's
# other personal ~/.cursor skills and agents alone.
MANIFEST="$HOME/.cursor/lgi-tools-managed-seats"
current_agents=""
current_skills=""
if [ -d "$AGENT_SRC" ]; then
  current_agents="$(find "$AGENT_SRC" -maxdepth 1 -type f -name '*.md' -exec basename {} \; | sort)"
fi
if [ -d "$SKILL_SRC" ]; then
  current_skills="$(find "$SKILL_SRC" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort)"
fi

if [ -f "$MANIFEST" ]; then
  while IFS= read -r line; do
    kind="${line%%:*}"
    name="${line#*:}"
    [ -n "$name" ] || continue
    if [ "$kind" = agent ]; then
      printf '%s\n' "$current_agents" | grep -Fxq "$name" && continue
      rm -f "$AGENT_DST/$name"
    elif [ "$kind" = skill ]; then
      printf '%s\n' "$current_skills" | grep -Fxq "$name" && continue
      rm -rf "$SKILL_DST/$name"
    fi
  done < "$MANIFEST"
fi

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

{
  printf '%s\n' "$current_agents" | sed '/^$/d; s/^/agent:/'
  printf '%s\n' "$current_skills" | sed '/^$/d; s/^/skill:/'
} > "$MANIFEST"

# Reconcile Convex AUTH_JWKS once Next and the anonymous backend are up.
# Backgrounded: start must return; the waiter polls and then exits.
nohup bash "$REPO_ROOT/.cursor/configure-convex-auth.sh" \
  >/tmp/lgi-convex-auth.log 2>&1 &

echo "start.sh complete: synced Cursor skills/agents into \$HOME/.cursor."
