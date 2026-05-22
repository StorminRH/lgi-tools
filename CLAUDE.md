## What This Is

**LGI.tools** (Lo-Gang Industries) is a multi-tool web platform for Eve Online players. Features are added incrementally — each one builds on shared infrastructure without requiring rewrites of what came before.

## Core Principles

Raise a conflict before proceeding if a task seems to violate one.

**Reusable primitives over one-off components.**
A wave card is not a wormhole component — it is a collapsible group-of-entities component fed wormhole data today. Future features use the same primitives with different data.

**Features don’t know about each other.**
Each feature is a self-contained slice. Shared logic lives in a common layer that features import from — never the reverse.

**Configuration over repetition.**
Types, classes, and variants are defined as constants in one place. Adding a new one is a config change, not a code change. Utilize strict typing to enforce these configurations.

**Schema stays extensible.**
Accommodate new content types and fields without structural rewrites.

**Maintain SCRATCHPAD.md.**
After every session update SCRATCHPAD.md with what was built, decisions made, open questions, and what the next session should start with. This is working memory across sessions — keep it current.

@AGENTS.md
