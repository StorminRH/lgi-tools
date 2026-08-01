# Chat-result schema

Use this form for every workflow result rendered to the operator in chat. The
owning procedure defines its outcome vocabulary and what belongs in each field.

```markdown
## <Workflow>: `<OUTCOME>`

- **Subject:** <one-line identity>
- **Result:** <≤2 sentences: what completed or why it stopped>
- **Action:** <operator-facing next step and only material findings; omit empty noise>
- **Blocker:** <exact blocker or `None`>
```

1. Start with a level-two `<Workflow>: <OUTCOME>` heading. Render the outcome as
   inline code and include exactly one actual outcome.
2. Use exactly these four bold-label bullets. Do not add per-workflow section
   headings, tables, or extra identity rows in chat.
3. Put one-line identity in **Subject**. Summarize completion or stop reason in
   **Result** (at most two sentences). Put only the operator-facing next step
   and material findings in **Action**. Put the exact blocker or `None` in
   **Blocker**.
4. Omit `Not applicable`, empty evidence, and noise from chat. Keep detail in
   artifacts, PR bodies, or procedure-local notes.
5. Long ledgers — design notes, surface ledgers, role or runtime-identity
   tables, PR/CI dumps — are not chat content. Chat carries counts plus the
   action the operator must take.
6. Replace every template placeholder. Render the Markdown directly in chat.
   Never wrap the result in a code fence, prepend a second summary, or append
   an unstructured duplicate.

Templates remain fenced inside procedures only so agents can distinguish the
literal field form from surrounding instructions.
