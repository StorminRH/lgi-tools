# Wave 7: UI kit primitives (src/components/ui)

Part of the [primitive extraction guide](README.md). Audit of `e5b7b17` on 2026-10-09; line ranges drift, so re-open each site before editing.

← [Wave 6: Config, env, ids and shared domain vocabularies](wave-06-config-env-ids-and-shared-domain-vocabularies.md) · [Index](README.md#roadmap) · [Wave 8: Charts, images and board/workspace adoption](wave-08-charts-images-and-board-workspace-adoption.md) →

Simplify, then complete, the ui kit. P319 removes single-value tone variants first, so P022 (Chip→Pill and ChipToggle) and P001 (dialog kit) build on clean primitives. CheckIcon/CloseIcon and the glass-chip utility land before the dialog kit. Then come the overlay portals, labelled Checkbox/Switch and Field, CollapsibleChevron, decorative Skeleton, next/link SegmentedControl, HelpPopover, StatFigure, SectionPanel, SectionNote, CardLink/ExternalLink, DistributionBars subline, SwitcherMenu, view-transition CSS and the combobox pick helper. P123 lands the longest section match, and P320 and P024 consume it. PreferenceControl and StatusPanel follow. The dialog test stub and confirm gate come last, against the final dialog API.

| Status | ID | Item | Category | Effort | Risk | Payoff | Depends on |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ☐ | [P319](#p319) | Remove the single-value tone variants from Menu, PointerMenu, NavigationMenu, Dialog and SegmentedControl, and split ChipToggle into ChipToggle and ToggleRow | simplification | S | low | low | — |
| ☐ | [P022](#p022) | Delete Chip, render every tinted label with Pill, and build ChipToggle on pillVariants | ui-component | M | low | medium | [P319](#p319) |
| ☐ | [P041](#p041) | Draw every check and close mark with ui/icons CheckIcon and CloseIcon | ui-component | S | low | low | — |
| ☐ | [P053](#p053) | Route the ui chip glass through a globals.css glass-chip utility and the --glass-* knobs | css-styling | S | low | low | — |
| ☐ | [P001](#p001) | Complete the ui/dialog kit (DialogBody, DialogFooter, DialogCloseButton, closeDisabled, displayTitle) and route hand-built dialog chrome through it | ui-component | M | low | high | [P319](#p319), [P041](#p041) |
| ☐ | [P019](#p019) | Portal every Base UI popup into the enclosing dialog, and share the pop-in transition | ui-component | S | medium | medium | — |
| ☐ | [P021](#p021) | Give Checkbox and Switch a visible-label row, and let the existing Field label Select and PercentInput | ui-component | M | medium | low | — |
| ☐ | [P006](#p006) | Export CollapsibleChevron from ui/collapsible and make it the only data-chevron owner (fixes 4 missing aria-hidden) | ui-component | S | low | medium | — |
| ☐ | [P018](#p018) | Make Skeleton decorative unless labelled, and add a SkeletonGroup status region for composite fallbacks | ui-component | S | low | medium | — |
| ☐ | [P020](#p020) | Render SegmentedControl's link mode with next/link and drop Pagination's unused href mode | ui-component | S | low | low | — |
| ☐ | [P007](#p007) | Promote KpiHelp to ui/help-popover.tsx as HelpPopover and replace NetWorthHelp and the AccountDangerZone (?) trigger | ui-component | S | low | medium | — |
| ☐ | [P016](#p016) | Move StatFigure to ui and replace ComponentDrawer's private Stat and AttributesSection's inline copy with it | ui-component | S | low | low | — |
| ☐ | [P002](#p002) | Promote board SectionPanel to ui and use it for the 40 hand-built Card + SectionHeader cards | ui-component | M | low | medium | — |
| ☐ | [P017](#p017) | Expose SectionBody's note as SectionNote for board and workspace panels, and use EmptyState and LoadingLabel where they are bypassed | ui-component | S | low | medium | [P002](#p002) |
| ☐ | [P034](#p034) | Move CardLink to ui, add ui ExternalLink and an inlineLink class, and make MultiplesCell children optional | ui-component | M | low | medium | — |
| ☐ | [P036](#p036) | Render the admin GSC top-term lists with DistributionBars plus a new subline field | ui-component | S | low | low | — |
| ☐ | [P023](#p023) | Extract SwitcherMenu and a shared float icon trigger for the profile and map switchers | ui-component | S | low | low | — |
| ☐ | [P057](#p057) | Move the document-wide view-transition reduced-motion rule to globals.css and share the board/industry view-transition fade keyframes | css-styling | S | low | low | — |
| ☐ | [P039](#p039) | Standardise search-field picks on Base UI's item-press change with one ui helper, and drop the redundant input attributes | ui-component | M | medium | medium | — |
| ☐ | [P123](#p123) | Route tool-nav activation and page-settings resolution through sectionMatches | generic-utility | S | low | low | — |
| ☐ | [P320](#p320) | Use lib/section-path for every route-segment match, add a longest-match helper, and merge the telemetry payload helper into the client | simplification | S | low | medium | [P123](#p123), [P066](wave-03-src-lib-primitives-collections-math-async.md#p066) |
| ☐ | [P024](#p024) | Add NavRailLayout beside NavRailFrame and one longest-prefix matchSection in lib/section-path | ui-component | S | low | low | [P123](#p123) |
| ☐ | [P013](#p013) | Extract PreferenceControl, the MenuControlModel-bound control, and use it in the settings page and the page menu | ui-component | S | low | medium | [P128](wave-03-src-lib-primitives-collections-math-async.md#p128) |
| ☐ | [P015](#p015) | Extract a StatusPanel for the error and 404 route states, and use LoadFailed for the map catalogue failure | ui-component | S | low | low | — |
| ☐ | [P043](#p043) | Share one static Base Dialog stub for markup tests and drop redundant Button stubs | testing | S | low | low | [P001](#p001) |
| ☐ | [P056](#p056) | Move the confirm gate next to ConfirmDialog in ui with a retained target, and adopt it for the map confirmations (drop useAsyncAction) | react-hook | M | low | low | [P001](#p001) |

<a id="p319"></a>

## P319: Remove the single-value tone variants from Menu, PointerMenu, NavigationMenu, Dialog and SegmentedControl, and split ChipToggle into ChipToggle and ToggleRow

- **Status:** [ ] not started
- **Category:** simplification · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -60 / +15
- **Depends on:** —

**Problem.** Five ui primitives declare a one-member tone type and thread it through a cva variant that maps it to '' or to one fixed class string. SegmentedControl also passes it into ToggleSegments only to select a compound variant. ChipToggle has three appearances: 'filter' renders the same as the default since the glass restyle, while the preview still documents a difference. 'row' shares no chip styling and ignores the required tone prop, which keeps a dead SITE_TYPE_CHIP_TONE map alive in the wormhole-sites feature.

**Verifier revision.** Confirmed on every cited site. MenuTone, PointerMenuTone, NavigationMenuTone and DialogTone each have the single member 'neutral', and SegmentedTone has only 'green'. A multiline grep found no production or test consumer that passes tone to Menu, PointerMenu, NavigationMenu, Dialog, ConfirmDialog's inner Dialog, SidePanel or SegmentedControl, and none of the tone types is imported outside its own file. ChipToggle 'filter' produces exactly the same classes as 'tone': commit 5be6df4 merged the two branches into `appearance !== 'row'`. The verifier adds three items. (a) The preview note at choices.tsx:146 still says 'filter lights up when pressed', which no longer describes any difference, so the docs drifted. (b) The 'row' appearance ignores its required `tone` prop, so SitesFilterLayout.tsx:138 passes SITE_TYPE_CHIP_TONE for nothing. That map (wormhole-styles.ts:30-36) has no other reader and holds the same values as SITE_TYPE_DOT_TONE, so it becomes dead and must be deleted. (c) The change touches the features and app zones as well as ui.

**Sites (11).**

- [`src/components/ui/menu.tsx:16-31, 46, 63, 95`](../../src/components/ui/menu.tsx#L16-L31) — MenuTone = Extract<Tone,'neutral'> maps to ''; the surface variant stays
- [`src/components/ui/pointer-menu.tsx:10-23, 33, 47, 71`](../../src/components/ui/pointer-menu.tsx#L10-L23) — PointerMenuTone maps to ''
- [`src/components/ui/navigation-menu.tsx:7-18, 65, 70, 75`](../../src/components/ui/navigation-menu.tsx#L7-L18) — NavigationMenuTone maps to ''
- [`src/components/ui/dialog.tsx:14-33, 40, 50, 67`](../../src/components/ui/dialog.tsx#L14-L33) — DialogTone's one option carries the real glass classes
- [`src/components/ui/segmented.tsx:8-39, 75, 83, 96, 105, 113, 121, 145`](../../src/components/ui/segmented.tsx#L8-L39) — SegmentedTone = 'green'; the active style lives in a tone×active compoundVariant
- [`src/components/ui/chip-toggle.tsx:36-70`](../../src/components/ui/chip-toggle.tsx#L36-L70) — Nothing checks for 'filter', so it renders like 'tone'; 'row' never reads tone
- [`src/features/wormhole-sites/components/SitesFilterLayout.tsx:113-121, 135-151`](../../src/features/wormhole-sites/components/SitesFilterLayout.tsx#L113-L121) — The only production ChipToggle consumer: appearance='filter' for classes, appearance='row' with a dead tone
- [`src/features/wormhole-sites/components/wormhole-styles.ts:30-36`](../../src/features/wormhole-sites/components/wormhole-styles.ts#L30-L36) — SITE_TYPE_CHIP_TONE is read only by the row ChipToggle's ignored tone and duplicates SITE_TYPE_DOT_TONE (38-44)
- [`src/app/(site)/preview/primitives/choices.tsx:143-170`](../../src/app/%28site%29/preview/primitives/choices.tsx#L143-L170) — Preview shows three appearances, and the note claims filter differs
- [`src/components/ui/confirm-dialog.tsx:57-66`](../../src/components/ui/confirm-dialog.tsx#L57-L66) — Its own danger/neutral tone is NOT forwarded to Dialog, which confirms no Dialog tone consumer
- [`src/components/ui/side-panel.tsx:18-25`](../../src/components/ui/side-panel.tsx#L18-L25) — Overrides Dialog classes through className; ordering is kept if the tone classes fold into the base string

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/ui/switch.tsx:13-20`](../../src/components/ui/switch.tsx#L13-L20) — SwitchTone has green and neutral, and settings-control-row and PageMenuSection use tone='neutral'
- [`src/components/ui/popover.tsx:12-27`](../../src/components/ui/popover.tsx#L12-L27) — PopoverTone has neutral and green; the preview uses green
- [`src/components/ui/checkbox.tsx:19`](../../src/components/ui/checkbox.tsx#L19) — Multi-member tone that the preview enumerates
- [`src/components/ui/confirm-dialog.tsx:39, 54`](../../src/components/ui/confirm-dialog.tsx#L39) — danger/neutral is a real two-value tone

</details>

**Home.** `src/components/ui (menu.tsx, pointer-menu.tsx, navigation-menu.tsx, dialog.tsx, segmented.tsx, chip-toggle.tsx). Consumer edits in src/features/wormhole-sites/components and src/app/(site)/preview/primitives.`

**Boundary check.** The ui files lose their './tones' type imports and gain no imports, consistent with { from: 'ui', allow: [] }. SitesFilterLayout and wormhole-styles (zone features) import ToggleRow and ChipToggle from ui, which the features rule allows. The preview page (zone app) imports ui, which the app rule allows.

**API sketch.**

```ts
// menu.tsx: Menu props minus tone; popup = cva('flex flex-col outline-none', { variants: { surface }, defaultVariants: { surface: 'solid' } })
// pointer-menu.tsx: const popup = cn('flex flex-col outline-none', panelSurface)
// navigation-menu.tsx: const list = 'flex items-center gap-0.5 list-none m-0 p-0'
// dialog.tsx: popup base string += 'glass-dense glass-lit border border-border text-text font-ui rounded-panel shadow-dd'
// segmented.tsx: segment variants { active: { true: 'border-border-active bg-row-on text-isk shadow-card-edge', false: 'text-muted hover:text-text' }, density }
// chip-toggle.tsx
export function ChipToggle(props: { tone: ChipTone; value: string; children: ReactNode; className?: string }): JSX.Element;
export function ToggleRow(props: { value: string; children: ReactNode; className?: string }): JSX.Element;
```

**Migration steps.**

1. menu.tsx: delete MenuTone and the tone variant, drop the tone prop (46, 63), and call popup({ surface }) at 95. Remove the Tone import if nothing else uses it.
2. pointer-menu.tsx: delete PointerMenuTone, turn popup into a plain cn(...) string, and drop the tone prop (33, 47, 71).
3. navigation-menu.tsx: delete NavigationMenuTone, turn list into a string constant, and drop the tone prop.
4. dialog.tsx: delete DialogTone, append the neutral classes to the end of the cva base string (or make popup a plain string), and drop the tone prop. Keep cn(popup, className) so SidePanel's overrides still win.
5. segmented.tsx: delete SegmentedTone. Move the compound class into active.true, drop the tone prop from SegmentedControl (75, 83) and from ToggleSegments (113, 121), and change the segment(...) calls at 96 and 145 to segment({ active, density }).
6. chip-toggle.tsx: remove the appearance prop so ChipToggle always renders the chip look (cn(chipVariants({ tone }), 'chip-toggle cursor-pointer', !pressed && '[--pill-tone:var(--color-faint)] text-muted hover:text-name', className)). Add a ToggleRow export that renders a Toggle with the row classes and takes no tone.
7. SitesFilterLayout.tsx: drop appearance='filter' at 117. Replace the row ChipToggle at 135-151 with ToggleRow and drop tone={SITE_TYPE_CHIP_TONE[t]}. Remove the SITE_TYPE_CHIP_TONE import, then delete SITE_TYPE_CHIP_TONE from wormhole-styles.ts:30-36. Fallow unused-exports would flag it otherwise.
8. preview/primitives/choices.tsx: delete the 'filter' Variant, render the row Variant with ToggleRow, and rewrite the note at 146 to describe two primitives.

**Tests.** Existing guards: chip-toggle.test.ts (ChipToggleGroup only), dialog.test.ts and side-panel.test.ts (Dialog wiring with base-ui mocked), and the ui coverage.test.ts pins. Add to chip-toggle.test.ts: ChipToggle's className callback includes the faint override when unpressed and omits it when pressed; ToggleRow's callback adds 'bg-row-sites-on text-name' when pressed. Optionally add a segmented test asserting segment({ active: true }) contains 'text-isk'.

**Notes.** Rendering stays identical. Folding the variant classes into the base string keeps them ahead of the caller's className, so cn/twMerge still lets SidePanel's rounded-none and border overrides win. In segmented, moving the active classes from compoundVariants into the active variant only reorders classes inside cva; the cn() call with clearOnThumb at 145 still comes last, and twMerge (cn.ts, which knows text-nav and text-label as font sizes) does not treat text-isk as conflicting with them. For SitesFilterLayout the class chips look unchanged, because 'filter' and 'tone' already rendered alike. The drift is in the preview note, not in the code. Keep CLASS_CHIP_TONE: ChipToggle still reads it.

<sub>Reported by: area:ui-components.</sub>

<a id="p022"></a>

## P022: Delete Chip, render every tinted label with Pill, and build ChipToggle on pillVariants

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** About -75 / +15: chip.tsx (-34), two dead tone maps (-16), about 15 dead or retired CSS token lines, and Chip/ChipTone imports across 10 files
- **Depends on:** [P319](#p319)
- **Existing primitive:** `src/components/ui/pill.tsx:Pill,pillToneClasses`

**Problem.** Two ui label primitives (Chip, Pill) implement the same pill-soft tinted label with different hue tokens. Production uses them interchangeably for status tags, so one concept renders in two colours. EWAR tags are Pill in SiteCardHeader but Chip in EwarRow/NpcRow inside the same SiteCard. Admin roles are Chip on the users pages but Pill in the audit table. 'Active' is chip-green on settings but isk-green elsewhere. The ChipTone subset also forces lossy duplicate tone maps (CLASS_CHIP_TONE collapses C1=C2 and C4=C6, so the class filter disagrees with the card class pills) and a dead SITE_TYPE_CHIP_TONE map.

**Verifier revision.** The core claim holds. Chip and Pill share the pill-soft base and the same five tone names (ChipTone is a subset of Tone in tones.ts:17), and they differ only in hue tokens, 1px of vertical padding and shrink-0. The duplication is worse than the finder reported: the same concept renders in both palettes on the same screen. On one SiteCard, the header draws EWAR as Pill (SiteCardHeader.tsx:65-69, tone-blue #3399cc) while the wave rows in SiteDetailsBody draw the same EWAR keys as Chip (EwarRow/NpcRow, chip-blue #6688ff). The admin role badge is a Chip on the users list and detail pages, but the audit 'Change' column shows the same ADMIN/USER roles as Pill. Because ChipTone has only five hues, CLASS_CHIP_TONE folds C1/C2 into green and C4/C6 into purple, so the class filter no longer matches the class pills on the cards. SITE_TYPE_CHIP_TONE is dead input, because ChipToggle ignores tone when appearance='row'. The finder's 'second palette in pillToneClasses' option is wrong: it adds near-synonym tones and keeps two greens. The EWAR concern is already met, because Pill's palette has distinct blue/red/purple/green and production already uses it for EWAR on the card header. Revised design: delete Chip and use one palette.

**Sites (21).**

- [`src/components/ui/chip.tsx:8-34`](../../src/components/ui/chip.tsx#L8-L34) — chipVariants: pill-soft base, px-[9px] py-px, shrink-0, leading-[1.5]; chip-* hues; orange reuses dps-mid
- [`src/components/ui/pill.tsx:8-47`](../../src/components/ui/pill.tsx#L8-L47) — pillToneClasses (12 tones incl. the same 5 names) + private pillVariants sm px-[9px] py-[2px]
- [`src/components/ui/tones.ts:1-17`](../../src/components/ui/tones.ts#L1-L17) — ChipTone = Extract<Tone,'blue'\|'red'\|'purple'\|'green'\|'orange'>, so every ChipTone is a valid PillTone
- [`src/components/ui/chip-toggle.tsx:36-70`](../../src/components/ui/chip-toggle.tsx#L36-L70) — ChipToggle styles via chipVariants({tone}); appearance='row' ignores tone entirely
- [`src/app/globals.css:241-257`](../../src/app/globals.css#L241-L257) — chip-* hue tokens; the -bg/-border tokens and chip-pressed-bg have no consumers anywhere in src
- [`src/features/wormhole-sites/components/SiteCardHeader.tsx:65-69`](../../src/features/wormhole-sites/components/SiteCardHeader.tsx#L65-L69) — EWAR keys rendered as <Pill tone={ChipTone}>
- [`src/features/wormhole-sites/components/site-card-header-view.ts:54, 69-72`](../../src/features/wormhole-sites/components/site-card-header-view.ts#L54) — ewarPills typed ChipTone but fed to Pill
- [`src/features/wormhole-sites/components/EwarRow.tsx:20-26`](../../src/features/wormhole-sites/components/EwarRow.tsx#L20-L26) — Same EWAR keys rendered as Chip (different hues) inside the same SiteCard via SiteDetailsBody/WaveCard
- [`src/features/wormhole-sites/components/NpcRow.tsx:35-42`](../../src/features/wormhole-sites/components/NpcRow.tsx#L35-L42) — EWAR + trigger label as Chip
- [`src/features/wormhole-sites/components/wormhole-styles.ts:4-36, 56-72`](../../src/features/wormhole-sites/components/wormhole-styles.ts#L4-L36) — CLASS_TONE vs CLASS_CHIP_TONE (C2 green-strong vs green, C4 magenta vs purple); SITE_TYPE_TONE vs SITE_TYPE_CHIP_TONE; EWAR_TONE/TRIGGER_CHIP_TONE typed ChipTone
- [`src/features/wormhole-sites/components/SitesFilterLayout.tsx:106-153`](../../src/features/wormhole-sites/components/SitesFilterLayout.tsx#L106-L153) — Class filter uses CLASS_CHIP_TONE; type filter passes SITE_TYPE_CHIP_TONE to appearance='row' where tone is unused
- [`src/app/(site)/admin/users/access-view.ts:22-47`](../../src/app/%28site%29/admin/users/access-view.ts#L22-L47) — adminRoleBadge and deriveAuditRowView use the same purple/blue role tones
- [`src/app/(site)/admin/users/page.tsx:89, 119-121`](../../src/app/%28site%29/admin/users/page.tsx#L89) — Role as Chip in the list, the same roles as Pill in the audit Change column
- [`src/app/(site)/admin/users/[userId]/page.tsx:78-82, 170-174`](../../src/app/%28site%29/admin/users/[userId]/page.tsx#L78-L82) — Selected/health and identity chips as Chip next to neutral Pills
- [`src/app/(site)/admin/users/[userId]/user-detail-view.ts:1-7, 29-32`](../../src/app/%28site%29/admin/users/[userId]/user-detail-view.ts#L1-L7) — identityChips typed ChipTone
- [`src/app/(site)/settings/characters/page.tsx:82-87`](../../src/app/%28site%29/settings/characters/page.tsx#L82-L87) — Neutral Pill and Chip side by side in one chip row
- [`src/app/(site)/settings/account/page.tsx:49`](../../src/app/%28site%29/settings/account/page.tsx#L49) — Admin role as Chip
- [`src/app/(site)/settings/corporations/page.tsx:30-37`](../../src/app/%28site%29/settings/corporations/page.tsx#L30-L37) — Member as Pill neutral, other roles as Chip green in the same slot
- [`src/components/composition/account/GrantedScopesList.tsx:22-26`](../../src/components/composition/account/GrantedScopesList.tsx#L22-L26) — Active/Legacy status as Chip
- [`src/app/(site)/preview/primitives/tags.tsx:25, 63-73`](../../src/app/%28site%29/preview/primitives/tags.tsx#L25) — Chip specimen documents an 'EWAR and combat status' niche that production does not follow
- [`src/app/(site)/preview/primitives/choices.tsx:151-168`](../../src/app/%28site%29/preview/primitives/choices.tsx#L151-L168) — ChipToggle preview; row examples pass a tone that has no effect

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/(site)/admin/admin-nav.tsx:36-45`](../../src/app/%28site%29/admin/admin-nav.tsx#L36-L45) — A nav count badge built from pillToneClasses with micro sizing. It already uses the Pill palette and is a badge, not a label, so leave it.
- [`src/components/composition/global-search-view.ts:30-35`](../../src/components/composition/global-search-view.ts#L30-L35) — Uses pillToneClasses to tint search icons; already on the canonical palette
- [`src/components/ui/field.tsx:48`](../../src/components/ui/field.tsx#L48) — Uses --color-chip-red as error ink, not as a label primitive. The token must survive (also checkbox.tsx:18, copy-button.css:72,95).

</details>

**Home.** `src/components/ui/pill.tsx (Pill, pillToneClasses, newly exported pillVariants); delete src/components/ui/chip.tsx`

**Boundary check.** pill.tsx is in zone ui. chip-toggle.tsx is also ui, so the import stays inside the zone (ui allow [] restricts only cross-zone imports). Consumers: app pages ('app' allows ui), src/components/composition/account ('components-composition' allows ui), src/features/wormhole-sites ('features' allows ui). No new cross-zone edges.

**API sketch.**

```ts
// pill.tsx
export const pillVariants = cva('font-ui font-semibold border inline-flex items-center gap-1.5', { variants: { tone: pillToneClasses, size: { sm, md } }, defaultVariants: { tone: 'neutral', size: 'sm' } });
export function Pill(props: VariantProps<typeof pillVariants> & { children: ReactNode; className?: string }): JSX.Element; // unchanged
// chip-toggle.tsx
type ChipToggleProps = { value: string; children: ReactNode; className?: string } & ({ appearance?: 'tone' | 'filter'; tone: PillTone } | { appearance: 'row'; tone?: never });
```

**Migration steps.**

1. In pill.tsx, export pillVariants (it is currently a private const). Leave Pill unchanged.
2. In chip-toggle.tsx, replace chipVariants({tone}) with pillVariants({ tone, size: 'sm' }) and change the tone type to PillTone. Make tone required only for 'tone'/'filter' appearance and drop it for 'row'. The unpressed override '[--pill-tone:var(--color-faint)] text-muted' keeps working because pill-soft reads --pill-tone.
3. In wormhole-styles.ts, delete CLASS_CHIP_TONE and SITE_TYPE_CHIP_TONE. Retype EWAR_TONE and TRIGGER_CHIP_TONE (rename to TRIGGER_TONE) as PillTone. In SitesFilterLayout.tsx, use CLASS_TONE[c] for the class filter and remove the tone prop from the row-appearance type toggles. In choices.tsx, drop tone from the row examples.
4. Retype site-card-header-view.ts ewarPills to PillTone. Swap Chip for Pill in EwarRow.tsx and NpcRow.tsx, passing className='shrink-0' because Chip had shrink-0 and Pill does not.
5. Swap Chip for Pill (same tone names) in GrantedScopesList.tsx, settings/characters, settings/account, settings/corporations, admin/users/page.tsx and admin/users/[userId]/page.tsx. Keep the existing className='normal-case' passes. Retype user-detail-view.ts identityChips to PillTone.
6. Remove the Chip specimen from preview/primitives/tags.tsx (CHIP_TONES and the Chip import) and widen the Pill note to cover status and EWAR.
7. Delete src/components/ui/chip.tsx and ChipTone from tones.ts. In globals.css, delete --color-chip-blue/-purple/-green, every --color-chip-*-bg/-border and --color-chip-pressed-bg, and update the comment. Keep --color-chip-red (used by field.tsx, checkbox.tsx, copy-button.css).
8. Run test-runner `pnpm check`. Fallow will flag any leftover unused export (chipVariants, ChipTone).

**Tests.** Extend src/components/ui/chip-toggle.test.ts: ChipToggle's className callback includes pillToneClasses[tone] when pressed, applies the faint --pill-tone override when unpressed, and with appearance='row' renders without a tone. These guard against regressions: site-card-header-view.test.ts:86-87 (ewarPills tone 'blue'), access-view.test.ts:22-59 (role tones purple/blue), and SiteCard.test.ts / SiteCardHeader.test.ts. Optionally add a render test showing EwarRow and SiteCardHeader produce the same tone class for 'web'.

**Notes.** Visual changes to expect and sign off on. EWAR wave rows and NPC chips move from the vivid chip hues to the Pill hues already used for EWAR in the card header (this is the consistency fix). Settings and admin status tags shift slightly (chip-green #33dd88 to isk #3dd68c is near-identical; purple #cc77ff to #aa55ff; orange dps-mid #ffaa22 to tone-orange #d68c3d). Pill sm is 2px taller (py-[2px] vs py-px). Class filter chips C2 and C4 change to green-strong and magenta, which now match the card class pills; the old collapse was a ChipTone limitation, not intent. If design wants the brighter EWAR look, retune the tone tokens rather than reintroducing a second palette. Drift verdict: the Pill palette is canonical (24 files, the card header, the audit table).

<sub>Reported by: area:ui-components.</sub>

<a id="p041"></a>

## P041: Draw every check and close mark with ui/icons CheckIcon and CloseIcon

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About +3 in icons, +3 in DialogHeader, -2 in checkbox, -14 in NodeCard, -18 in MapAccessDialog's header; glyph swaps net 0; net about -28
- **Depends on:** —
- **Existing primitive:** `src/components/ui/icons.tsx:strokeIcon,CheckIcon`

**Problem.** ui/icons exports CheckIcon and CloseIcon, but check and close marks are still drawn ad hoc.

Check mark:
- ui/checkbox inlines CheckIcon's exact path.
- NodeCard's RingCheck redraws it with a slightly different path at stroke width 3.
- DockCharacterPicker's radio indicator and ProfileBar's current-profile mark use a text '✓'.
- ui/select, by contrast, uses CheckIcon.

Close mark:
- DialogHeader, SidePanel, MapAccessDialog, FeedbackModal, SiteCardLightbox, MapWindow and NodeAddMenu render a text '×', whose look depends on font metrics.
- banner and StructureComposer render CloseIcon.
- NodeAddMenu's DialogClose has no aria-label, so screen readers announce it as the multiplication sign.
- MapAccessDialog copies DialogHeader's markup (header, title, description and close) only to add disabled and min-w-0 break-words.

**Verifier revision.** The proposed glyphs mostly fail AGENTS.md's 'real second consumer' bar. CogGlyph (MapSwitcher) and PlusGlyph (MapCatalogue) are each used once. TrashGlyph is used twice, but in the same file. The lock is a one-off 7px filled badge. HamburgerGlyph is already a shared component with two consumers in components/composition, which is a legal home for both. Moving any of these is churn.

The same concept does survive, though. Two glyphs that ui/icons already provides are re-drawn ad hoc across many sites. The check mark is drawn four ways: CheckIcon in ui/select, a verbatim copy of CheckIcon's path in ui/checkbox, RingCheck in NodeCard, and a text '✓' in DockCharacterPicker and ProfileBar. The close mark is a text '×' at 7 sites, including ui/dialog's DialogHeader and ui/side-panel, while banner and StructureComposer, which uses the same ghost-sm Button shape as DialogHeader, use CloseIcon. One '×' site, NodeAddMenu, has no aria-label at all. MapAccessDialog also hand-copies DialogHeader just to disable the close button.

**Sites (15).**

- [`src/components/ui/icons.tsx:3-40`](../../src/components/ui/icons.tsx#L3-L40) — strokeIcon (fixed strokeWidth 1.8), CheckIcon (32) and CloseIcon (40)
- [`src/components/ui/checkbox.tsx:48-52`](../../src/components/ui/checkbox.tsx#L48-L52) — Inline svg with CheckIcon's exact path; stroke and stroke-width 3 come from checkbox.css .check-soft-mark path (22-29)
- [`src/features/industry-planner/components/NodeCard.tsx:74-88, 130`](../../src/features/industry-planner/components/NodeCard.tsx#L74-L88) — RingCheck: near-identical check path with strokeWidth 3 and stroke-isk
- [`src/mapper/tracking/DockCharacterPicker.tsx:42-46`](../../src/mapper/tracking/DockCharacterPicker.tsx#L42-L46) — Text '✓' in MenuRadioItemIndicator
- [`src/components/composition/industry-workspace/ProfileBar.tsx:65-67`](../../src/components/composition/industry-workspace/ProfileBar.tsx#L65-L67) — Text '✓' current-profile mark
- [`src/components/ui/select.tsx:61-68`](../../src/components/ui/select.tsx#L61-L68) — Canonical: ItemIndicator renders CheckIcon size 15
- [`src/components/ui/dialog.tsx:82-113`](../../src/components/ui/dialog.tsx#L82-L113) — DialogHeader close is a ghost-sm Button with text '×' (108-110)
- [`src/components/ui/side-panel.tsx:30-32`](../../src/components/ui/side-panel.tsx#L30-L32) — Same ghost-sm close with '×'
- [`src/features/maps/MapAccessDialog.tsx:173-193`](../../src/features/maps/MapAccessDialog.tsx#L173-L193) — Hand-copied DialogHeader plus disabled close button with '×'
- [`src/features/feedback/components/FeedbackModal.tsx:268-276`](../../src/features/feedback/components/FeedbackModal.tsx#L268-L276) — Bare Button with '×'
- [`src/features/wormhole-sites/components/SiteCardLightbox.tsx:74-79`](../../src/features/wormhole-sites/components/SiteCardLightbox.tsx#L74-L79) — DialogClose with '×'
- [`src/mapper/windows/MapWindow.tsx:160-168`](../../src/mapper/windows/MapWindow.tsx#L160-L168) — Window close with '×'
- [`src/mapper/authoring/NodeAddMenu.tsx:82-84`](../../src/mapper/authoring/NodeAddMenu.tsx#L82-L84) — DialogClose with '×' and no aria-label
- [`src/features/custom-structures/components/StructureComposer.tsx:362-364`](../../src/features/custom-structures/components/StructureComposer.tsx#L362-L364) — Canonical: ghost-sm Button with CloseIcon size 14
- [`src/components/ui/banner.tsx:12-19`](../../src/components/ui/banner.tsx#L12-L19) — Canonical: dismiss button with CloseIcon size 14

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/maps/MapSwitcher.tsx:27-45`](../../src/features/maps/MapSwitcher.tsx#L27-L45) — CogGlyph is single-use; no second consumer
- [`src/features/maps/MapCatalogue.tsx:63-77`](../../src/features/maps/MapCatalogue.tsx#L63-L77) — PlusGlyph is single-use and TrashGlyph is used twice in the same file; keep them local until a second module needs them
- [`src/components/composition/HamburgerGlyph.tsx:1-14`](../../src/components/composition/HamburgerGlyph.tsx#L1-L14) — Already a shared component for its only consumers, MapMenu and NavMenu (both components-composition); moving it to ui is churn
- [`src/mapper/tracking/DockCharacterPicker.tsx:29-40`](../../src/mapper/tracking/DockCharacterPicker.tsx#L29-L40) — PINNED_BADGE lock: a single-use 7px filled glyph inside a badge
- [`src/components/composition/industry-workspace/MemberRail.tsx:66-78`](../../src/components/composition/industry-workspace/MemberRail.tsx#L66-L78) — Text '+' inside a dashed placeholder tile is a different affordance, not an icon. It parallels board/AddCharacter.tsx 18-33, which is a separate lead.

</details>

**Home.** `Existing src/components/ui/icons.tsx (CheckIcon and CloseIcon), with one small extension: an optional strokeWidth prop. Existing src/components/ui/dialog.tsx:DialogHeader for the MapAccessDialog header.`

**Boundary check.** icons.tsx and dialog.tsx are in the ui zone. Consumers:
- ui/checkbox, ui/dialog and ui/side-panel: same zone, as ui/select and ui/banner already import ./icons.
- features/industry-planner (NodeCard), features/maps (MapAccessDialog), features/feedback (FeedbackModal) and features/wormhole-sites (SiteCardLightbox): the features rule allows ui.
- mapper (DockCharacterPicker, MapWindow, NodeAddMenu): the mapper rule allows ui.
- components-composition (ProfileBar): its rule allows ui.

**API sketch.**

```ts
// src/components/ui/icons.tsx
type IconProps = { size?: number; className?: string; strokeWidth?: number }; // strokeWidth defaults to 1.8

// src/components/ui/dialog.tsx
export function DialogHeader(props: {
  titleId: string;
  title: ReactNode;
  description?: ReactNode;
  closeLabel: string;
  closeDisabled?: boolean; // new, for MapAccessDialog
}): JSX.Element; // title gains min-w-0 break-words; close renders <CloseIcon size={14} />
```

**Migration steps.**

1. icons.tsx: add an optional strokeWidth to IconProps, defaulting to 1.8, and thread it into strokeIcon's svg.
2. ui/checkbox.tsx 48-52: render `<CheckIcon size={13} />` inside Base.Indicator. The path is identical and checkbox.css still sets stroke-width 3 and the dash draw animation on `.check-soft-mark path`.
3. NodeCard: delete RingCheck (74-88) and render `<CheckIcon strokeWidth={3} className="size-icon-md text-isk" />` at line 130.
4. DockCharacterPicker INDICATOR (42-46) and ProfileBar (65-67): replace '✓' with `<CheckIcon size={12} />`, keeping ProfileBar's invisible wrapper for alignment.
5. ui/dialog DialogHeader (108-110) and ui/side-panel (30-32): replace '×' with `<CloseIcon size={14} />`, which matches StructureComposer's ghost-sm close. Get design sign-off, because this changes every dialog header.
6. Add closeDisabled to DialogHeader and min-w-0 break-words to its title. Replace MapAccessDialog's hand-copied header (173-193) with `<DialogHeader titleId={titleId} title={`Manage ${mapName}`} description="Grant, change, or revoke access. Only characters on this list can be tracked here." closeLabel="Close map access" closeDisabled={disabled} />`.
7. FeedbackModal (268-276), SiteCardLightbox (74-79), MapWindow (160-168) and NodeAddMenu (82-84): use `<CloseIcon size={14} />`. Add aria-label="Close" to NodeAddMenu's DialogClose.
8. Leave CogGlyph, PlusGlyph, TrashGlyph, the lock badge and HamburgerGlyph in place until a second module needs them.

**Tests.** dialog.test.ts: assert DialogHeader renders an aria-hidden svg (no '×'), add a closeDisabled case, and keep the closeLabel aria-label check. side-panel.test.ts keeps guarding the 'Close side panel' label. MapAccessDialog.test.ts: assert the header still reads 'Manage <map>' and the close button is disabled while saving. NodeCard.test.ts: the check still renders. Add a NodeAddMenu assertion for aria-label="Close". MapWindow.test.ts keeps guarding `Close ${title}`.

**Notes.** Visual differences:
- RingCheck's path (M5 13l4 4L19 7) differs slightly from CheckIcon's (M5 12.5l4.5 4.5L19 7.5). Use CheckIcon's. The stroke width stays 3 through the new prop.
- The checkbox look is unchanged because CSS stroke-width and stroke override the svg presentation attributes, and the dasharray 20 animation is tuned to the identical path.
- '×' to CloseIcon is a deliberate convergence on the design-system glyph that banner and StructureComposer already use. Confirm it with design before landing step 5.

Drift and a11y fixes: NodeAddMenu's close has no accessible label beyond '×'. MapAccessDialog's min-w-0 break-words on long titles is the better behaviour, so fold it into DialogHeader.

<sub>Reported by: concern:ui-patterns.</sub>

<a id="p053"></a>

## P053: Route the ui chip glass through a globals.css glass-chip utility and the --glass-* knobs

- **Status:** [ ] not started
- **Category:** css-styling · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -25 / +14 CSS lines
- **Depends on:** —
- **Existing primitive:** `src/app/globals.css:@utility glass-panel / glass-dense, --glass-blur, --glass-saturate, --shadow-dd`

**Problem.** The ui stylesheets hand-roll a fourth frost tier that ignores the shared knobs. .banner-glass, .copy-chip and .field-trigger repeat one tint, color-mix(white 4%, color-mix(bg-deep 55%)). .banner-glass, .copy-chip and .field-glass repeat blur(14px) saturate(1.3), and .copy-bubble repeats saturate(1.3). None has the @supports fallback the globals tiers carry. Retuning --glass-saturate today leaves banners, copy chips and every Input, Select and Combobox field behind. Separately, banner.css copies the same 28px round icon-disc block into .banner-icon, .banner-dismiss and .banner-retry.

**Verifier revision.** The bypass is real. globals.css says the --glass-blur and --glass-saturate knobs let the frost 'tune in ONE place'. Yet banner.css, copy-button.css and input.css hard-code blur(14px) saturate(1.3) in four rules, and .copy-bubble hard-codes saturate(1.3). Three rules (.banner-glass, .copy-chip, .field-trigger) also share a byte-identical white-4%-over-bg-deep-55% tint. Several cited details are wrong, though. .field-glass's tint is white 4% over transparent, and its drop shadow differs, so applying the full chip recipe would darken every Input. .copy-chip has no background-image. .copy-bubble already uses var(--shadow-dd), and its 82% tint is not glass-dense's 90%. .copy-icon-btn is a 30px bordered rounded square (9px radius), not the round icon disc. The checked tints are not one value: check fills at 20%, switch at 22%, radio at 16%, and copy's copied state uses 14% fill with a 35% border. Drop the checkbox part. What survives: a named chip-blur knob, a glass-chip utility for the three identical tints, knob vars in .field-glass and .copy-bubble, and the banner disc merge.

**Sites (8).**

- [`src/app/globals.css:515-575, 673-679`](../../src/app/globals.css#L515-L575) — glass-panel / glass-panel-faint / glass-surface (@apply glass-panel) / glass-dense / glass-lit utilities with the @supports fallback; :root --glass-blur 16px, --glass-saturate 1.3
- [`src/components/ui/banner.css:2-20, 31-57, 80-93`](../../src/components/ui/banner.css#L2-L20) — .banner-glass tint 12, filter 16-17, shadow 18, background-image gradients 13-15; disc block repeated in .banner-icon/.banner-dismiss/.banner-retry
- [`src/components/ui/copy-button.css:2-13, 75-93`](../../src/components/ui/copy-button.css#L2-L13) — .copy-chip: same tint, filter and shadow as .banner-glass; .copy-bubble: bg-deep 82%, blur(24px) saturate(1.3), already var(--shadow-dd)
- [`src/components/ui/input.css:6-15, 44-51`](../../src/components/ui/input.css#L6-L15) — .field-glass: white 4% over transparent, blur(14px) saturate(1.3), shadow 0 6px 18px -12px; .field-trigger: chip tint with an aurora shadow (always paired with field-glass)
- [`src/components/ui/input.tsx:6, 14`](../../src/components/ui/input.tsx#L6) — fieldVariants = 'field-glass field-own-focus'; triggerShape = 'field-trigger'
- [`src/components/ui/select.tsx:110-114`](../../src/components/ui/select.tsx#L110-L114) — trigger = fieldVariants + triggerShape
- [`src/components/ui/combobox.tsx:20-22`](../../src/components/ui/combobox.tsx#L20-L22) — input group = fieldVariants + triggerShape
- [`src/components/composition/industry-workspace/AddFacilityRow.tsx:143`](../../src/components/composition/industry-workspace/AddFacilityRow.tsx#L143) — not-focus-within:bg-transparent / backdrop-blur-none utilities override the field glass; relies on field rules staying in @layer components

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/ui/copy-button.css:14-32`](../../src/components/ui/copy-button.css#L14-L32) — .copy-icon-btn is a 30px bordered rounded square (9px radius), not the round 28px disc
- [`src/components/ui/checkbox.css:14-17, 42-45, 69-72`](../../src/components/ui/checkbox.css#L14-L17) — checked tints differ (20/22/16% fill); one --tint property would either change the look or just move three values around
- [`src/components/ui/copy-button.css:56-60`](../../src/components/ui/copy-button.css#L56-L60) — copied tint is 14% fill / 35% border, not the checkbox values
- [`src/mapper/signatures/scanner-window-frame.css:23-30`](../../src/mapper/signatures/scanner-window-frame.css#L23-L30) — .scanner-scroll-frost already uses var(--glass-blur) and var(--glass-saturate); a frost strip with no tint, so it is correct as is

</details>

**Home.** `src/app/globals.css (new :root knob --glass-chip-blur beside --glass-blur/--glass-saturate; new @utility glass-chip beside the other glass tiers)`

**Boundary check.** CSS is outside the import-zone graph (.fallowrc.json zones cover TS modules). src/AGENTS.md: 'Keep Tailwind setup, tokens, shared utilities, and document rules in app/globals.css' and 'Put rules that need CSS in a sibling <owner>.css and import it from app/globals.css'. Every consumer stylesheet (banner.css, copy-button.css, input.css) is already @import-ed by globals.css (lines 13, 16, 17), so @apply glass-chip resolves in the same Tailwind compilation.

**API sketch.**

```ts
:root { --glass-blur: 16px; --glass-chip-blur: 14px; --glass-saturate: 1.3; }
@utility glass-chip {
  background-color: color-mix(in oklab, white 4%, color-mix(in oklab, var(--color-bg-deep) 55%, transparent));
  -webkit-backdrop-filter: blur(var(--glass-chip-blur)) saturate(var(--glass-saturate));
  backdrop-filter: blur(var(--glass-chip-blur)) saturate(var(--glass-saturate));
  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { background-color: var(--color-bg-deep); }
}
```

**Migration steps.**

1. globals.css: add --glass-chip-blur: 14px to the :root knob block (673-679) and @utility glass-chip after glass-dense. Set background-color only, never the `background` shorthand, matching the tier comment at 549-558.
2. banner.css: in .banner-glass, replace the background-color and both backdrop-filter lines (12, 16-17) with `@apply glass-chip;` placed before background-image, so the gradients survive. Keep the box-shadow inline. Merge the shared disc declarations of .banner-icon, .banner-dismiss and .banner-retry (display, width, height, flex-shrink, align-items, justify-content, border-radius) into one selector list, and keep each rule's color, cursor and transition separate.
3. copy-button.css: in .copy-chip, replace lines 9-11 with `@apply glass-chip;`. In .copy-bubble, change saturate(1.3) to saturate(var(--glass-saturate)) and keep its 82% tint, unless design accepts glass-dense's 90%, in which case use @apply glass-dense.
4. input.css: in .field-glass, keep its white-4%-over-transparent tint and its own shadow, and change only the filter to blur(var(--glass-chip-blur)) saturate(var(--glass-saturate)). In .field-trigger, replace the background-color line (47) with `@apply glass-chip;` and keep its aurora box-shadow after it. Keep all rules inside @layer components and leave .field-own-focus unlayered.
5. Ask docs-researcher (Tailwind v4) to confirm @apply of a custom @utility containing nested @supports inside a plain class rule in an @import-ed stylesheet. Today's only precedent is glass-surface's @apply inside another @utility.

**Tests.** Extend src/app/stylesheet-contract.test.ts with a contract that no stylesheet other than src/app/globals.css contains a literal saturate(<number>) or blur(14px) in a backdrop-filter, so the knobs stay the single source. The existing src/app/stylesheet-contract.test.ts (one import per owner sheet) and src/app/reduced-motion.test.ts (banner, copy and field reduced-motion overrides untouched) must stay green. Visually check the banner, copy chip, Input, Select trigger and the AddFacilityRow unfocused field on staging.

**Notes.** Preserve: (1) .field-glass's tint (white 4% over transparent) differs from the chip tint. Never apply glass-chip to .field-glass, or every Input darkens. (2) The three shadows differ (banner/copy-chip `0 8px 24px -16px`, field-glass `0 6px 18px -12px`, field-trigger aurora), so they stay per rule. Do not add a @theme --shadow-* token: it would generate a shadow-* utility that must be registered in cn.ts (globals.css 395-397). (3) @apply inside the components-layer rule keeps the declarations in @layer components, so AddFacilityRow's utilities-layer not-focus-within:bg-transparent and backdrop-blur-none overrides keep winning. Never put glass-chip as a class on the element. (4) The @supports fallback is new: on engines without backdrop-filter, banners, copy chips and triggers become opaque bg-deep instead of a 55% tint, matching every other tier. (5) The 14px chip blur is kept as its own knob rather than merged into --glass-blur (16px), so nothing changes visually.

<sub>Reported by: area:ui-components, dupes-triage-2.</sub>

<a id="p001"></a>

## P001: Complete the ui/dialog kit (DialogBody, DialogFooter, DialogCloseButton, closeDisabled, displayTitle) and route hand-built dialog chrome through it

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** high · **Size:** About +60 in ui (dialog.tsx, confirm-dialog.tsx, type-roles.ts) and about -120 across 13 sites. Net about -60.
- **Depends on:** [P319](#p319), [P041](#p041)
- **Existing primitive:** `src/components/ui/dialog.tsx:DialogHeader; src/components/ui/confirm-dialog.tsx:ConfirmDialog; src/components/ui/type-roles.ts:eyebrow`

**Problem.** ui/dialog.tsx exports DialogHeader only. ConfirmDialog holds the sole copy of the body ('flex flex-col gap-3 px-4 py-4') and footer ('flex items-center justify-end gap-2.5 border-t border-border-soft px-4 py-3') strings. Feature dialogs copy them:
- Footers appear in MapAccessDialog, MapCreationDialog, ProfileDialogs, TrashWindow (justify-between), FeedbackModal (gap-3 drift), AfkGate and the preview specimen.
- MapAccessDialog copies DialogHeader line for line only to add a disabled close and a wrap-safe title.
- FeedbackModal hand-rolls the header with a plain <h2> (font-bold, where the kit uses font-semibold) and a bare × Button.
- AfkGate re-creates ConfirmDialog's title bar, body and footer.
- NodeAddMenu hand-rolls its header, and its × close has no accessible label.
- corp-sharing-card builds a destructive confirm from a <p> label and two text-styled DialogClose buttons instead of ConfirmDialog.
- RevokeRedirectLightbox labels its dialog with a <p>.

The display-title string 'font-display text-h2|h3 font-semibold tracking-copy uppercase text-name' appears 8 times: dialog.tsx, confirm-dialog.tsx, MapAccessDialog, MapCreationDialog, NodeAddMenu, AfkGate and MapCatalogue ×2. The × close buttons come in 5 styles: ghost sm, bare text-ui, text-nav unlabeled, compact px-1.5 and SidePanel.

**Verifier revision.** The core holds. ui/dialog.tsx has DialogHeader but no body, footer or shared close button, and 7 dialog footers plus 8 copies of the display-title string repeat the same chrome. Several claims and design choices change on review. (1) corp-sharing-card cannot be closed mid-request: 'Stop sharing' is itself a DialogClose, so the dialog closes before applySharing runs, and the Switch is disabled while busy. The real defects there are the missing DialogTitle (the dialog is labelled by a <p> holding the whole sentence) and the bespoke text-link buttons. (2) AfkGate should not become a single-action ConfirmDialog. It has no busy or error state, its primary 'Continue' is a DialogClose that drives onOpenChange→dismiss, and ConfirmDialog's neutral tone renders a secondary button. Composing the new parts keeps it honest, so cancelLabel:null is dropped. ConfirmDialog instead gains cancelLabel?: string, which corp-sharing-card needs for its 'Keep sharing' wording. (3) displayTitle must not be applied to SidePanel, whose title is non-uppercase font-bold, because that would restyle it. (4) MapWindow and StructureComposer are not dialogs and are excluded. (5) A drift bug the finders missed: NodeAddMenu's × DialogClose (line 82) has no aria-label, so its accessible name is '×'. (6) TrashWindow passes no closeDisabled, so its header × stays enabled while busy even though onOpenChange ignores it. (7) The preview overlays specimen copies the footer string.

**Sites (16).**

- [`src/components/ui/dialog.tsx:82-113`](../../src/components/ui/dialog.tsx#L82-L113) — DialogHeader: required closeLabel, no closeDisabled, title class inline, inner div lacks min-w-0; no DialogBody/DialogFooter/close-button export
- [`src/components/ui/confirm-dialog.tsx:58-96`](../../src/components/ui/confirm-dialog.tsx#L58-L96) — Title bar (67-74), body string (75), footer string (82), hard-coded 'Cancel' (84)
- [`src/components/ui/side-panel.tsx:26-33`](../../src/components/ui/side-panel.tsx#L26-L33) — Own × DialogClose (30-32); keep its own non-uppercase title
- [`src/components/ui/type-roles.ts:1-31`](../../src/components/ui/type-roles.ts#L1-L31) — Only eyebrow; natural home for displayTitle
- [`src/features/maps/MapAccessDialog.tsx:165-231`](../../src/features/maps/MapAccessDialog.tsx#L165-L231) — 174-193 verbatim DialogHeader copy + min-w-0 break-words + disabled close; 195 body gap-4; 223-230 footer without gap
- [`src/features/maps/TrashWindow.tsx:155-203`](../../src/features/maps/TrashWindow.tsx#L155-L203) — 164-169 DialogHeader without closeDisabled while busy; 171 body gap-2; 181-203 footer justify-between gap-3 with inner gap-2.5 group
- [`src/features/maps/MapCreationDialog.tsx:88-93, 246-252, 302-309`](../../src/features/maps/MapCreationDialog.tsx#L88-L93) — Interstitial title string copy; DialogHeader use; footer string copy
- [`src/components/composition/industry-workspace/ProfileDialogs.tsx:112-131`](../../src/components/composition/industry-workspace/ProfileDialogs.tsx#L112-L131) — Body gap-4 (113) and footer string (126)
- [`src/features/feedback/components/FeedbackModal.tsx:251-317`](../../src/features/feedback/components/FeedbackModal.tsx#L251-L317) — 261-277 plain h2 (font-bold drift) + bare × Button; 309 footer gap-3 drift; onOpenChange closes even while submitting
- [`src/mapper/tracking/AfkGate.tsx:57-84`](../../src/mapper/tracking/AfkGate.tsx#L57-L84) — 67-72 ConfirmDialog title-bar copy; 73 body with data-afk-dialog; 80-82 footer, single primary DialogClose
- [`src/mapper/authoring/NodeAddMenu.tsx:67-87`](../../src/mapper/authoring/NodeAddMenu.tsx#L67-L87) — Own header row; 82-84 DialogClose with no aria-label (a11y bug); title string copy at 78
- [`src/app/(site)/settings/corporations/corp-sharing-card.tsx:38-101`](../../src/app/%28site%29/settings/corporations/corp-sharing-card.tsx#L38-L101) — 80-98 Dialog labelled by a <p>, text-link DialogClose buttons; should be ConfirmDialog tone=danger
- [`src/components/composition/account/RevokeRedirectLightbox.tsx:37-57`](../../src/components/composition/account/RevokeRedirectLightbox.tsx#L37-L57) — Dialog labelled by <p id> instead of DialogTitle
- [`src/features/wormhole-sites/components/SiteCardLightbox.tsx:64-80`](../../src/features/wormhole-sites/components/SiteCardLightbox.tsx#L64-L80) — Compact × DialogClose (74-79)
- [`src/features/maps/MapCatalogue.tsx:139, 258`](../../src/features/maps/MapCatalogue.tsx#L139) — Display-title string on catalogue cards (139 also min-w-0 break-words)
- [`src/app/(site)/preview/primitives/overlays.tsx:134-141`](../../src/app/%28site%29/preview/primitives/overlays.tsx#L134-L141) — Primitive specimen copies the footer string; should demo DialogBody/DialogFooter

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/windows/MapWindow.tsx:117-170`](../../src/mapper/windows/MapWindow.tsx#L117-L170) — Floating mapper window chrome, not a Base UI dialog: onClick close sized h-6 w-6 for an h-8 header
- [`src/features/custom-structures/components/StructureComposer.tsx:357-411`](../../src/features/custom-structures/components/StructureComposer.tsx#L357-L411) — A cardSurface section, not a Dialog; header has hull tile and non-uppercase bold title. Footer string matches but a 'DialogFooter' in a card would mislead
- [`src/mapper/authoring/HomePrompt.tsx:45-61`](../../src/mapper/authoring/HomePrompt.tsx#L45-L61) — Non-dismissable centered prompt with text-title; a distinct design
- [`src/app/(site)/preview/primitives/overlays.tsx:152-157`](../../src/app/%28site%29/preview/primitives/overlays.tsx#L152-L157) — 'Hand-composed' specimen deliberately demos the raw parts
- [`src/features/maps/MapCatalogue.tsx:255-262`](../../src/features/maps/MapCatalogue.tsx#L255-L262) — The 'unavailable' card layout belongs to the NoticePanel/LoadFailed opportunity; only its title class moves to displayTitle here

</details>

**Home.** `src/components/ui/dialog.tsx (DialogBody, DialogFooter, DialogCloseButton, extended DialogHeader); src/components/ui/confirm-dialog.tsx (rebuilt on them, + cancelLabel); src/components/ui/type-roles.ts (displayTitle)`

**Boundary check.** Home zone is ui (src/components/ui/**), rule {from: 'ui', allow: []}. dialog.tsx and confirm-dialog.tsx import only intra-ui modules (./button, ./cn, ./overlay-portal-container, ./tones, ./type-roles). Consumer zones:
- features (MapAccessDialog, MapCreationDialog, TrashWindow, MapCatalogue, FeedbackModal, SiteCardLightbox): the features rule allows 'ui'.
- mapper (AfkGate, NodeAddMenu): the mapper rule allows 'ui'.
- app (corp-sharing-card, preview overlays): the app rule allows 'ui'.
- components-composition (ProfileDialogs, RevokeRedirectLightbox): the components-composition rule allows 'ui'.

**API sketch.**

```ts
// type-roles.ts
export const displayTitle = cva('font-display font-semibold tracking-copy uppercase', {
  variants: { size: { h2: 'text-h2', h3: 'text-h3' }, tone: { name: 'text-name', danger: 'text-pill-red-text' }, wrap: { true: 'min-w-0 break-words', false: '' } },
  defaultVariants: { size: 'h2', tone: 'name', wrap: false },
});
// dialog.tsx
export function DialogCloseButton(p: { label: string; disabled?: boolean; className?: string }): JSX.Element; // <DialogClose render={<Button variant="ghost" size="sm" className={className}/>} aria-label={label} disabled={disabled}>×</DialogClose>
export function DialogHeader(p: { titleId: string; title: ReactNode; description?: ReactNode; closeLabel?: string /* omitted = no close */; closeDisabled?: boolean; size?: 'h2' | 'h3'; tone?: 'name' | 'danger'; className?: string }): JSX.Element; // shrink-0, inner div min-w-0, title displayTitle({size, tone, wrap: true})
export function DialogBody(p: ComponentProps<'div'>): JSX.Element; // cn('flex flex-col gap-3 px-4 py-4', className); twMerge lets gap-4/gap-5 override
export function DialogFooter(p: { align?: 'end' | 'between'; className?: string; children: ReactNode }): JSX.Element; // 'flex shrink-0 items-center gap-2.5 border-t border-border-soft px-4 py-3' + justify-end|justify-between
// confirm-dialog.tsx
ConfirmDialog({ ...existing, cancelLabel?: string /* default 'Cancel' */ }) // useId() → labelledBy + DialogHeader titleId, size 'h3', tone, no closeLabel
```

**Migration steps.**

1. Add displayTitle to src/components/ui/type-roles.ts.
2. In src/components/ui/dialog.tsx, add DialogCloseButton, DialogBody and DialogFooter. Make closeLabel optional on DialogHeader (no × when omitted) and add closeDisabled, size, tone and className. Render its title with displayTitle({size, tone, wrap: true}) and give the inner div min-w-0.
3. In side-panel.tsx, replace the inline DialogClose with <DialogCloseButton label="Close side panel" />. Keep SidePanel's own title classes.
4. Rebuild confirm-dialog.tsx on DialogHeader (size h3, tone, no close, titleId from useId passed as Dialog labelledBy), DialogBody and DialogFooter. Add cancelLabel. The rendered box must stay identical (border-b px-4 py-3 title bar, gap-3 body, gap-2.5 footer).
5. MapAccessDialog: replace lines 174-193 with <DialogHeader titleId title={`Manage ${mapName}`} description closeLabel="Close map access" closeDisabled={disabled} />. The body at 195 becomes DialogBody className="gap-4" and the footer at 223-230 becomes DialogFooter.
6. TrashWindow: add closeDisabled={busy !== null || confirmOpen} to DialogHeader. The body at 171 becomes DialogBody className="gap-2" and the footer at 181-203 becomes DialogFooter align="between".
7. MapCreationDialog: the footer at 302-309 becomes DialogFooter and the body becomes DialogBody className="gap-5". The interstitial DialogTitle at 88-91 takes displayTitle().
8. ProfileDialogs: lines 113 and 126 become DialogBody className="gap-4" and DialogFooter.
9. FeedbackModal: lines 261-277 become <DialogHeader titleId={titleId} title="Send feedback" size="h3" closeLabel="Close feedback" className="items-center" /> inside the form, and the footer at 309 becomes DialogFooter. Keep Dialog onOpenChange → onClose, which FeedbackModal.test.ts asserts.
10. AfkGate: lines 67-82 become <DialogHeader titleId={TITLE_ID} title="Still mapping?" size="h3" /> + <DialogBody data-afk-dialog> + <DialogFooter><DialogClose render={<Button variant="primary" size="sm"/>}>Continue</DialogClose></DialogFooter>. Do not convert it to ConfirmDialog.
11. NodeAddMenu: swap the unlabeled DialogClose (82-84) for <DialogCloseButton label="Close add connection" /> and the title class at 78 for displayTitle({size: 'h3'}). Keep the compact p-4 layout. Adopting DialogHeader is optional because it adds a border bar.
12. corp-sharing-card: replace lines 80-98 with <ConfirmDialog tone="danger" title={`Stop sharing ${corp.corporationName}'s data?`} consequence="Members lose access to shared corporation data. Directors keep it. Nothing is deleted." confirmLabel="Stop sharing" cancelLabel="Keep sharing" busy={busy} onConfirm={async () => { await applySharing(false); setConfirmOpen(false); }} />. Drop useId, Dialog and DialogClose.
13. RevokeRedirectLightbox: make the <p id={labelId}> at 39-41 a DialogTitle with the same eyebrow classes.
14. SiteCardLightbox 74-79: use <DialogCloseButton label="Close" className="px-1.5 py-0.5" />, keeping the compact sizing via className.
15. MapCatalogue 139 and 258: use displayTitle({wrap: true}) and displayTitle().
16. preview overlays 136-141: demo DialogBody and DialogFooter. Mention DialogCloseButton and closeDisabled in the specimen note.
17. Verify with rg that no dialog footer 'border-t border-border-soft px-4 py-3' string and no 'font-display text-h[23] font-semibold tracking-copy uppercase' string remains outside src/components/ui.

**Tests.** Extend src/components/ui/dialog.test.ts. Widen its Base UI Close mock to forward aria-label and disabled, then cover four cases: DialogHeader renders the × with closeLabel and disabled when closeDisabled; it omits the × without closeLabel; DialogFooter applies the align classes; DialogBody merges a gap override. Add src/components/ui/confirm-dialog.test.ts covering four cases: cancelLabel defaults to 'Cancel' and accepts an override; busy disables both buttons and swaps in busyLabel; onOpenChange is suppressed while busy; labelledBy matches the title id. Six tests mock '@/components/ui/dialog' and need stubs for any new parts they render (DialogBody, DialogFooter, DialogCloseButton): ChainHost.test.ts, HomePrompt.test.ts, WorkspaceDialogs.test.ts, MapCreationDialog.test.ts, TrashWindow.test.ts and MapAccessDialog.test.ts. side-panel.test.ts mocks './dialog' the same way. A partial vi.importActual mock is simplest. These existing tests guard the migrated behavior: FeedbackModal.test.ts (onOpenChange→onClose, form as the Dialog child), MapAccessDialog.test.ts, TrashWindow.test.ts, mapper/authoring/surface.test.ts ('Add connection' string), MapChromeVariants.test.ts. Add a render test for corp-sharing-card's confirm path: ConfirmDialog opens on switch-off, and confirm calls the endpoint with enabled:false.

**Notes.** Drift resolution:
- Footer gap: gap-2.5 is canonical (ConfirmDialog, MapCreationDialog, ProfileDialogs, preview). FeedbackModal's gap-3 is the drift. The no-gap footers (MapAccessDialog, AfkGate) are single-button, so adopting gap-2.5 is invisible.
- Title weight: font-semibold is canonical. FeedbackModal's font-bold h3 becomes semibold, a small visual change.
- Body gaps legitimately differ (gap-2, 3, 4 or 5 by content). Keep them via className rather than forcing one value.

Behavior changes to accept knowingly:
- corp-sharing-card's confirm now stays open with 'Working…' until the request settles (standard ConfirmDialog behavior) instead of closing immediately.
- TrashWindow's × greys out while busy. Today it is enabled but does nothing.

Behavior to preserve:
- AfkGate keeps data-afk-dialog on the body.
- FeedbackModal keeps closing on Escape in every state (its test asserts onOpenChange(false) → onClose).
- MapAccessDialog keeps blocking close while disabled.
- ConfirmDialog keeps no × in its title bar.

The MapCatalogue unavailable card (255-262) is coordinated with the NoticePanel/LoadFailed opportunity. The AccessSectionHeading trio in features/maps is a trivial local constant to fix while there.

<sub>Reported by: area:app-site, area:features-sites-misc, area:mapper-signatures, area:ui-components, concern:ui-patterns.</sub>

<a id="p019"></a>

## P019: Portal every Base UI popup into the enclosing dialog, and share the pop-in transition

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** medium · **Payoff:** medium · **Size:** About -12/+10 for the hook and portals, -8/+6 for popIn; the optional MenuPopup shell is about -20/+25
- **Depends on:** —
- **Existing primitive:** `src/components/ui/overlay-portal-container.tsx:useOverlayPortalContainer; src/components/ui/dropdown-panel.ts:panelSurface`

**Problem.** OverlayPortalContainerProvider (provided only by Dialog, and so by SidePanel and ConfirmDialog) lets nested popups portal into the dialog popup and stack above it. Select, Combobox and PointerMenu read it, each copying the same conditional spread. Menu, Popover and Tooltip never read it. Inside a dialog, Base UI then portals them into the dialog's portal node as a sibling of the popup, where z-dropdown (40) sits below the popup's z-overlay (50). The Tooltips in StructureBonusColumns inside the Structures SidePanel are therefore stacked under the panel. Separately, Popover and Tooltip duplicate the same scale-95/opacity pop-in class string, and Menu and PointerMenu duplicate the Root -> Portal -> Positioner(z-dropdown) -> Popup chain with drifted surface rounding.

**Verifier revision.** The portal-container drift is real and causes a concrete layering defect. In Base UI 1.7, a nested Portal with no container resolves to the parent portal node (FloatingPortal.js:64), not to the Dialog popup. The Dialog popup is fixed at z-overlay (50) and dropdown positioners sit at z-dropdown (40), so a Menu, Popover or Tooltip opened inside a Dialog or SidePanel lands beside the popup and underneath it. Select, Combobox and PointerMenu escape this through useOverlayPortalContainer. Tooltip does not, and there is a live case: StructureBonusColumns renders Tooltips inside the Structures SidePanel (industry/layout -> StructuresDrawer -> StructuresManager:93). The shared transition string is also real: Popover and Tooltip carry identical classes. Two parts are scoped down. Adding an enter animation to Menu is a visual change nobody asked for, so it is left out. The Menu/PointerMenu shell is a small, optional cleanup. Extracting it does expose a second drift: PointerMenu and Menu's frosted surface lack rounded-card, so both production map context menus (EdgeContextMenu, NodeAddMenu) render square corners, while the preview specimen adds rounded-card by hand.

**Sites (17).**

- [`src/components/ui/overlay-portal-container.tsx:5-23`](../../src/components/ui/overlay-portal-container.tsx#L5-L23) — Context and hook; returns HTMLElement \| null
- [`src/components/ui/dialog.tsx:20-24, 57-74`](../../src/components/ui/dialog.tsx#L20-L24) — Popup is 'fixed z-overlay'; provider wraps the popup's children with the popup element
- [`src/components/ui/side-panel.tsx:9-39`](../../src/components/ui/side-panel.tsx#L9-L39) — SidePanel is a Dialog with keepMounted and a translated (transformed) popup
- [`src/components/ui/pointer-menu.tsx:16-23, 56-78`](../../src/components/ui/pointer-menu.tsx#L16-L23) — Conditional container spread at line 59; popup uses panelSurface with no rounding
- [`src/components/ui/select.tsx:98, 141`](../../src/components/ui/select.tsx#L98) — Conditional container spread copy
- [`src/components/ui/combobox.tsx:46-53`](../../src/components/ui/combobox.tsx#L46-L53) — Conditional container spread copy
- [`src/components/ui/menu.tsx:20-31, 77-103`](../../src/components/ui/menu.tsx#L20-L31) — Base.Portal at line 82 has no container; the 'frosted' surface is panelSurface without rounded-card
- [`src/components/ui/popover.tsx:17-31, 74-93`](../../src/components/ui/popover.tsx#L17-L31) — Pop-in transition string at lines 19-21; Base.Portal at line 74 has no container
- [`src/components/ui/tooltip.tsx:29-45`](../../src/components/ui/tooltip.tsx#L29-L45) — Base.Portal has no container; the same pop-in transition string at lines 35-37
- [`src/components/ui/dropdown-panel.ts:3-7`](../../src/components/ui/dropdown-panel.ts#L3-L7) — Home of panelSurface, menuPanelSurface and dropdownPanel; the natural place for a popIn token
- [`src/app/globals.css:373-374`](../../src/app/globals.css#L373-L374) — --z-index-dropdown: 40 is below --z-index-overlay: 50
- [`node_modules/@base-ui/react/floating-ui-react/components/FloatingPortal.js:64`](../../node_modules/@base-ui/react/floating-ui-react/components/FloatingPortal.js#L64) — resolvedContainer = containerProp ?? parentPortalNode ?? document.body, so a nested portal lands in the dialog's portal node beside the popup
- [`src/features/industry-planner/components/structure-bonus-readout.tsx:11-21, 46-50, 63-67`](../../src/features/industry-planner/components/structure-bonus-readout.tsx#L11-L21) — Tooltips rendered by StructureBonusColumns
- [`src/components/composition/industry-workspace/StructuresManager.tsx:93`](../../src/components/composition/industry-workspace/StructuresManager.tsx#L93) — Renders StructureBonusColumns; mounted through industry/layout.tsx:24-30 inside StructuresDrawer, which is a SidePanel (IndustryShell.tsx:133-144)
- [`src/mapper/canvas/EdgeContextMenu.tsx:24-31`](../../src/mapper/canvas/EdgeContextMenu.tsx#L24-L31) — PointerMenu with className 'min-w-40' and no rounding, so square corners
- [`src/mapper/authoring/NodeAddMenu.tsx:49-55`](../../src/mapper/authoring/NodeAddMenu.tsx#L49-L55) — PointerMenu with no className, so square corners
- [`src/app/(site)/preview/primitives/overlays.tsx:108-115`](../../src/app/%28site%29/preview/primitives/overlays.tsx#L108-L115) — The preview PointerMenu passes 'rounded-card p-1' by hand

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/ui/drawer.tsx:30-58`](../../src/components/ui/drawer.tsx#L30-L58) — Top-level modal sheet, not a popup nested in a dialog; its own Portal must keep going to body
- [`src/components/ui/dialog.tsx:60`](../../src/components/ui/dialog.tsx#L60) — The Dialog's own Portal is the provider and must not consume the context
- [`src/components/ui/select.tsx:144-151`](../../src/components/ui/select.tsx#L144-L151) — Select and Combobox use dropdownPanel's dropdown-panel-in keyframe by design; out of scope for the popIn token

</details>

**Home.** `src/components/ui/overlay-portal-container.tsx (hook), src/components/ui/dropdown-panel.ts (popIn token), src/components/ui/menu.tsx (optional internal MenuPopup shell)`

**Boundary check.** Every change stays inside the ui zone (src/components/ui/**). The ui rule allows no imports outside ui, and the touched files import only each other and @base-ui/react, which is a package, not a zone. No consumer outside ui changes its imports.

**API sketch.**

```ts
// overlay-portal-container.tsx
export function useOverlayPortalContainer(): HTMLElement | undefined  // never null: Base UI treats container={null} as 'wait'
// usage: <Base.Portal container={useOverlayPortalContainer()}>
// dropdown-panel.ts
export const popIn = 'origin-[var(--transform-origin)] transition-[opacity,transform] duration-fast motion-reduce:transition-none data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0';
// menu.tsx (internal, optional)
export function MenuPopup(props: { anchor?: MenuAnchor; side; align; sideOffset; alignOffset?; collisionPadding?; label: string; surface: 'solid' | 'frosted'; popupProps?: DataAttributes & { style?: CSSProperties }; finalFocus?: PopupProps['finalFocus']; className?: string; children: ReactNode }): JSX.Element
```

**Migration steps.**

1. Change useOverlayPortalContainer to return useContext(...) ?? undefined. It must never return null, because Base UI's container={null} means 'wait'.
2. In select.tsx:141, combobox.tsx:49 and pointer-menu.tsx:59, replace the conditional spread with container={overlayContainer}.
3. Add container={useOverlayPortalContainer()} to menu.tsx:82, popover.tsx:74 and tooltip.tsx:29. Call the hook at the top of each component, which is required for Tooltip and Popover because the Portal is created inline.
4. Export popIn from dropdown-panel.ts. Use it in the popover cva base (replacing lines 19-21) and in the tooltip className (replacing lines 35-37). Leave Menu's motion unchanged.
5. Optional: extract MenuPopup (Portal + Positioner + Popup) in menu.tsx. Menu renders Trigger plus MenuPopup; PointerMenu renders Root(open, onOpenChange) plus MenuPopup with surface='frosted'. Then decide with design whether the frosted surface gains rounded-card. If it does, drop the hand-added rounded-card in preview overlays.tsx:115.
6. Verify in the browser: hover a structure bonus Tooltip inside the Structures SidePanel (at /industry with the panel open), open a Popover or Menu inside a Dialog, and check stacking, focus return and the SidePanel slide transform. The Hull Select inside the same SidePanel already proves the popup-container route works under that transform.

**Tests.** Add src/components/ui/overlay-portal.test.ts in the vi.mock style of dialog.test.ts. Mock the Portal of @base-ui/react/tooltip, popover, menu, select and autocomplete to capture props, render Tooltip, Popover, Menu, PointerMenu, Select and Combobox inside <OverlayPortalContainerProvider container={el}>, and assert each Portal received container === el. Outside the provider, assert container is undefined. Existing guards: dialog.test.ts (portal keepMounted and modal focus), side-panel.test.ts, and connection-fields.test.ts and MapSwitcher.test.ts, which render Tooltip and Menu consumers.

**Notes.** Outside a dialog the context is null, so the hook returns undefined and behaviour is unchanged (portal to body). Only popups inside Dialog, SidePanel or ConfirmDialog move. They move into the popup element, which puts them inside the modal focus scope and above the popup, matching Select, Combobox and PointerMenu today. Inside a dialog, Popover's openOnHover and closeDelay behaviour should be unaffected but needs a manual check. The Dialog's popupEl is null on the first render, so these popups portal to the parent node for one frame before moving; Select already lives with this. Surface drift: Menu solid uses menuPanelSurface (rounded-card overflow-hidden), while Menu frosted and PointerMenu use bare panelSurface (square). The two production PointerMenus (map edge and node context menus) are square, probably by accident given that every other popup is rounded-card; confirm with design before changing.

<sub>Reported by: area:ui-components.</sub>

<a id="p021"></a>

## P021: Give Checkbox and Switch a visible-label row, and let the existing Field label Select and PercentInput

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** medium · **Payoff:** low · **Size:** Checkbox/Switch half about -25 across 5 sites, +30 in ui (slot, token, tests); Field half about -15 (LabeledField, CorpRigEditor column, FeedbackModal span), +12 (id forwarding and labelStyle)
- **Depends on:** —
- **Existing primitive:** `src/components/ui/radio-group.tsx:RadioGroup; src/components/ui/field.tsx:Field`

**Problem.** Checkbox and Switch take label only as an aria-label. Five sites wrap them in hand-built <label className='flex items-center gap-…'> rows that drift on gap, cursor and disabled affordance, and AccountDangerZone's aria-label replaces its visible sentence with different words (a WCAG 2.5.3 failure). RadioGroup already owns the right labelled-row markup. Separately, Field labels its child by cloning an id into it, but Select and PercentInput drop id. So StructureComposer has its own LabeledField (Field's root layout with an eyebrow label), two of its four uses (Hull, Facility tax) leave the visible label unassociated, FeedbackModal's Category label is a bare span beside a Select, and CorpRigEditor rebuilds the same eyebrow label column.

**Verifier revision.** The Checkbox/Switch gap is real. RadioGroup already renders a labelled <label> row with canonical disabled and cursor handling, but Checkbox and Switch accept only an aria-label. So 5 production sites hand-build <label> rows, and they have drifted on gap (2, 2.5 or 3), cursor-pointer (present on 3 sites, absent on AccountDangerZone and corp-sharing) and disabled styling (only CategoryChecklist adds it, by hand; TrashWindow keeps cursor-pointer when disabled). Two claims are corrected. 'Accessible name does not match the visible label' holds for only 1 of the 5: the other aria-labels contain the visible text, so they pass WCAG 2.5.3. AccountDangerZone is the real mismatch ('Acknowledge permanent account deletion' versus 'I understand my account and all of my saved data will be lost.'), and the finders missed CharacterSearchControl (visible 'Add character', name 'Search characters'). On the Field half, a new non-cloning FieldLayout would duplicate Field. Base UI 1.7's Field.Root already feeds the label id to Base controls through LabelableContext (SelectTrigger.js), and the only blocker for the cloned id is that Select and PercentInput do not accept or forward id. Reuse the existing Field by forwarding id and giving Field an eyebrow label style for StructureComposer's and CorpRigEditor's micro labels. CorpRigEditor's wrapping <label> already associates its input, so it is a style duplicate, not an a11y bug.

**Sites (17).**

- [`src/components/ui/checkbox.tsx:25-55`](../../src/components/ui/checkbox.tsx#L25-L55) — label only becomes aria-label; no visible-label slot
- [`src/components/ui/switch.tsx:24-53`](../../src/components/ui/switch.tsx#L24-L53) — label only becomes aria-label; no visible-label slot
- [`src/components/ui/radio-group.tsx:46-64`](../../src/components/ui/radio-group.tsx#L46-L64) — Canonical labelled row: flex cursor-pointer gap-2.5, has-[[data-disabled]]:cursor-not-allowed and opacity-50
- [`src/components/composition/account/AccountDangerZone.tsx:318-328`](../../src/components/composition/account/AccountDangerZone.tsx#L318-L328) — Wrapper label with gap-2, no cursor; aria-label 'Acknowledge permanent account deletion' does not contain the visible sentence (Label-in-Name failure)
- [`src/features/industry-planner/components/MultibuyPanel.tsx:118-126`](../../src/features/industry-planner/components/MultibuyPanel.tsx#L118-L126) — Wrapper label with gap-2 and cursor-pointer; name 'Build tier N' contains the visible 'Tier N'; trailing type count
- [`src/app/(site)/settings/corporations/corp-sharing-card.tsx:66-77`](../../src/app/%28site%29/settings/corporations/corp-sharing-card.tsx#L66-L77) — Wrapper label around Switch with gap-2.5, no cursor; trailing 'sharing on/off' state text
- [`src/components/composition/industry-workspace/CategoryChecklist.tsx:38-55`](../../src/components/composition/industry-workspace/CategoryChecklist.tsx#L38-L55) — Wrapper label with gap-2.5 and hand-rolled disabled/cursor classes; trailing bonus text
- [`src/features/maps/TrashWindow.tsx:69-86`](../../src/features/maps/TrashWindow.tsx#L69-L86) — Wrapper label with insetSurface and gap-3; cursor-pointer even when disabled; trailing provenance text
- [`src/components/ui/field.tsx:56-105`](../../src/components/ui/field.tsx#L56-L105) — Clones id, disabled, aria-describedby and aria-invalid into its child; Base.Label htmlFor={controlId}; aria-describedby becomes '' when there is no hint or error
- [`src/features/custom-structures/components/StructureComposer.tsx:50, 84-91, 142-157, 376-383, 395-397, 433-442`](../../src/features/custom-structures/components/StructureComposer.tsx#L50) — LabeledField copies Field's root classes with an eyebrow({size:'micro'}) label; Hull (Select) and Facility tax (PercentInput) get no htmlFor
- [`src/features/owned-structures/components/CorpRigEditor.tsx:65-68`](../../src/features/owned-structures/components/CorpRigEditor.tsx#L65-L68) — Hand-rolled eyebrow label column around PercentInput (implicitly associated)
- [`src/features/feedback/components/FeedbackModal.tsx:76-97`](../../src/features/feedback/components/FeedbackModal.tsx#L76-L97) — Missed by finders: span with fieldLabel class beside a Select, not associated
- [`src/features/maps/CharacterSearchControl.tsx:140-141, 171-197`](../../src/features/maps/CharacterSearchControl.tsx#L140-L141) — Missed by finders: visible 'Add character' span not associated; Combobox aria-label 'Search characters' does not contain it
- [`src/components/ui/select.tsx:72-97, 109-110`](../../src/components/ui/select.tsx#L72-L97) — Select accepts no id; Base.Trigger gets only aria-label
- [`src/components/PercentInput.tsx:6-30`](../../src/components/PercentInput.tsx#L6-L30) — Accepts no id; only aria-label
- [`node_modules/@base-ui/react/select/trigger/SelectTrigger.js:55-90`](../../node_modules/@base-ui/react/select/trigger/SelectTrigger.js#L55-L90) — Base Select.Trigger resolves aria-labelledby from the Field label id in LabelableContext
- [`src/features/maps/TrashWindow.test.ts:31-34, 77-78`](../../src/features/maps/TrashWindow.test.ts#L31-L34) — Checkbox mock renders aria-label from label; asserts 'Select Created map'

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/maps/AccessListEditor.tsx:115-134`](../../src/features/maps/AccessListEditor.tsx#L115-L134) — div row with an action-style name 'Add/Remove X' and a portrait; it can adopt the slot later, but the name semantics differ, so it is not part of this migration
- [`src/app/(site)/settings/settings-control-row.tsx:13-54`](../../src/app/%28site%29/settings/settings-control-row.tsx#L13-L54) — Label-first, control-at-end rows; aria-label equals the visible text; a different layout (and a near-duplicate of PageMenuSection, which is a separate finding)
- [`src/components/composition/PageMenuSection.tsx:16-52`](../../src/components/composition/PageMenuSection.tsx#L16-L52) — Same label-first row as settings-control-row; not a wrapper-label site
- [`src/components/composition/industry-workspace/ProfileDialogs.tsx:44-67`](../../src/components/composition/industry-workspace/ProfileDialogs.tsx#L44-L67) — A section labelled by aria-labelledby with a header action button: a group label, not a field

</details>

**Home.** `src/components/ui/checkbox.tsx and switch.tsx, plus a shared choiceRow token in a new src/components/ui/choice-row.ts that radio-group.tsx also uses; src/components/ui/field.tsx, src/components/ui/select.tsx and src/components/PercentInput.tsx for the Field half`

**Boundary check.** Checkbox, Switch, choice-row.ts, Field and Select are in the ui zone and import only other ui files (cn, type-roles' eyebrow) and @base-ui packages, so the ui rule (allow: []) holds. PercentInput is in the components zone (src/components/*.tsx), whose rule allows ui. Consumers: features/industry-planner, features/maps, features/custom-structures, features/owned-structures and features/feedback (rule 'features' allows ui and components); components-composition (allows ui); src/app/(site)/settings (rule 'app' allows ui). No cross-feature import is introduced: LabeledField and the CorpRigEditor column both move to ui's Field instead of sharing code between features.

**API sketch.**

```ts
// choice-row.ts
export const choiceRow = 'flex cursor-pointer gap-2.5 font-ui text-ui text-text has-[[data-disabled]]:cursor-not-allowed has-[[data-disabled]]:opacity-50';
// checkbox.tsx (switch.tsx identical)
type ChoiceLabel =
  | { label: string; children?: undefined; rowClassName?: undefined }      // today: aria-only
  | { children: ReactNode; label?: string; rowClassName?: string };          // visible row; name from <label> text unless label is given
export function Checkbox(props: { checked: boolean; onCheckedChange: (c: boolean) => void; tone?: CheckboxTone; disabled?: boolean; className?: string } & ChoiceLabel): JSX.Element
// field.tsx
Field({ label, hint, error, invalid, disabled, labelStyle = 'field', children, className }: { labelStyle?: 'field' | 'eyebrow'; ... })
// select.tsx / PercentInput.tsx
Select({ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean; ariaLabel?: string; ... })  // forwarded to Base.Trigger
PercentInput({ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean; ariaLabel?: string; ... })  // forwarded to Input
```

**Migration steps.**

1. Add choice-row.ts with choiceRow, and switch radio-group.tsx's <label> to cn(choiceRow, 'items-start') so the disabled and cursor rules have one definition.
2. Checkbox and Switch: when children are given, render <label className={cn(choiceRow, 'items-center', rowClassName)}><Base.Root aria-label={label} .../>{children}</label>, setting aria-label only if label is passed. Without children, keep today's aria-only output exactly.
3. Migrate AccountDangerZone first, because it fixes the WCAG 2.5.3 failure: pass the sentence as children, tone red, rowClassName 'items-start', and no label.
4. Migrate MultibuyPanel, CategoryChecklist and TrashWindow, moving their row classes into rowClassName (TrashWindow: insetSurface gap-3; CategoryChecklist: the off/parent tone classes, with its hand-rolled cursor and opacity classes deleted because choiceRow covers them). Keep label where trailing extras would pollute the name, and make sure the label starts with the visible text (MultibuyPanel label 'Tier N'; TrashWindow label = map name).
5. corp-sharing-card: pass the corporation name as children, and either move the 'sharing on/off' text outside the label or pass label={corp.corporationName} so the state text stays out of the name.
6. Field half: make Select and PercentInput accept id, aria-describedby and aria-invalid and forward them to Base.Trigger and Input; make their ariaLabel optional so Field supplies the name. In Field, map an empty describedBy to undefined.
7. Add labelStyle 'eyebrow' to Field (eyebrow({ size: 'micro' }) from ./type-roles). Replace StructureComposer's LabeledField with <Field labelStyle='eyebrow'> for all four uses (PickField already accepts id) and delete LabeledField and its local label constant.
8. Replace CorpRigEditor's hand-rolled label column (lines 65-68) with <Field labelStyle='eyebrow' label='Facility tax' className='mr-auto w-40'>.
9. Replace FeedbackModal's Category span-plus-Select with <Field label='Category'><Select .../></Field>.
10. CharacterSearchControl: make the visible label the name, either by associating the span through aria-labelledby on Combobox.Field or by changing searchLabel to start with 'Add character'. This is a one-line local fix; it does not need Field.
11. Check in the browser that a Select inside Base Field.Root picks up aria-labelledby, that label clicks focus or open the control, and that there is no doubled name.

**Tests.** Add src/components/ui/checkbox.test.ts and switch.test.ts. With children, the output must be a <label> containing the control with no aria-label; with label only, an aria-label must be present (today's behaviour); a disabled control must make choiceRow's has-[[data-disabled]] styles apply. radio-group.test.ts already exists and must stay green. Extend field coverage with Field wrapping Select and PercentInput: assert the trigger or input receives the cloned id and the label's htmlFor matches. Update TrashWindow.test.ts's Checkbox mock (lines 31-34) to the new props and keep the 'Select Created map' assertions, or change them to the map name if label changes. Check e2e selectors for the renamed AccountDangerZone checkbox (no current e2e match was found for these labels).

**Notes.** The two halves are independent and can land separately; the Checkbox/Switch half carries the a11y fix and the drift cleanup. The visible text sits inside a native <label>, so it becomes the accessible name, including any trailing spans (counts, provenance, bonus text, sharing state). Use the label override or move trailing text out where that would read badly. Be careful with corp-sharing's 'sharing on/off', which repeats the switch state. TrashWindow's whole inset row must stay clickable. RadioGroup is the correct reference for disabled and cursor affordances; CategoryChecklist's hand-rolled version and TrashWindow's always-pointer row are the drifted copies. Field's Base.Root also provides Base UI field context (invalid, disabled) to Base controls, and Select inside it gains data-invalid and data-disabled; this needs a quick visual check. StructureComposer's eyebrow-style labels are a deliberate dense style, which is why the design adds labelStyle instead of switching them to fieldLabel.

<sub>Reported by: area:ui-components.</sub>

<a id="p006"></a>

## P006: Export CollapsibleChevron from ui/collapsible and make it the only data-chevron owner (fixes 4 missing aria-hidden)

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** missing-primitive · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -40 (7 five-line spans become one-line calls) and about +15 for the primitive. Net about -25.
- **Depends on:** —
- **Existing primitive:** `src/components/ui/collapsible.tsx:Collapsible`

**Problem.** Collapsible's stylesheet rotates [data-chevron] inside an open summary, but Collapsible never renders a chevron. Seven call sites hand-write the same span. Four forget aria-hidden, so screen readers read the ▾ glyph as part of the summary's accessible name. FacilitiesPanel builds the same down-to-up flip with group-open:rotate-180 on an SVG instead.

**Sites (11).**

- [`src/components/ui/collapsible.css:1-3`](../../src/components/ui/collapsible.css#L1-L3) — details[data-collapsible][open] > summary [data-chevron] { rotate(180deg) }
- [`src/components/ui/collapsible.tsx:4-39`](../../src/components/ui/collapsible.tsx#L4-L39) — Renders details/summary with the 'group' class and data-collapsible; no chevron
- [`src/app/(site)/admin/health/StatusRow.tsx:28-33`](../../src/app/%28site%29/admin/health/StatusRow.tsx#L28-L33) — ml-auto; no aria-hidden
- [`src/app/(site)/admin/health/ServiceLevelRows.tsx:235-240`](../../src/app/%28site%29/admin/health/ServiceLevelRows.tsx#L235-L240) — Trailing position after a flex-1 title; no aria-hidden
- [`src/app/(site)/settings/characters/page.tsx:116-121`](../../src/app/%28site%29/settings/characters/page.tsx#L116-L121) — ml-auto; no aria-hidden
- [`src/mapper/canvas/MapControls.tsx:389-401`](../../src/mapper/canvas/MapControls.tsx#L389-L401) — DialGroupHeader; span at 393-398; ml-auto; no aria-hidden
- [`src/mapper/log/MapEventLog.tsx:73-79`](../../src/mapper/log/MapEventLog.tsx#L73-L79) — aria-hidden, ml-auto (correct)
- [`src/mapper/signatures/scanner-section-table.tsx:172-178`](../../src/mapper/signatures/scanner-section-table.tsx#L172-L178) — aria-hidden, leading (correct)
- [`src/features/industry-planner/components/FeeBreakdownPanel.tsx:44-46`](../../src/features/industry-planner/components/FeeBreakdownPanel.tsx#L44-L46) — aria-hidden, plus w-3 text-center (correct)
- [`src/components/composition/industry-workspace/FacilitiesPanel.tsx:106`](../../src/components/composition/industry-workspace/FacilitiesPanel.tsx#L106) — ChevronDownIcon with group-open:rotate-180. Same down-to-up affordance, unscoped mechanism. Optional adopter via children
- [`src/esi-datasets/ui-adoption.test.ts:33-42`](../../src/esi-datasets/ui-adoption.test.ts#L33-L42) — filesMatching skips ui and can host a data-chevron zero-ratchet

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/composition/board/sections/SkillsSection.tsx:53-55`](../../src/components/composition/board/sections/SkillsSection.tsx#L53-L55) — › rotated 90° (right to down) is a different disclosure affordance; data-chevron's 180° would point it left. Leave it unless design accepts ▾
- [`src/mapper/windows/SystemIntelligenceBody.tsx:66`](../../src/mapper/windows/SystemIntelligenceBody.tsx#L66) — Not a Collapsible; the IntelIcon expand rotation is driven by React state
- [`src/components/ui/stepper.tsx:97`](../../src/components/ui/stepper.tsx#L97) — Static rotate-180 for an increment arrow, not a disclosure
- [`src/app/(site)/preview/primitives/overlays.tsx:61`](../../src/app/%28site%29/preview/primitives/overlays.tsx#L61) — ▾ inside a Popover trigger label, not a Collapsible

</details>

**Home.** `src/components/ui/collapsible.tsx (new export CollapsibleChevron next to Collapsible)`

**Boundary check.** Home zone is ui (rule 'ui -> []'); the component needs only ./cn and react types. Consumer zones: app (StatusRow, ServiceLevelRows, settings/characters) allows 'ui'; mapper (MapControls, MapEventLog, scanner-section-table) allows 'ui'; features (FeeBreakdownPanel) allows 'ui'; components-composition (FacilitiesPanel, optional) allows 'ui'.

**API sketch.**

```ts
/** Rotates when its Collapsible opens; must sit inside the Collapsible header. */
export function CollapsibleChevron({ className, children = '▾' }: { className?: string; children?: ReactNode }) {
  return (
    <span data-chevron aria-hidden className={cn('inline-block shrink-0 text-micro text-muted transition-transform', className)}>
      {children}
    </span>
  );
}
```

**Migration steps.**

1. Add CollapsibleChevron to src/components/ui/collapsible.tsx with JSDoc noting that it works only inside a Collapsible header. Keep the data-chevron attribute so collapsible.css still applies.
2. Add src/components/ui/collapsible.test.ts. Render it and assert data-chevron, aria-hidden="true", the base classes and that className merges.
3. Replace the 3 correct copies first (no visible change): MapEventLog 73-79 (className='ml-auto'), scanner-section-table 172-178, and FeeBreakdownPanel 44-46 (className='w-3 text-center').
4. Replace the 4 drifted copies, which now gain aria-hidden: StatusRow 28-33 (ml-auto), ServiceLevelRows 235-240, settings/characters/page.tsx 116-121 (ml-auto), and MapControls DialGroupHeader 393-398 (ml-auto).
5. Optional: FacilitiesPanel 106 becomes <CollapsibleChevron><ChevronDownIcon size={14} /></CollapsibleChevron>, dropping group-open:rotate-180. The rotation becomes scoped to its own summary.
6. Add a ratchet to src/esi-datasets/ui-adoption.test.ts: expect(filesMatching(/\bdata-chevron\b/)).toEqual([]). The ui directory is already skipped.
7. Optional: show the chevron in the Collapsible specimen at src/app/(site)/preview/primitives/structure.tsx:98-104.
8. Leave SkillsSection as a documented exception unless design accepts ▾.

**Tests.** New: src/components/ui/collapsible.test.ts (CollapsibleChevron markup) and the data-chevron zero-ratchet in src/esi-datasets/ui-adoption.test.ts. No existing test asserts chevron markup; MapEventLog and MapControls tests should keep passing because the visible text is unchanged.

**Notes.** All 7 copies share identical base classes. The only differences are placement (ml-auto on 4 sites, leading on 2, trailing after a flex-1 title on 1) and FeeBreakdownPanel's w-3 text-center; className covers all of them, so a position prop is unnecessary. The correct copies are MapEventLog, scanner-section-table and FeeBreakdownPanel (aria-hidden present). The CSS selector requires the chevron to be a descendant of the Collapsible's own summary; every migrated site meets this. FacilitiesPanel's group-open variant would also rotate when any open ancestor .group exists, so the data-chevron selector is the more robust mechanism.

<sub>Reported by: area:app-site, area:mapper-surface, concern:ui-patterns.</sub>

<a id="p018"></a>

## P018: Make Skeleton decorative unless labelled, and add a SkeletonGroup status region for composite fallbacks

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -35 (per-bar labels and aria-hidden props removed), +20 (SkeletonGroup and test)
- **Depends on:** —
- **Existing primitive:** `src/components/ui/skeleton.tsx:Skeleton`

**Problem.** src/components/ui/skeleton.tsx gives every instance role=status and a default aria-label of 'Loading'. Composite fallbacks therefore handle the multi-bar case in three different ways. (a) The first bar is labelled and the rest are aria-hidden: JobsCard, EveStatusPanel, changelog/[slug], sites/[id], and industry/[id] through an sr-only skeleton. (b) A role=status container whose bars are all aria-hidden: CharacterPanelSkeleton. (c) Every bar is its own status node: BoardSkeleton has 17 individually labelled bars inside an aria-busy div, WorkspaceSkeleton has 12 default 'Loading' bars, and admin CardFallback has 2 per row, so 10 per card at rows=5. Patterns (a) and (b) are correct; (c) leaves many 'Loading' status nodes in the accessibility tree. Every caller has to remember aria-hidden, and three did not.

**Verifier revision.** The core holds. Skeleton puts role=status and aria-label='Loading' on every bar by default, so each composite has to opt out bar by bar, and three conventions have grown up. Two corrections. First, the counts were understated: BoardSkeleton exposes up to 17 named status nodes, not 13, and WorkspaceSkeleton has 12 unnamed default 'Loading' regions plus 1 labelled one. Second, 'floods with announcements' is overstated. Screen readers announce a role=status that has only an aria-label and no text inconsistently. The harm you can count on is browse-mode noise: dozens of 'Loading' status nodes per screen. Two first-labelled sites were missed (changelog/[slug], sites/[id]), plus the preview specimen. All 13 standalone single-skeleton callers already pass an explicit label, so making unlabelled skeletons decorative changes only the composites, and those are the ones meant to change.

**Sites (12).**

- [`src/components/ui/skeleton.tsx:4-16`](../../src/components/ui/skeleton.tsx#L4-L16) — role=status plus default label 'Loading' on every instance; spreads props last, so callers can override it with aria-hidden
- [`src/components/composition/board/BoardSkeleton.tsx:7-35`](../../src/components/composition/board/BoardSkeleton.tsx#L7-L35) — aria-busy wrapper, then 3 + 3x2 + 4 + 4 = 17 individually labelled status bars
- [`src/components/composition/industry-workspace/WorkspaceStates.tsx:10-34`](../../src/components/composition/industry-workspace/WorkspaceStates.tsx#L10-L34) — One labelled bar (line 14), then 12 unlabelled bars that each default to a 'Loading' status region (lines 18, 20, 21 in a x3 loop; lines 28-30)
- [`src/app/(site)/admin/CardFallback.tsx:5-20`](../../src/app/%28site%29/admin/CardFallback.tsx#L5-L20) — Two default 'Loading' regions per row; AdminFrame.tsx:37 and :59 render it with rows=5 or more
- [`src/components/composition/CharacterPanelSkeleton.tsx:4-28`](../../src/components/composition/CharacterPanelSkeleton.tsx#L4-L28) — Correct pattern: Card role=status aria-label={label}, every bar aria-hidden
- [`src/features/industry-jobs/components/JobsCard.tsx:111-145`](../../src/features/industry-jobs/components/JobsCard.tsx#L111-L145) — First-labelled pattern using aria-hidden={row === 0 ? undefined : true}; JobsCardSkeleton header bars are aria-hidden
- [`src/components/composition/EveStatusPanel.tsx:28-37`](../../src/components/composition/EveStatusPanel.tsx#L28-L37) — First-labelled pattern
- [`src/app/(site)/industry/[id]/page.tsx:112-130`](../../src/app/%28site%29/industry/[id]/page.tsx#L112-L130) — An sr-only Skeleton serves as the status node and every visible bar is aria-hidden
- [`src/app/(site)/changelog/[slug]/page.tsx:55-63`](../../src/app/%28site%29/changelog/[slug]/page.tsx#L55-L63) — First-labelled pattern (missed by finders)
- [`src/app/(site)/sites/[id]/page.tsx:110-116`](../../src/app/%28site%29/sites/[id]/page.tsx#L110-L116) — First-labelled pattern (missed by finders)
- [`src/app/(site)/preview/primitives/feedback.tsx:136-149`](../../src/app/%28site%29/preview/primitives/feedback.tsx#L136-L149) — Preview specimen: 9 unlabelled default 'Loading' bars; it teaches pattern (c)
- [`src/esi-datasets/ui-adoption.test.ts:77-85`](../../src/esi-datasets/ui-adoption.test.ts#L77-L85) — Existing source-regex guard file where a no-aria-hidden-on-Skeleton guard can live

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/wormhole-sites/widget.tsx:46-52`](../../src/features/wormhole-sites/widget.tsx#L46-L52) — Standalone labelled skeleton; keeps role=status under the new API
- [`src/components/composition/account/LoginButton.tsx:111-116`](../../src/components/composition/account/LoginButton.tsx#L111-L116) — Standalone labelled skeleton; unchanged
- [`src/features/industry-planner/components/PlannerRail.tsx:112, 133`](../../src/features/industry-planner/components/PlannerRail.tsx#L112) — Standalone labelled skeletons; unchanged
- [`src/components/ui/loading-label.tsx:3-15`](../../src/components/ui/loading-label.tsx#L3-L15) — Visible text loading label, a different concept; not a status region

</details>

**Home.** `src/components/ui/skeleton.tsx (change Skeleton, add SkeletonGroup in the same file)`

**Boundary check.** Home zone: ui. skeleton.tsx imports only './cn', and ui may import nothing outside ui. Consumers: features/industry-jobs and features/industry-planner (rule 'features' allows ui); src/components/composition/** (rule 'components-composition' allows ui); src/app/(site)/** (rule 'app' allows ui). Every import is legal.

**API sketch.**

```ts
export function Skeleton({ label, className, ...props }: { label?: string } & ComponentProps<'span'>): JSX.Element  // label present -> role='status' aria-label={label}; absent -> aria-hidden='true', no role
export function SkeletonGroup({ label, className, children, ...props }: { label: string; children: ReactNode } & ComponentProps<'div'>): JSX.Element  // <div role='status' aria-label={label} aria-busy='true' className={className}>{children}</div>
```

**Migration steps.**

1. In skeleton.tsx, remove the label default. Render {role:'status','aria-label':label} when label is set and {'aria-hidden':true} otherwise, and keep {...props} last. Add SkeletonGroup in the same file.
2. Add src/components/ui/skeleton.test.ts covering three cases: an unlabelled Skeleton is aria-hidden with no role; a labelled one is role=status with aria-label; SkeletonGroup renders role=status, aria-busy and aria-label.
3. BoardSkeleton: replace the root div with <SkeletonGroup label='Loading your characters' className=...grid classes...>. Delete all 17 per-bar labels and the aria-busy attribute.
4. WorkspaceSkeleton: replace the root with <SkeletonGroup label='Loading production profiles' className=...>. Delete the label on the first bar.
5. CardFallback: keep Card and SectionHeader, and wrap the rows in <SkeletonGroup label={`Loading ${label}`}>.
6. JobRowsSkeleton: replace the root with <SkeletonGroup label='Loading jobs' className='flex flex-col'>. Delete the conditional aria-hidden and the first-bar label. In JobsCardSkeleton, delete the aria-hidden props on the header bars.
7. EveStatusPanelFallback, ChangelogMasterFallback and SiteDetailFallback: replace each root div with SkeletonGroup, moving the first bar's label to the group, and delete the aria-hidden props on the bars.
8. industry/[id] PlannerSkeleton: replace the root with <SkeletonGroup label='Loading blueprint' className=...grid...>. Delete the sr-only Skeleton and every aria-hidden='true'.
9. CharacterPanelSkeleton: keep Card role=status, or render the rows in SkeletonGroup. Delete the four redundant aria-hidden props.
10. Wrap the preview feedback specimen in SkeletonGroup so the reference shows the right pattern.
11. In ui-adoption.test.ts, add a guard that filesMatching(/<Skeleton\b[^>]*aria-hidden/) equals [], so the old opt-out convention cannot come back.

**Tests.** New: src/components/ui/skeleton.test.ts (the three render cases). Strengthen existing tests: HomeBoardView.test.ts (around lines 125-131) should assert exactly one role="status" in the BoardSkeleton markup; add the same single-status assertion for WorkspaceSkeleton and CardFallback (page-coverage.test.ts already imports CardFallback). Existing guards that must stay green: JobsCard.test.ts:78 (aria-label="Loading jobs"), EveStatusPanel.test.ts:20-22 (aria-label="Loading EVE status"), HomeBoardView.test.ts:129-131 ('Loading your characters'), and the reduced-motion.test.ts 'skeleton-shimmer' entry.

**Notes.** Behaviour to preserve: every standalone labelled skeleton must keep role=status. All 13 of them pass an explicit label today, so dropping the default does not affect them. Only WorkspaceSkeleton's and CardFallback's unlabelled bars and the preview specimen relied on the default. CardFallback has no announcing node of its own, so it must gain a SkeletonGroup in the same commit or the admin cards lose their loading announcement. Keep max-lg:hidden and the other responsive classes on the bars; they remain purely visual. aria-busy on a role=status container is fine. JobsCard's comment ('The first placeholder announces the load; the rest are decoration') records the intent that SkeletonGroup now encodes.

<sub>Reported by: concern:ui-patterns.</sub>

<a id="p020"></a>

## P020: Render SegmentedControl's link mode with next/link and drop Pagination's unused href mode

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -15 (the Pagination href branch and threading), +6 (Link import and the no-href fallback)
- **Depends on:** —
- **Existing primitive:** `src/components/ui/segmented.tsx:SegmentedControl; src/components/ui/tabs.tsx:tabTrack,tabItem,tabSpotlight`

**Problem.** SegmentedControl's href option renders <a href>, so admin RangeSelector, its only link-mode consumer, does a full page reload on each range change. The admin rail one column over navigates the same ?range= URLs as soft navigations through next/link, as do SortableTable headers. Pagination also carries an <a>-based hrefForPage mode that nothing uses.

**Verifier revision.** The next/link half is real. SegmentedControl's link mode renders a plain <a>, so its only consumer, the admin RangeSelector, reloads the whole document on every range change. The admin rail (admin-nav.tsx) links to the same ?range= URLs with next/link, and ui already uses next/link in sortable-table.tsx and content-browser-nav.tsx. Pagination's hrefForPage <a> branch has no consumer at all (the only use is the preview, which uses onPageChange), so the right fix is to delete it, not convert it. The route-tab half is rejected. IndustryShell does not hand-assemble a bypass: tabs.tsx:14-18 exports tabTrack, tabItem and tabSpotlight for exactly this ('shared with tab bars that navigate between routes'). It is the only route-tab bar, and its ViewTransition morph, transitionTypes and conditional prefetch are specific to it, so a LinkTabs primitive would have one consumer, which breaks AGENTS.md's second-consumer rule. Folding it into SegmentedControl would change its look (isk spotlight versus green segment fill).

**Sites (9).**

- [`src/components/ui/segmented.tsx:87-103`](../../src/components/ui/segmented.tsx#L87-L103) — Link mode renders <a href={option.href}>, typed string \| undefined
- [`src/app/(site)/admin/RangeSelector.tsx:8-20`](../../src/app/%28site%29/admin/RangeSelector.tsx#L8-L20) — Only link-mode consumer; hrefs come from rangeHref(basePath, option)
- [`src/app/(site)/admin/admin-sections.ts:105-114`](../../src/app/%28site%29/admin/admin-sections.ts#L105-L114) — rangeHref and adminSectionHref build the same ?range= URLs
- [`src/app/(site)/admin/admin-nav.tsx:16-51, 66-78`](../../src/app/%28site%29/admin/admin-nav.tsx#L16-L51) — The admin rail uses next/link with adminSectionHref(section, range): soft navigation to the same URLs
- [`src/components/ui/sortable-table.tsx:51-65`](../../src/components/ui/sortable-table.tsx#L51-L65) — ui already renders next/link with scroll={false} for in-place search-param navigation
- [`src/components/ui/content-browser-nav.tsx:3, 17-30`](../../src/components/ui/content-browser-nav.tsx#L3) — A second ui file that imports next/link
- [`src/components/ui/pagination.tsx:10-16, 40-46, 96-114`](../../src/components/ui/pagination.tsx#L10-L16) — The hrefForPage <a> branch and its prop threading
- [`src/app/(site)/preview/primitives/navigation.tsx:62`](../../src/app/%28site%29/preview/primitives/navigation.tsx#L62) — Only Pagination consumer; uses onPageChange, never hrefForPage
- [`src/components/ui/coverage.test.ts:75-105`](../../src/components/ui/coverage.test.ts#L75-L105) — Pagination is pinned as a leftover runtime export

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/composition/industry-workspace/IndustryShell.tsx:33-82`](../../src/components/composition/industry-workspace/IndustryShell.tsx#L33-L82) — Uses tabTrack, tabItem and tabSpotlight as tabs.tsx documents; it is the single route-tab bar, with a ViewTransition morph, transitionTypes and prefetch flags. No second consumer for a LinkTabs primitive.
- [`src/components/ui/tabs.tsx:14-23, 25-87`](../../src/components/ui/tabs.tsx#L14-L23) — Tokens deliberately shared with route tab bars; Tabs is Base UI in-page tabs with panels, a different concept
- [`src/components/ui/segmented.tsx:48-59`](../../src/components/ui/segmented.tsx#L48-L59) — The track is close to tabTrack, but only 2 copies; a shared token is optional polish, not worth its own change

</details>

**Home.** `src/components/ui/segmented.tsx and src/components/ui/pagination.tsx (existing primitives)`

**Boundary check.** Home zone: ui. next/link is a package, not a zone, and ui already imports it in sortable-table.tsx:1 and content-browser-nav.tsx:3, so the ui rule (allow: []) is not affected. Consumer RangeSelector is in src/app/** (rule 'app' allows ui). The preview Pagination consumer is in app, which is also allowed.

**API sketch.**

```ts
// segmented.tsx, link mode
{options.map((option) => option.href === undefined
  ? <span key={option.value} aria-disabled className={segment({ tone, active: false, density })}>{option.label}</span>
  : <Link key={option.value} href={option.href} scroll={false} aria-current={value === option.value ? 'page' : undefined} className={segment({ tone, active: value === option.value, density })}>{option.label}</Link>)}
// pagination.tsx: remove hrefForPage from PageControlProps, PaginationItemControl and Pagination props
```

**Migration steps.**

1. In segmented.tsx, import Link from 'next/link' and replace the <a> in link mode with Link, passing scroll={false} as sortable-table does for in-place filter changes. Render options without an href as non-link spans, because Link requires href and today a mixed list yields <a href={undefined}>.
2. In pagination.tsx, delete hrefForPage from PageControlProps, PageControl (the <a> branch at lines 40-46), PaginationEdge, PaginationItemControl and Pagination. If a link-mode consumer ever appears, add it back with next/link.
3. Check RangeSelector by hand: on /admin/traffic, switching 7d, 30d, 90d and All should soft-navigate. TrafficContent reads searchParams.range, and the server segment re-renders under cacheComponents just as it does for admin rail navigation. Confirm the selected segment and the cards update with no document reload.

**Tests.** Add src/components/ui/segmented.test.ts. Render link mode with renderToStaticMarkup and assert the anchors carry the href, aria-current='page' on the active option, and the active classes. Mock next/link to a marker element to prove Link is used. Existing guards: page-coverage.test.ts:67 and 149-150 render RangeSelector and RangeSelectorFallback; it already mocks next/navigation and renders other next/link pages, so it should stay green. coverage.test.ts pins Pagination.

**Notes.** RangeSelectorFallback renders with value='' (no active option); Link keeps that working. Default prefetch on the 4 range links fetches only the static shell under partialPrefetching, which is acceptable; pass prefetch={false} if admin data fetching ever becomes expensive. Leave IndustryShell alone: its Tab component is the single consumer of the route-tab tokens, as tabs.tsx intends.

<sub>Reported by: area:ui-components.</sub>

<a id="p007"></a>

## P007: Promote KpiHelp to ui/help-popover.tsx as HelpPopover and replace NetWorthHelp and the AccountDangerZone (?) trigger

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -45 (KpiHelp body leaves kpi-tile, plus NetWorthHelp's and AccountDangerZone's trigger strings) and about +35 for the new file. Net about -10 to -15 plus a test.
- **Depends on:** —
- **Existing primitive:** `src/components/ui/popover.tsx:Popover; src/features/industry-planner/components/kpi-tile.tsx:KpiHelp`

**Problem.** src/AGENTS.md:11-12 makes the (?) hint a Popover that opens on hover; Popover defaults openOnHover to true. The styled trigger exists once, as KpiHelp, inside features/industry-planner. The board's NetWorthHelp copies its trigger classes verbatim. AccountDangerZone hand-builds a third (?) trigger with drifted size, border, background, cursor and hover color. The result is three visual treatments of one concept, and the canonical one sits where components-composition consumers have to copy it rather than reuse it.

**Verifier revision.** Confirmed: there are exactly three trigger="?" Popovers in production code. NetWorthHelp (WorthChart 104-123) repeats KpiHelp's non-attention trigger class string character for character. AccountDangerZone's trigger has drifted (h-4 w-4 grid, border-border, hover:text-text, no cursor-help, bg or font-bold). KpiHelp is stranded in a feature folder although components-composition already needs it. The design changes in four ways. (1) Use a separate file, src/components/ui/help-popover.tsx, and do not add it to popover.tsx: HomeBoardView.test.ts:11-16 mocks '@/components/ui/popover' with only Popover and PopoverHeading. A new export there would be undefined under that mock and crash the WorthChart render. A separate file importing './popover' still picks up the mock, so the test keeps passing unchanged. (2) features/industry-planner/coverage.test.ts:62,92 pins KpiHelp and must drop it. (3) The cited CockpitKpis 100-113 range was wrong; the real uses are 81-93, 169-171, 177-205 and 281-289. (4) Do not add a side prop: no caller passes one.

**Sites (9).**

- [`src/features/industry-planner/components/kpi-tile.tsx:28-59`](../../src/features/industry-planner/components/kpi-tile.tsx#L28-L59) — KpiHelp: trigger '?', 15px circle, attention (amber) and keepSide; the canonical copy
- [`src/components/composition/board/WorthChart.tsx:103-123`](../../src/components/composition/board/WorthChart.tsx#L103-L123) — NetWorthHelp: identical non-attention trigger classes; used at 144
- [`src/components/composition/account/AccountDangerZone.tsx:43-62`](../../src/components/composition/account/AccountDangerZone.tsx#L43-L62) — Drifted (?) trigger in a SectionHeader hint slot: 'grid h-4 w-4 ... border-border ... hover:text-text'
- [`src/components/ui/popover.tsx:33-96`](../../src/components/ui/popover.tsx#L33-L96) — Popover: trigger, triggerClassName, keepSide, openOnHover (default true), className
- [`src/features/industry-planner/components/CockpitKpis.tsx:29,81-93,169-171,177-205,281-289`](../../src/features/industry-planner/components/CockpitKpis.tsx#L29) — KpiHelp import and 4 uses (fee breakdown uses keepSide, attention and className w-[296px])
- [`src/features/industry-planner/components/MarketScorePanel.tsx:9,42`](../../src/features/industry-planner/components/MarketScorePanel.tsx#L9) — KpiHelp import and use
- [`src/features/industry-planner/components/MultibuyPanel.tsx:22,87-97`](../../src/features/industry-planner/components/MultibuyPanel.tsx#L22) — KpiHelp nested inside another Popover
- [`src/features/industry-planner/coverage.test.ts:62,92`](../../src/features/industry-planner/coverage.test.ts#L62) — Pins KpiHelp; must be updated when KpiHelp is deleted
- [`src/components/composition/board/HomeBoardView.test.ts:11-16,55,74`](../../src/components/composition/board/HomeBoardView.test.ts#L11-L16) — Mocks '@/components/ui/popover' (Popover and PopoverHeading only) and asserts data-popover="About estimated net worth"

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/industry-planner/components/MultibuyPanel.tsx:70-84`](../../src/features/industry-planner/components/MultibuyPanel.tsx#L70-L84) — Menu-style Popover (openOnHover=false, 'Multibuy ▾' trigger), not an informational hint
- [`src/features/industry-planner/components/CockpitKpis.tsx:122-125`](../../src/features/industry-planner/components/CockpitKpis.tsx#L122-L125) — Pill trigger for the regional discount, not a (?) mark
- [`src/features/industry-planner/components/NodeCard.tsx:122-135,161-170`](../../src/features/industry-planner/components/NodeCard.tsx#L122-L135) — Click popovers on a QtyRing or TypeIcon; different concept
- [`src/components/composition/ServerStatus.tsx:35-43`](../../src/components/composition/ServerStatus.tsx#L35-L43) — Status-text trigger, not a hint mark
- [`src/app/(site)/preview/primitives/overlays.tsx:229`](../../src/app/%28site%29/preview/primitives/overlays.tsx#L229) — Specimen of plain Popover with the text trigger 'Margin (?)'

</details>

**Home.** `src/components/ui/help-popover.tsx (new file; imports ./popover and ./cn)`

**Boundary check.** Home zone is ui (rule 'ui -> []'); it imports only ./popover and ./cn, both in ui. Consumer zones: features (CockpitKpis, MarketScorePanel, MultibuyPanel) allows 'ui'; components-composition (WorthChart, AccountDangerZone) allows 'ui'.

**API sketch.**

```ts
export function HelpPopover({ label, attention = false, keepSide, className, children }: {
  label: string;            // aria-label for the trigger and popup
  attention?: boolean;      // amber mark when something inside wants a look
  keepSide?: boolean;       // content grows while open
  className?: string;       // popup width etc.
  children: ReactNode;
}): JSX.Element  // <Popover trigger="?" triggerClassName={cn(BASE, attention ? AMBER : NEUTRAL)} ...>
```

**Migration steps.**

1. Create src/components/ui/help-popover.tsx by moving KpiHelp's body (kpi-tile.tsx 28-59) verbatim and renaming it HelpPopover. Do not add it to popover.tsx; see the HomeBoardView mock note.
2. Add src/components/ui/help-popover.test.ts. Render it with renderToStaticMarkup and assert the trigger has the aria-label and '?', the text-dps-mid and border-dps-mid/60 classes when attention is set, and the text-muted and hover:text-isk classes otherwise.
3. Repoint CockpitKpis (import at 29; uses at 83-91, 169-171, 177-205, 281-289), MarketScorePanel (9, 42) and MultibuyPanel (22, 87-97) to HelpPopover from '@/components/ui/help-popover'. Do not leave an alias re-export.
4. Delete KpiHelp from kpi-tile.tsx and its now-unused Popover import; cn and Card stay.
5. Update src/features/industry-planner/coverage.test.ts:62,92 to drop KpiHelp from the pinned list.
6. In WorthChart.tsx, replace the Popover in NetWorthHelp (106-121) with <HelpPopover label="About estimated net worth">. Keep the NetWorthHelp content wrapper or inline it at 144, and drop the unused Popover import while keeping PopoverHeading. HomeBoardView.test.ts keeps passing because help-popover's './popover' import resolves to the mocked module.
7. In AccountDangerZone.tsx 44-61, replace Popover with <HelpPopover label="What purge and unlink do"> and drop Popover from the import, keeping PopoverHeading and PopoverRow.
8. Optional: add a HelpPopover specimen (normal and attention) to src/app/(site)/preview/primitives/overlays.tsx.

**Tests.** New: src/components/ui/help-popover.test.ts (trigger markup in both tones). Existing guards: HomeBoardView.test.ts:55,74 (the net-worth hint renders only when net worth exists) and features/industry-planner/coverage.test.ts, which needs its pinned list edited. The CockpitKpis and MarketScore rendering tests, if any, keep their label text.

**Notes.** NetWorthHelp is pixel-identical to KpiHelp's non-attention tone, so it does not change visually. AccountDangerZone does change: 16px becomes 15px, it gains bg-bg-deep/60, font-bold and cursor-help, its border goes from border-border to border-border-idle, and its hover goes from text-text to isk-tinted (hover:border-isk-dim hover:text-isk). The isk accent will appear inside the red 'Danger zone' card, so get design sign-off; the proposal says this is intended. KpiHelp is the correct copy. Only CockpitKpis' fee-breakdown help uses attention, keepSide and className, and those must be preserved there. openOnHover stays at Popover's default of true, satisfying src/AGENTS.md:11-12.

<sub>Reported by: area:components-composition, area:ui-components, concern:ui-patterns.</sub>

<a id="p016"></a>

## P016: Move StatFigure to ui and replace ComponentDrawer's private Stat and AttributesSection's inline copy with it

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -30 / +22 (plus about -20 more if the KpiTile fold in step 5 is done)
- **Depends on:** —
- **Existing primitive:** `src/components/ui/multiples-grid.tsx:MultiplesCell; src/components/ui/type-roles.ts:eyebrow`

**Problem.** The labelled figure (an eyebrow({size:'micro'}) label over a 'font-data text-h3 tabular-nums' value with an optional tone class) is implemented three times. board-bits.tsx StatFigure uses dt/dd. ComponentDrawer has a private Stat using spans, plus min-w-0 and gap-1. AttributesSection writes StatFigure's dt/dd markup inline instead of calling it. The features copy exists because StatFigure lives in components-composition, which features may not import. The board KpiTile is the same figure on a readout surface, with a note line and a larger responsive size.

**Verifier revision.** Most of the proposal does not survive. The two KpiTile components share a name but are different abstractions. The planner KpiTile is a padded Card container. Its KpiHead is a fixed-height label row whose right slot holds toggles, PriceConfidence, badges and help popovers, and KPI_FIG is a semibold figure, all composed per tile in CockpitKpis and MarketScorePanel inside one feature. MultiplesCell is the admin hairline-grid cell: strong-tracking eyebrow, text-lead value, a delta slot and chart children. One StatTile with size × surface × note × aside props would add indirection without removing real duplication. ui/row.tsx Stat is an unrelated inline muted label. What does survive: board StatFigure and ComponentDrawer's private Stat are the same labelled figure (eyebrow micro muted label over a font-data text-h3 tabular-nums text-name value with a tone override). The copy exists because the features rule does not allow components-composition. AttributesSection also hand-rolls StatFigure's exact markup inline. Moving StatFigure to ui fixes all three. Folding the board KpiTile into it is an optional last step.

**Sites (10).**

- [`src/components/composition/board/board-bits.tsx:59-67`](../../src/components/composition/board/board-bits.tsx#L59-L67) — StatFigure: div gap-0.5, dt eyebrow micro, dd font-data text-h3 tabular-nums, tone default text-name
- [`src/features/industry-planner/components/ComponentDrawer.tsx:103-110`](../../src/features/industry-planner/components/ComponentDrawer.tsx#L103-L110) — Private Stat: span eyebrow({size:'micro', tone:'muted'}) over span font-data text-h3 tabular-nums text-name plus tone; div min-w-0 gap-1
- [`src/features/industry-planner/components/ComponentDrawer.tsx:219-236`](../../src/features/industry-planner/components/ComponentDrawer.tsx#L219-L236) — Five Stat uses in two div grids (not dl)
- [`src/components/composition/board/sections/AttributesSection.tsx:44-52`](../../src/components/composition/board/sections/AttributesSection.tsx#L44-L52) — Inline copy of StatFigure markup (div gap-0.5 / dt eyebrow micro / dd font-data text-h3 tabular-nums text-name) with an implant suffix
- [`src/components/composition/board/sections/IndustrySection.tsx:27-31`](../../src/components/composition/board/sections/IndustrySection.tsx#L27-L31) — StatFigure consumer
- [`src/components/composition/board/OverviewCards.tsx:105-109`](../../src/components/composition/board/OverviewCards.tsx#L105-L109) — StatFigure consumer
- [`src/components/composition/industry-workspace/ProductionCapacity.tsx:40-58`](../../src/components/composition/industry-workspace/ProductionCapacity.tsx#L40-L58) — StatFigure consumer with an icon and value node
- [`src/components/composition/board/board-bits.tsx:36-57`](../../src/components/composition/board/board-bits.tsx#L36-L57) — Board KpiTile: StatFigure plus readoutSurface padding, a 'text-h3 sm:text-stat' figure and an optional note dd
- [`src/components/composition/board/sections/SheetHeader.tsx:70-86`](../../src/components/composition/board/sections/SheetHeader.tsx#L70-L86) — The only KpiTile consumer (three tiles)
- [`src/features/industry-planner/components/ComponentDrawer.test.ts:110-132`](../../src/features/industry-planner/components/ComponentDrawer.test.ts#L110-L132) — Regexes match 'Needed</span><span'. They must change to dt/dd.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/industry-planner/components/kpi-tile.tsx:1-87`](../../src/features/industry-planner/components/kpi-tile.tsx#L1-L87) — Planner KpiTile is a Card container. KpiHead is an h-8 label row with a right slot for toggles and help popovers, KPI_FIG is a semibold leading-[1.02] stat figure, and KpiHelp is a popover trigger. It is a feature-local compositional family, not a label/value tile.
- [`src/features/industry-planner/components/CockpitKpis.tsx:95-302`](../../src/features/industry-planner/components/CockpitKpis.tsx#L95-L302) — Each tile composes KpiHead with custom right-side controls (RawItemToggle, GrossNetToggle, FeeHover, PriceConfidence) and conditional figures. A StatTile with aside/size props would not simplify this.
- [`src/features/industry-planner/components/MarketScorePanel.tsx:39-54`](../../src/features/industry-planner/components/MarketScorePanel.tsx#L39-L54) — Planner KpiTile/KpiHead/KpiHelp composition, as above
- [`src/components/ui/multiples-grid.tsx:24-48`](../../src/components/ui/multiples-grid.tsx#L24-L48) — Admin hairline-grid cell: eyebrow emphasis strong, text-lead value, delta slot, note and chart children below. A different scale and structure, used only by app/admin and preview.
- [`src/components/ui/row.tsx:94-104`](../../src/components/ui/row.tsx#L94-L104) — ui Stat is an inline muted text-label span. It is unrelated despite the name.
- [`src/components/composition/board/WorthChart.tsx:139-150`](../../src/components/composition/board/WorthChart.tsx#L139-L150) — Headline figure with an inline unit and help, not label-over-value
- [`src/app/(site)/admin/esi/EsiCards.tsx:48-53`](../../src/app/%28site%29/admin/esi/EsiCards.tsx#L48-L53) — Gauge figure with an inline sentence, not label-over-value

</details>

**Home.** `src/components/ui/stat-figure.tsx (zone: ui)`

**Boundary check.** The ui zone may import nothing outside ui, and StatFigure needs only './cn' and './type-roles' (both ui). The consumers: components-composition (board sections, OverviewCards, ProductionCapacity, SheetHeader) is allowed ui by its rule. features (ComponentDrawer) is allowed ui by its rule. That rule does not allow components-composition, which is why the copy exists today. The app zone is also allowed ui for future use.

**API sketch.**

```ts
// src/components/ui/stat-figure.tsx — must be rendered inside a <dl>
export function StatFigure(props: {
  label: string;
  children: ReactNode;          // the value (current StatFigure 'value' prop, renamed to children to match ComponentDrawer/KpiTile)
  tone?: string;                // value colour class, default 'text-name'
  className?: string;           // wrapper extras (min-w-0 is built in)
  // optional, add only with the KpiTile fold (step 5), so fallow unused-component-props stays green:
  note?: string; noteTone?: string; size?: 'md' | 'lg';  // lg = 'text-h3 sm:text-stat'
}): JSX.Element  // <div class="flex min-w-0 flex-col gap-0.5"><dt class={eyebrow({size:'micro'})}/><dd class="font-data text-h3 tabular-nums {tone}"/>[<dd note/>]</div>
```

**Migration steps.**

1. Create src/components/ui/stat-figure.tsx with StatFigure({label, children, tone='text-name', className}) and the dt/dd markup from board-bits plus min-w-0. Add it to src/components/ui/coverage.test.ts or give it its own render test.
2. Migrate IndustrySection.tsx, OverviewCards.tsx and ProductionCapacity.tsx to import from '@/components/ui/stat-figure' (value → children). Delete StatFigure from board-bits.tsx.
3. Replace AttributesSection.tsx lines 46-52 with <StatFigure key={value.key} label={ATTRIBUTE_LABEL[value.key]}>{value.base + value.implant}{implant suffix}</StatFigure>.
4. In ComponentDrawer.tsx, change the two grid <div>s at lines 219 and 229 to <dl> and replace Stat with StatFigure. Delete the private Stat. Update the ComponentDrawer.test.ts regexes at lines 110-132 from '</span><span' to '</dt><dd'.
5. Optional: add note/noteTone/size='lg' to StatFigure and rewrite SheetHeader's three KpiTiles as <StatFigure size="lg" className={cn(readoutSurface, 'gap-1 px-3 py-2.5 sm:px-3.5')} …>. Then delete board KpiTile, which removes the duplicate KpiTile name. Leave the planner kpi-tile.tsx untouched.
6. Run pnpm check through test-runner.

**Tests.** Add src/components/ui/stat-figure.test.ts: renders dt label, dd value, default text-name, tone override, and (if step 5 lands) the note dd and lg size classes. Existing guards: ComponentDrawer.test.ts:110-132 (labels, values and the text-isk tone on Owned and cheaper price; update the regexes to dt/dd). src/components/composition/industry-workspace/ProfileWorkspace.test.ts renders ProductionCapacity. HomeBoardView tests render the board sections.

**Notes.** Spacing drift: StatFigure uses gap-0.5, while ComponentDrawer's Stat and the board KpiTile use gap-1. Default to gap-0.5 and pass className='gap-1' where the 4px matters (the drawer). ComponentDrawer's min-w-0 is needed for LivePrice in grid columns and is harmless on the board, so build it in. ComponentDrawer's Stats currently sit in <div> grids. With dt/dd they must be wrapped in <dl>, otherwise the markup is invalid. The label is identical everywhere (eyebrow({size:'micro'}) defaults to tone muted). P017 edits the same files (AttributesSection, OverviewCards, ProductionCapacity), so land the two sequentially to avoid conflicts.

<sub>Reported by: concern:ui-patterns.</sub>

<a id="p002"></a>

## P002: Promote board SectionPanel to ui and use it for the 40 hand-built Card + SectionHeader cards

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** About +35 (new ui file and test) and about -20 (SectionBody). The 40 sites each lose a line and often an import, about -60. Net about -45.
- **Depends on:** —
- **Existing primitive:** `src/components/composition/board/SectionBody.tsx:SectionPanel; src/components/ui/card.tsx:Card; src/components/ui/section-header.tsx:SectionHeader`

**Problem.** A glass card topped by a size='md' SectionHeader is hand-composed 40 times in app and components-composition (plus one preview specimen). The canonical composition already exists as SectionPanel in src/components/composition/board/SectionBody.tsx: Card surface + min-w-0 overflow-hidden + SectionHeader md. Because it lives in the board folder, industry-workspace imports it across folders (../board/SectionBody), and app pages rebuild it inline. The inline copies differ only in missing min-w-0 overflow-hidden. ActionsCard adds overflow-hidden by hand, and the preview specimen does too. As a result the same 'titled card' has two implementations whose shrink and clip behavior differ by page.

**Verifier revision.** The 41 Card→SectionHeader pairs are real; I re-ran the multiline grep and got exactly 41, one of which is the preview specimen. The board's SectionPanel already implements this composition, and industry-workspace reaches into ../board/SectionBody for both it and readoutSurface. Three parts of the proposal change. (1) The motivating 'unclipped header bar' bug is negligible: --color-row-hover is rgba(255,255,255,0.018) (globals.css:107), so the corner bleed is effectively invisible. The value is one canonical titled card, not a visual fix. (2) Overflow-hidden is safe to roll out. Popover, Menu, Select and Tooltip all portal, chart tooltips are clamped inside the canvas (tooltip-placement.ts), no card holds a table, and the board already hosts charts inside SectionPanel. (3) The extras are dropped. The cardRow cva has 12 sites with different grid and flex layouts sharing only 4 utilities, and ui/row.tsx EntityRow/ResourceRow already own the border-t row form. CardNote is 2 sites in the same app folder with different content. Keeping the existing name SectionPanel and its title/meta API means the 14 board and workspace call sites change only their import path.

**Sites (30).**

- [`src/components/composition/board/SectionBody.tsx:7-27`](../../src/components/composition/board/SectionBody.tsx#L7-L27) — readoutSurface and SectionPanel (the canonical composition); SectionBody 29-42 is board-contract-specific and stays
- [`src/components/composition/industry-workspace/ProfileOverview.tsx:12, 100-116`](../../src/components/composition/industry-workspace/ProfileOverview.tsx#L12) — Imports SectionPanel from ../board/SectionBody
- [`src/components/composition/industry-workspace/FacilitiesPanel.tsx:24, 205-235`](../../src/components/composition/industry-workspace/FacilitiesPanel.tsx#L24) — Imports SectionPanel from ../board
- [`src/components/composition/industry-workspace/ProductionCapacity.tsx:5, 36-68`](../../src/components/composition/industry-workspace/ProductionCapacity.tsx#L5) — Imports SectionPanel from ../board
- [`src/components/composition/industry-workspace/MemberDetail.tsx:12, 36-40, 77-88`](../../src/components/composition/industry-workspace/MemberDetail.tsx#L12) — Imports SectionPanel from ../board
- [`src/components/composition/industry-workspace/WorkspaceStates.tsx:8, 39`](../../src/components/composition/industry-workspace/WorkspaceStates.tsx#L8) — Imports readoutSurface from ../board for IntroCard
- [`src/components/composition/board/board-bits.tsx:8, 51`](../../src/components/composition/board/board-bits.tsx#L8) — readoutSurface for StatFigure tiles
- [`src/components/composition/account/LinkedCharactersCard.tsx:18-22`](../../src/components/composition/account/LinkedCharactersCard.tsx#L18-L22) — Inline Card + SectionHeader md
- [`src/components/composition/account/AccountDangerZone.tsx:39-63`](../../src/components/composition/account/AccountDangerZone.tsx#L39-L63) — Inline Card + SectionHeader md with Popover hint (portaled; safe under overflow-hidden)
- [`src/app/(site)/admin/SectionUnavailable.tsx:7-8`](../../src/app/%28site%29/admin/SectionUnavailable.tsx#L7-L8) — Inline pair
- [`src/app/(site)/admin/CardFallback.tsx:7-18`](../../src/app/%28site%29/admin/CardFallback.tsx#L7-L18) — Inline pair
- [`src/app/(site)/admin/esi/EsiCards.tsx:45-46, 79-80, 101-102, 162-163, 166-167`](../../src/app/%28site%29/admin/esi/EsiCards.tsx#L45-L46) — Five inline pairs (h-full, data-* attributes)
- [`src/app/(site)/admin/search/SearchCards.tsx:60-61, 83-84, 120-121, 124-125, 154-155`](../../src/app/%28site%29/admin/search/SearchCards.tsx#L60-L61) — Five inline pairs
- [`src/app/(site)/admin/search/IndexCoverageCard.tsx:77-78`](../../src/app/%28site%29/admin/search/IndexCoverageCard.tsx#L77-L78) — Inline pair
- [`src/app/(site)/admin/ActionsCard.tsx:72-73`](../../src/app/%28site%29/admin/ActionsCard.tsx#L72-L73) — Inline pair with hand-added overflow-hidden
- [`src/app/(site)/admin/AdminOverviewCards.tsx:52-53, 69-70`](../../src/app/%28site%29/admin/AdminOverviewCards.tsx#L52-L53) — Two inline pairs
- [`src/app/(site)/admin/AudienceCard.tsx:69-70`](../../src/app/%28site%29/admin/AudienceCard.tsx#L69-L70) — Inline pair
- [`src/app/(site)/admin/AccountsCard.tsx:13-14`](../../src/app/%28site%29/admin/AccountsCard.tsx#L13-L14) — Inline pair
- [`src/app/(site)/admin/traffic/TrafficCards.tsx:46-47, 69-70, 121-122`](../../src/app/%28site%29/admin/traffic/TrafficCards.tsx#L46-L47) — Three inline pairs
- [`src/app/(site)/admin/health/HealthCards.tsx:49-50, 84-85`](../../src/app/%28site%29/admin/health/HealthCards.tsx#L49-L50) — Two inline pairs
- [`src/app/(site)/admin/health/ScheduledTasks.tsx:181-182`](../../src/app/%28site%29/admin/health/ScheduledTasks.tsx#L181-L182) — Inline pair with id + scroll-mt-24
- [`src/app/(site)/admin/statics/page.tsx:213-214, 263-264, 289-290`](../../src/app/%28site%29/admin/statics/page.tsx#L213-L214) — Three inline pairs
- [`src/app/(site)/admin/queue/QueueCards.tsx:19-20, 40-41`](../../src/app/%28site%29/admin/queue/QueueCards.tsx#L19-L20) — Two inline pairs
- [`src/app/(site)/admin/users/page.tsx:127-128, 181-182, 211-212`](../../src/app/%28site%29/admin/users/page.tsx#L127-L128) — Three inline pairs
- [`src/app/(site)/admin/users/[userId]/page.tsx:196-197`](../../src/app/%28site%29/admin/users/[userId]/page.tsx#L196-L197) — Inline pair
- [`src/app/(site)/settings/account/page.tsx:39-40`](../../src/app/%28site%29/settings/account/page.tsx#L39-L40) — Inline pair
- [`src/app/(site)/settings/corporations/page.tsx:52-53`](../../src/app/%28site%29/settings/corporations/page.tsx#L52-L53) — Inline pair
- [`src/app/(site)/settings/corporations/corp-sharing-card.tsx:21-22`](../../src/app/%28site%29/settings/corporations/corp-sharing-card.tsx#L21-L22) — Inline pair
- [`src/app/(site)/settings/preferences/preference-groups.tsx:12-13`](../../src/app/%28site%29/settings/preferences/preference-groups.tsx#L12-L13) — Inline pair
- [`src/app/(site)/atlas/AtlasGuestLanding.tsx:47-48`](../../src/app/%28site%29/atlas/AtlasGuestLanding.tsx#L47-L48) — Inline pair

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/(site)/preview/primitives/structure.tsx:60-61`](../../src/app/%28site%29/preview/primitives/structure.tsx#L60-L61) — Specimen demoing size='sm' SectionHeader; update it to demo SectionPanel rather than migrate it
- [`src/features/industry-jobs/components/JobsCard.tsx:50-60`](../../src/features/industry-jobs/components/JobsCard.tsx#L50-L60) — Custom header (avatar, h3 title, subtitle), not SectionHeader
- [`src/app/(site)/admin/search/SearchCards.tsx:30, 134`](../../src/app/%28site%29/admin/search/SearchCards.tsx#L30) — cardRow candidates: layouts differ across the 12 row sites (also AdminOverviewCards 21, CardFallback 12, HealthCards 93, AtlasGuestLanding 53, StatusLines 8, QueueCards 52, CharacterPanelSkeleton 16, JobRow 25, JobsCard 115, settings/account 19). Only 4 utilities are shared, and ui/row.tsx already owns the row form. Deferred
- [`src/app/(site)/settings/characters/page.tsx:164`](../../src/app/%28site%29/settings/characters/page.tsx#L164) — CardNote: same class string as corporations/page.tsx:64 but different content, both in app/settings. At most a local constant, not a ui primitive

</details>

**Home.** `src/components/ui/section-panel.tsx (SectionPanel + readoutSurface), built on ui/card.tsx with Card's as widened to include 'section'`

**Boundary check.** Home zone is ui, rule {from: 'ui', allow: []}. The file imports only ./card, ./section-header and ./cn (intra-ui). section-header.tsx does not import card.tsx, so there is no cycle either way. Consumer zones:
- components-composition (board, industry-workspace, account): its rule allows 'ui'.
- app (admin, settings, atlas): its rule allows 'ui'.
- features: allows 'ui', for future consumers that cannot import components-composition.

SectionBody (the pending/reconnect switch) stays in board because it imports '@/composition/board/api-contract' (composition zone), which ui may not import.

**API sketch.**

```ts
// src/components/ui/section-panel.tsx
export const readoutSurface: string; // cn(cardSurface, 'min-w-0 overflow-hidden')
export function SectionPanel(p: {
  title: ReactNode;
  meta?: ReactNode;          // SectionHeader hint
  as?: 'section' | 'div';    // default 'section'
  className?: string;
  children: ReactNode;
} & Omit<ComponentProps<'section'>, 'title'>): JSX.Element;
// renders <Card as={as} className={cn('min-w-0 overflow-hidden', className)} {...rest}><SectionHeader size="md" label={title} hint={meta} />{children}</Card>
// card.tsx: as?: 'div' | 'li' | 'section'
```

**Migration steps.**

1. Widen Card's `as` in src/components/ui/card.tsx to 'div' | 'li' | 'section'.
2. Create src/components/ui/section-panel.tsx. Move readoutSurface and SectionPanel there. Add `as` and rest-prop forwarding (id, data-*), with title omitted from the HTML props.
3. Delete SectionPanel and readoutSurface from board/SectionBody.tsx, which keeps only SectionBody. Repoint the imports to @/components/ui/section-panel in board/OverviewCards, the board/sections/* files (Attributes, Clones, Skills, Industry, Queue, Wallet), board-bits, and industry-workspace ProfileOverview, FacilitiesPanel, ProductionCapacity, MemberDetail and WorkspaceStates.
4. Codemod the 40 inline sites by area: components-composition/account, then app/settings and atlas, then app/admin. The pattern is <Card {props}><SectionHeader size="md" label={X} hint={Y} /> … </Card> → <SectionPanel title={X} meta={Y} {props}> … </SectionPanel>. Carry className (reveal-*, h-full, scroll-mt-24), id and data-* attributes over unchanged, and drop ActionsCard's now-redundant overflow-hidden.
5. Remove now-unused Card and SectionHeader imports per file. Fallow unused-imports and exports will flag leftovers.
6. Update the preview structure.tsx specimen to show SectionPanel.

**Tests.** Add src/components/ui/section-panel.test.ts, required by Fallow coverage-gaps with requireAllFiles. Use renderToStaticMarkup to check five things: section by default, div via as, title and meta in the header, className merged with min-w-0 overflow-hidden, and data-*/id forwarded. Existing guards: board section tests and HomeBoardView.test.ts (board markup), ProfileWorkspace.test.ts, ServiceLevelRows.test.ts and the other admin card tests, and corporations-view.test.ts.

**Notes.** Behavior changes on migrated sites:
- The element becomes <section> instead of <div>. An unnamed section is not a landmark, so this is harmless.
- min-w-0 and overflow-hidden are added. Every Popover, Menu, Select and Tooltip inside these cards is portaled, and chart tooltips are clamped inside ChartCanvas, so nothing should clip. Spot-check AccountDangerZone's Popover hint and the admin chart cards after migration.
- Building SectionPanel on Card adds font-ui to the board sections. This is inert because html/body already set var(--font-ui) (globals.css:462-465).

The corp-sharing-card edit overlaps P001: land them in either order, but rebase carefully. If P003 lands first, its new board files import readoutSurface from the new ui path.

<sub>Reported by: area:components-composition, concern:ui-patterns.</sub>

<a id="p017"></a>

## P017: Expose SectionBody's note as SectionNote for board and workspace panels, and use EmptyState and LoadingLabel where they are bypassed

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -12 / +14 (the gain is one style source for 9 notes, not line count)
- **Depends on:** [P002](#p002)
- **Existing primitive:** `src/components/ui/empty-state.tsx:EmptyState; src/components/ui/loading-label.tsx:LoadingLabel`

**Problem.** The board and industry-workspace panels (SectionPanel children) show empty and status notes as hand-written <p> elements. The intended style is SectionBody's 'px-3.5 py-3 text-ui text-faint'. The copies have drifted: py-2 in ClonesSection, py-2.5 in AttributesSection, border-t in Wallet and Clones, text-muted in ProfileOverview and text-dps-high in QueueSection, so a style change means editing 9 sites. Separately, CockpitBuildPlan renders its empty state as a Card plus a muted <p>, while its sibling CockpitRawLedger uses EmptyState. OwnCharacterPicker types out the loading span that LoadingLabel already provides.

**Verifier revision.** The quiet-note duplication is real and broader than reported. Nine paragraphs inside board and industry-workspace SectionPanels hand-roll 'px-3.5 py-3 text-ui text-faint'. Padding has drifted (py-2, py-2.5), two sites add border-t, ProfileOverview uses text-muted and QueueSection uses an alert tone. All nine live in components-composition under SectionPanel, and SectionBody already renders this exact note for its pending and reconnect states. Several are status notes ('Syncing from EVE…', 'Needs a reconnect', 'still syncing'), not empty states. So the right home is exposing SectionBody's existing note as SectionNote next to SectionPanel, not adding variants to the app-wide ui EmptyState, which has 39 row-style consumers. The 'inline' variant is rejected: the statics 'None.' paragraphs (all in one admin file) and AccessListEditor's single line are unpadded muted text, so a variant would save no structure. The two primitive bypasses are confirmed: CockpitBuildPlan's Card plus muted <p>, where its sibling CockpitRawLedger uses EmptyState, and OwnCharacterPicker's typed-out loading span, which matches LoadingLabel's classes.

**Sites (14).**

- [`src/components/composition/board/SectionBody.tsx:29-42`](../../src/components/composition/board/SectionBody.tsx#L29-L42) — SectionBody's non-ready branch: <p className="px-3.5 py-3 text-ui text-faint">, the canonical note
- [`src/components/composition/board/sections/WalletSection.tsx:93-94`](../../src/components/composition/board/sections/WalletSection.tsx#L93-L94) — border-t, py-3, faint
- [`src/components/composition/board/sections/ClonesSection.tsx:27-28`](../../src/components/composition/board/sections/ClonesSection.tsx#L27-L28) — border-t, py-2 (drift), faint
- [`src/components/composition/board/sections/AttributesSection.tsx:66-67`](../../src/components/composition/board/sections/AttributesSection.tsx#L66-L67) — py-2.5 (drift), faint
- [`src/components/composition/board/sections/QueueSection.tsx:56-57`](../../src/components/composition/board/sections/QueueSection.tsx#L56-L57) — py-3 with text-dps-high, the alert tone (missed by the finders)
- [`src/components/composition/board/OverviewCards.tsx:59-60`](../../src/components/composition/board/OverviewCards.tsx#L59-L60) — py-3, faint
- [`src/components/composition/board/OverviewCards.tsx:101-102`](../../src/components/composition/board/OverviewCards.tsx#L101-L102) — py-3, faint
- [`src/components/composition/industry-workspace/MemberDetail.tsx:78-79`](../../src/components/composition/industry-workspace/MemberDetail.tsx#L78-L79) — py-3, faint
- [`src/components/composition/industry-workspace/ProductionCapacity.tsx:37-38`](../../src/components/composition/industry-workspace/ProductionCapacity.tsx#L37-L38) — py-3, faint
- [`src/components/composition/industry-workspace/ProfileOverview.tsx:101-104`](../../src/components/composition/industry-workspace/ProfileOverview.tsx#L101-L104) — py-3 with text-muted (drift; missed by the finders)
- [`src/features/industry-planner/components/CockpitBuildPlan.tsx:229-238`](../../src/features/industry-planner/components/CockpitBuildPlan.tsx#L229-L238) — Card plus muted <p> empty state
- [`src/features/industry-planner/components/CockpitRawLedger.tsx:100-101`](../../src/features/industry-planner/components/CockpitRawLedger.tsx#L100-L101) — Sibling uses <EmptyState> for the same situation
- [`src/features/maps/OwnCharacterPicker.tsx:29-30`](../../src/features/maps/OwnCharacterPicker.tsx#L29-L30) — <span className="font-ui text-ui text-muted">Loading your characters…</span>. LoadingLabel renders the same classes plus inline-flex.
- [`src/components/ui/loading-label.tsx:3-15`](../../src/components/ui/loading-label.tsx#L3-L15) — Existing primitive with label and className props

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/(site)/admin/statics/page.tsx:66-68, 82-84, 125-127, 193`](../../src/app/%28site%29/admin/statics/page.tsx#L66-L68) — Unpadded 'None.' placeholders under h3s in one admin diff view. An EmptyState 'inline' variant would just be 'font-ui text-ui text-muted' and save nothing. A file-local helper is optional.
- [`src/features/maps/AccessListEditor.tsx:139-140`](../../src/features/maps/AccessListEditor.tsx#L139-L140) — A single unpadded muted line inside a form section, not a card row. No primitive is warranted.
- [`src/components/composition/industry-workspace/ProductionCapacity.tsx:62-66`](../../src/components/composition/industry-workspace/ProductionCapacity.tsx#L62-L66) — A text-micro footnote, not an empty or status note
- [`src/components/composition/board/sections/ClonesSection.tsx:22`](../../src/components/composition/board/sections/ClonesSection.tsx#L22) — An inline 'Not set' value placeholder inside a field
- [`src/components/ui/empty-state.tsx:1-11`](../../src/components/ui/empty-state.tsx#L1-L11) — Leave unchanged. Its 39 consumers rely on the icon-row style (border-b, last:border-b-0, InboxIcon, muted).

</details>

**Home.** `Export SectionNote from src/components/composition/board/SectionBody.tsx (zone: components-composition). The CockpitBuildPlan and OwnCharacterPicker fixes use the existing ui primitives EmptyState and LoadingLabel.`

**Boundary check.** SectionNote lives in components-composition next to SectionPanel and readoutSurface. Every SectionNote consumer (board/*, board/sections/*, industry-workspace/*) is in the same components-composition zone, and industry-workspace already imports '../board/SectionBody'. SectionNote imports only ui (cn), which the components-composition rule allows. CockpitBuildPlan.tsx and OwnCharacterPicker.tsx are in features, and the features rule allows ui (empty-state, loading-label).

**API sketch.**

```ts
// src/components/composition/board/SectionBody.tsx
export function SectionNote(props: {
  children: ReactNode;
  divided?: boolean;            // adds 'border-t border-border-soft' (Wallet, Clones)
  tone?: 'quiet' | 'alert';     // quiet = text-faint (default), alert = text-dps-high (QueueSection)
}): JSX.Element  // <p className={cn('px-3.5 py-3 text-ui', tone==='alert' ? 'text-dps-high' : 'text-faint', divided && 'border-t border-border-soft')}>
// SectionBody's non-ready branch returns <SectionNote>{pending ? 'Syncing from EVE…' : 'Needs a reconnect to sync.'}</SectionNote>
```

**Migration steps.**

1. Add SectionNote to SectionBody.tsx and use it in SectionBody's own non-ready branch.
2. Replace the board paragraphs: WalletSection:94 (divided), ClonesSection:28 (divided; py-2 becomes py-3), AttributesSection:67 (py-2.5 becomes py-3), QueueSection:57 (tone="alert"), OverviewCards:60 and :102.
3. Replace the workspace paragraphs: MemberDetail:79, ProductionCapacity:38 and ProfileOverview:102 (text-muted becomes faint; confirm with design, or keep it muted only if design asks for it).
4. In CockpitBuildPlan.tsx:229-238, replace the muted <p> inside the Card with <EmptyState>No build breakdown — this blueprint has no resolved inputs yet.</EmptyState>. Keep the reveal wrapper and Card.
5. In OwnCharacterPicker.tsx:30, replace the span with <LoadingLabel label="Loading your characters…" /> and import it from '@/components/ui/loading-label'.
6. Capture screenshots of the home board, the member sheet and the industry profile overview to check the normalized py-3 spacing, then run pnpm check through test-runner.

**Tests.** Existing guards: src/components/composition/board/HomeBoardView.test.ts:108 ('Needs a reconnect to sync.'). src/components/composition/industry-workspace/ProfileWorkspace.test.ts:207 ('Skills are still syncing from EVE.') and :267 (production capacity link prompt). Add a small SectionNote test, colocated or in a new src/components/composition/board/SectionBody.test.ts: default faint, divided adds border-t, alert uses text-dps-high, and SectionBody renders the pending and reconnect copy through it. Add or extend a CockpitBuildPlan render test for the empty-tiers branch, and an OwnCharacterPicker test asserting 'Loading your characters…' when characters is null.

**Notes.** Drift to reconcile: padding py-3 is used by 7 of 9 sites, so ClonesSection (py-2) and AttributesSection (py-2.5) are the drifted copies. Text tone is text-faint on 7 sites. ProfileOverview's text-muted is likely drift, but it is a call to action, so confirm with design. QueueSection's text-dps-high is a deliberate alert and is kept through tone='alert'. The border-t on Wallet and Clones is deliberate (the note follows other content) and is kept through divided. The CockpitBuildPlan swap changes its look to the standard EmptyState row (InboxIcon, py-2.5), matching CockpitRawLedger. P016 touches AttributesSection, OverviewCards and ProductionCapacity, so land them sequentially.

<sub>Reported by: concern:ui-patterns.</sub>

<a id="p034"></a>

## P034: Move CardLink to ui, add ui ExternalLink and an inlineLink class, and make MultiplesCell children optional

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** About -40 lines in src (CardLink.tsx 9, legal helper 7, contact/settings target/rel 8, board and ActionsCard about 6, {null} children 8), plus about 20 in ui/text-link.tsx and about 30 in its test
- **Depends on:** —
- **Existing primitive:** `src/app/(site)/admin/CardLink.tsx:CardLink`

**Problem.** The card-header action link ('text-isk no-underline transition-colors hover:text-name' plus an arrow) is an app-local admin component, admin/CardLink.tsx, used at 8 call sites in 6 admin files. components-composition may not import from app, so the board retypes it twice (IndustrySection, OverviewCards) with whitespace-nowrap added. ActionsCard retypes it again with ↗. legal/page.tsx keeps a private ExternalLink (target=_blank, rel=noopener noreferrer), while contact (3 anchors) and settings/characters (1 anchor) hand-write the same attributes. The inline helper-text link class 'text-tone-blue hover:underline' is retyped at 7 sites in 6 files. ui MultiplesCell requires children, so 3 consumers pass {null} 4 times and still render an empty mt-1 flex item.

**Verifier revision.** The core holds. admin/CardLink is a real primitive: 6 admin files and 8 call sites use it, all in the SectionHeader hint slot. The board copies exist because CardLink lives in the app zone, which components-composition may not import. That is a structural reason, and it will recur. Board SectionPanel meta passes straight through to SectionHeader hint (SectionBody.tsx 10-27), so this is the same slot and the same concept. ExternalLink has a real local helper with 9 uses in legal, plus 4 hand-written target/rel anchors in contact and settings. The inline 'text-tone-blue hover:underline' role appears 7 times across 6 files. Revisions: (1) The quiet 'reset filters' link-button repeats only inside SitesFilterLayout, which is one consumer. It becomes a local const, not a ui variant. (2) The proposed CardLink className passthrough is dropped. No consumer would pass it, and .fallowrc rule unused-component-props is set to error. whitespace-nowrap goes into the base class instead. (3) A cva linkVariants with three tones is overkill. Two tones are used outside the component and one only internally. Export an inlineLink class constant, following the cardSurface precedent in ui/card.tsx. (4) MapMenu and account-menu-items new-tab links are excluded. (5) A hover drift was found: see notes.

**Sites (25).**

- [`src/app/(site)/admin/CardLink.tsx:1-9`](../../src/app/%28site%29/admin/CardLink.tsx#L1-L9) — App-local CardLink, children: string, always appends ' →', no whitespace-nowrap
- [`src/app/(site)/admin/AccountsCard.tsx:5, 17`](../../src/app/%28site%29/admin/AccountsCard.tsx#L5) — CardLink consumer
- [`src/app/(site)/admin/traffic/TrafficCards.tsx:23, 101, 125`](../../src/app/%28site%29/admin/traffic/TrafficCards.tsx#L23) — CardLink consumer, 2 uses
- [`src/app/(site)/admin/health/ServiceLevelRows.tsx:11, 195`](../../src/app/%28site%29/admin/health/ServiceLevelRows.tsx#L11) — CardLink consumer
- [`src/app/(site)/admin/AdminOverviewCards.tsx:8, 73`](../../src/app/%28site%29/admin/AdminOverviewCards.tsx#L8) — CardLink consumer
- [`src/app/(site)/admin/AudienceCard.tsx:10, 72-77`](../../src/app/%28site%29/admin/AudienceCard.tsx#L10) — CardLink consumer, 2 side by side in a flex gap-3 span
- [`src/app/(site)/admin/esi/EsiCards.tsx:20, 83`](../../src/app/%28site%29/admin/esi/EsiCards.tsx#L20) — CardLink consumer
- [`src/app/(site)/admin/ActionsCard.tsx:44-50`](../../src/app/%28site%29/admin/ActionsCard.tsx#L44-L50) — Same class inlined in REFERENCE_LINKS.map with a ↗ arrow. The links go to /preview/*, which leave the admin console, consistent with admin-nav's ↗ for leavesConsole.
- [`src/components/composition/board/sections/IndustrySection.tsx:1, 18-22`](../../src/components/composition/board/sections/IndustrySection.tsx#L1) — Retyped CardLink with whitespace-nowrap. Link is imported only for this.
- [`src/components/composition/board/OverviewCards.tsx:3, 90-98`](../../src/components/composition/board/OverviewCards.tsx#L3) — Retyped CardLink with whitespace-nowrap. Link is imported only for this.
- [`src/components/composition/board/SectionBody.tsx:10-27`](../../src/components/composition/board/SectionBody.tsx#L10-L27) — SectionPanel meta is SectionHeader hint, the same slot admin CardLink sits in
- [`src/components/ui/section-header.tsx:36-37`](../../src/components/ui/section-header.tsx#L36-L37) — Hint slot wrapper (text-micro font-normal text-muted)
- [`src/app/(site)/legal/page.tsx:20-26, 79-202`](../../src/app/%28site%29/legal/page.tsx#L20-L26) — Local ExternalLink with 9 uses, unstyled, inside Prose (prose.css styles a)
- [`src/app/(site)/contact/page.tsx:56-62, 91-98, 112-119`](../../src/app/%28site%29/contact/page.tsx#L56-L62) — Three hand-written target=_blank rel=noopener noreferrer anchors. Two carry their own className.
- [`src/app/(site)/settings/characters/page.tsx:164-182`](../../src/app/%28site%29/settings/characters/page.tsx#L164-L182) — One external anchor with target/rel and text-tone-blue hover:underline, plus two inline Links with the same class
- [`src/app/(site)/settings/account/page.tsx:53-55`](../../src/app/%28site%29/settings/account/page.tsx#L53-L55) — Inline link class ('Manage →')
- [`src/app/(site)/settings/corporations/page.tsx:66-68`](../../src/app/%28site%29/settings/corporations/page.tsx#L66-L68) — Inline link class
- [`src/components/composition/account/AccountDangerZone.tsx:56-58`](../../src/components/composition/account/AccountDangerZone.tsx#L56-L58) — Inline link class
- [`src/components/composition/account/RevokeRedirectLightbox.tsx:48-55`](../../src/components/composition/account/RevokeRedirectLightbox.tsx#L48-L55) — Bare Button with the inline link class plus 'self-start text-label uppercase tracking-wide'
- [`src/components/ui/multiples-grid.tsx:24-48`](../../src/components/ui/multiples-grid.tsx#L24-L48) — children: ReactNode is required. <div className="mt-1">{children}</div> always renders.
- [`src/app/(site)/admin/KpiGrid.tsx:9-17`](../../src/app/%28site%29/admin/KpiGrid.tsx#L9-L17) — Passes {null}
- [`src/app/(site)/admin/AccountsCard.tsx:20-28`](../../src/app/%28site%29/admin/AccountsCard.tsx#L20-L28) — Passes {null} twice
- [`src/app/(site)/admin/queue/QueueCards.tsx:23-25`](../../src/app/%28site%29/admin/queue/QueueCards.tsx#L23-L25) — Passes {null}
- [`src/app/globals.css:484-489`](../../src/app/globals.css#L484-L489) — Unlayered a / a:hover { color: var(--color-isk) }. No @layer anywhere in globals.css; Tailwind v4 puts utilities in @layer utilities.
- [`src/app/(site)/page-coverage.test.ts:62, 143`](../../src/app/%28site%29/page-coverage.test.ts#L62) — Pins CardLink. The import must move when the file is deleted.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/composition/map/MapMenu.tsx:50-54, 123-144`](../../src/components/composition/map/MapMenu.tsx#L50-L54) — Base UI MenuLinkItem render props for internal new-tab menu rows plus one attribution row. A menu-item concept, not a text link.
- [`src/components/composition/account/account-menu-items.tsx:33`](../../src/components/composition/account/account-menu-items.tsx#L33) — newTab linkProps for menu rows, internal routes
- [`src/app/(site)/contact/page.tsx:46`](../../src/app/%28site%29/contact/page.tsx#L46) — mailto anchor, not a new-tab external link
- [`src/features/wormhole-sites/components/SitesFilterLayout.tsx:156-158, 218-225`](../../src/features/wormhole-sites/components/SitesFilterLayout.tsx#L156-L158) — Quiet 'reset filters' link-button repeated within one file only. One consumer, so use a local const, not a ui variant.
- [`src/app/(site)/admin/AdminOverviewCards.tsx:29-34`](../../src/app/%28site%29/admin/AdminOverviewCards.tsx#L29-L34) — Button-styled Link (buttonVariants secondary) with →, a different concept
- [`src/features/wormhole-sites/components/SiteCard.tsx:17-22`](../../src/features/wormhole-sites/components/SiteCard.tsx#L17-L22) — 'View full page →' uses a muted uppercase label style. A different role.
- [`src/features/industry-planner/components/MeAdjuster.tsx:119`](../../src/features/industry-planner/components/MeAdjuster.tsx#L119) — A button with text-isk hover:text-name, not a link
- [`src/app/(site)/preview/primitives/structure.tsx:118-120`](../../src/app/%28site%29/preview/primitives/structure.tsx#L118-L120) — MultiplesCell with real children. Unaffected.

</details>

**Home.** `src/components/ui/text-link.tsx (CardLink, ExternalLink, inlineLink). The MultiplesCell change stays in src/components/ui/multiples-grid.tsx.`

**Boundary check.** The home is in zone ui. The rule 'from: ui, allow: []' forbids cross-zone imports. text-link.tsx imports only the next/link package (already imported by ui/sortable-table.tsx:1 and ui/content-browser-nav.tsx:3), react types, and ./cn (same zone). Consumers: src/app/(site)/admin/*, legal, contact and settings/* are zone app, whose rule allows ui. src/components/composition/board/* and src/components/composition/account/* are zone components-composition, whose rule allows ui. KpiGrid, AccountsCard and QueueCards (app) already import ui/multiples-grid. No consumer is in a zone that lacks ui.

**API sketch.**

```ts
// src/components/ui/text-link.tsx
export function CardLink({ href, children, arrow = '→' }: { href: string; children: string; arrow?: '→' | '↗' }): JSX.Element // <Link className="whitespace-nowrap text-isk no-underline">{children} {arrow}</Link>
export function ExternalLink({ href, className, children }: { href: string; className?: string; children: ReactNode }): JSX.Element // <a target="_blank" rel="noopener noreferrer">
export const inlineLink = 'text-tone-blue hover:underline';
// src/components/ui/multiples-grid.tsx
MultiplesCell({ title, value, delta?, note?, children?: ReactNode }) // wrapper only when children !== undefined
```

**Migration steps.**

1. Create src/components/ui/text-link.tsx with CardLink, ExternalLink and inlineLink as sketched. Do not add a className prop to CardLink: no consumer needs it, and unused-component-props is an error.
2. Add src/components/ui/text-link.test.ts (renderToStaticMarkup): default '→' and an arrow='↗' case; the whitespace-nowrap and text-isk classes; ExternalLink emits target="_blank" and rel="noopener noreferrer" and forwards className.
3. Point the 6 admin consumers at '@/components/ui/text-link': AccountsCard, AudienceCard, AdminOverviewCards, traffic/TrafficCards, health/ServiceLevelRows, esi/EsiCards (8 call sites, no JSX change).
4. ActionsCard ReferenceTile (lines 45-49): render <CardLink key={link.href} href={link.href} arrow="↗">{link.label}</CardLink>. Keep the next/link import, which ActionTile still uses.
5. Board: replace IndustrySection 19-21 and OverviewCards 95-97 with <CardLink href="/industry/jobs">Open jobs</CardLink>. Remove the now-unused next/link import in both files.
6. Delete src/app/(site)/admin/CardLink.tsx. Remove its import and pin from src/app/(site)/page-coverage.test.ts (lines 62, 143).
7. legal/page.tsx: delete the local ExternalLink (20-26) and the then-unused ReactNode import if nothing else uses it. Import ExternalLink from ui. The 9 call sites are unchanged.
8. contact/page.tsx: replace the three anchors (56-62, 91-98, 112-119) with <ExternalLink href=... className=...>, keeping each className.
9. settings/characters/page.tsx 166-173: <ExternalLink href={EVE_AUTHORIZED_APPS_URL} className={inlineLink}>. Lines 174 and 178 use className={inlineLink}.
10. Apply inlineLink at settings/account 53, settings/corporations 66 and AccountDangerZone 56. RevokeRedirectLightbox 52 becomes className={cn(inlineLink, 'self-start text-label uppercase tracking-wide')}.
11. multiples-grid.tsx: make children optional and render <div className="mt-1">{children}</div> only when children !== undefined. Remove the {null} children in KpiGrid 16, AccountsCard 21 and 27, and QueueCards 24, using self-closing <MultiplesCell ... />.
12. Separately and locally: in SitesFilterLayout, hoist the repeated reset-button class into a module const. This is not part of the ui primitive.

**Tests.** New: src/components/ui/text-link.test.ts, as above. Optionally add a MultiplesCell case to an existing ui test: no mt-1 wrapper without children, wrapper present with children. Existing guards: src/app/(site)/page-coverage.test.ts pins (update), src/components/ui/coverage.test.ts already pins MultiplesCell, and src/app/(site)/admin/AudienceCard.test.ts renders the admin audience card. Run pnpm check via test-runner; Fallow will catch a leftover unused export or prop.

**Notes.** 1) Hover drift: globals.css 484-489 sets an unlayered `a:hover { color: var(--color-isk) }`. Tailwind v4 utilities live in @layer utilities, and unlayered declarations beat layered ones, so CardLink's `hover:text-name` and `transition-colors` probably never take effect: the link is already text-isk and 'hovers' to isk, with no visible feedback. The globals comment says this universal rule deliberately replaces ad-hoc hover:text-* utilities. Confirm in the browser, then drop hover:text-name and transition-colors from the shared CardLink (both are redundant with the global a rule) or pick an affordance the global rule does not override, such as hover:underline. Do not carry the dead class into ui. The same global rule turns the inline text-tone-blue links isk on hover, which is the intended vocabulary. 2) whitespace-nowrap: the board copies have it and the admin original does not. Treat the board copies as correct, since nowrap keeps the arrow from orphaning in the right-aligned hint slot. The admin hints gain nowrap too; their labels are short, but check AudienceCard's two-link hint at narrow widths. 3) rel: contact, settings and legal all use 'noopener noreferrer'. MapMenu and account-menu-items use 'noreferrer', which already implies noopener, on internal new-tab menu rows. Those are excluded and are not a bug. 4) Removing the empty MultiplesCell wrapper shrinks each of those cells by about 10px (gap-1.5 plus mt-1). No grid mixes child and child-less cells today, so rows stay even. If a separate StatTile consolidation lands first, apply the optional-children change there instead. 5) Lead outside this scope: board IndustrySection and OverviewCards.IndustryCard render near-identical Industry panels (StatFigure Active/Ready/Slots plus 'Open jobs'). Worth a separate look.

<sub>Reported by: area:app-site, concern:ui-patterns.</sub>

<a id="p036"></a>

## P036: Render the admin GSC top-term lists with DistributionBars plus a new subline field

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -30 in SearchCards, +5 in distribution-bars, +10 in traffic-view, plus about 20 lines of tests
- **Depends on:** —
- **Existing primitive:** `src/components/ui/distribution-bars.tsx:DistributionBars`

**Problem.** SearchCards hand-rolls a distribution list for the Top queries and Top pages cards (GscTermRow, TermList). It recomputes fill and share percentages and duplicates the DistributionBars row markup instead of using ui/distribution-bars, which every other admin ranking list uses (Traffic, ESI endpoints, coverage reasons, scheduled tasks, board net worth).

**Verifier revision.** Confirmed for GscTermRow and TermList. They duplicate DistributionBars: the same li classes, the same label plus right-aligned count/share header, a ProgressBar scaled to the max row with a 2% floor (the max===0 → 0 guard matches distributionBars' scale===0 guard), and share of an external total, which DistributionBars already supports via `total`. The only missing feature is a second line under the bar. SitemapRow is removed from scope: it has no bar, no count/share and no ranking, only the same row padding, so it is not a distribution. TrafficCards' BarList (29-32) shows the target shape: an empty check, then DistributionBars with total.

**Sites (7).**

- [`src/app/(site)/admin/search/SearchCards.tsx:4, 26-44`](../../src/app/%28site%29/admin/search/SearchCards.tsx#L4) — GscTermRow: fill pct = max===0 ? 0 : max(2, round(clicks/max*100)); share = total>0 ? round(...) : null; '{n} clk · {share}%'; a ProgressBar, then a mt-1 text-micro line with impr · CTR · pos
- [`src/app/(site)/admin/search/SearchCards.tsx:46-56`](../../src/app/%28site%29/admin/search/SearchCards.tsx#L46-L56) — TermList: EmptyState when empty, otherwise ul of GscTermRow scaled to max clicks
- [`src/app/(site)/admin/search/SearchCards.tsx:112-130`](../../src/app/%28site%29/admin/search/SearchCards.tsx#L112-L130) — TermCards consumers, total = totals.clicks (dimension 'total' row)
- [`src/components/ui/distribution-bars.tsx:3-10, 21-40, 42-74`](../../src/components/ui/distribution-bars.tsx#L3-L10) — DistributionInput {key,label,count,tone?,detail?}; distributionBars with denominator and a 2% floor; DistributionBars with formatCount, sort, total, ariaLabel
- [`src/app/(site)/admin/traffic/TrafficCards.tsx:29-32`](../../src/app/%28site%29/admin/traffic/TrafficCards.tsx#L29-L32) — BarList: the same empty-then-DistributionBars shape TermList should become
- [`src/data/gsc/queries.ts:106-122`](../../src/data/gsc/queries.ts#L106-L122) — getTopTerms orders by clicks desc then impressions desc, so sort='none' preserves the impressions tiebreak
- [`src/data/gsc/types.ts:70-76`](../../src/data/gsc/types.ts#L70-L76) — GscTermStat {key, clicks, impressions, ctr, position}

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/(site)/admin/search/SearchCards.tsx:132-148`](../../src/app/%28site%29/admin/search/SearchCards.tsx#L132-L148) — SitemapRow has no bar, count/share or ranking; it is a status row that only shares padding and header classes. Not a distribution, so leave it.
- [`src/app/(site)/admin/esi/EsiCards.tsx:48-54`](../../src/app/%28site%29/admin/esi/EsiCards.tsx#L48-L54) — A single ProgressBar budget gauge, not a list

</details>

**Home.** `src/components/ui/distribution-bars.tsx (existing; add an optional subline field). The term-to-row mapping goes in src/app/(site)/admin/traffic-view.ts next to deriveGscPerformanceView.`

**Boundary check.** distribution-bars.tsx is zone ui and imports only ./progress-bar (same zone), so 'ui allow: []' is satisfied. SearchCards.tsx and traffic-view.ts are zone app. The app rule allows ui (the DistributionBars and DistributionInput type import) and data (@/data/gsc/types, already imported).

**API sketch.**

```ts
// ui/distribution-bars.tsx
export interface DistributionInput { key: string; label: string; count: number; tone?: ProgressTone; detail?: string; /** A second line under the bar. */ subline?: string }
// rendered after <ProgressBar/>: {bar.subline === undefined ? null : <div className="mt-1 font-data text-micro tabular-nums text-muted">{bar.subline}</div>}
// admin/traffic-view.ts
export function gscTermRows(terms: GscTermStat[]): DistributionInput[] // {key: t.key, label: t.key, count: t.clicks, subline: `${t.impressions.toLocaleString()} impr · ${(t.ctr*100).toFixed(1)}% CTR · pos ${t.position.toFixed(1)}`}
// SearchCards TermList
<DistributionBars rows={gscTermRows(terms)} total={total} sort="none" formatCount={(n) => `${n.toLocaleString()} clk`} ariaLabel={ariaLabel} />
```

**Migration steps.**

1. Add `subline?: string` to DistributionInput and render it under the ProgressBar in DistributionBars, using GscTermRow's classes ('mt-1 font-data text-micro tabular-nums text-muted').
2. Add a subline case to src/components/ui/distribution-bars.test.ts: the text renders after the bar, and is absent when undefined.
3. Add gscTermRows(terms) to src/app/(site)/admin/traffic-view.ts and a unit test in traffic-view.test.ts covering the CTR and position formatting.
4. Rewrite TermList in SearchCards as: empty → <EmptyState>{empty}</EmptyState>, otherwise <DistributionBars rows={gscTermRows(terms)} total={total} sort="none" formatCount={(n) => `${n.toLocaleString()} clk`} ariaLabel=... />. Add an ariaLabel prop to TermList ('Top search queries by clicks' / 'Top search-landing pages by clicks').
5. Delete GscTermRow and the ProgressBar import from SearchCards.tsx. Leave SitemapRow unchanged.

**Tests.** Extend src/components/ui/distribution-bars.test.ts (subline render) and src/app/(site)/admin/traffic-view.test.ts (gscTermRows). Existing guards: distribution-bars.test.ts (share/fill math, sort none, total denominator) and the page-coverage.test.ts pins for TermCards.

**Notes.** Behavior differences to accept or reconcile: (a) Share label: GscTermRow rounds to a whole percent; DistributionBars shows one decimal under 10% ('8.3%'). Accept, since this matches every other admin list. (b) When totals.clicks is 0, GscTermRow omits the share ('0 clk') and DistributionBars prints '0 clk · 0%'. This is realistic for a low-traffic GSC property, where every top query can have 0 clicks. Accept it, or have DistributionBars hide the share when the total is 0, which would change other lists too, so prefer accepting it. (c) Fill pct is no longer rounded (visually identical). (d) The ul gains an aria-label (an improvement). (e) Keep sort='none': the API order includes an impressions tiebreak (queries.ts 121), which a stable 'desc' sort would also keep, but 'none' states the intent. Optional follow-up lead: TrafficCards BarList (29-32), EsiCards 167-171 and the new TermList all do 'rows.length === 0 ? <EmptyState> : <DistributionBars>'. An `empty?: ReactNode` prop on DistributionBars (ui may import ui/empty-state) would remove all three wrappers.

<sub>Reported by: area:app-site.</sub>

<a id="p023"></a>

## P023: Extract SwitcherMenu and a shared float icon trigger for the profile and map switchers

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -30 / +35. Net neutral, but removes two copies of a 160-character class string and one icon-trigger copy.
- **Depends on:** —
- **Existing primitive:** `src/components/ui/menu.tsx:Menu,menuRow; src/components/ui/card.tsx:floatSurface; src/components/ui/scroll-area.ts:scrollArea`

**Problem.** The 'current record ⌄' switcher menu (frosted Menu, glass pill trigger, scrollable capped panel) is hand-built twice with copy-pasted class strings: ProfileBar for industry profiles and MapSwitcher for atlas maps. The round 40px glass icon trigger is also hand-built twice (ProfileBar's ⋯, MapMenu's signed-out hamburger) with drifted focus styling.

**Verifier revision.** Verified: ProfileBar and MapSwitcher render byte-identical '{name} ⌄' trigger markup with an identical 160-character trigger class. Their popup classes share the same scroll/height/padding stem and differ only in layout (flex column vs 2-column grid). The 40px glass icon trigger appears twice with drifted focus handling: ProfileBar sets outline-none plus focus-visible:border-border-active, and MapMenu sets neither. Design changes from the finder's version: (1) put SwitcherMenu in its own ui file, not menu.tsx. MapSwitcher.test.ts fully mocks '@/components/ui/menu' with only Menu, MenuItem and menuRow, so an export added to menu.tsx would vanish under the mock. In a separate file, SwitcherMenu's internal './menu' import resolves to the mocked module and the existing class and data-attribute assertions keep passing. (2) Rows stay with callers, including aria-current, because the two values are both correct and differ on purpose. (3) Skip a menuRowCurrent constant: it is a two-token class, and fallow would flag unused extras.

**Sites (7).**

- [`src/components/composition/industry-workspace/ProfileBar.tsx:36-74`](../../src/components/composition/industry-workspace/ProfileBar.tsx#L36-L74) — Switcher Menu: trigger markup 38-43, trigger class 44-47, panel class 48 (flex flex-col min-w-64), frosted/bottom/start/8, current row aria-current='true' + bg-row-on text-name + ✓ marker
- [`src/components/composition/industry-workspace/ProfileBar.tsx:75-87`](../../src/components/composition/industry-workspace/ProfileBar.tsx#L75-L87) — ⋯ manage Menu: floatSurface + size-10 rounded-full text-muted outline-none hover/focus-visible:border-border-active
- [`src/features/maps/MapSwitcher.tsx:85-146`](../../src/features/maps/MapSwitcher.tsx#L85-L146) — Identical trigger markup 87-92 and trigger class 99-102; panel 103 (grid min-w-72 grid-cols-[minmax(0,1fr)_auto]) with the same scrollArea/rounded-card/p-[5px]/max-h/overflow/overscroll stem; align='center'; current row aria-current='page' + bg-row-on text-name
- [`src/components/composition/map/MapMenu.tsx:42-45, 186-190`](../../src/components/composition/map/MapMenu.tsx#L42-L45) — glyphTrigger: floatSurface + inline-flex size-10 rounded-full text-muted hover:border-border-active hover:text-name; no outline-none or focus-visible treatment
- [`src/components/ui/menu.tsx:38-103`](../../src/components/ui/menu.tsx#L38-L103) — Menu already forwards triggerProps (ref, data-*), popupProps and surface, so a wrapper can be thin
- [`src/components/ui/card.tsx:7-9`](../../src/components/ui/card.tsx#L7-L9) — floatSurface, documented as glass for 'pinned controls'; callers choose the shape
- [`src/features/maps/MapSwitcher.test.ts:18-48, 115-126`](../../src/features/maps/MapSwitcher.test.ts#L18-L48) — Mocks '@/components/ui/menu' wholesale and asserts trigger and panel classes, data attributes and aria-current='page'

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/composition/AppHeader.tsx:41-46`](../../src/components/composition/AppHeader.tsx#L41-L46) — floatSurface on the header bar, not a menu trigger
- [`src/components/composition/NavMenu.tsx:51`](../../src/components/composition/NavMenu.tsx#L51) — A size-10 round trigger with transparent row-hover styling, not glass; different look
- [`src/mapper/signatures/scanner-combo-panel.tsx:37`](../../src/mapper/signatures/scanner-combo-panel.tsx#L37) — Combobox listbox with a different max-h fallback and shadow-dd; not a Menu switcher
- [`src/mapper/windows/MapWindow.tsx:114`](../../src/mapper/windows/MapWindow.tsx#L114) — Floating window sizing that only shares 24rem
- [`src/components/ui/portrait-toggle.tsx:9`](../../src/components/ui/portrait-toggle.tsx#L9) — A size-10 toggle with a different role (pressed portrait)

</details>

**Home.** `New src/components/ui/switcher-menu.tsx ('use client') exporting SwitcherMenu; floatIconTrigger in src/components/ui/card.tsx next to floatSurface`

**Boundary check.** Both homes are in zone ui. switcher-menu.tsx imports './menu', './card', './scroll-area' and './cn', all intra-zone and allowed under ui allow []. Consumers: ProfileBar.tsx and MapMenu.tsx are components-composition (allowed: ui); MapSwitcher.tsx is features (allowed: ui).

**API sketch.**

```ts
// card.tsx
export const floatIconTrigger = `${floatSurface} flex size-10 cursor-pointer items-center justify-center rounded-full text-muted outline-none transition-colors hover:border-border-active hover:text-name focus-visible:border-border-active`;
// switcher-menu.tsx
export function SwitcherMenu(props: {
  label: string;            // aria label, e.g. `Switch map from ${name}`
  current: string;          // rendered as '{current} ⌄'
  align?: PositionerProps['align']; // default 'start'
  className?: string;       // panel layout only: 'flex min-w-64 flex-col' | 'grid min-w-72 grid-cols-[...]'
  triggerProps?: MenuTriggerProps;
  popupProps?: DataAttributes;
  children: ReactNode;      // caller-owned rows incl. aria-current
}): JSX.Element; // Menu surface='frosted' side='bottom' sideOffset={8}, triggerClassName=cn(floatSurface, SWITCHER_TRIGGER), className=cn(scrollArea, 'rounded-card p-[5px] max-h-[min(24rem,var(--available-height))] overflow-y-auto overscroll-contain', className)
```

**Migration steps.**

1. Add floatIconTrigger to card.tsx.
2. Create src/components/ui/switcher-menu.tsx with SwitcherMenu. Move the trigger span markup and the trigger and panel stem classes there verbatim from ProfileBar.tsx:38-48.
3. Migrate MapSwitcher.tsx:85-108 to <SwitcherMenu label current={selected.name} align='center' triggerProps={...} popupProps={...} className='grid min-w-72 grid-cols-[minmax(0,1fr)_auto]'>. Keep the rows and aria-current='page' unchanged. Run MapSwitcher.test.ts: its Menu mock still intercepts the inner './menu' import, so the class assertions should pass unchanged.
4. Migrate ProfileBar.tsx:36-53 to SwitcherMenu with className='flex min-w-64 flex-col'. Keep the rows, the ✓ marker and aria-current='true'.
5. Set ProfileBar.tsx:78-81 to triggerClassName={cn(floatIconTrigger, 'font-data text-h3')}. In MapMenu.tsx, delete glyphTrigger and use floatIconTrigger. This adds outline-none and focus-visible:border-border-active to the hamburger, matching the switcher trigger's focus treatment.
6. Remove the now-unused floatSurface and scrollArea imports from ProfileBar.tsx and MapSwitcher.tsx, then run test-runner `pnpm check`.

**Tests.** Add src/components/ui/switcher-menu.test.ts. Render with a mocked './menu' (the pattern in MapSwitcher.test.ts) and assert: the trigger shows the current name, truncate and the ⌄ glyph; the trigger class includes max-w-full and min-w-0; the panel class merges scroll-area, max-h-[min(24rem,var(--available-height))] and overflow-y-auto with the caller's layout class; triggerProps and popupProps data attributes are forwarded. Existing guards: MapSwitcher.test.ts:115-126 and MapMenu.test.ts, which spreads the real menu module.

**Notes.** Preserve these differences: aria-current='true' for profiles (an in-page state switch) and 'page' for maps (URL navigation), so the value must stay with the caller. align 'start' vs 'center'. ProfileBar's ✓ column. MapSwitcher's subgrid rows with the manage cog. Popup display: Menu's cva base is 'flex flex-col' and MapSwitcher overrides it with 'grid' through cn; keep the layout class last so the merge still resolves to grid. Focus drift: MapMenu's hamburger currently relies on the UA outline. After migration it uses the border-active focus style shared with the switcher trigger; if a stronger ring is wanted, change floatIconTrigger once rather than per site.

<sub>Reported by: concern:ui-patterns.</sub>

<a id="p057"></a>

## P057: Move the document-wide view-transition reduced-motion rule to globals.css and share the board/industry view-transition fade keyframes

- **Status:** [ ] not started
- **Category:** css-styling · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -16 / +12
- **Depends on:** —
- **Existing primitive:** `src/app/globals.css:@keyframes reveal`

**Problem.** HomeBoardView.css ends with a @media (prefers-reduced-motion) rule that zeroes every ::view-transition-group/image-pair/old/new(*). That is a document-level rule covering the board, industry tab and planner-view transitions, but it lives in the board's owner stylesheet. The two view-transition stylesheets also define the same keyframes under different names: board-fade-out and industry-section-out are both `to { opacity: 0 }`, and board-rise-in (12px) and industry-section-in (6px) are the same rise at different distances.

**Verifier revision.** Most of the claim fails on inspection. (1) 'IndustryShell's transitions depend on the board stylesheet being loaded' is false: globals.css imports both stylesheets unconditionally (31-32), and src/app/stylesheet-contract.test.ts 5-20 requires every owner stylesheet to be imported exactly once, so the ::view-transition-*(*) reduced-motion override always applies document-wide. (2) banner-in is not 'the same rise': it adds filter: blur(4px), moves up (-8px) and is declared inside @layer components (banner.css 1-30), which makes it the reveal/input-dropdown family. (3) map-fade-in/out belong to the mapper's self-contained motion contract, whose own reduced-motion fallbacks reference them 14 times (motion-contract.css 200-240, 306-322, 336-340). map-fade-in also has an explicit `to { opacity: 1 }`, unlike board-fade-in's implicit end value, so merging them changes behavior. What survives is small: the global view-transition reduced-motion override is a document rule living in a board-owned stylesheet, which goes against src/AGENTS.md ('Keep … document rules in app/globals.css'). The two view-transition owners (board and industry, which also serves CockpitPlanner's planner-view) define identical fade-out keyframes and the same rise with different distances.

**Sites (7).**

- [`src/components/composition/board/HomeBoardView.css:69-77`](../../src/components/composition/board/HomeBoardView.css#L69-L77) — Global ::view-transition-*(*) reduced-motion override housed in the board stylesheet
- [`src/components/composition/board/HomeBoardView.css:26-28, 46-67`](../../src/components/composition/board/HomeBoardView.css#L26-L28) — board-fade-in/out and board-rise-in keyframes and their view-transition uses
- [`src/components/composition/industry-workspace/IndustryShell.css:1-15`](../../src/components/composition/industry-workspace/IndustryShell.css#L1-L15) — industry-section-out (== board-fade-out) and industry-section-in (rise 6px)
- [`src/components/composition/industry-workspace/IndustryShell.tsx:103`](../../src/components/composition/industry-workspace/IndustryShell.tsx#L103) — SECTION_MOTION uses the industry-section class
- [`src/features/industry-planner/components/CockpitPlanner.tsx:14`](../../src/features/industry-planner/components/CockpitPlanner.tsx#L14) — planner-view also uses the industry-section class, so a third owner relies on these keyframes
- [`src/app/globals.css:31-32, 627-646, 666-671`](../../src/app/globals.css#L31-L32) — Imports both owner stylesheets; reveal keyframe; document-level reduced-motion block
- [`src/app/stylesheet-contract.test.ts:5-20`](../../src/app/stylesheet-contract.test.ts#L5-L20) — Requires every owner stylesheet to be imported once from globals.css, which refutes the 'depends on board stylesheet' claim

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/ui/banner.css:19, 24-30`](../../src/components/ui/banner.css#L19) — banner-in adds blur(4px), rises from above (-8px) and is inside @layer components; it belongs to the reveal family, not a plain rise
- [`src/mapper/motion/motion-contract.css:81-97, 200-240, 306-322, 336-340`](../../src/mapper/motion/motion-contract.css#L81-L97) — map-fade-in/out are part of the mapper motion contract and its reduced-motion fallbacks; map-fade-in has an explicit end opacity, so it differs semantically; moving it would split a cohesive, tested file
- [`src/app/globals.css:627-629`](../../src/app/globals.css#L627-L629) — reveal includes blur and uses backwards fill on purpose (comment 630-632); not the same effect

</details>

**Home.** `src/app/globals.css (document rules and shared keyframes), next to the existing reduced-motion block at 666-671`

**Boundary check.** CSS only. globals.css is the app-zone stylesheet entry that imports both owner stylesheets (31-32). Keyframe names are global at runtime, and the fallow import boundaries do not govern CSS keyframe references. src/AGENTS.md styling rules put document rules and shared utilities in app/globals.css, and no new stylesheet is added, so stylesheet-contract.test.ts is unaffected.

**API sketch.**

```ts
/* globals.css */
@keyframes vt-fade-out { to { opacity: 0; } }
@keyframes vt-fade-in { from { opacity: 0; } }
@keyframes vt-rise-in { from { opacity: 0; translate: 0 var(--vt-rise, 12px); } }
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*), ::view-transition-image-pair(*), ::view-transition-old(*), ::view-transition-new(*) {
    animation-duration: 0s !important; animation-delay: 0s !important;
  }
}
```

**Migration steps.**

1. Cut HomeBoardView.css 69-77 and paste it into globals.css beside the reduced-motion block at 666-671, with a one-line comment that it covers every view transition (board, industry tabs, planner view). Keep the !important flags and keep it outside @layer, as now.
2. Add vt-fade-out, vt-fade-in and vt-rise-in to globals.css near @keyframes reveal (627).
3. Point HomeBoardView.css 27, 48, 51, 54 and 57 at vt-fade-in, vt-fade-out and vt-rise-in, and IndustryShell.css 2 and 6 at vt-fade-out and vt-rise-in, setting --vt-rise: 6px on ::view-transition-new(.industry-section). Delete board-fade-out, board-fade-in, board-rise-in, industry-section-out and industry-section-in. Leave board-morph-blur in the board stylesheet because it has a single owner.
4. Leave the mapper motion-contract.css and banner.css untouched.
5. Check in a browser (local dev server) that board open/close and industry tab switches look unchanged, and that they are instant with prefers-reduced-motion emulated. If var() inside a keyframe misbehaves on view-transition pseudo-elements, fall back to two literal rise keyframes.

**Tests.** stylesheet-contract.test.ts keeps passing because no stylesheet is added or removed. Add an assertion to src/app/reduced-motion.test.ts that globals.css contains the ::view-transition-*(*) reduced-motion override (animation-duration: 0s), so it cannot drift back into an owner file or disappear when the board stylesheet changes. No test references these keyframe names (grep shows only class names: industry-section in IndustryShell.tsx 103, CockpitPlanner.tsx 14 and ui-adoption-registry.ts 39), so renaming is safe.

**Notes.** The original claim of a real reduced-motion dependency bug is false; the fix is about ownership, not behavior. Lead (unverified, separate from this change): map-fade-in has `to { opacity: 1 }` and is applied with fill-mode both through .map-edge-fade-enter. ChainLinkEdge.tsx 51-56 can put that class on the same path as .map-edge-derived (opacity 0.45, motion-contract.css 99-101). A derived halo or stub edge that fades in would then hold opacity 1 until the motion class clears and jump to 0.45. Whether halo or stub edges ever get fade motion depends on motion-host-model.ts 203-214 and 266-291 and was not confirmed. If they do, dropping the explicit `to` (board-fade-in's implicit end) is the correct version.

<sub>Reported by: area:components-composition, concern:ui-patterns.</sub>

<a id="p039"></a>

## P039: Standardise search-field picks on Base UI's item-press change with one ui helper, and drop the redundant input attributes

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** medium · **Payoff:** medium · **Size:** +15 helper and +30 test; about -4 per site across 8 sites, -4 in the NameField workaround, and about -20 redundant attribute lines; net about -25 production lines
- **Depends on:** —
- **Existing primitive:** `src/features/custom-structures/components/PickField.tsx:PickField`

**Problem.** Nine Autocomplete-based search fields detect a picked item in two ways. BlueprintSearch, AddFacility and the three scanner combos read onValueChange with details.reason === 'item-press'. PickField, CharacterSearchControl, TerminalSearch and GlobalSearch put the pick in Combobox.Item onClick.

Base UI runs that onClick first, then commits and fills the input with the item's label through onValueChange(label, 'item-press'). The onClick sites therefore receive the pick and then a stray 'typed' value:
- StructureComposer's NameField works around it with a `picked` ref.
- CharacterSearchControl calls changeQuery('') and then the fill calls changeQuery(result.name). The field likely keeps the added character's name and re-searches.
- TerminalSearch's fill runs setError(null) after submitParsedString, wiping any error that submit set.
- A drag-release selection (ComboboxItem onMouseUp) commits without any click, so the onClick pickers miss it.

Separately, six Field call sites repeat spellCheck, autoCorrect, autoCapitalize and autoComplete props that Base UI already applies to the combobox input.

**Verifier revision.** The split in how picks are detected is real and wider than reported: 4 sites use Item onClick and 5 use reason 'item-press'. The keyboard concern is refuted. In Base UI 1.7.0, Enter calls clickHighlightedItem, which calls listItem.click() (ComboboxInput.mjs 342-355, utils/parts.mjs 43-50), so onClick pickers are keyboard-accessible.

The onClick approach is still wrong in two ways. First, mergeProps runs the user's onClick before Base UI's own commit. Autocomplete then fills the input (fillInputOnItemPress: true) and calls onValueChange(label, 'item-press') after the pick. Every onClick consumer has to absorb that second event: NameField has a `picked`-ref workaround, and CharacterSearchControl likely ends with the picked name in the field. Second, ComboboxItem also commits on onMouseUp for a press that started elsewhere and was released on the item, and that path never fires onClick.

Promoting PickField does not survive. Its only consumer is StructureComposer. BlueprintSearch, AddFacility and CharacterSearchControl each need several props PickField lacks (placeholder, aria-label, className, onItemHighlighted, groups, controlled open, ref, disabled, onBlur), so a promoted PickField would just pass the Root and Field API through. The shared scaffold is also mostly redundant: Base UI's AriaCombobox already sets autoComplete off, spellCheck false, autoCorrect off and autoCapitalize none on the input, and mode='list' is the Autocomplete default.

**Sites (14).**

- [`src/features/custom-structures/components/PickField.tsx:16-67`](../../src/features/custom-structures/components/PickField.tsx#L16-L67) — Picks via Item onClick (56); redundant input attributes (42-45) and mode=list (37)
- [`src/features/custom-structures/components/StructureComposer.tsx:113-157`](../../src/features/custom-structures/components/StructureComposer.tsx#L113-L157) — NameField: picked ref (128, 147-148, 152) exists only to absorb the post-pick fill
- [`src/features/custom-structures/components/StructureComposer.tsx:415-443`](../../src/features/custom-structures/components/StructureComposer.tsx#L415-L443) — SystemField: onPick then the fill calls onType(name), so the draft is updated twice
- [`src/features/maps/CharacterSearchControl.tsx:175-225`](../../src/features/maps/CharacterSearchControl.tsx#L175-L225) — Object items with itemToStringValue (179); onClick at 206-209 calls changeQuery(''), which the fill overrides with changeQuery(result.name); partial redundant attributes (189-190)
- [`src/components/ui/terminal-search.tsx:95-146`](../../src/components/ui/terminal-search.tsx#L95-L146) — onClick at 139-142 submits, then the fill runs onValueChange (98-102), which clears error and highlightedRef; redundant attributes (117-120)
- [`src/components/composition/GlobalSearch.tsx:96-121, 180-196`](../../src/components/composition/GlobalSearch.tsx#L96-L121) — SearchRow onClick (191). The post-pick fill is masked because the close triggers dismiss() and resets the value. Redundant attributes (116-119).
- [`src/features/industry-planner/components/BlueprintSearch.tsx:23-62`](../../src/features/industry-planner/components/BlueprintSearch.tsx#L23-L62) — Correct: item-press with an id lookup; redundant attributes (43-46)
- [`src/components/composition/industry-workspace/AddFacility.tsx:107-145`](../../src/components/composition/industry-workspace/AddFacility.tsx#L107-L145) — Correct: item-press with a Map lookup; redundant attributes (138-141)
- [`src/mapper/signatures/scanner-type-combo.tsx:102-117`](../../src/mapper/signatures/scanner-type-combo.tsx#L102-L117) — item-press; a failed parse of the picked value does nothing
- [`src/mapper/signatures/scanner-identify-combo.tsx:119-133`](../../src/mapper/signatures/scanner-identify-combo.tsx#L119-L133) — item-press: commitValue(next)
- [`src/mapper/signatures/scanner-leads-control.tsx:256-270`](../../src/mapper/signatures/scanner-leads-control.tsx#L256-L270) — item-press: commitScannerLeadsValue(next, setters)
- [`node_modules/@base-ui/react/combobox/item/ComboboxItem.mjs:106-152`](../../node_modules/@base-ui/react/combobox/item/ComboboxItem.mjs#L106-L152) — Evidence: commitSelection runs from onClick and from onMouseUp (drag-release); the user's onClick runs first (mergeProps right-to-left)
- [`node_modules/@base-ui/react/combobox/root/AriaCombobox.mjs:555-598, 863-868`](../../node_modules/@base-ui/react/combobox/root/AriaCombobox.mjs#L555-L598) — Evidence: item-press fill of the input; default input attributes autoComplete off, spellCheck false, autoCorrect off, autoCapitalize none
- [`node_modules/@base-ui/react/autocomplete/root/AutocompleteRoot.mjs:16-24, 86-92`](../../node_modules/@base-ui/react/autocomplete/root/AutocompleteRoot.mjs#L16-L24) — Evidence: mode defaults to 'list'; fillInputOnItemPress is true

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/composition/industry-workspace/ProfileDialogs.tsx:119`](../../src/components/composition/industry-workspace/ProfileDialogs.tsx#L119) — autoComplete=off on a plain input, not a combobox
- [`src/features/maps/MapCreationDialog.tsx:258`](../../src/features/maps/MapCreationDialog.tsx#L258) — Plain input, not a combobox
- [`src/features/feedback/components/FeedbackModal.tsx:121`](../../src/features/feedback/components/FeedbackModal.tsx#L121) — Plain input, not a combobox
- [`src/app/(site)/preview/primitives/combobox-sample.tsx:21-49`](../../src/app/%28site%29/preview/primitives/combobox-sample.tsx#L21-L49) — Preview sample with no pick handler; only the redundant mode=list (26) applies

</details>

**Home.** `New src/components/ui/combobox-pick.ts, a pure helper beside ui/combobox.tsx following the terminal-search-view.ts precedent, with combobox-pick.test.ts. PickField stays in features/custom-structures.`

**Boundary check.** The home is in the ui zone (src/components/ui/**), whose rule allows nothing, and the helper imports nothing; its details type is inlined. Consumers:
- features/custom-structures, features/industry-planner and features/maps: the features rule allows ui.
- components-composition (AddFacility, GlobalSearch): the components-composition rule allows ui.
- mapper/signatures scanner combos: the mapper rule allows ui.
- ui/terminal-search: same zone.
All imports are legal.

**API sketch.**

```ts
// src/components/ui/combobox-pick.ts
/**
 * onValueChange for a search field whose list items are picks. Base UI reports every commit
 * (click, Enter on the highlighted item, drag-release) as reason 'item-press' carrying the
 * item's value, then fills the input with it. Picks go to onPick; that fill never reaches onType.
 */
export function pickOrType<T>(
  lookup: (value: string) => T | undefined,
  onType: (text: string) => void,
  onPick: (item: T) => void,
): (next: string, details: { readonly reason: string }) => void;
```

**Migration steps.**

1. Add src/components/ui/combobox-pick.ts and its unit test. Ask docs-researcher to confirm the Base UI 1.7 item-press and fill contract first.
2. Behaviour-preserving adoptions:
- BlueprintSearch: `pickOrType((id) => hits.find((h) => h.id === id), setQuery, open)`.
- AddFacility: `pickOrType((v) => options.get(v), setQuery, (o) => { onAdd(o.pick); setQuery(''); onScopeEnd?.(); })`.
- Scanner combos: identity lookup `(v) => v`, keeping the parse or commit inside onPick so a failed parse still does nothing.
3. PickField: make Item values the option keys, which are unique (names can collide), build `const byKey = new Map(options.map((o) => [o.key, o]))`, use `onValueChange={pickOrType((k) => byKey.get(k), onValueChange, (o) => onPick(o.item))}`, and delete the Item onClick. Keep PickField's props unchanged so StructureComposer.actions.test.ts still applies. Then in NameField delete the `picked` ref and call `setTyped(name)` directly.
4. CharacterSearchControl: make items `available.map((r) => String(r.characterId))` with a Map from id to result, drop itemToStringValue, and use `onValueChange={pickOrType((id) => byId.get(id), changeQuery, (r) => { onSelect(principalFromCharacter(r)); changeQuery(''); })}`. Delete the Item onClick. Pin the clearing behaviour with a test first.
5. TerminalSearch (ui): `pickOrType((v) => v, onTypeHandler, (s) => { setValue(s); submitParsedString(s); })`, and delete the Item onClick.
6. GlobalSearch is optional. Its items are SearchResult objects keyed by a possibly duplicated label, so switch item values to row ids with a Map lookup if adopted. Otherwise leave it: dismiss() already masks the fill, and only the drag-release path is missed.
7. Delete spellCheck, autoCorrect, autoCapitalize and autoComplete from the Combobox.Field call sites in PickField (42-45), BlueprintSearch (43-46), AddFacility (138-141), GlobalSearch (116-119), TerminalSearch (117-120) and CharacterSearchControl (189-190). Optionally delete mode="list" (a default) as well.

**Tests.** New combobox-pick.test.ts covers:
- item-press with a known value calls onPick only.
- item-press with an unknown value calls onType.
- 'input-change' calls onType.
- onType and onPick never both fire for one call.

Add a static-markup test in a ui/combobox test that renders Field and asserts autocomplete="off" and spellcheck="false" are still present, which guards step 7.

Add a CharacterSearchControl test that invokes the Root onValueChange with (id, { reason: 'item-press' }) and asserts that onSelect runs and the query is cleared.

Existing tests that guard the change:
- StructureComposer.actions.test.ts 159-196 (onPick and onType props unchanged)
- CharacterSearchControl.test.ts
- terminal-search-view.test.ts
- AddFacilityRow.test.ts

**Notes.** Correct pattern: item-press via onValueChange, as used in BlueprintSearch, AddFacility and the scanner combos.

Behaviour differences to preserve or accept:
(1) Scanner combos ignore an item-press whose value fails to parse. Keep that by using an identity lookup and parsing inside onPick.
(2) BlueprintSearch and AddFacility treat an item-press with an unknown value as typing. The helper does the same.
(3) PickField consumers stop receiving onValueChange(name) after a pick. SystemField still shows the system name, because shown = query || system.name and pick sets query to ''. NameField's draft name is still set by pickStructure.
(4) TerminalSearch keeps a parse error raised by a picked suggestion instead of the fill clearing it.
(5) CharacterSearchControl's post-pick state is likely buggy today: the query becomes the picked name, a new search runs, and the popup may reopen. Confirm with the new test before changing it.

The Base UI behaviour was read from node_modules/@base-ui/react@1.7.0. Re-check it on upgrade.

<sub>Reported by: area:features-owned.</sub>

<a id="p123"></a>

## P123: Route tool-nav activation and page-settings resolution through sectionMatches

- **Status:** [ ] not started
- **Category:** generic-utility · **Kind:** bypasses-existing-primitive · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About 15 lines removed and 12 added (plus a new test file)
- **Depends on:** —
- **Existing primitive:** `src/lib/section-path.ts:sectionMatches`

**Problem.** data/tools isToolActive uses raw startsWith, so a sibling route sharing a prefix ('/sitesx') marks a tool active. platform/page-settings resolveSpecForPath re-implements the segment-safe match inline. It and settings-sections each hand-roll the same 'longest matching href wins' loop.

**Sites (7).**

- [`src/lib/section-path.ts:1-5`](../../src/lib/section-path.ts#L1-L5) — existing sectionMatches (trims trailing slashes; segment-safe; optional exact)
- [`src/data/tools/registry.ts:58-61`](../../src/data/tools/registry.ts#L58-L61) — raw startsWith over matchPrefix and alsoMatches (drifted)
- [`src/platform/page-settings/resolve.ts:3-17`](../../src/platform/page-settings/resolve.ts#L3-L17) — inline segment check plus a longest-route loop; empty-path guard at 7
- [`src/app/(site)/settings/settings-sections.ts:51-64`](../../src/app/%28site%29/settings/settings-sections.ts#L51-L64) — longest-href loop over nested groups via sectionMatches
- [`src/platform/page-settings/index.ts:14-16`](../../src/platform/page-settings/index.ts#L14-L16) — the only caller of resolveSpecForPath
- [`src/data/tools/registry.test.ts:13-21`](../../src/data/tools/registry.test.ts#L13-L21) — no negative case for a prefix-sibling path
- [`src/platform/page-settings/resolve.test.ts:8-21`](../../src/platform/page-settings/resolve.test.ts#L8-L21) — already pins segment safety, longest match and empty path

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/(site)/admin/admin-sections.ts:94-103`](../../src/app/%28site%29/admin/admin-sections.ts#L94-L103) — First match with exact=true only for '/admin'. Switching to longest match would return the '/admin' section for '/admin/unknown', where today it returns null, so leave it.
- [`src/components/ui/content-browser-view.ts:35-47`](../../src/components/ui/content-browser-view.ts#L35-L47) — Different concept (extracts a child slug). Also the ui zone may import nothing, so it cannot use lib.
- [`src/components/composition/industry-workspace/IndustryShell.tsx:28-29`](../../src/components/composition/industry-workspace/IndustryShell.tsx#L28-L29) — Exact equality and a numeric-id regex, not a prefix-section match

</details>

**Home.** `src/lib/section-path.ts (existing; add mostSpecificMatch beside sectionMatches)`

**Boundary check.** Home zone lib (the lib rule allows only config; section-path.ts imports nothing).

Consumers:
- src/data/tools/registry.ts is zone data/tools, and the data rule allows 'lib'.
- src/platform/page-settings/resolve.ts is zone platform/page-settings, whose rule allows only 'lib'.
- src/app/(site)/settings/settings-sections.ts is zone app, and the app rule allows 'lib'.

All legal.

**API sketch.**

```ts
export function sectionMatches(pathname: string, href: string, exact?: boolean): boolean; // unchanged
export function mostSpecificMatch<T>(pathname: string, items: Iterable<T>, hrefOf: (item: T) => string): T | null;
```

**Migration steps.**

1. Add mostSpecificMatch to src/lib/section-path.ts. It loops over items, keeps the item whose href satisfies sectionMatches and is longest, and returns the first such item on ties, matching both current loops (strict `>`).
2. Add src/lib/section-path.test.ts covering:
- sectionMatches: exact, child, prefix-sibling rejected, trailing slash, exact flag.
- mostSpecificMatch: nested routes pick the longest, ties keep the first, no match returns null.
3. src/data/tools/registry.ts:60 becomes `return [tool.matchPrefix, ...(tool.alsoMatches ?? [])].some((prefix) => sectionMatches(pathname, prefix));`, keeping the null and missing-matchPrefix guard on 59.
4. src/platform/page-settings/resolve.ts: keep `if (!pathname) return null;`, then `return mostSpecificMatch(pathname, specs, (spec) => spec.route);`.
5. settings-sections.ts deriveActiveSettingsSection becomes `return mostSpecificMatch(pathname, groups.flatMap((g) => g.sections), (s) => s.href);`.
6. Add `expect(isToolActive(sites, '/sitesx')).toBe(false)` and `expect(isToolActive(industry, '/jobsboard')).toBe(false)` to registry.test.ts.

**Tests.** New tests:
- src/lib/section-path.test.ts (new; section-path.ts has no direct test today).
- Prefix-sibling negatives in src/data/tools/registry.test.ts.

Existing guards:
- src/platform/page-settings/resolve.test.ts: '/sitesfoo', '' and the longest-match cases.
- src/app/(site)/settings/settings-sections.test.ts: trailing slash, '/settings/accounts', '/settings'.
- src/composition/page-settings/registry.test.ts.

**Notes.** Behaviour differences:
- sectionMatches trims trailing slashes. resolveSpecForPath already matches '/sites/' via startsWith('/sites/'), so results are the same.
- Empty pathname: keep resolve's explicit guard, because sectionMatches('', '/') would match a hypothetical '/' route.
- isToolActive becomes stricter only for prefix siblings. No registered route collides today (TOOLS prefixes: /sites, /industry, /jobs, /structures, /atlas), so this hardens the code without visible change.
- Do not migrate admin-sections (first match with exact root).

<sub>Reported by: area:data-services, area:platform.</sub>

<a id="p320"></a>

## P320: Use lib/section-path for every route-segment match, add a longest-match helper, and merge the telemetry payload helper into the client

- **Status:** [ ] not started
- **Category:** simplification · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -30 / +25 (two files deleted, three loops collapsed; one helper and its test added)
- **Depends on:** [P123](#p123), [P066](wave-03-src-lib-primitives-collections-math-async.md#p066)
- **Existing primitive:** `src/lib/section-path.ts:sectionMatches`

**Problem.** Route-prefix matching is written four ways. lib/section-path.sectionMatches is segment-aware and used by settings and admin. The telemetry skip list and the nav tool registry use bare startsWith, so '/administrator' or '/sitesX' would match. page-settings writes its own correct `=== route || startsWith(route + '/')`. Separately, settings and page-settings each run the same longest-href-wins loop. In telemetry, a one-line payload wrapper with one consumer sits in a different zone directory from the only function that uses it.

**Verifier revision.** Both parts hold, but the scope was too narrow. (1) buildTelemetryPayload is a one-line pass-through with one consumer, and client.ts sits in components-composition although the components zone may import data and transport, so the two can merge into src/components/telemetry/client.ts. (2) shouldSkip's bare startsWith('/admin') also matches '/administrator'. The same segment-unaware prefix match appears in src/data/tools/registry.ts:58-61 isToolActive, where '/sitesfoo' would light up the Wormhole Sites nav. src/platform/page-settings/resolve.ts:11 re-implements sectionMatches inline, and its test explicitly pins '/sitesfoo' -> null, which shows segment matching is the intended semantics. resolve.ts:8-15 and settings-sections.ts:51-62 also run the same longest-matching-href loop. Both bugs are latent: no '/admin*' or '/sites*' sibling routes exist today (checked src/app). Adopting sectionMatches everywhere is the real payoff; the telemetry file shuffle is incidental.

**Sites (12).**

- [`src/components/telemetry/page-view-metadata.ts:3-7`](../../src/components/telemetry/page-view-metadata.ts#L3-L7) — SKIP_PREFIXES ['/admin','/api/'] with startsWith: '/administrator' is skipped and '/api' exactly is not
- [`src/data/tools/registry.ts:58-61`](../../src/data/tools/registry.ts#L58-L61) — isToolActive uses pathname.startsWith(prefix) for matchPrefix and alsoMatches, so it is not segment-aware
- [`src/platform/page-settings/resolve.ts:3-17`](../../src/platform/page-settings/resolve.ts#L3-L17) — Inline segment match plus a longest-route loop
- [`src/platform/page-settings/resolve.test.ts:14-16`](../../src/platform/page-settings/resolve.test.ts#L14-L16) — Pins '/sitesfoo' -> null, the intended semantics
- [`src/app/(site)/settings/settings-sections.ts:51-62`](../../src/app/%28site%29/settings/settings-sections.ts#L51-L62) — The same longest-match loop, over sectionMatches
- [`src/app/(site)/admin/admin-sections.ts:94-103`](../../src/app/%28site%29/admin/admin-sections.ts#L94-L103) — First match with exact '/admin'; the current hrefs (58-89) make this equal to longest-match
- [`src/lib/section-path.ts:1-5`](../../src/lib/section-path.ts#L1-L5) — Canonical segment matcher; trims trailing slashes
- [`src/components/telemetry/telemetry-payload.ts:1-8`](../../src/components/telemetry/telemetry-payload.ts#L1-L8) — buildTelemetryPayload = { action, metadata: metadata ?? {} }
- [`src/components/composition/telemetry/client.ts:1-18`](../../src/components/composition/telemetry/client.ts#L1-L18) — Its only consumer; imports data and transport, both legal from the components zone
- [`src/components/composition/TelemetryReporter.tsx:5-11, 57, 66`](../../src/components/composition/TelemetryReporter.tsx#L5-L11) — The only caller of postTelemetry and shouldSkip
- [`src/components/coverage.test.ts:58, 68`](../../src/components/coverage.test.ts#L58) — Pins buildTelemetryPayload
- [`src/components/composition/coverage.test.ts:69, 89`](../../src/components/composition/coverage.test.ts#L69) — Pins postTelemetry at its current path

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/ui/content-browser-view.ts:34-46`](../../src/components/ui/content-browser-view.ts#L34-L46) — Already segment-aware (prefix includes the trailing '/'), and it sits in ui, which cannot import lib
- [`src/app/robots.ts:10`](../../src/app/robots.ts#L10) — robots.txt Disallow uses prefix semantics by spec; a different concept
- [`src/app/api/feedback/route.ts:61`](../../src/app/api/feedback/route.ts#L61) — Validates that a path starts with '/'; not route matching

</details>

**Home.** `src/lib/section-path.ts (existing sectionMatches plus a new longestSectionMatch). src/components/telemetry/client.ts, the new home of postTelemetry.`

**Boundary check.** lib/section-path.ts imports nothing, which fits { from: 'lib', allow: ['config'] }. Every consumer may import lib: components (page-view-metadata.ts), data (tools/registry.ts; the data rule lists lib), platform/page-settings (resolve.ts; the rule is ['lib']), and app (settings-sections, admin-sections). For the moved client, src/components/telemetry/** belongs to the components zone, whose rule allows 'data' (data/telemetry/api-contract) and 'transport' (transport/api-client). Its consumer TelemetryReporter is in components-composition, whose rule allows 'components'.

**API sketch.**

```ts
// src/lib/section-path.ts
export function sectionMatches(pathname: string, href: string, exact = false): boolean; // unchanged
/** The item whose href is the longest segment match for pathname. */
export function longestSectionMatch<T>(pathname: string, items: Iterable<T>, hrefOf: (item: T) => string): T | null;
// src/components/telemetry/client.ts
export type TelemetryInput = z.input<typeof telemetryRequestSchema>;
export function postTelemetry({ action, metadata }: TelemetryInput): void; // payload = { action, metadata: metadata ?? {} }
```

**Migration steps.**

1. page-view-metadata.ts: replace SKIP_PREFIXES with SKIP_SECTIONS = ['/admin', '/api'] and implement shouldSkip as SKIP_SECTIONS.some((href) => sectionMatches(path, href)). Add '/administrator' -> false and '/api' -> true cases to page-view-metadata.test.ts.
2. registry.ts: change isToolActive to [tool.matchPrefix, ...(tool.alsoMatches ?? [])].some((href) => sectionMatches(pathname, href)). Add isToolActive(sites, '/sitesfoo') === false to registry.test.ts.
3. section-path.ts: add longestSectionMatch, plus a new src/lib/section-path.test.ts covering exact, child, sibling-prefix ('/sitesfoo'), trailing slash and longest-wins.
4. resolve.ts: replace the loop with return longestSectionMatch(pathname, specs, (spec) => spec.route) and keep the `if (!pathname) return null` guard. resolve.test.ts already guards this.
5. settings-sections.ts: deriveActiveSettingsSection becomes longestSectionMatch(pathname, groups.flatMap((g) => g.sections), (s) => s.href).
6. Optional: change admin-sections deriveActiveAdminSection the same way and drop the exact-'/admin' special case. Equivalence relies on the current hrefs, so add a test that '/admin/users/x' resolves to users and '/admin' to overview.
7. Telemetry: create src/components/telemetry/client.ts holding TelemetryInput and postTelemetry with the payload built inline. Point TelemetryReporter.tsx:5 at '@/components/telemetry/client' and delete src/components/telemetry/telemetry-payload.ts and src/components/composition/telemetry/client.ts.
8. Coverage pins: in src/components/coverage.test.ts, swap the buildTelemetryPayload import (58, 68) for postTelemetry from the new path; in src/components/composition/coverage.test.ts, remove the postTelemetry import and pin (69, 89).

**Tests.** Existing guards: page-view-metadata.test.ts shouldSkip (9-18), registry.test.ts isToolActive (13-21), resolve.test.ts (14-16, including '/sitesfoo'), and the settings and admin section tests. Add: lib/section-path.test.ts for longestSectionMatch; '/administrator' and '/api' cases for shouldSkip; '/sitesfoo' for isToolActive.

**Notes.** Behavior changes, all intended: '/administrator'-style paths are no longer skipped by telemetry; '/api' exactly is now skipped, which is harmless because TelemetryReporter only runs on page routes; tool nav no longer lights for '/sitesX'-style siblings. sectionMatches also trims a trailing slash, which resolve.ts did not, but '/sites/' already matched there through startsWith('/sites/'), so results are the same. Keep postTelemetry's `metadata ?? {}` default even though telemetryRequestSchema.metadata is optional, because the route may rely on an object. The sendBeacon-then-apiFetch fallback must move unchanged.

<sub>Reported by: area:ui-components.</sub>

<a id="p024"></a>

## P024: Add NavRailLayout beside NavRailFrame and one longest-prefix matchSection in lib/section-path

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -35 / +40 (four grids and three matcher bodies collapse; the helper, the layout and a new test are added)
- **Depends on:** [P123](#p123)
- **Existing primitive:** `src/components/ui/nav-rail.tsx:NavRailFrame; src/lib/section-path.ts:sectionMatches`

**Problem.** Every NavRailFrame consumer re-implements the rail-plus-content grid, and the rail width and gap have drifted four ways. Active-route resolution exists in four forms: first-match with an exact special case (admin), longest-prefix via sectionMatches (settings), longest-prefix written inline (page-settings), and a bare startsWith without a segment boundary (tools registry). These match sibling prefixes inconsistently.

**Verifier revision.** Both halves are real but need a different scope. Layout: NavRailFrame has exactly four consumers, and each wraps it in a hand-written 'grid items-start gap-5 lg:grid-cols-[Wpx_minmax(0,C)] lg:gap-N' plus a min-w-0 content column. The rail widths drift (200/208/220/232) as do the gaps (8/10), with no comment justifying them. Matching: the finder missed two sites. src/platform/page-settings/resolve.ts has its own longest-prefix matcher that skips sectionMatches. src/data/tools/registry.ts isToolActive uses a bare startsWith with no segment boundary, so '/sitesfoo' activates Sites, while resolve.test.ts:16 explicitly treats '/sitesfoo' as no match. The admin and settings algorithms give equal results on every current route, because admin's only parent href ('/admin') is exact. A unified longest-prefix helper therefore preserves both, provided it supports a per-item exact flag. The finder's railWidth 'sm'|'md'|'lg' would encode the drift; the revised design normalizes to two named column sets.

**Sites (10).**

- [`src/app/(site)/admin/layout.tsx:9-32`](../../src/app/%28site%29/admin/layout.tsx#L9-L32) — grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8; data-admin-layout; content data-admin-content flex min-w-0 flex-col gap-5
- [`src/app/(site)/settings/layout.tsx:7-26`](../../src/app/%28site%29/settings/layout.tsx#L7-L26) — grid lg:grid-cols-[220px_minmax(0,var(--container-reading))] lg:gap-10; content gap-6
- [`src/app/(site)/preview/primitives/PrimitivesDemo.tsx:29-57`](../../src/app/%28site%29/preview/primitives/PrimitivesDemo.tsx#L29-L57) — grid pb-16 lg:grid-cols-[208px_minmax(0,1fr)] lg:gap-10; content gap-14
- [`src/components/ui/content-browser.tsx:27-53`](../../src/components/ui/content-browser.tsx#L27-L53) — grid pb-16 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-10; content min-w-0 only
- [`src/components/ui/nav-rail.tsx:140-167`](../../src/components/ui/nav-rail.tsx#L140-L167) — NavRailFrame: the rail primitive the four grids wrap
- [`src/app/(site)/admin/admin-sections.ts:94-103`](../../src/app/%28site%29/admin/admin-sections.ts#L94-L103) — First match in group order, with exact matching only for '/admin'
- [`src/app/(site)/settings/settings-sections.ts:51-64`](../../src/app/%28site%29/settings/settings-sections.ts#L51-L64) — Longest prefix via sectionMatches
- [`src/platform/page-settings/resolve.ts:3-17`](../../src/platform/page-settings/resolve.ts#L3-L17) — Longest prefix written inline (pathname===route \|\| startsWith(route+'/')), with an empty-path guard and no trailing-slash trim
- [`src/data/tools/registry.ts:58-61`](../../src/data/tools/registry.ts#L58-L61) — isToolActive: bare pathname.startsWith(prefix) with no segment boundary, so '/sitesfoo' and '/jobsx' match
- [`src/lib/section-path.ts:1-5`](../../src/lib/section-path.ts#L1-L5) — sectionMatches: segment-safe and trims trailing slashes

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/composition/board/HomeBoardView.tsx:18`](../../src/components/composition/board/HomeBoardView.tsx#L18) — Sheet grid xl:280px without NavRailFrame (a board column, not a section rail)
- [`src/components/composition/industry-workspace/ProfileWorkspace.tsx:111`](../../src/components/composition/industry-workspace/ProfileWorkspace.tsx#L111) — Member-rail sheet grid at xl 280px; different component and breakpoint
- [`src/components/composition/board/BoardSkeleton.tsx:9`](../../src/components/composition/board/BoardSkeleton.tsx#L9) — Skeleton of the board layout, not a nav rail
- [`src/components/composition/industry-workspace/IndustryShell.tsx:27-31`](../../src/components/composition/industry-workspace/IndustryShell.tsx#L27-L31) — sectionOf uses exact and regex tab matching (planner ids), not prefix sections
- [`src/components/ui/content-browser-view.ts:34-47`](../../src/components/ui/content-browser-view.ts#L34-L47) — deriveActiveContentSlug parses a slug segment, which is a different job

</details>

**Home.** `NavRailLayout in src/components/ui/nav-rail.tsx; matchSection in src/lib/section-path.ts`

**Boundary check.** nav-rail.tsx is ui. Its consumers are app layouts and PrimitivesDemo ('app' allows ui) and content-browser.tsx (ui, intra-zone). section-path.ts is lib ('lib' allows only config, and the helper imports nothing). Its consumers: app/(site)/admin and settings ('app' allows lib), src/platform/page-settings/resolve.ts ('platform/page-settings' allows ['lib']), src/data/tools/registry.ts ('data' allows lib).

**API sketch.**

```ts
// lib/section-path.ts
export function matchSection<T>(pathname: string, items: Iterable<T>, pathOf: (item: T) => string, exactOf?: (item: T) => boolean): T | null; // longest matching path wins, ties keep first; built on sectionMatches
// ui/nav-rail.tsx
const RAIL_COLUMNS = { nav: 'lg:grid-cols-[220px_minmax(0,1fr)]', reading: 'lg:grid-cols-[220px_minmax(0,var(--container-reading))]', chapters: 'lg:grid-cols-[232px_minmax(0,1fr)]' } as const;
export function NavRailLayout(props: Omit<ComponentProps<'div'>, 'children'> & { [k: `data-${string}`]: string | boolean | undefined } & { rail: ReactNode; columns?: keyof typeof RAIL_COLUMNS; contentClassName?: string; contentProps?: { [k: `data-${string}`]: string | boolean }; children: ReactNode }): JSX.Element; // grid items-start gap-5 lg:gap-10 + RAIL_COLUMNS[columns]; content div cn('min-w-0', contentClassName)
```

**Migration steps.**

1. Add matchSection to src/lib/section-path.ts with src/lib/section-path.test.ts (this file has no test of its own today).
2. settings-sections.ts: deriveActiveSettingsSection = matchSection(pathname, groups.flatMap(g => g.sections), s => s.href).
3. admin-sections.ts: add an 'exact' option to section() and set it on the overview entry. deriveActiveAdminSection = matchSection(pathname, groups.flatMap(g => g.sections), s => s.href, s => s.exact).
4. platform/page-settings/resolve.ts: keep the `if (!pathname) return null` guard (sectionMatches maps '' to '/'), then return matchSection(pathname, specs, s => s.route).
5. data/tools/registry.ts isToolActive: replace startsWith with sectionMatches(pathname, prefix) and add a '/sitesfoo' → false case to registry.test.ts.
6. Add NavRailLayout to nav-rail.tsx. Migrate ContentBrowser (columns='chapters', className='pb-16', data-content-browser-layout), then PrimitivesDemo (columns='nav', className='pb-16', contentClassName='flex flex-col gap-14'), then the settings layout (columns='reading', data-settings-layout, contentProps data-settings-content, contentClassName='flex flex-col gap-6'), then the admin layout (columns='nav', data-admin-layout, contentProps data-admin-content, contentClassName='flex flex-col gap-5'). Keep each layout's PageShell, PageHead, AdminGate and Suspense rail as they are.
7. Run test-runner `pnpm check`.

**Tests.** New src/lib/section-path.test.ts: longest wins ('/a' vs '/a/b'), exact items match only themselves, a sibling prefix does not match ('/settings/accounts' vs '/settings/account'), trailing slash, a tie keeps first, empty iterable returns null. Existing guards: admin-sections.test.ts:13-21, settings-sections.test.ts:18-23, platform/page-settings/resolve.test.ts:7-19, data/tools/registry.test.ts:13-21 (add '/sitesfoo'), admin-console.test.ts:69,100 (data-admin-layout present). Add one nav-rail render case asserting NavRailLayout forwards data-* to the grid and content divs and applies the column class.

**Notes.** Admin visual change needs sign-off: the rail goes from 200 to 220px and the gap from 32 to 40px, so the content column is 28px narrower at lg. PrimitivesDemo goes from 208 to 220px. If admin truly needs a narrower rail, add it as a named column set with a reason, not a free width. Preserve the differences: settings caps content at --container-reading; ContentBrowser's content column is not a flex column; pb-16 sits on the grid for ContentBrowser and PrimitivesDemo but pb-20 sits on the outer wrapper for admin and settings. Matching drift: isToolActive's bare startsWith is the incorrect copy; sectionMatches semantics are right. resolve.ts must keep its empty-pathname guard. Admin results are unchanged because no admin href other than '/admin' is a parent of another href.

<sub>Reported by: area:app-site.</sub>

<a id="p013"></a>

## P013: Extract PreferenceControl, the MenuControlModel-bound control, and use it in the settings page and the page menu

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** duplicate-implementation · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -90 / +40 (one file deleted, two dispatchers collapsed into one)
- **Depends on:** [P128](wave-03-src-lib-primitives-collections-math-async.md#p128)
- **Existing primitive:** `src/components/PreferencesProvider.tsx:usePreference; src/platform/page-settings/controls.ts:MenuControlModel; src/components/ui/dropdown-panel.ts:menuControlRow`

**Problem.** settings-control-row.tsx and PageMenuSection.tsx each implement the binding from a MenuControlModel to a live preference control. Each has a separate enum component (usePreference + SegmentedControl, options mapped to {value, label: option}), a separate boolean component (usePreference + Switch tone neutral) and a separate kind dispatcher. Only the row frame differs: 'flex items-center justify-between gap-4' with a 'text-ui text-text' label, versus menuControlRow with an unstyled label. A new MenuControlModel kind, such as a select-backed preference, has to be added in both dispatchers. Fallow's semantic pass groups these lines (dupes-grouped lines 1594-1595, 3064-3065, 4481-4482).

**Sites (5).**

- [`src/app/(site)/settings/settings-control-row.tsx:13-61`](../../src/app/%28site%29/settings/settings-control-row.tsx#L13-L61) — SettingsRowFrame (13-26), EnumSettingsRow (28-40), BooleanSettingsRow (42-54), SettingsControlRow dispatcher (56-61)
- [`src/components/composition/PageMenuSection.tsx:16-64`](../../src/components/composition/PageMenuSection.tsx#L16-L64) — ControlRowFrame (16-29), EnumControlRow (31-43), BooleanControlRow (45-57), ControlRow dispatcher (59-64); used at 74-76
- [`src/app/(site)/settings/preferences/preference-groups.tsx:14-18`](../../src/app/%28site%29/settings/preferences/preference-groups.tsx#L14-L18) — The only consumer of SettingsControlRow
- [`src/platform/page-settings/controls.ts:6-21`](../../src/platform/page-settings/controls.ts#L6-L21) — The Enum/Boolean MenuControlModel union that both dispatchers switch on
- [`src/components/PreferencesProvider.tsx:114-121`](../../src/components/PreferencesProvider.tsx#L114-L121) — usePreference works without a provider (it falls back to def.fallback), so render tests need no provider

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/wormhole-sites/components/SitesFilterLayout.tsx:169-190`](../../src/features/wormhole-sites/components/SitesFilterLayout.tsx#L169-L190) — SitesViewTools uses curated VIEW_OPTIONS/DETAIL_OPTIONS labels and shows the second control only when view === 'cards'. It is not a MenuControlModel rendering.
- [`src/mapper/tracking/TrackingControls.tsx:136-163`](../../src/mapper/tracking/TrackingControls.tsx#L136-L163) — DefaultScannerRow uses menuControlRow but binds a Select to a character list built at runtime. It is not a model-driven preference control.

</details>

**Home.** `src/components/preference-control.tsx (zone: components)`

**Boundary check.** The home is in the components zone (pattern src/components/*.tsx). Its imports: '@/components/PreferencesProvider' is in the same zone. '@/components/ui/segmented' and '@/components/ui/switch' are ui, and the components rule allows ui. '@/platform/page-settings/controls' is a type import, and the components rule allows platform/page-settings. The consumers: src/app/(site)/settings/preferences/preference-groups.tsx is in the app zone, and the app rule allows components. src/components/composition/PageMenuSection.tsx is in components-composition, and that rule allows components. The features and mapper rules also allow components, so later adopters are legal too.

**API sketch.**

```ts
'use client';
export function PreferenceControl({ model }: { model: MenuControlModel }): JSX.Element
// internal: EnumPreferenceControl({ model: EnumMenuControlModel }) -> SegmentedControl options={model.options.map(o => ({ value: o, label: o }))} label={model.label}
// internal: BooleanPreferenceControl({ model: BooleanMenuControlModel }) -> Switch tone="neutral" label={model.label}
// Keep the two internal components so each calls usePreference with a correctly typed def.
```

**Migration steps.**

1. Create src/components/preference-control.tsx with 'use client'. Move the enum and boolean bodies (without the frame) and the kind dispatcher into it. Export only PreferenceControl.
2. In src/components/composition/PageMenuSection.tsx, delete ControlRowFrame, EnumControlRow, BooleanControlRow and ControlRow. Render models.map(model => <div key={model.key} className={menuControlRow}><span>{model.label}</span><PreferenceControl model={model} /></div>). Drop the SegmentedControl, Switch, usePreference and Enum/Boolean model type imports.
3. In src/app/(site)/settings/preferences/preference-groups.tsx, render <div key={model.key} className="flex items-center justify-between gap-4"><span className="text-ui text-text">{model.label}</span><PreferenceControl model={model} /></div> inline in PreferenceGroupCard.
4. Delete src/app/(site)/settings/settings-control-row.tsx. Remove the SettingsControlRow import (line 124) and the list entry (line 235) from src/app/(site)/page-coverage.test.ts.
5. Run pnpm check through test-runner. Fallow should report no unused exports and no coverage gap for the new file.

**Tests.** src/components/composition/PageMenuSection.test.ts (lines 19-79) already renders enum options with aria-pressed and the boolean role="switch"/aria-checked through the page menu. It guards the behaviour and keeps the new file on the test graph. Add src/components/preference-control.test.ts that renders PreferenceControl for an enum model (sites.view) and a boolean model (atlas.cameraFollow) with renderToStaticMarkup, and asserts the options, aria-pressed and role="switch". src/app/(site)/settings/preferences/preferences-view.test.ts keeps covering model derivation.

**Notes.** The two copies have identical behaviour: same option labels (the raw option string), same Switch tone, and the SegmentedControl/Switch label comes from model.label in both. There is no drift to reconcile. Keep the frames exactly as they are: the settings frame uses 'text-ui text-text' on the label and gap-4, and the menu frame uses menuControlRow with an unstyled span. Do not move the frame into the primitive. That would need className props for both the wrapper and the label, and the frame is what each owner controls.

<sub>Reported by: concern:ui-patterns, dupes-triage-1, dupes-triage-2.</sub>

<a id="p015"></a>

## P015: Extract a StatusPanel for the error and 404 route states, and use LoadFailed for the map catalogue failure

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -35 / +30 for StatusPanel; about -12 / +6 for the MapCatalogue LoadFailed swap
- **Depends on:** —
- **Existing primitive:** `src/components/ui/load-failed.tsx:LoadFailed; src/components/ui/card.tsx:cardSurface; src/components/ui/access-gate.tsx:AccessGate`

**Problem.** ErrorPanel, which backs (site)/error.tsx and atlas/error.tsx, and NotFoundContent, which backs both not-found pages, each hand-build the same status shell: the min-h-[70vh] centring wrapper, an identical cardSurface panel class at max-w-[720px], the 'font-data text-label text-muted tracking-eyebrow uppercase' eyebrow, the font-display text-hero h1 and the body paragraph. Any styling change has to be made twice, and the copies have already drifted: header vs div element, and the home link as primary vs secondary. Separately, MapCatalogue renders its listing-failure state as a hand-built Card with an h2, a body and a 'Try again' Button instead of the LoadFailed primitive. ProfileWorkspace, PlannerRail, CockpitKpis, IndustryJobsPanel and CorpJobsBoard all use LoadFailed for the same situation.

**Verifier revision.** The core holds: ErrorPanel and NotFoundContent repeat the whole route-status shell with the same class strings. MapCatalogue's unavailable card is also a failed read with a retry, which is exactly what LoadFailed is documented for, and five other section failures already use it. The rest of the proposal does not hold. NoMapAccess is an in-canvas h-full section with an h2 at text-title, no card and no actions, in the mapper zone. Including it forces a ui home with size, surface and heading-level variants to serve one site that shares only an eyebrow class string. The signed-out prompts are a different concept with different layouts: IntroCard with numbered steps, AccessGate with tone, and EmptyState plus a button. JobsIntro already composes IntroCard; it does not re-type IntroBody, because it has no steps list. So the primitive stays in components-composition and serves the two route-status consumers. The LoadFailed adoption is kept as a separate step. Drift found: ErrorPanel wraps its stack in <header> while NotFoundContent uses <div>, and src/app/not-found.test.ts asserts exactly one <header> under SiteLayout. The <div> copy is the correct one.

**Sites (11).**

- [`src/components/composition/ErrorPanel.tsx:26-60`](../../src/components/composition/ErrorPanel.tsx#L26-L60) — console.error effect (26-28), shell (32-58) with a <header> stack, digest Incident pill (42-49), Try again plus a secondary Warp to home (52-57)
- [`src/components/composition/NotFoundContent.tsx:6-27`](../../src/components/composition/NotFoundContent.tsx#L6-L27) — Identical wrapper and panel classes (8-9), <div> stack (10-20), primary Warp to home (22-24)
- [`src/app/(site)/error.tsx:9-19`](../../src/app/%28site%29/error.tsx#L9-L19) — ErrorPanel consumer with body copy
- [`src/app/(site)/atlas/error.tsx:9-17`](../../src/app/%28site%29/atlas/error.tsx#L9-L17) — ErrorPanel consumer without body copy
- [`src/app/(site)/not-found.tsx:1-4`](../../src/app/%28site%29/not-found.tsx#L1-L4) — NotFoundContent consumer
- [`src/app/not-found.tsx:1-12`](../../src/app/not-found.tsx#L1-L12) — NotFoundContent consumer
- [`src/app/not-found.test.ts:20-32`](../../src/app/not-found.test.ts#L20-L32) — Asserts the copy and exactly one <header> for both 404 paths, which is why the stack must be a <div>
- [`src/features/maps/MapCatalogue.tsx:245-271`](../../src/features/maps/MapCatalogue.tsx#L245-L271) — Hand-built 'Map catalogue unavailable' card with a Try again button wired to router.refresh (onRetry at line 397)
- [`src/components/ui/load-failed.tsx:5-30`](../../src/components/ui/load-failed.tsx#L5-L30) — Documented as 'A read that failed every automatic retry: what did not load and what that leaves'
- [`src/components/composition/industry-workspace/ProfileWorkspace.tsx:348`](../../src/components/composition/industry-workspace/ProfileWorkspace.tsx#L348) — An existing LoadFailed use for a section-level read failure
- [`src/features/maps/MapCatalogue.test.ts:226-235`](../../src/features/maps/MapCatalogue.test.ts#L226-L235) — Guards data-map-catalogue-unavailable, the title, 'Try again', and the absence of the create and trash controls

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/chain/NoMapAccess.tsx:3-23`](../../src/mapper/chain/NoMapAccess.tsx#L3-L23) — In-canvas h-full section with an h2 at text-title, no card surface, no actions and a max-w-xl column. It shares only the eyebrow class string. Folding it in would add size, surface and heading-level variants for one site and force a ui home.
- [`src/components/composition/industry-workspace/WorkspaceStates.tsx:36-90`](../../src/components/composition/industry-workspace/WorkspaceStates.tsx#L36-L90) — IntroCard/IntroBody form an onboarding intro (purpose plus numbered steps plus CTA), not a status notice
- [`src/app/(site)/industry/jobs/JobsContent.tsx:12-22`](../../src/app/%28site%29/industry/jobs/JobsContent.tsx#L12-L22) — JobsIntro already reuses IntroCard. Its body has no steps list, so it is not a re-typed IntroBody. Only the two-line heading classes overlap.
- [`src/app/(site)/industry/CustomStructuresContent.tsx:12-17`](../../src/app/%28site%29/industry/CustomStructuresContent.tsx#L12-L17) — Signed-out prompt built from EmptyState plus a sign-in button: a different concept from a route error or 404
- [`src/app/(site)/atlas/AtlasGuestLanding.tsx:31-68`](../../src/app/%28site%29/atlas/AtlasGuestLanding.tsx#L31-L68) — Guest landing: a green AccessGate plus a setup-steps Card, a different concept

</details>

**Home.** `src/components/composition/StatusPanel.tsx (zone: components-composition); the existing src/components/ui/load-failed.tsx for MapCatalogue`

**Boundary check.** StatusPanel lives in components-composition. It imports only ui (cardSurface, cn), and the components-composition rule allows ui. ErrorPanel.tsx and NotFoundContent.tsx are in the same zone. Their consumers (src/app/**/error.tsx and not-found.tsx) are in the app zone, and the app rule allows components-composition. MapCatalogue.tsx is in the features zone (autoDiscover src/features), and the features rule allows ui, so importing '@/components/ui/load-failed' is legal. No mapper consumer is proposed, so the ui placement is unnecessary.

**API sketch.**

```ts
// src/components/composition/StatusPanel.tsx (no directive; usable from the server NotFoundContent and the client ErrorPanel)
export function StatusPanel(props: {
  eyebrow: string;
  title: string;
  children?: ReactNode;   // body copy rendered in <p className="text-body text-text leading-relaxed">
  meta?: ReactNode;       // ErrorPanel's Incident digest pill
  actions: ReactNode;     // the buttons and links row
}): JSX.Element
// MapCatalogue: <LoadFailed title="Map catalogue unavailable" detail="Atlas could not load your authorized maps. Retry before creating or managing a map." retryLabel="Try again" onRetry={onRetry} />
```

**Migration steps.**

1. Create src/components/composition/StatusPanel.tsx with NotFoundContent's markup: the wrapper div, the cardSurface panel, a <div> stack (not <header>) holding the eyebrow, the h1, the optional body <p> and the optional meta, and an actions row 'flex items-center gap-3'.
2. Rewrite NotFoundContent as <StatusPanel eyebrow="404 · Signature lost" title="Nothing on D-Scan" actions={<Link href="/" className={buttonVariants({ variant: 'primary' })}>Warp to home</Link>}>This page doesn’t exist.</StatusPanel>.
3. Rewrite ErrorPanel's render as StatusPanel. Keep its props and the console.error useEffect. Pass meta = the digest Incident Pill block when error.digest is set, and actions = the Try again Button plus the secondary Warp to home Link. Remove its own wrapper, panel and header markup.
4. In MapCatalogue.tsx's !listingAvailable branch, keep the outer div (ref, tabIndex, data-map-catalogue, data-map-catalogue-unavailable), PageShell and the sr-only h1. Replace the Card block (lines 256-268) with LoadFailed (className 'max-w-lg' if width should stay capped). Card and Button imports stay, because CatalogueMapCard and the create button still use them.
5. Run pnpm check through test-runner.

**Tests.** src/app/not-found.test.ts guards the 404 copy and the single-<header> invariant, and it puts StatusPanel on the coverage graph. Add src/components/composition/StatusPanel.test.ts or ErrorPanel.test.ts: render ErrorPanel with a digest and assert 'Incident', the digest text, 'Try again' and 'Warp to home', plus no <header> element; render it without a digest and assert no 'Incident'. src/app/(site)/page-coverage.test.ts already mounts both error boundaries. src/features/maps/MapCatalogue.test.ts:226-235 keeps passing if retryLabel stays 'Try again', because it renders as the retry button's aria-label. Optionally also assert role="alert".

**Notes.** Drift to reconcile: (1) ErrorPanel uses <header> for the title stack and NotFoundContent uses <div>. The <div> is correct, because not-found.test.ts enforces one <header> (AppHeader) under SiteLayout, and the error boundaries render inside the same layout. (2) The home link is variant 'secondary' in ErrorPanel, where Try again is primary, and 'primary' in NotFoundContent. Keep both by passing actions from the caller. (3) Keep ErrorPanel's console.error with the [source] prefix. The MapCatalogue swap is a visual change: a centred glass card becomes the warn Banner, with role=alert and the whole notice clickable for retry. That matches every other failed read in the app, but have design check a screenshot of /atlas with the listing failing. Optional follow-up, not part of this change: CustomStructuresContent's signed-out branch could use IntroCard to match SignedOutWorkspace on the same /industry page. That is a separate design-consistency decision.

<sub>Reported by: area:components-composition, concern:ui-patterns.</sub>

<a id="p043"></a>

## P043: Share one static Base Dialog stub for markup tests and drop redundant Button stubs

- **Status:** [ ] not started
- **Category:** testing · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -130 lines of per-test stubs (≈95 dialog, ≈35 button) and +45 for the helper; net ≈ -85
- **Depends on:** [P001](#p001)

**Problem.** Base UI portals render nothing on the server, so every markup test of a dialog-bearing component stubs @/components/ui/dialog. Seven test files each re-implement a different subset of parts with different attribute forwarding. WorkspaceDialogs and TrashWindow drop labelledBy and DialogHeader's titleId. MapCreationDialog and side-panel forward aria-labelledby. MapAccessDialog swaps in a bespoke finalFocus marker. HomePrompt and ChainHost forward only id. As a result, accessibility wiring (aria-labelledby pointing to a mounted title) is tested in two places and silently untestable in the rest, and each stub re-implements DialogHeader instead of running it. Separately, five mapper tests stub @/components/ui/button as a bare <button>, which the real Button already renders. SignatureWindow's stub even leaks variant and size onto the DOM.

**Verifier revision.** The core holds. The real Dialog emits nothing in renderToStaticMarkup: Base UI's DialogPortal goes through FloatingPortal, which keeps its container in useState(null) and only calls createPortal once a DOM node exists (node_modules/@base-ui/react/floating-ui-react/components/FloatingPortal.mjs:34-35,80,190). That is why consumers stub it. Seven test files hand-roll ui/dialog stubs, and an eighth (dialog.test.ts) stubs the Base layer with the same h2/p/button shapes. The subsets differ, and some drop labelledBy or titleId. I changed the design in three ways. (1) Stub the Base layer once (`@base-ui/react/dialog`) rather than re-implementing ui/dialog. The real Dialog, DialogHeader, SidePanel, ConfirmDialog and any future dialog-kit parts then render for real, so labelledBy and titleId wiring is tested instead of re-typed in each stub, and the stub cannot drift from DialogHeader. (2) Add side-panel.test.ts and dialog.test.ts as consumers, and add connection-fields.test.ts and MapEventLog.test.ts to the Button-stub list. (3) No dependency on the dialog-kit opportunity: a Base-layer stub picks up new ui parts with no change. The Button-stub removal also holds. Every stub's test asserts only on renderToStaticMarkup substrings, never on button markup shape or class, and the real Button is hook-free and already defaults to type=button.

**Sites (14).**

- [`src/components/composition/industry-workspace/WorkspaceDialogs.test.ts:8-14`](../../src/components/composition/industry-workspace/WorkspaceDialogs.test.ts#L8-L14) — Dialog→div[role=dialog] drops labelledBy; DialogHeader stub drops titleId; DialogClose→button
- [`src/features/maps/TrashWindow.test.ts:8-30`](../../src/features/maps/TrashWindow.test.ts#L8-L30) — Dialog drops labelledBy (TrashWindow.tsx:160 passes one); DialogHeader stub drops titleId; also stubs Title and Description that TrashWindow never imports
- [`src/features/maps/MapCreationDialog.test.ts:9-39`](../../src/features/maps/MapCreationDialog.test.ts#L9-L39) — forwards aria-labelledby and DialogHeader titleId; test at 65 asserts the label points at a mounted title
- [`src/features/maps/MapAccessDialog.test.ts:34-53`](../../src/features/maps/MapAccessDialog.test.ts#L34-L53) — bespoke data-has-final-focus marker asserted at 140; drops labelledBy
- [`src/mapper/authoring/HomePrompt.test.ts:75-80, 90-97`](../../src/mapper/authoring/HomePrompt.test.ts#L75-L80) — Dialog/Title stub (asserts role="dialog" at 115) plus Button stub that strips variant
- [`src/mapper/chain/ChainHost.test.ts:44-53`](../../src/mapper/chain/ChainHost.test.ts#L44-L53) — Dialog, Title(id), Close, Description
- [`src/components/ui/side-panel.test.ts:6-15`](../../src/components/ui/side-panel.test.ts#L6-L15) — missed by finders: a fourth shape of the same stub that captures props and forwards aria-labelledby
- [`src/components/ui/dialog.test.ts:5-43`](../../src/components/ui/dialog.test.ts#L5-L43) — missed by finders: stubs @base-ui/react/dialog (Root/Portal/Backdrop/Popup/Close/Title/Description) and captures props; this is the seed of the shared helper
- [`src/components/ui/dialog.tsx:35-112`](../../src/components/ui/dialog.tsx#L35-L112) — real Dialog wraps Base.Root/Portal/Popup and forwards aria-labelledby; DialogClose/Title/Description are Base parts; DialogHeader wires titleId
- [`src/mapper/authoring/connection-fields.test.ts:45-53`](../../src/mapper/authoring/connection-fields.test.ts#L45-L53) — missed by finders: Button stub stripping variant/size
- [`src/mapper/log/MapEventLog.test.ts:17-27`](../../src/mapper/log/MapEventLog.test.ts#L17-L27) — missed by finders: Button stub forwarding only data-map-event-restore. The assertion at 128 (not.toContain('map-chip-undo-pulse')) is dead: the class exists nowhere in src
- [`src/mapper/signatures/SignatureWindow.test.ts:30-33`](../../src/mapper/signatures/SignatureWindow.test.ts#L30-L33) — Button stub spreads variant/size onto <button>
- [`src/mapper/tracking/ScannerCharacterPrompt.test.ts:22-25`](../../src/mapper/tracking/ScannerCharacterPrompt.test.ts#L22-L25) — Button stub forcing type=button, which the real Button already defaults
- [`src/components/ui/button.tsx:48-61`](../../src/components/ui/button.tsx#L48-L61) — real Button: no hooks, type='button' default, plain <button>

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/signatures/SignatureJumpPrompt.test.ts:10-18`](../../src/mapper/signatures/SignatureJumpPrompt.test.ts#L10-L18) — Prop-capturing Button stub (buttonProps spy); a legitimate test double, keep
- [`src/features/maps/TrashWindow.test.ts:35-38`](../../src/features/maps/TrashWindow.test.ts#L35-L38) — ConfirmDialog stub is a count marker (asserted at 80), not a static-render workaround; keep
- [`src/features/maps/MapCatalogue.test.ts:71`](../../src/features/maps/MapCatalogue.test.ts#L71) — ConfirmDialog marker stub, same reason
- [`src/features/feedback/components/FeedbackModal.test.ts:11-24`](../../src/features/feedback/components/FeedbackModal.test.ts#L11-L24) — Mocks react/transport rather than the dialog; unrelated

</details>

**Home.** `src/components/ui/__tests__/static-base-dialog.ts (new; mirrors the existing __tests__ helper convention of src/db/__tests__/support and src/mapper/chain/__tests__)`

**Boundary check.** Home zone ui (pattern src/components/ui/**). The rule {from:'ui', allow:[]} holds because the helper imports only react (and may import vitest, as src/db/__tests__/support/db-test-harness.ts does). Consumers: ui tests (dialog.test.ts, side-panel.test.ts) are the same zone. components-composition test (WorkspaceDialogs): its rule allows 'ui'. features tests (maps/*): the features rule allows 'ui'. mapper tests (HomePrompt, ChainHost): the mapper rule allows 'ui'.

**API sketch.**

```ts
// src/components/ui/__tests__/static-base-dialog.ts
export const dialogProbe: { root: RootProps | null; portal: { keepMounted?: boolean } | null; popup: PopupProps | null };
export const Dialog: {
  Root(p: { open: boolean; modal?: boolean; onOpenChange?: (o: boolean) => void; children: ReactNode }): ReactNode; // records p, returns children
  Portal(p: { keepMounted?: boolean; children: ReactNode }): ReactNode;             // records p, returns children
  Backdrop(): null;
  Popup(p: { 'aria-labelledby'?: string; 'aria-describedby'?: string; className?: string; initialFocus?: unknown; finalFocus?: unknown; children: ReactNode }): ReactElement; // records p, renders <div role="dialog" aria-labelledby aria-describedby class>
  Close(p: { 'aria-label'?: string; disabled?: boolean; children?: ReactNode }): ReactElement;  // <button type="button" aria-label disabled>
  Title(p: { id?: string; className?: string; children: ReactNode }): ReactElement;          // <h2 id class>
  Description(p: { id?: string; className?: string; children: ReactNode }): ReactElement;    // <p id class>
};
// usage in any markup test:
vi.mock('@base-ui/react/dialog', () => import('@/components/ui/__tests__/static-base-dialog'));
```

**Migration steps.**

1. Create static-base-dialog.ts by lifting the stub out of src/components/ui/dialog.test.ts:5-43. Forward id, className, aria-labelledby, aria-describedby, aria-label and disabled explicitly; never spread props, because finalFocus, initialFocus and ref objects would become DOM attributes. Record Root, Portal and Popup props on an exported dialogProbe object.
2. Convert src/components/ui/dialog.test.ts to vi.mock('@base-ui/react/dialog', () => import('./__tests__/static-base-dialog')) and assert through dialogProbe. Keep the existing keepMounted, modal, finalFocus and aria-labelledby assertions unchanged. This proves the helper before any consumer moves.
3. Convert src/components/ui/side-panel.test.ts: delete its './dialog' stub. The real Dialog plus SidePanel now render, and the aria-labelledby assertion runs against the real wiring. Read finalFocus from dialogProbe.popup.
4. Convert the six consumer tests (WorkspaceDialogs, TrashWindow, MapCreationDialog, MapAccessDialog, HomePrompt, ChainHost). Replace each vi.mock('@/components/ui/dialog', …) block with the Base-layer mock. In MapAccessDialog.test.ts, replace the data-has-final-focus marker (line 140) with expect(dialogProbe.popup?.finalFocus).toBeDefined().
5. Add one labelling assertion to WorkspaceDialogs.test.ts and TrashWindow.test.ts: the aria-labelledby value equals an id on a rendered h2. This is the coverage that was previously impossible.
6. Delete the Button stubs in HomePrompt.test.ts:90-97, connection-fields.test.ts:45-53, MapEventLog.test.ts:17-27, SignatureWindow.test.ts:30-33 and ScannerCharacterPrompt.test.ts:22-25. Keep SignatureJumpPrompt.test.ts:10-18.
7. Delete the dead assertion MapEventLog.test.ts:128 (map-chip-undo-pulse exists nowhere in src).

**Tests.** The helper is exercised by src/components/ui/dialog.test.ts, which becomes its first consumer and keeps its current keepMounted/modal/focus/labelledBy assertions. Existing guards that must stay green: MapCreationDialog.test.ts:65 (labelledBy → mounted title), MapAccessDialog.test.ts:140 (focus return wired; re-expressed via dialogProbe), HomePrompt.test.ts:115 (role=dialog), WorkspaceDialogs.test.ts:98-106 (submit-button regexes, unaffected because DialogHeader's real close button has no type=submit), and TrashWindow.test.ts:80 (one ConfirmDialog marker). New: aria-labelledby ↔ h2 id assertions in WorkspaceDialogs and TrashWindow.

**Notes.** Behaviour differences to reconcile. (a) With the Base-layer stub, real DialogHeader output appears in markup: an h2 with the real classes plus a close <button aria-label=…>×</button>. Any test that counted buttons or matched a bare <header> would need adjusting, but none of the six does. (b) The stub's Close must ignore Base's render prop (DialogHeader passes render={<Button/>}) and still forward aria-label and disabled. MapAccessDialog.tsx:186-192 passes disabled. (c) Both ConfirmDialog stubs (TrashWindow, MapCatalogue) stay. They are count markers and they shadow the real ConfirmDialog, so it never reaches the Base stub. (d) Fallow: the helper is reached through a dynamic import() in vi.mock factories. Confirm with `pnpm check` that unused-exports counts the namespace import as using Dialog and dialogProbe. If it does not, also import dialogProbe statically in dialog.test.ts. (e) Fallback if the team prefers unit isolation over running real ui wrappers: the original design (stub @/components/ui/dialog in the same __tests__ home) still works, but the helper then has to re-implement DialogHeader's titleId wiring, which is exactly the drift this fixes.

<sub>Reported by: concern:tests-fixtures.</sub>

<a id="p056"></a>

## P056: Move the confirm gate next to ConfirmDialog in ui with a retained target, and adopt it for the map confirmations (drop useAsyncAction)

- **Status:** [ ] not started
- **Category:** react-hook · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** low · **Size:** about -45 / +35 (AccountDangerZone local hook and four hand-rolled target states removed; reducer gains target, hook moves to ui)
- **Depends on:** [P001](#p001)
- **Existing primitive:** `src/platform/auth/confirm-gate.ts:confirmGateReducer; src/components/ui/confirm-dialog.tsx:ConfirmDialog; react:useTransition`

**Problem.** The confirm, run, retry state machine (confirmGateReducer) lives in src/platform/auth/confirm-gate.ts. It has no auth content and one consumer, AccountDangerZone, which wraps it in a local useConfirmGate and wires ConfirmDialog to it three times. features/maps reimplements 'confirm a pending target' with useState<T | null>, open={target !== null}, consequence={target === null ? '' : …}, and an onConfirm that checks for null and then clears. That happens in AccessListEditor, MapBlockList and MapCatalogue, and TrashWindow does the same with a boolean plus the live selection. Because the target (or selection) is cleared while ConfirmDialog's exit transition is still running, the dialog body goes blank, or for Trash shows '0 selected maps', as it fades out. Separately, corp-sharing-card builds its own confirmation from a raw Dialog instead of ConfirmDialog.

**Verifier revision.** The useAsyncAction half does not survive. The cited handlers do not share semantics. Errors come back as a message (map sites), as a token ('save' or 'fit' in StructureComposer.tsx 327/336), as a toast (corp-sharing-card.tsx 51-56), or as a boolean plus toast (AccountDangerZone 113-118). Success is ok, outcome.kind, or partial success with an unconditional refresh (TrashWindow.tsx 127-151). CorpRigEditor validates before going busy and never clears the old error (39-51). The safety claims do not hold up either: apiFetch never throws (transport/api-client.ts 38, 44), React ignores setState after unmount, and re-entry is already blocked by disabled={busy} on every trigger. The hook would save about two lines per site behind an options bag. The confirm-gate half is real. confirmGateReducer is generic UI state stored in platform/auth with one consumer, whose local useConfirmGate (AccountDangerZone 98-131) is used three times. The maps feature hand-rolls 'confirm a pending target' four times, and each copy clears its target while ConfirmDialog's Base UI popup is still running its 200ms exit transition (dialog.tsx 22-24, --transition-duration-panel 200ms). As a result AccessListEditor, MapBlockList and MapCatalogue render an empty consequence while fading out, and TrashWindow renders '0 selected maps…' because the selection is cleared in the same tick as confirmOpen. A gate that keeps the last target fixes all four and gives the reducer real consumers in ui.

**Sites (11).**

- [`src/platform/auth/confirm-gate.ts:1-25`](../../src/platform/auth/confirm-gate.ts#L1-L25) — Generic idle/confirming/running reducer housed in platform/auth
- [`src/platform/auth/confirm-gate.test.ts:1-41`](../../src/platform/auth/confirm-gate.test.ts#L1-L41) — Reducer tests to move with it
- [`src/components/composition/account/AccountDangerZone.tsx:98-131`](../../src/components/composition/account/AccountDangerZone.tsx#L98-L131) — Local useConfirmGate (errored flag, run with toast on kind==='error')
- [`src/components/composition/account/AccountDangerZone.tsx:169-215, 221-268, 274-330`](../../src/components/composition/account/AccountDangerZone.tsx#L169-L215) — Three controls wire gate.open/cancel/busy/errored into ConfirmDialog identically
- [`src/features/maps/AccessListEditor.tsx:76, 83-89, 194-212`](../../src/features/maps/AccessListEditor.tsx#L76) — revokeTarget state; consequence '' when null; onConfirm null guard then clear (fire-and-forget, busy={false})
- [`src/features/maps/MapBlockList.tsx:71, 89, 121-139`](../../src/features/maps/MapBlockList.tsx#L71) — pending block target; same null-guard/clear shape, busy={false}
- [`src/features/maps/MapCatalogue.tsx:340-344, 406-409, 461-480`](../../src/features/maps/MapCatalogue.tsx#L340-L344) — pendingDelete target + useMapDeletion busy/error; clears on success callback; the redundant !deletion.deleting guard at 464 duplicates ConfirmDialog's own busy guard
- [`src/features/maps/TrashWindow.tsx:104, 138-151, 186, 206-216`](../../src/features/maps/TrashWindow.tsx#L104) — confirmOpen boolean; consequence reads live creatorIds, which purge success clears together with confirmOpen (145-146)
- [`src/components/ui/confirm-dialog.tsx:26-97`](../../src/components/ui/confirm-dialog.tsx#L26-L97) — Existing primitive; already ignores onOpenChange while busy (61-63)
- [`src/components/ui/dialog.tsx:20-24, 59-73`](../../src/components/ui/dialog.tsx#L20-L24) — Popup has data-ending-style exit transition, so content stays mounted while closing
- [`src/app/(site)/settings/corporations/corp-sharing-card.tsx:38-62, 80-98`](../../src/app/%28site%29/settings/corporations/corp-sharing-card.tsx#L38-L62) — Builds its own confirm from a raw Dialog plus DialogClose buttons instead of ConfirmDialog; closes immediately and toasts

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/maps/use-map-deletion.ts:8-33`](../../src/features/maps/use-map-deletion.ts#L8-L33) — Async busy/error with navigation, not confirm state. The proposed useAsyncAction for it is rejected; it stays as the busy/error source for MapCatalogue.
- [`src/features/owned-structures/components/CorpRigEditor.tsx:36-51`](../../src/features/owned-structures/components/CorpRigEditor.tsx#L36-L51) — Validates before going busy, never clears the stale error, no refresh. Not the same sequence; no confirm.
- [`src/features/custom-structures/components/StructureComposer.tsx:323-339`](../../src/features/custom-structures/components/StructureComposer.tsx#L323-L339) — Error is a field token ('save' or 'fit'), not a message; readFit applies a parsed fit. Different contract.
- [`src/features/maps/MapAccessDialog.tsx:101-130`](../../src/features/maps/MapAccessDialog.tsx#L101-L130) — Map-access writes; covered by P054's useMapAccessWrite
- [`src/features/maps/MapBlockList.tsx:37-49`](../../src/features/maps/MapBlockList.tsx#L37-L49) — Map-access write; covered by P054
- [`src/components/composition/industry-workspace/ProfileDialogs.tsx:137-188`](../../src/components/composition/industry-workspace/ProfileDialogs.tsx#L137-L188) — ConfirmDialog with open always true, mounted conditionally by WorkspaceDialogs, so it unmounts with no exit transition and has no retention problem
- [`src/features/feedback/components/FeedbackModal.tsx:213-219`](../../src/features/feedback/components/FeedbackModal.tsx#L213-L219) — SubmitState discriminated union (idle/sending/error) is a different model

</details>

**Home.** `src/components/ui/use-confirm-gate.ts (reducer, moved from platform/auth, plus the hook), next to src/components/ui/confirm-dialog.tsx`

**Boundary check.** Home is in the ui zone, whose allow list is empty. The file imports only react, and the reducer imports nothing, so it is legal. Consumers: src/components/composition/account/AccountDangerZone.tsx (components-composition, allow list includes 'ui'), src/features/maps/{AccessListEditor,MapBlockList,MapCatalogue,TrashWindow}.tsx (features, allow list includes 'ui'), and optionally src/app/(site)/settings/corporations/corp-sharing-card.tsx (app, allow list includes 'ui'). ui hooks have precedent (use-copy-feedback.ts, use-cssom-tooltip.ts, use-sliding-thumb.ts). Toasts stay with the callers, so the hook does not depend on toast, even though toast is also in ui.

**API sketch.**

```ts
export type ConfirmPhase = 'idle' | 'confirming' | 'running';
export interface ConfirmState<T> { readonly phase: ConfirmPhase; readonly target: T | null }
export type ConfirmEvent<T> = { type: 'request'; target: T } | { type: 'cancel' } | { type: 'confirm' } | { type: 'fail' } | { type: 'reset' };
export function confirmGateReducer<T>(state: ConfirmState<T>, event: ConfirmEvent<T>): ConfirmState<T>; // same phase rules; request while running is ignored (target unchanged); cancel/reset keep target

export function useConfirmGate<T = void>(): {
  readonly open: boolean;            // phase !== 'idle'
  readonly busy: boolean;            // phase === 'running'
  readonly errored: boolean;
  readonly target: T | null;         // last requested target, retained through the exit transition
  request(target: T): void;
  cancel(): void;
  reset(): void;
  run<R>(action: (target: T) => Promise<R>, failed: (outcome: R) => boolean): Promise<R>; // confirm -> await -> fail+errored on failed(outcome); caller resets on success
};
```

**Migration steps.**

1. Move src/platform/auth/confirm-gate.ts and its test to src/components/ui/use-confirm-gate.ts(.test.ts). Make the reducer state {phase, target}: request carries the target, request is ignored while running, and cancel/reset keep the last target. Add useConfirmGate built from AccountDangerZone.tsx 98-131, replacing errorToast with a failed predicate.
2. AccountDangerZone.tsx: delete the local useConfirmGate and the platform/auth/confirm-gate import. Each control calls gate.run(() => runX(apiFetch), (o) => o.kind === 'error') and shows its existing toast.error text when that predicate holds, keeping the 'Purge failed', 'Sign-out failed' and 'Account deletion failed' strings and the reset-on-success calls as they are.
3. MapCatalogue.tsx: replace pendingDelete (340-343) with useConfirmGate<{ id: string; name: string }>(); onDelete calls gate.request(...); the ConfirmDialog takes open={gate.open}, onOpenChange={(o) => !o && gate.cancel()}, consequence from gate.target, onConfirm={() => gate.target && void deletion.removeMap(gate.target.id, gate.reset)}. Keep busy/error from useMapDeletion and drop the redundant !deletion.deleting check.
4. AccessListEditor.tsx: replace revokeTarget with useConfirmGate<AccessGrantDraft>(); requestRemove calls gate.request(grant) in manage mode; onConfirm calls onPrincipalRemove(gate.target) and then gate.reset(); keep busy={false}.
5. MapBlockList.tsx: replace pending with useConfirmGate<AccessPrincipalOption>(); CharacterSearchControl onSelect={gate.request}; onConfirm runs editor.block(...) and then gate.reset().
6. TrashWindow.tsx: replace confirmOpen with useConfirmGate<readonly string[]>(). The Permanently delete button calls gate.request(creatorIds) and the consequence counts gate.target, so the text no longer drops to 0 while closing. purgeSelected uses gate.target and calls gate.reset() when complete. Busy stays busy === 'purge' (shared with restore), and the main Dialog's guard becomes !gate.open.
7. Optional, needs design sign-off: replace corp-sharing-card's raw Dialog (80-98) with ConfirmDialog (busy={false}, onConfirm calls applySharing(false) and then closes). This adds a title bar to that dialog.
8. Run pnpm check through test-runner; fallow will confirm that platform/auth no longer exports the reducer.

**Tests.** Move confirm-gate.test.ts and extend it with target cases: request sets the target; cancel and reset keep it; request while running neither changes phase nor replaces the target; fail returns to confirming with the target intact. MapCatalogue.test.ts 71-80 and TrashWindow.test.ts 36 mock ConfirmDialog by open/title; keep them passing and add a TrashWindow assertion that the consequence counts the requested snapshot. AccountDangerZone is rendered by src/components/composition/coverage.test.ts 61-81, which keeps the file covered. Add static-render assertions in AccessListEditor.test.ts that the revoke ConfirmDialog is closed initially. Retention itself is covered by the pure reducer tests.

**Notes.** Rejected part: useAsyncAction; do not build P054's write helper on it. Drift and bug, inferred from code: AccessListEditor 200-204, MapBlockList 127-131 and MapCatalogue 467-471 set the consequence to '' when the target clears, and TrashWindow 145-146 clears the selection together with confirmOpen, so its consequence (210) reads '0 selected maps' during the 200ms exit transition. Retaining the target fixes all four; AccountDangerZone's consequences come from props and are already correct. AccessListEditor and MapBlockList close at once and run the write in the parent (busy={false}); keep that and do not move them to gate.run, or errors would move from the parent Banner into the dialog. MapCatalogue keeps the dialog open while deleting and clears only on success; keep that with gate.reset as the onDeleted callback. ConfirmDialog already ignores onOpenChange while busy (confirm-dialog.tsx 61-63), so caller-side busy guards on close are redundant. Alternative considered: retain the consequence inside ConfirmDialog itself. Rejected, because ReactNode consequences (AccountDangerZone 197-207) make identity-based retention fragile, while target retention in the gate is explicit and testable as a pure reducer. Sequence after P054, which edits the same AccessListEditor and MapBlockList files.

<sub>Reported by: area:components-composition, area:mapper-signatures, area:platform, concern:client-hooks.</sub>

← [Wave 6: Config, env, ids and shared domain vocabularies](wave-06-config-env-ids-and-shared-domain-vocabularies.md) · [Index](README.md#roadmap) · [Wave 8: Charts, images and board/workspace adoption](wave-08-charts-images-and-board-workspace-adoption.md) →
