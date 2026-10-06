# Encryption plan

Working copy of the encryption-first rebuild design for LGI.tools. The owner and Claude are reviewing it section by section; nothing here is final until marked agreed below.

The live, editable version is the shared Claude doc "LGI.tools Encryption-First Rebuild — Design & Spec". These files are snapshots of it, updated as decisions are agreed.

## Files

| File | Contents |
|---|---|
| 01-design-and-spec.md | The design: goals, threat model, reuse map, alignment with the current app, recommended architecture, identity and keys, maps, mapper engine, ESI data, infrastructure, security, UX flows, review findings, rebuild plan, open questions |
| 02-decision-records.md | Decision records (DR-…) |
| 03-reference-tables.md | Features by tier, route map, datasets, metadata the server sees |
| 04-detailed-spec.md | Implementation-level rules (D-… IDs) |
| 05-sources.md | Pages the research used |

## Review status

### Owner decisions

| # | Decision | Status |
|---|---|---|
| 1 | How members get into maps, and how a user gets their keys back on a new device | In discussion |
| 2 | Do corp spaces gate cutover? | Not started |
| 3 | Who sees old map history after a key rotation | Not started |
| 4 | Standard tier | Not started |
| 5 | Recovery delay | Not started |
| 6 | Auto re-admit after a short affiliation loss | Not started |
| 7 | High-security mode | Not started |
| 8 | One-owner personal maps | Not started |
| 9 | Recovery secret requirement | Not started |

### Working notes on decision 1 (not yet agreed)

- Everyone on a map's access list is admitted automatically; no strict-approval mode or waiting period by default.
- A key change caused by a character changing hands (EVE owner hash changes) needs a manager to confirm.
- Direction under discussion: users get their keys back simply by logging in with EVE. A small key-release service running in a hardware enclave holds users' keys sealed, checks the CCP-signed login, and returns the key to the user's browser. LGI's operators cannot read the sealed keys. This would replace passkeys and recovery keys as the main path (they become optional), and remove any need for other members or bots to be online.
- Provider options: AWS Nitro Enclaves (about $32-50/month), or Azure confidential VMs with an immutable key-release policy (about $63/month, the only option where even the owner cannot change the release rule). Vercel, Neon, Cloudflare and Convex offer nothing equivalent.

### Section-by-section review

After the owner decisions are settled, the full document will be split into review parts and walked through one at a time. Each part is marked agreed here as it is settled.
