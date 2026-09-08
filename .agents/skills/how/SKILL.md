---
name: how
description: Use for "how does X work", code walkthroughs before changing something, and placement / ownership / layering questions ("where should this live", "which package owns this", "is this the right layer"). Explains subsystem architecture, runtime flow, onboarding mental models. Can critique architecture. Use why for motivation.
disable-model-invocation: true
---

# Explain behavior

Explain the requested runtime flow, ownership or architecture from current
source. Bound the question before retrieval; state a reasonable scope when
needed and accept steering. Reuse applicable current packets.

For unresolved relationships, consumers or blast radius, use `repo-mapper`
with [agent calls](../_shared/agent-calls.md). Delegate noisy implementation
exploration as a bounded independent task when it protects parent context.
For unresolved external API behavior, use `docs-researcher`. Keep retrieval
question-driven; a clear existing packet needs no second investigation.

Trace the relevant entry, state transitions, boundaries and resulting
behavior. Broaden only for a material unknown. Cite decisive source and
explain in plain English, with a small diagram when it clarifies the flow.
Keep logs/full source in the child or referenced artifacts. Use `why` only
when motivation is part of the question, reusing retrieved history.

For an explicitly requested critique, explain the established behavior first,
then commission independent bounded reviews of the uncertain design areas.
Preserve native pins/permissions and synthesize evidence rather than votes.
Return concrete improvements and uncertainty, not mandatory findings.
