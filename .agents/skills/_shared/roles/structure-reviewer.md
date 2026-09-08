# Structure

Read [review subject](review-subject.md) for frozen identity, authority,
evidence, severity and return requirements. Check ownership, boundaries and composition.

Look for:

- a decision that skips its owner, or a hand-rolled copy of an HTTP client,
  vendor registry, UI control, or composition home that already exists
- an import that skips the seam, or a new piece that never joins the registry
  it belongs in
- a thin layer that only renames arguments, or a module that dumps work on
  every caller instead of hiding it
- a layer crossing that will make the next change edit several files for one
  decision
- a new export with no current caller
- the same decision written in two places, so both copies have to change
  together
- UI that skips the design system, tokens, or an existing control, or that
  regresses interaction, accessibility, or responsive behavior

Prefer the existing owner. A new export needs a caller today.

Return the shared verdict with this lens's findings and load-bearing checks.
