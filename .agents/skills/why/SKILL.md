---
name: why
description: Use for design rationale, historical decisions, regressions and evidence behind a threshold.
disable-model-invocation: true
---

# Explain rationale

Investigate the decision the user actually asked about. Start with relevant
code history and the directly linked PR/Linear decision. Identify each PR's
forge before retrieving historical evidence; current work uses GitHub,
while historical provenance retains its original identity.

Reuse a current applicable research packet. Delegate noisy history/source
retrieval in a bounded brief using [agent calls](../_shared/agent-calls.md).
Expand to docs, chat, observability or analytics only for a material unanswered
question or contradiction; an explicitly broad audit can cover more sources.
Source adapters under `references/sources/` are optional retrieval aids.
Do not require every category or an agent for an already answered fact.

Separate documented rationale from inference. Cite the decisive PR, commit,
Linear record or authoritative source, preserve contradictions and name
unsearched or unavailable evidence that limits the conclusion. Code shape
proves mechanics, not motivation. Stop when the question is answered or the
remaining uncertainty is explicit. Return the answer first, supporting
tradeoffs, sources and gaps without the research transcript.
