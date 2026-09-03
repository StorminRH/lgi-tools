# Changelog entry form

A public changelog entry is written only when Origin `staging` merges onto
`main`. `close-out` writes it from the as-builts in that merge. Pending
fragments are retired. Ordinary work and lifecycle work both wait for that
release.

Prepend one entry to the master-version file at `content/changelog/vX.Y.md`,
directly below that file's `## vX.Y — Theme` heading and summary. Entries
stay newest-first.

Use this exact shape. Keep only the change-type headings that apply, in this
order:

```markdown
### v<X.Y.N> — YYYY-MM-DD

<One or two plain paragraphs. What this version now gives a player. Example:
This version ships Atlas. Pilots can draw a chain, paste signatures, and
open a blank map.>

#### Added
- One short plain-speech line.

#### Changed
- One short plain-speech line.

#### Fixed
- One short plain-speech line.

#### Removed
- One short plain-speech line.
```

The version heading uses `v` plus the lifecycle identity already on
`staging`, an em dash (a hyphen is also accepted by the parser), and the
ISO ship date. The overview sits between that heading and the first
`####` group. Invoke `unslop`. Do not use bold, inline code, or links. The
renderer displays that Markdown literally.

Allowed groups are exactly `Added`, `Changed`, `Fixed`, and `Removed`.
Each retained group has one or more `- ` bullets. Lift those bullets from
the as-built Delivered outcome lines (`Added:`, `Changed:`, `Fixed:`,
`Removed:`). Group them in the order above. Rewrite into *player speech*
as you lift. Do not paste shop-talk verbs from code or as-builts unchanged.

When a master-version file does not yet exist, create it with this frame
before the first entry:

```markdown
## v<X.Y> — <theme>

<One or two plain-text sentences describing the master version for players.>
```

The master summary names what the version *is* for a player, not how the
project measured or delivered it.

## Voice

Write for someone with no technical knowledge. A player should understand
the impact on them. The project is open source, so internal work stays in
the changelog too, but those lines stay short and plain.

**Player impact.** Interface, features, behavior, bug fixes. Say what the
player sees or can do now.

**Shop talk.** Database layout, tests, agent workflows, cleanup, security
patches, CI. One simple sentence for the overall change. Not a granular
process log.

### Prefer

| Shop talk (avoid) | Player speech (write) |
| --- | --- |
| A map whose purge has started cannot be restored or republished. | A map that is being deleted for good cannot be restored or put back online. |
| An older access projection can no longer restore a revoked claim. | Old sharing access can no longer come back after it was removed. |
| Staging lives at its durable host and talks to Convex staging. | Staging uses its lasting address and talks to the staging live services. |
| Jump authoring and signature elimination share one Convex HTTP door. | Recording jumps and removing signatures share one service path. |
| The website JWT is minted once per session. | The website login is created once per session. |
| Location sync holds a short-lived EVE access-token lease. | Location sync holds a short-lived EVE login. |
| Authored k-space exits open into a gate halo. | Known k-space exits open into a gate halo. |
| Severing a connection marks the branch severed. | Removing a connection marks the branch as removed. |
| Ghost stubs / eliminator deductions | Ghost placeholders / automatic fill-in |
| A one-way Neon-to-Convex access projection keeps claims regenerable. | Access sync from the main database into the live map service so sharing stays renewable. |
| Floored a transitive development-tooling identifier library to a patched 3.x release. | Security patches were applied for a development tooling library. |
| Consolidated fragmented micro-tests across eleven Vitest suites. | Map and settings tests were folded into fewer longer workflow tests. |

### Master summary

| Shop talk (avoid) | Player speech (write) |
| --- | --- |
| v4.0 lays the groundwork for a collaborative wormhole mapper while keeping its delivery records and measurement baseline trustworthy from the first shipped slice. | v4.0 ships Atlas, a shared wormhole map that updates live for everyone watching. Paste scanner results, jump through holes, track mass and lifetime, manage who can edit, and see pilots and fog on one canvas. |

### Shop-talk bullets

Keep them when the release includes that work. Collapse detail into one
line that a non-developer can skim.

| Granular (avoid) | Simple (write) |
| --- | --- |
| Kept machine-checked session, audit, changelog, and pull-request forms in the repo, moved workflow steps into Cursor skills, and stopped the lifecycle resolver from hashing procedure text. | Internal agent workflows moved into Cursor skills, and scratch notes moved into session records and handoff notes. |
| The code-health baseline now captures each master version's starting reference, measures its expanded lifecycle surfaces, and preserves session as-built records in version archives. | The code-health baseline now captures each master version's starting reference and preserves session records in version archives. |

Name the thing the player would say: delete, share, restore, login, map,
scanner, return hole, cut connection. When a line still reads like a
function name or an internal status, rewrite it until it does not.
