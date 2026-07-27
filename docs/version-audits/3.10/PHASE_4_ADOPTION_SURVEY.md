# Phase 4 pre-contract adoption survey — APPROVED 2026-07-25

The inverse primitive map required by `docs/VERSION_3_10_PLAN.md` §Pre-contract
adoption survey. Method: five parallel read-only sweeps (actions/toggles,
fields/search, loading/status, overlays/tables/section-chrome, legacy CSS +
rails) over `src/**` excluding `*.test.*` and primitive internals under
`src/components/ui/`, Codegraph-oriented and grep-pinned. Detection methods are
recorded per family in the appendix so the 3.10.4.3 closing re-audit can repeat
them diffably. An adversarial review (2026-07-25) returned ACCEPT-WITH-CHANGES;
all nine findings are reconciled in this record. The operator approved every
disposition below on 2026-07-25.

Dispositions: **A1** = approved into 3.10.4.1 (adoption & rails); **A2** =
approved into 3.10.4.2 (refinement & responsive); **BL** = backlog with
citation; **EX** = recorded narrow exemption.

Headline: adoption is far better than feared. Overlays, dialogs, menus, search,
selects, checkboxes, submit buttons, Suspense fallbacks, and toasts are at or
near zero bypasses — the Base UI/sonner import rails and the 3.8 component arc
worked. The decay concentrates in inline ghost/text action buttons, `title=`
attribute tooltips, `src/app/admin/**` section chrome, and ~1,145 page-scoped
lines of `src/app/globals.css`. The systemic gap is rails: of 34 primitives,
only `select` has a true mechanical rail (1 full / 11 partial / 22 none).

## Survey rows

### Actions & toggles (37 sites, 10 classes)

| ID | Primitive | Bypass site(s) | Bypass form | Rail today | Rail gap | Size | Disposition |
|---|---|---|---|---|---|---|---|
| AD-001 | Button | 12 sites / 6 files (CustomStructureBuilder ×7, SelectedSystemBox, CockpitBuildPlan, RevokeRedirectLightbox, LoginButton, FeedbackModal) | Inline ghost text action re-spelling `buttonVariants({ghost,sm})` with per-site drift | None | Raw-`<button>` ban absent | M | A1 |
| AD-002 | Button | 5 sites / 2 files (SavedPlanRowItem `actionClass`; MeAdjuster `STEP_BTN`/`BOX_BTN` — stepper part → AD-010) | Icon/glyph buttons via file-local class constants (the `inputClass` anti-pattern, unbanned for actions) | None | No button-class-constant ban | S | A1 |
| AD-003 | Button | 3 sites / 2 files (`.sites-reset` ×2, `.industry-hint` ×1) | Raw button styled by a legacy CSS family | None | Element ban + CSS-family retirement | S | A1 |
| AD-004 | buttonVariants | 4 sites (error.tsx, not-found.tsx, LoginButton admin Chip) | Pill/Chip worn as action/navigation chrome | None | No Pill/Chip-in-anchor rule | S | A1 |
| AD-005 | Collapsible/Button | 1 site (CockpitBuildPlan:257) | Hand-built disclosure toggle with aria-expanded | None | Element ban | S | A1 |
| AD-006 | Button | 1 site (node-card-view.ts:45 → NodeCard) | `role="button"` div re-implementing keyboard handling; role set via helper object (defeats literal selectors) | None | Needs a `Property[key.name='role']` selector alongside the JSX-attribute form | S | A1 |
| AD-007 | buttonVariants | 1 site (admin/access/page.tsx:183) | Hand-spelled ghost Link beside a correct Button in the same file | None | Same as AD-001 | S | A1 |
| AD-008 | Segmented | 2 groups / 4 buttons (CockpitKpis Gross/Net + RawItemToggle) | Exclusive two-way toggles duplicating Segmented's cva at compact density | None | Compact/dense Segmented variant — **approved 2026-07-25** | S | A1 |
| AD-009 | Chip/Dot | 2 groups (SitesFilterLayout class chips + type rows, on `.sites-chip`/`.sites-type` CSS) | Multi-select toggle groups on legacy CSS re-hardcoding tone hexes already owned by `wormhole-styles.ts` | None | **Pressable Chip variant approved 2026-07-25** (over a Segmented multi-select mode) | S | A1 |

### Fields & search (1 class — otherwise clean)

| ID | Primitive | Bypass site(s) | Bypass form | Rail today | Rail gap | Size | Disposition |
|---|---|---|---|---|---|---|---|
| AD-010 | Stepper | 1 file (MeAdjuster: 2 raw inputs, StepButton, hand-written commit/clamp/wheel model) | ME/TE stepper re-implemented by hand; the file's own comment concedes it duplicates the Runs Stepper | `inputClass` const ban only | Stepper `inline` variant + revert/trailing slot, then a raw-`<input>` ban | S | A1 |

Clean (recorded): visible raw `<input>` 2 (both MeAdjuster = AD-010; zero
others), raw `<textarea>` 0, raw `<select>` 0 (rail holds), checkbox/radio 0,
search wells 0, `.dd-*` CSS already retired (PR #221), submit buttons 9/9 on
Button, `buttonVariants` misuse 0, Base UI `render=` escape hatches 0.

Hidden-field exempt class (the raw-`<input>` rail's only permitted carve-out):
12 `type="hidden"` server-action inputs across 7 files (RetryJobForm ×2,
RoleToggleForm ×3, AdminReassignCharacterForm ×2, AdminUnlinkCharacterForm ×2,
AdminForceLogoutForm, UnlinkCharacterForm, SwitchCharacterForm) — each listed
in the rail's exemption encoding.

### Loading & status (7 classes)

| ID | Primitive | Bypass site(s) | Bypass form | Rail today | Rail gap | Size | Disposition |
|---|---|---|---|---|---|---|---|
| AD-011 | LoadingLabel | 5 sites (character-strip-section, HomeRosterPanel, TemplatesMenu, live-character-card; OpsSection marginal) | Loading copy in hand-rolled spans (one re-states LoadingLabel's recipe minus font-mono) | None | Loading-literal detection is judgment-grade (warn-level with allowlist) | S | A1 |
| AD-012 | Skeleton | 2 sites (RunAsFrame:55, LoginButton:121) | Placeholder boxes with no shimmer and no `role="status"` — silent to assistive tech | None | `animate-pulse`/`skeleton-shimmer` scoping ban (currently vacuous, preventive) | S | A1 |
| AD-013 | EmptyState | 7 sites (RosterCard — leaks the `text-empty` token, OpsSection ×2, CockpitRawLedger, NodeCard, HomeRosterPanel, SectionUnavailable) | "No …" copy in ad-hoc muted divs; loses the region contract | None | `text-empty` token-scope ban is mechanically available | S/M | A1 |
| AD-014 | Banner/Callout | 4 sites (FeedbackModal hand-rolled live region, OpsSection headline, CustomStructureBuilder error, HomeRosterPanel) | Tone-colored notice blocks; Banner has only one real consumer | None | `role="alert\|status"` outside ui/ is detectable | S | A1 |
| AD-015 | ProgressBar | 1 site + CSS (IndustryJobBar + `.industry-bar*`) | Verbatim ProgressBar duplicate including the `--pct` CSSOM idiom | None | Scope `--pct`/fill classes to the primitive | S | A1 |
| AD-016 | Dot/StatusDot | 4 sites (StatusRow `DOT_CLASS`, MarketScorePanel, HomeLiveStats, `.sites-type .dot` CSS family) | Root cause: Dot exposes only 2 tones / 1 size — the bypasses are forced. Widen first, migrate, then ban | None | Primitive widening precedes the rail | S | A1 |
| AD-017 | Pill/Chip/Kbd | 3 classes (GlobalSearch SearchHints keycap — Kbd exists in the same file, CockpitKpis RegionalDiscountBadge, `.status-chip` CSS) | Hand-rolled bordered/toned badge shapes | None | Pill/chip token-scope ban (currently vacuous, preventive) | S | A1 |

Clean (recorded): Suspense fallbacks 32/32 conformant (19 LoadingLabel-rooted,
6 Skeleton-rooted, 6 deliberate `null`, 1 real-component stand-in),
`animate-pulse` 0, `toast.loading` 0 outside the primitive, QtyRing 0,
pill/chip token leaks 0, route-level `loading.tsx` none (all streaming is
explicit `<Suspense>`).

### Overlays, tables, section chrome (8 classes)

| ID | Primitive | Bypass site(s) | Bypass form | Rail today | Rail gap | Size | Disposition |
|---|---|---|---|---|---|---|---|
| AD-018 | Tooltip/Popover | 16 sites / 12 files | Native `title=` attribute hover hints — no touch/keyboard access, OS-styled panel | Base UI import rail (library only) | No `title=` selector. The 5 disabled-control sites (account form buttons) are **EX — approved 2026-07-25** (JS tooltips fire no pointer events on disabled controls) | M | A1 (5 sites EX) |
| AD-019 | StaticTable (new) | 7 raw `<table>` / 5 files, all `src/app/admin/**` (MetricTable, OpsSection ×3, StatusStrip, GscCoverageSection, access/page) | Semantic static tables with hand-repeated cell classes. Raw `<table>` is better a11y than grid-divs — **StaticTable primitive approved 2026-07-25** | None | New primitive + `<table>` ban outside it | S | A1 |
| AD-020 | Row/EntityRow | 6 sites / 6 files (SkillQueuePanel reproduces EntityRow verbatim, JobRowFrame, CockpitRawLedger, IndustryRow, GrantedScopesList, NodeCard) | Hand-built `grid-cols-[…] border-t border-border-soft` rows | None | Row-signature selector | S | A1 |
| AD-021 | SectionHeader | 15 sites / 7 files, all `src/app/admin/**` | Mid-card sub-headers hand-repeating the header recipe; the primitive lacks a sub-header variant | None | Variant addition + class-string selector | M | A1 |
| AD-022 | SectionLabel | 7 sites / 4 files (industry-planner) | Label typography verbatim minus the `//` glyph; the primitive hardcodes the prefix | None | Prefix opt-out (or exported const) + selector | S | A1 |
| AD-023 | PageHead | 14 sites / 11 files (≈6 real after exemptions; admin/access user page duplicates the h1 class byte-for-byte; legal `SECTION_HEAD` const) | Hand-styled h1/h2 title frames | None | Heading-const ban (generalize `inputClassSelectors`); 3.10.4.2 may re-tune sizes after adoption | M | A1 (sizing → A2) |
| AD-024 | Card | 10 sites / 10 files (admin SectionFallback verbatim, HomeLiveStats, HeroCard, kpi-tile, …) | Ad-hoc `border border-border bg-section` surfaces; 2 `<li>` cases blocked by missing polymorphism | None | Card element polymorphism + surface selector | S | A1 |
| AD-025 | Collapsible | 3 feature sites (SiteCard, CodeExcerpt — documented opt-out; SitesTable sanctioned by SortableTable's own API) | Raw `<details>` re-stating the marker-hiding incantation; prose guidance reads as sanctioning it | Prose only | Unstyled Collapsible opt-out vs recorded idiom — session plan resolves | S | A1 |

Clean (recorded): hand-rolled dialogs/backdrops/menus/dropdown
panels/portals/overlay-ARIA 0; pagination and tabs unadopted but unbypassed;
PageShell 22/22 routes (18 direct, 4 via layout); section/page footers clean;
`use-cssom-tooltip` correctly fenced (chart-only, sanctioned by
`src/AGENTS.md`). PageHead route adoption 19/22 rendered; `/`,
`/industry/[id]`, `/sites/[id]` carry documented deliberate alternatives and
`/preview/cards` is sandbox — recorded exemptions, not bypasses.

### Legacy CSS families (`src/app/globals.css`: ~1,145 page-scoped lines of 1,792)

| ID | Family | ~lines | Superseded by | Size | Disposition |
|---|---|---|---|---|---|
| AD-026 | `.sites-*` filter rail (chips, types, reset) | ~100 | Pressable Chip + widened Dot + `wormhole-styles.ts` (removes duplicated tone hexes) | M | A1 (with AD-009/016) |
| AD-027 | `.sites-card-*` inner layout | ~54 | Tailwind/Row/Pill (Card chrome already migrated) | S | A1 |
| AD-028 | `.industry-hint` | ~30 | TerminalSearch/Combobox (cursor keyframe stays) | S | A1 |
| AD-029 | `.industry-mono/-bp` | ~18 | Chip/Pill + `industry-styles.ts` (removes hardcoded hexes) | S | A1 |
| AD-030 | `.industry-jobs*` grid table | ~45 | SortableTable or the AD-019 StaticTable | S | A1 |
| AD-031 | `.legal-prose` + `.devlog-prose` duplication | ~131 total | **Shared Prose primitive — approved 2026-07-25** (two real consumers) | M | A1 |
| AD-032 | `.contact-*` | ~62 | Card/Row/SectionLabel | S | A1 |
| AD-033 | `.changelog-*` | ~118 | **Feature-owned conversion approved 2026-07-25** — no new Timeline primitive (single consumer) | M | A1 |
| AD-034 | `.account-menu-*` | ~57 | `dropdown-panel.ts` vocabulary (already duplicates it) | S | A2 (header cluster — restyled by group B) |
| AD-035 | `.nav-tool*`/`.nav-menu*` cell skins | ~108 | NavigationMenu/Menu ownership | M | A2 (group B's header restraint rewrites these) |
| AD-036 | Dead selectors (`.tile-desc`, `.tool-tile-soon`) | ~6 | Delete | S | A1 |
| AD-037 | `.tool-tile*` | ~40 | Card hover variant | S | A1 |
| AD-038 | Misc: `.sites-grid`, `.sites-table-row`, `.status-chip`, `.body-copy`, `.hero-wordmark` | ~50 | Inline Tailwind / Pill / small utilities | S | A1 |
| AD-039 | Primitive-serving CSS relocation into primitives (`.skeleton-shimmer`, `.status-led`, `.progress-fill`, …; keyframes stay) | ~278 | Housekeeping only | M | **BL — approved 2026-07-25** |

Keep as-is (recorded, not bypasses): `.page-backdrop`, the print block,
chart/progress CSSOM patterns, `.app-header` (a Floating-UI anchor),
`.hover-bob`, `.field-own-focus`, the sonner override, `.sites-lightbox` zoom,
`.content-browser-*` (recomposed by 3.10.4.2's drawer work, not retired in
3.10.4.1). **Keep-as-is is an adoption verdict only** — group B's
header-restraint and reduced-motion work may deliberately restyle
`.app-header`/`.hover-bob`; the 3.10.4.3 re-audit must not read those approved
changes as drift.

### Rails & enforcement (meta-rows)

| ID | Item | Detail | Disposition |
|---|---|---|---|
| AD-040 | Rail package for every migrated family | Element bans (`button`, `input`, `textarea`, `table`), class-constant bans (generalized from `inputClassSelectors`), token-scope bans (`text-empty`, pill/chip tokens, `--pct`, `skeleton-shimmer`, `toast.loading`), `title=`/`aria-pressed`/`role=button` selectors — each with narrowly encoded exemptions, same-PR with its migration | A1 |
| AD-041 | Repeatable adoption census gate | A census over the recorded detection patterns (the `vendor-resilience.test.ts` model) plus a CSS-family checker (no stylelint exists — assert no unexpected class families in `globals.css` outside an allowlist). 3.10.4.1 ships it with `.account-menu-*`, `.nav-tool*`/`.nav-menu*`, `.content-browser-*` on a declared temporary allowlist; 3.10.4.2 shrinks it. Retires `scripts/audit_ui_system.py` (one-shot, non-gating, disagrees with this survey on two rows) | A1 |
| AD-042 | Preview ESLint block bug | The `src/app/preview/**` override silently drops 4 selector families (`select`, `inputClass`, `textSize`, `roundedSize`) — flat-config replacement drift; only the hex lift is documented | A1 (bug fix) |
| AD-043 | CONTRIBUTING.md untrue claim | States Button/`buttonVariants` are "lint-enforced"; no such rule exists. Becomes true when AD-040 lands | A1 |

### Per-primitive rail status (complete roster, required by the master plan)

Full rail: `select` (element-level `no-restricted-syntax` ban, 9 scope blocks).

Partial/indirect rail only: `input` (class-const ban; no element ban),
`dialog`, `confirm-dialog`, `popover`, `menu`, `navigation-menu`, `tooltip`,
`tabs`, `combobox`, `toast` (Base UI/sonner import allowlists — library
access, not hand-rolling), `collapsible` (CSS attribute contract),
`status-dot`/`skeleton`/`progress-bar` (CSS-class seam owned by the primitive
but unenforced).

No rail: `button`, `field`, `checkbox`, `radio-group`, `switch`, `stepper`,
`segmented`, `pill`, `chip`, `dot`, `loading-label`, `loading-toast` (token
unguarded), `card`, `section-header`, `section-label`, `section-footer`,
`sortable-table`, `pagination`, `terminal-search`, `page-shell` (convention
only), `page-head`, `page-footer`, `banner`, `callout`, `empty-state`,
`qty-ring`, `copy-button`, `kbd`, `access-gate`, `live-price`, `url-sync`.

The chart family (`src/components/ui/chart/`, sparkline, trend/bar/
distribution/stacked-share/multiples/annotated-daily) is explicitly sanctioned
as its own visx+CSSOM dialect (`src/AGENTS.md`) and is out of Phase 4 adoption
scope. AD-041's census covers every unrailed primitive preventively, including
those with no current bypass.

## Approved operator decisions (2026-07-25)

1. Scroll-aware section links: **backlog with citation** (this survey + master
   plan §Outcome group B). The static layered rail (guide + marker + wash)
   ships in 3.10.4.2; the heading-registration/IntersectionObserver section
   model is deferred.
2. Compact/dense Segmented variant: **approved** (AD-008).
3. Multi-select toggle shape: **pressable Chip variant** (AD-009).
4. StaticTable primitive: **approved** (AD-019/030 — 8 live consumers).
5. Shared Prose primitive: **approved** (AD-031).
6. Changelog family: **feature-owned conversion, no Timeline primitive** (AD-033).
7. Disabled-control `title=` hints: **recorded exemption** (AD-018 subset, 5 sites).
8. AD-039 primitive-serving CSS relocation: **backlog**.
9. Primitive interaction behavior, including Stepper: **adopt the Base UI
   behavior** (approved 2026-07-26). Small visual differences are acceptable in
   3.10.4.1; appearance refinement remains owned by 3.10.4.2/3.

Survey corrections recorded during execution: AD-008's second toggle is
`RawItemToggle`, not `InputCostBasis`. `RetryJobForm` owns two hidden
server-action inputs but is not one of AD-018's disabled-title exceptions; the
five title exceptions are the account forms named by the adoption registry.

## 3.10.4.1 delivery ledger — 2026-07-26

Every A1 row has an explicit delivery mark below. A2, BL, and EX dispositions
remain owned by their recorded later slice or exemption.

| ID | Status | Delivery evidence |
|---|---|---|
| AD-001 | Delivered | Inline actions consume Button; the CCP SSO button is registry-pinned. |
| AD-002 | Delivered | Action class constants were removed; Stepper owns its controls. |
| AD-003 | Delivered | Sites reset and industry hint consume Button; legacy CSS retired. |
| AD-004 | Delivered | Action links consume `buttonVariants`; Pill/Chip stay informational. |
| AD-005 | Delivered | The planner disclosure consumes the shared primitive behavior. |
| AD-006 | Delivered | NodeCard uses a native Button overlay; role-button model removed. |
| AD-007 | Delivered | Admin access navigation consumes `buttonVariants`. |
| AD-008 | Delivered | Both CockpitKpis groups consume compact Segmented. |
| AD-009 | Delivered | Site multi-select filters consume ChipToggle and Dot. |
| AD-010 | Delivered | MeAdjuster consumes inline Stepper with Base UI behavior. |
| AD-011 | Delivered | Loading copy consumes LoadingLabel where a loading label is intended. |
| AD-012 | Delivered | Silent placeholder boxes consume Skeleton. |
| AD-013 | Delivered | Recorded no-data surfaces consume EmptyState. |
| AD-014 | Delivered | Recorded notices consume Banner. |
| AD-015 | Delivered | Industry job completion consumes ProgressBar. |
| AD-016 | Delivered | Dot owns the widened status-tone and size vocabulary. |
| AD-017 | Delivered | Search hints, discount, and server status consume Kbd/Pill/Dot. |
| AD-018 | Delivered | Accessible hints consume Tooltip; six exceptions are registry-pinned. |
| AD-019 | Delivered | All recorded admin tables consume StaticTable. |
| AD-020 | Delivered | Recorded repeated rows consume EntityRow. |
| AD-021 | Delivered | Admin subheaders consume the SectionHeader sub variant. |
| AD-022 | Delivered | Planner labels consume SectionLabel without a forced prefix. |
| AD-023 | Delivered | Duplicate route heading chrome consumes PageHead. |
| AD-024 | Delivered | Recorded surfaces consume Card, including polymorphic list items. |
| AD-025 | Delivered | Site cards consume Collapsible; two native contracts are pinned. |
| AD-026 | Delivered | Sites filter rail CSS retired in favor of ChipToggle and Dot. |
| AD-027 | Delivered | Site-card inner layout moved to primitives and utilities. |
| AD-028 | Delivered | Industry hint CSS retired in favor of Button and utilities. |
| AD-029 | Delivered | Industry mono badge consumes Chip; legacy family retired. |
| AD-030 | Delivered | Industry jobs grid consumes StaticTable. |
| AD-031 | Delivered | Legal and devlog reading surfaces consume shared Prose. |
| AD-032 | Delivered | Contact layout consumes Card, EntityRow, and SectionLabel. |
| AD-033 | Delivered | Changelog family is feature-owned utility composition. |
| AD-036 | Delivered | Dead tile selectors were deleted. |
| AD-037 | Delivered | Home tool tiles consume Card hover composition. |
| AD-038 | Delivered | Miscellaneous recorded families retired or narrowed to sanctioned seams. |
| AD-040 | Delivered | ESLint enforces element, semantic, recipe, and token adoption rails. |
| AD-041 | Delivered | Registry-backed TypeScript census and CSS-family gate replace the audit script. |
| AD-042 | Delivered | Preview restores select/input-class rails and carries all new adoption bans. |
| AD-043 | Delivered | CONTRIBUTING now describes the enforced primitive contract truthfully. |

## 3.10.4.3 adoption re-audit — 2026-07-26

The closing audit used the approved PD-3 supersession map: mechanical rails
replace the greps they now own, while the judgment-grade appendix searches were
rerun against current production source. Deliberate 3.10.4.2 presentation
changes to the retained header, content browser, and hover treatments are
approved evolution, not adoption drift.

| Family | Method | Current result | Diff against the approved survey |
|---|---|---|---|
| Syntax and token adoption | `pnpm lint`; `pnpm test scripts/ui-adoption-rail.test.mjs` | Pass: zero lint warnings; 62/62 syntax-rail tests pass in production and preview scopes. | Supersedes the raw button/input/table/details, native-title, semantic-role, action-recipe, and primitive-token greps. No rail weakened. |
| Exception and CSS-family census | `pnpm test src/esi-datasets/ui-adoption.test.ts` | Pass: 9/9 census tests; no unexpected or dead CSS family, and every surviving exception exactly matches the registry. | Temporary CSS allowlist is empty. The exact surviving set is one provider-owned raw button, two native-details owners, seven hidden-input owners, one native-title owner, five disabled-control title owners, and eight retained CSS families. |
| Loading language | Recorded loading-literal grep, excluding tests and primitive internals | 35 candidates inspected; zero actionable residue. They are primitive consumers, content-shaped fallback labels, state/view-model vocabulary consumed by a primitive, accessibility labels, or comments. | RA-001 restored the Templates popover to AD-011's delivered `LoadingLabel` state; no other new bypass. |
| Heading chrome | Recorded `<h1>`…`<h6>` grep | 16 candidates inspected; zero residue. They are the recorded route alternatives, prose/content headings, dialog semantics, preview examples, or screen-reader-only page identities. | PageHead adoption remains at the approved destination; no ad-hoc heading family returned. |
| Arbitrary grid signatures | Recorded `grid-cols-[` grep | 27 candidates inspected; zero residue. Row consumers use the shared row/table APIs; survivors are unique layout geometry, primitive parameters, or the NodeCard asset sub-ledger. | AD-020 remains delivered; no repeated row recipe reappeared. |
| Authored ARIA roles | Recorded role sweeps | One production candidate outside primitives: the labelled PageMenu settings `role="group"`; zero residue. | No hand-built action, alert/status, overlay, table, or tab semantics returned. |
| Suspense boundaries | Recorded `Suspense` census plus fallback inspection | 35/35 conformant: 24 content-shaped fallbacks, 2 compact `LoadingLabel` fallbacks, 8 deliberate `null` holes, and 1 real-component stand-in. | The former 32-boundary census grew by three honest holes while the stronger shape-preserving policy replaced most compact labels; no shell regressed. |
| Rails inventory | ESLint rail plus both census suites above | Zero unrailed bypass and zero silent exemption change. | AD-040, AD-041, AD-042, and AD-043 remain delivered. |

Terminal marks carried forward:

- **AD-034 / AD-035 — Delivered:** 3.10.4.2 retired the account/nav family
  bypasses; the CSS-family census proves they did not return.
- **AD-039 — Backlogged:** primitive-serving CSS relocation remains deferred
  under the approved survey decision; no re-disposition occurred.
- **AD-018 EX subset — Reconfirmed:** the five disabled-control title owners
  remain exact, and the separate `NavTools` native-title exemption remains
  registry-pinned to its cited navigation backlog.

### Re-audit residue

| ID | Family / survey row | Evidence | Required disposition | Status |
|---|---|---|---|---|
| RA-001 | Loading presentation / AD-011 | `TemplatesMenu` rendered `templatesEmptyLine(...plans: null)` as a plain muted `<p>`, although AD-011 records this site as migrated to `LoadingLabel`. | Operator directed the existing-primitive fix; the in-flight branch now renders `LoadingLabel`, while settled empty/error copy retains the paragraph treatment. | Fixed; zero accepted residue |

## Appendix — recorded detection methods (re-audit contract)

Run from the repository root. Quote `--include` patterns under zsh. Suffix
every pattern with `| grep -v '\.test\.'` and, where primitive internals are
excluded, `| grep -v '^src/components/ui/'`. The 3.10.4.3 re-audit re-runs
these per family and diffs against this record; rails added by 3.10.4.x may
supersede a grep with a lint/test gate, in which case the gate is the method.

Actions/toggles:

```
grep -rn '<button' src --include='*.tsx' --include='*.ts'
grep -rn 'buttonVariants' src --include='*.tsx' --include='*.ts'
grep -rn 'render={<button\|render={<a' src --include='*.tsx'
grep -rn 'aria-pressed' src --include='*.tsx' --include='*.ts'
grep -rn 'role="group"\|role="radiogroup"\|role="tablist"' src --include='*.tsx'
grep -rn 'type="submit"\|formAction' src --include='*.tsx'
```

Fields/search:

```
grep -rn '<input\|<textarea\|<select\|<option' src --include='*.tsx'
grep -rn 'type="hidden"' src --include='*.tsx'
grep -rn 'type="search"\|role="combobox"\|role="searchbox"\|role="listbox"\|role="option"\|contentEditable' src --include='*.tsx'
grep -rn 'appearance:textfield\|spin-button' src --include='*.tsx' --include='*.css'
```

Loading/status:

```
grep -rn 'animate-pulse\|shimmer' src
grep -rniE '(>|["'"'"'`])\s*(loading|fetching|syncing|updating|refreshing|please wait|working)\b' src --include='*.tsx' --include='*.ts'
grep -rn 'Suspense' src --include='*.tsx'
grep -rnE 'toast\.(loading|success|error|info|message|dismiss)' src --include='*.tsx' --include='*.ts'
grep -rnE '(bg|text|border)-(pill|chip)-' src --include='*.tsx' --include='*.ts'
grep -rnE 'size-(2|\[[0-9]+px\]|1\.5)[^>]*rounded-full|rounded-full[^>]*size-(2|\[[0-9]+px\])' src --include='*.tsx'
grep -rn 'text-empty' src --include='*.tsx' --include='*.ts'
grep -rnE 'role="(alert|status)"' src --include='*.tsx'
grep -rnE 'industry-bar|progress-fill|--pct' src --include='*.tsx' --include='*.ts'
```

Overlays/tables/section chrome:

```
grep -rn 'title=' src --include='*.tsx'
grep -rnE '\b(fixed|absolute)\b[^"`]*\binset-0' src --include='*.tsx'
grep -rnE 'role="(dialog|alertdialog|menu|menuitem|tooltip|listbox|table|row|grid|tab|tablist)"' src --include='*.tsx'
grep -rn 'createPortal' src --include='*.tsx'
grep -rnE '<(table|thead|tbody|tfoot|tr|td|th)\b' src --include='*.tsx'
grep -rn 'grid-cols-\[' src --include='*.tsx'
grep -rnE 'text-label tracking-display uppercase text-muted' src --include='*.tsx'
grep -rnE '<h[1-6]\b' src --include='*.tsx'
grep -rnE 'rounded-card|border border-border' src --include='*.tsx'
grep -rnE '<(details|summary)\b' src --include='*.tsx'
```

Legacy CSS census:

```
grep -n "^\." src/app/globals.css
grep -n "^  \.[a-z]" src/app/globals.css
grep -rn --include='*.tsx' --include='*.ts' "<family-prefix>" src/
```

Rails inventory:

```
grep -nE 'selector:|files:|no-restricted-(syntax|imports)|paths:|patterns:' eslint.config.mjs
find src -name "*-styles.ts"
ls scripts/*.test.mjs
```
