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
| 1 | How members get into maps, and how a user gets their keys back on a new device | Agreed 2026-10-06 |
| 2 | Do corp spaces gate cutover? | Not started |
| 3 | Who sees old map history after a key rotation | Not started |
| 4 | Standard tier | Not started |
| 5 | Recovery delay | Not started |
| 6 | Auto re-admit after a short affiliation loss | Not started |
| 7 | High-security mode | Not started |
| 8 | One-owner personal maps | Not started |
| 9 | Recovery secret requirement | Not started |

### Decision 1, agreed 2026-10-06

- **Joining maps:** anyone on a map's access list is admitted automatically, with or without an invite link. No strict-approval mode and no waiting period.
- **Character sold (owner-hash change):** detected at login before any key is released, as the current app already does. The seller's link and data for that character are removed (unchanged from today). Then, automatically and with no prompts:
  - the character is removed from every map access list it is named on, and map owners get a notice ("Character sale detected: [name] has been removed from your map's access list");
  - if the character is still in a corporation that has access to a map, it is added to that map's block list, so the corp grant cannot let the buyer in. This uses the existing block, created after the seller is unlinked, so it records only the buyer's account and never affects the seller or their other characters. Owners re-admit by removing the block;
  - the corporation (directors, members using LGI, and owners of maps granting that corp) gets a heads-up that a character in the corp changed owners.
- **Other key changes** (new device, passkey, recovery, logging in elsewhere) are automatic and need no one.
- **Getting keys back:** a user gets their keys back by logging in with EVE. A sealed key service running in an AWS Nitro Enclave holds users' keys sealed (via AWS KMS bound to the enclave's code fingerprint), checks the CCP-signed login, and returns the keys to the user's browser wrapped to a fresh key. LGI's operators cannot read the sealed keys. No other members or bots need to be online.
- **Built from day one**, on AWS Nitro with a 1-year commitment (about $32/month). Reproducible enclave builds with published code fingerprints; browsers verify the enclave's attestation before sending anything.
- **Backups:** passkeys and a recovery key are optional extras, nudged but not required. They cover a key-service outage or loss of the AWS account.
- **Honest caveat for users:** AWS signs the enclave's proof, and the AWS account owner could change the key-release rule; such a change would be visible through the published fingerprints.
- **Doc impact:** the identity, recovery and key-directory parts of the design will be reworked around this during the section-by-section review.

### Section-by-section review

After the owner decisions are settled, the full document will be split into review parts and walked through one at a time. Each part is marked agreed here as it is settled.
