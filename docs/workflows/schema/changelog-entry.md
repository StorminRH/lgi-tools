# Changelog entry form

Every completed sub-version prepends one entry to its master-version file at
`content/changelog/vX.Y.md`, directly below that file's `## vX.Y — Theme`
heading and summary. Entries stay newest-first.

Use this exact shape, keeping only the change-type headings that apply and
preserving their shown order:

```markdown
### v<X.Y.N> — YYYY-MM-DD

#### Added
- One plain-language change per bullet.

#### Changed
- One plain-language change per bullet.

#### Fixed
- One plain-language change per bullet.

#### Removed
- One plain-language change per bullet.
```

The version heading uses `v` plus the complete sub-version, an em dash (a
hyphen is also accepted by the parser), and the ISO ship date. Allowed groups
are exactly `Added`, `Changed`, `Fixed`, and `Removed`. Each retained group has
one or more `- ` bullets. Write user-facing work in plain pilot language and
internal work in a plain sentence a teammate can understand. Do not use bold,
inline code, or links; the renderer displays that Markdown literally.

When a master-version file does not yet exist, create it with this frame before
the first entry:

```markdown
## v<X.Y> — <theme>

<One or two plain-text sentences describing the master version for players.>
```
