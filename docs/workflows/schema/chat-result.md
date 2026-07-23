# Chat-result schema

Use this form for every workflow result rendered to the operator in chat. The
owning procedure defines its outcome vocabulary, field names, and evidence.

1. Start with a level-two `<Workflow>: <OUTCOME>` heading. Render the outcome as
   inline code and include exactly one actual outcome.
2. Put identity fields directly below the heading as `- **Label:** value`.
3. Group evidence under short level-three headings and bold-label bullets.
4. End with `### Next state`, including the applicable handoff or state field and
   the exact blocker or `None`.
5. Replace every template placeholder. Keep required fields visible and use
   `Not applicable`, `Not reached`, or `None` instead of omitting them.
6. Render the Markdown directly in chat. Never wrap the result in a code fence,
   prepend a second summary, or append an unstructured duplicate.

Templates remain fenced inside procedures only so agents can distinguish the
literal field form from surrounding instructions.
