---
name: typescript-best-practices
description: Use for consequential TypeScript type/API design, external-input boundaries and unsafe narrowing.
---

# Type and API design

Use this guidance for consequential TypeScript type/API changes, external
input boundaries or unsafe narrowing. Ordinary source reading does not
require a language tutorial. Read applicable `src/AGENTS.md`, existing
owners and installed dependency documentation for the actual change.

Validate external input at its boundary. Model meaningful states so invalid
combinations are difficult to construct. Prefer inferred types and checked
narrowing; justify a necessary assertion from an established invariant.
Choose argument/interface shape for current callers, not an object-argument
mandate. Reuse current primitives and avoid speculative abstractions.

Tests follow the contributor testing policy: use the lightest layer that
can detect the failure, real local dependencies where the behavior requires
them, and controlled fakes/error injection where appropriate. Required
real-database coverage remains real. Select proof through verification.
