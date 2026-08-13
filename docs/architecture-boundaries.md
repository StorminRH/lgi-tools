# Architecture boundaries

The exact zones, dependency permissions, and coverage exceptions live in
[`.fallowrc.json`](../.fallowrc.json). `pnpm fallow` enforces that deny-by-default
map, and [`architecture-map.md`](architecture-map.md) is its generated view.

Dependencies flow from entry points through composition and product slices
toward platform and foundational capabilities. Cross-slice orchestration stays
above the participating slices; product features and data slices do not become
mutual dependency networks. [`src/AGENTS.md`](../src/AGENTS.md) lists only
source landmines that Fallow and lint do not catch.

## Feature widget surfaces

A feature that can be embedded by a host exposes exactly one
`src/features/<name>/widget.tsx` module. That module exports the widget component
and its props contract; hosts import the widget only through that path. The
widget receives its entity identifier, loads through the owning feature's
existing endpoint, and fills the container box the host supplies. It does not
receive host window dimensions or import the host layer.

This is a narrow embeddable surface, not a general feature barrel. Existing
deep-path imports remain unchanged, and other feature internals are not
re-exported through `widget.tsx`. The wormhole-sites `SiteCardWidget` is the
first instance; the mapper may consume it once the mapper zone lands, while the
feature never imports the mapper.

## Inversion and runtime seams

Authentication exposes the owner-reconciliation hook at
`src/platform/auth/owner-reconcile-hook.ts`. Route composition activates its
implementation by importing
`src/composition/account-lifecycle/register-owner-reconciler.ts`. This keeps
authentication pointed downward while composition wires the participating
capabilities above it.

Runtime-entry and lint exemptions do not grant architecture-boundary
exceptions.
