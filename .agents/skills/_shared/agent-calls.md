# Native agent calls

Shared role contracts live in `roles/`. Native definitions retain the
harness's model, effort and permission fields and instruct the role to read
its contract after resolving the repository root. A path in a prompt is
not an automatic include: runtime acceptance must prove the file was read.

For Codex, read [Codex calls](codex-agents.md). For Cursor, set the exposed
Task tool's `subagent_type` to the exact native role and omit a model override
so `.cursor/agents/<role>.md` owns its pin. A role name in the prompt alone
creates a generic child and can inherit the parent's model. Verify the actual
call arguments and follow the live tool schema.

Send a bounded brief: repository/root, exact subject and revision, question
or selected commands, authority, applicable source paths and required return.
Prefer a fresh context to full conversation inheritance. Launch independent
seats within available capacity and collect every required final verdict.
Keep one frozen review subject across batches. Missing role/loading evidence
blocks that seat; repair discovery before retrying. Requested pins and child
self-reports are not proof of effective runtime model identity.

Keep noisy logs and retries in the role context or accessible artifacts.
Return conclusions first with decisive evidence and uncertainty. Request a
focused follow-up for a gap rather than routinely repeating the tools.
