---
name: close-out
description: Close out every merge onto staging or main. Always use when the operator asks to close out, or to merge onto staging or main.
---

# Close out work

Read and follow [delivery](../../../docs/workflows/delivery.md) in order.
Its destination, candidate, freeze, review, CI, Linear receipt, merge,
resync and deployment gates are the complete procedure. Every merge onto
`staging` or `main` uses it. Preserve a caller's preparation/review boundary.

Use [verification](../../../docs/workflows/verification.md) to select and
reuse local proof. Use [agent calls](../_shared/agent-calls.md) for seats.
Return the delivery outcome with exact subject, evidence, next action and
blocker. A promotion requested for visual testing returns to its pending
operator pause after deployment proof; it does not approve the UI.
