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
- One short player-facing line.

#### Changed
- One short player-facing line.

#### Fixed
- One short player-facing line.

#### Removed
- One short player-facing line.
```

The version heading uses `v` plus the lifecycle identity already on
`staging`, an em dash (a hyphen is also accepted by the parser), and the
ISO ship date. The overview sits between that heading and the first
`####` group. Write it in plain player language and invoke `unslop`.
Do not use bold, inline code, or links. The renderer displays that
Markdown literally.

Allowed groups are exactly `Added`, `Changed`, `Fixed`, and `Removed`.
Each retained group has one or more `- ` bullets. Lift those bullets from
the as-built Delivered outcome lines (`Added:`, `Changed:`, `Fixed:`,
`Removed:`). Group them in the order above. Drop internal-only notes.

When a master-version file does not yet exist, create it with this frame
before the first entry:

```markdown
## v<X.Y> — <theme>

<One or two plain-text sentences describing the master version for players.>
```
