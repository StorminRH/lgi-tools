# Wave 8: Charts, images and board/workspace adoption

Part of the [primitive extraction guide](README.md). Audit of `e5b7b17` on 2026-10-09; line ranges drift, so re-open each site before editing.

← [Wave 7: UI kit primitives (src/components/ui)](wave-07-ui-kit-primitives-src-components-ui.md) · [Index](README.md#roadmap) · [Wave 9: Auth, routes and the mutation/transport pipeline](wave-09-auth-routes-and-the-mutation-transport-pipeline.md) →

Collapse the chart stack onto TimeSeriesFrame, then BandSeries, then retire the sparkline module, then tidy the board domain. Route all EVE images through eveImageSrc, with TypeIcon and CharacterPortrait on top. Add SecurityStatus/useSystemsById and the facility helpers, the shared focus rail, ActionForm, one status-level tone, and signOutAndLeave/startEveSignIn. Last, route page metadata through buildPageMetadata, which uses P247's route ids.

| Status | ID | Item | Category | Effort | Risk | Payoff | Depends on |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ☑ | [P004](#p004) | Build TrendChart and AnnotatedDailyChart on TimeSeriesFrame and delete chart/line-chart.tsx | ui-component | M | low | high | — |
| ☑ | [P037](#p037) | Extract a gap-aware BandSeries and a shared band-chart margin for SplitAxisChart and StackedAreaChart | ui-component | S | low | medium | [P004](#p004) |
| ☐ | [P317](#p317) | Retire the vestigial sparkline module: ChartTone in tones, tests on chart-geometry, cssom tooltip into chart/ | simplification | S | low | low | [P004](#p004), [P037](#p037) |
| ☐ | [P318](#p318) | Use paddedDomain in board-view-model, add one year-dropping date helper, and export readyData and the missing board data types | simplification | S | low | low | [P317](#p317), [P089](wave-04-formatting-dates-and-names-have-one-home.md#p089) |
| ☐ | [P008](#p008) | Route every EVE image URL through lib/eve-image (eveImageSrc) and promote EntityLogo to src/components/entity-logo.tsx as the corp/alliance counterpart of CharacterPortrait | ui-component | M | low | medium | — |
| ☐ | [P009](#p009) | Derive TypeIcon's fallback monogram with initials() and make its size a typed union that includes 30 | ui-component | S | low | low | [P008](#p008) |
| ☐ | [P012](#p012) | Derive the linked-character health label once in platform/auth and render admin character portraits with CharacterPortrait | ui-component | S | low | medium | [P008](#p008) |
| ☐ | [P010](#p010) | Move the security formatter beside the security bands, add SecurityStatus/SystemWithSecurity, and resolve systems by id through one useSystemsById hook | ui-component | M | low | medium | — |
| ☐ | [P011](#p011) | Reuse FacilitySubline in StructureRow, share the placeholder tile, export the structure source groups, and build facility keys with facilityKey | ui-component | S | low | low | [P010](#p010) |
| ☐ | [P183](#p183) | Derive owned-structure security classes through getSystemFacts | server-pipeline | S | low | low | [P010](#p010) |
| ☐ | [P003](#p003) | Share the focus-board rail, grids and view-model helpers between the home board and the industry workspace | ui-component | M | low | medium | [P018](wave-07-ui-kit-primitives-src-components-ui.md#p018) |
| ☐ | [P005](#p005) | Extract a ui ActionForm (plus a client ConfirmActionForm) for hidden-field POST buttons and fix the disabled-reason drift | ui-component | M | low | medium | — |
| ☐ | [P062](#p062) | Share one StatusLevel tone module between EveStatusPanel and admin, keeping each surface's plain colour | css-styling | S | low | low | — |
| ☐ | [P067](#p067) | Add signOutAndLeave(target) and startEveSignIn(callbackURL) in platform/auth; migrate the four finally-style sign-outs and three EVE sign-ins | client-data | S | low | low | — |
| ☐ | [P271](#p271) | Route the industry and site detail pages through buildPageMetadata (with a route-image mode) and loadNumericRouteEntity | feature-skeleton | M | low | medium | [P247](wave-06-config-env-ids-and-shared-domain-vocabularies.md#p247) |

<a id="p004"></a>

## P004: Build TrendChart and AnnotatedDailyChart on TimeSeriesFrame and delete chart/line-chart.tsx

- **Status:** [x] done
- **Category:** ui-component · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** high · **Size:** About -135 (line-chart.tsx deleted), about -30 (trend-chart) and about -70 (annotated-daily-chart shell and DailyXAxis); about +25 (ChartBaseline, defaults, tests excluded). Net about -210.
- **Depends on:** —
- **Existing primitive:** `src/components/ui/chart/chart-frame.tsx:TimeSeriesFrame`

**Problem.** chart/chart-frame.tsx TimeSeriesFrame is the shared time-series shell: ChartFocusFrame keyboard stepping, ChartCanvas with a clamped tooltip, XTickLabels, crosshair and hover capture. SplitAxisChart and StackedAreaChart use it. LineChart (TrendChart's only implementation) and AnnotatedDailyChart rebuild that shell by hand, each with its own x-tick loop and identical bottom baseline. The copies have drifted on accessibility. TrendChart (BalanceTrend, AdminTrendChart in health, search and ESI cards) and AnnotatedDailyChart (AdminDailyChart) have no focus or arrow-key path, so 2 of the 4 time-series charts cannot be read by keyboard. The formatNumber/identity defaults are copied in trend-chart, annotated-daily-chart and bar-chart, and inlined in split-axis-chart and stacked-area-chart.

**Verifier revision.** Confirmed on the substance. LineChart, whose only consumer is TrendChart (rg finds no other import of chart/line-chart), and AnnotatedDailyChart both hand-assemble ChartCanvas, useChartHover, continuousHoverHandler, HoverCrosshair, HoverCaptureRect and their own x-tick loop. That is the shell TimeSeriesFrame already provides. Neither wraps in ChartFocusFrame, so BalanceTrend and the admin trend and daily charts cannot be read by keyboard while SplitAxisChart and StackedAreaChart can. TimeSeriesFrame is the correct copy. The design changes in three ways. (1) No caller passes xTicks, yTicks or className to TrendChart or AnnotatedDailyChart (BalanceTrend.tsx:27-37, admin/charts.tsx:65-79 and 105-113, preview data.tsx:184 and 197-210). Drop those dead options instead of threading xTicks into the frame; the 5-tick output is identical. (2) The baseline stays a child, as an exported ChartBaseline, rather than a frame prop. A prop drawn before children would change paint order against ValueAxisGrid at y=innerBottom. (3) The formatter-default consolidation covers 5 sites, including the inline defaults in split-axis and stacked-area, not 3.

**Sites (10).**

- [`src/components/ui/chart/chart-frame.tsx:15-48, 50-70, 78-156`](../../src/components/ui/chart/chart-frame.tsx#L15-L48) — ChartFocusFrame (keyboard), XTickLabels (5 ticks), TimeSeriesFrame. The canonical copy
- [`src/components/ui/chart/line-chart.tsx:1-135`](../../src/components/ui/chart/line-chart.tsx#L1-L135) — Hand-assembled shell without focus frame; exported types used nowhere else; sole consumer is trend-chart.tsx:5
- [`src/components/ui/trend-chart.tsx:10-14, 31-99`](../../src/components/ui/trend-chart.tsx#L10-L14) — Re-exports tickIndices (only for trend-chart.test.ts); formatter copies; own baseline + x-tick loop in renderAxis
- [`src/components/ui/annotated-daily-chart.tsx:44-45, 197-225, 237-347`](../../src/components/ui/annotated-daily-chart.tsx#L44-L45) — Formatter copies; DailyXAxis; third hand-built shell (ChartCanvas, hover, crosshair, capture) with no focus frame
- [`src/components/ui/bar-chart.tsx:16-17, 40-41`](../../src/components/ui/bar-chart.tsx#L16-L17) — Third copy of the formatter defaults (categorical chart; only defaults are shared)
- [`src/components/ui/split-axis-chart.tsx:58, 106-117`](../../src/components/ui/split-axis-chart.tsx#L58) — Uses TimeSeriesFrame; inline formatTick default
- [`src/components/ui/stacked-area-chart.tsx:49, 78-89`](../../src/components/ui/stacked-area-chart.tsx#L49) — Uses TimeSeriesFrame; inline formatTick default
- [`src/components/composition/board/BalanceTrend.tsx:8-40`](../../src/components/composition/board/BalanceTrend.tsx#L8-L40) — TrendChart consumer; x is index (board-view-model.ts:321)
- [`src/app/(site)/admin/charts.tsx:11-24, 64-81, 104-114`](../../src/app/%28site%29/admin/charts.tsx#L11-L24) — AdminDailyChart / AdminTrendChart consumers; trend x is index (composition/admin-period.ts:44)
- [`src/components/ui/trend-chart.test.ts:1-20`](../../src/components/ui/trend-chart.test.ts#L1-L20) — Tests tickIndices through trend-chart's re-export

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/ui/bar-chart.tsx:30-120`](../../src/components/ui/bar-chart.tsx#L30-L120) — Categorical band-scale chart, not a time series. Only the formatter defaults are in scope

</details>

**Home.** `src/components/ui/chart/chart-frame.tsx (TimeSeriesFrame, unchanged API), src/components/ui/chart/value-axis.tsx (new ChartBaseline), src/components/ui/chart/chart-geometry.ts (default formatters)`

**Boundary check.** Everything stays inside the ui zone (src/components/ui/** and src/components/ui/chart/**), rule {from: 'ui', allow: []}. All imports are intra-ui plus the @visx packages.

Consumers are unchanged. components-composition (BalanceTrend) is allowed 'ui', and app (admin/charts.tsx, preview) is allowed 'ui'. Both keep importing @/components/ui/trend-chart and annotated-daily-chart.

**API sketch.**

```ts
// chart/value-axis.tsx
export function ChartBaseline(p: { left: number; right: number; y: number }): JSX.Element; // <line className="stroke-[var(--color-border)]" strokeWidth={1} …/>
// chart/chart-geometry.ts
export const formatPlainValue: (value: number) => string; // String(value)
export const identityLabel: (label: string) => string;
// trend-chart.tsx (public props minus never-passed className/xTicks)
TrendChart({ data, labels, tone, width, height, yTicks, formatY, formatTick, ariaLabel, yDomain })
  // points = data.map((d, i) => ({ x: d.x, y: d.y, label: labels[i] ?? String(d.x) }))
  // <TimeSeriesFrame points xScale yScale width height margin ariaLabel crosshairColor={toneHex[tone]} formatTick renderTooltip={p => <>{formatY(p.y)} · {p.label}</>}>
  //   <ValueAxisGrid/> <ChartBaseline/> <AreaClosed/> <LinePath/>
  // </TimeSeriesFrame>
// annotated-daily-chart.tsx
  // <TimeSeriesFrame points={model.hover} … crosshairColor={fill} renderTooltip={d => <DailyTooltip datum={d} formatY={formatY}/>}>
  //   <ValueAxisGrid/> <ChartBaseline/> <DailyBars/> <DeployMarkers/> <ReferenceLine/> <MovingAverageLine/> <ChartEndLabel/>
  // </TimeSeriesFrame>
```

**Migration steps.**

1. Add ChartBaseline to chart/value-axis.tsx, and formatPlainValue and identityLabel to chart/chart-geometry.ts.
2. Rewrite TrendChart on TimeSeriesFrame:
   - Build xScale (extent of xs) and yScale (zeroBasedDomain or yDomain, nice: true) as LineChart does today.
   - Zip labels into points.
   - Pass ValueAxisGrid (integer ticks), ChartBaseline, AreaClosed (fillOpacity 0.07) and LinePath (strokeWidth 1.5) as children.
   - Return null for empty data.
   - Remove the x-tick loop.
3. Delete src/components/ui/chart/line-chart.tsx. Remove the `export { tickIndices }` re-export from trend-chart.tsx, and move the tickIndices cases from trend-chart.test.ts into chart/chart-geometry.test.ts.
4. Rewrite AnnotatedDailyChart's render on TimeSeriesFrame:
   - Pass points=model.hover, the existing xScale and yScale, margin=MARGIN and crosshairColor=fill.
   - Keep DailyBars, DeployMarkers, ReferenceLine, MovingAverageLine and ChartEndLabel as children in their current order, after ValueAxisGrid and ChartBaseline.
   - Delete DailyXAxis and the inline useChartHover, continuousHoverHandler, HoverCrosshair and HoverCaptureRect code.
5. Drop the never-passed className and xTicks props from TrendChartProps and AnnotatedDailyChartProps. If a className is wanted later, forward it through TimeSeriesFrame to ChartCanvas instead.
6. Replace the formatter copies in bar-chart.tsx, trend-chart.tsx and annotated-daily-chart.tsx, and the inline defaults in split-axis-chart.tsx:58 and stacked-area-chart.tsx:49, with the chart-geometry defaults.
7. Check the preview specimens (preview/primitives/data.tsx:181-212), BalanceTrend and the admin health, search and ESI cards locally. Expect a focus ring and arrow-key tooltips.

**Tests.** Existing guards:
- chart-frame.test.ts covers keyboard focus, arrow stepping and blur.
- daily-chart-geometry.test.ts covers the daily model.
- chart-geometry.test.ts covers tickAnchor. Add the moved tickIndices cases.
- coverage.test.ts pins TrendChart and AnnotatedDailyChart exports.
- ServiceLevelRows.test.ts mocks AdminTrendChart, so it is unaffected.

Add trend-chart and annotated-daily-chart render tests with renderToStaticMarkup, modeled on stacked-area-chart.test.ts:
- tabindex="0" and the 'use the arrow keys' aria-label are present.
- Up to 5 x-tick <text> labels render.
- Empty data renders ''.
- AnnotatedDailyChart renders one <rect> per point, the reference-line label and the end label.

**Notes.** Equivalences checked:
- TrendChart's tooltip uses labels[d.x] ?? d.x while its ticks use labels[i]. Every caller passes x = index (board-view-model.ts:321, admin-period.ts:44), so zipping label = labels[i] keeps both identical.
- AnnotatedDailyChart's crosshair already anchors at yScale(hover.y), the bar top. TimeSeriesFrame's yScale(point.y) is the same.
- Paint order is preserved: children, then XTickLabels, then crosshair, then capture rect, matching the current daily chart.
- XTickLabels sits at y=height-6, matching both copies.

Minor drift: DailyXAxis shows '' for a missing label where model.hover uses String(p.x). Callers always supply a full labels array.

Intended behavior change: every BalanceTrend and admin trend or daily chart gains a tab stop and arrow-key reading. The frame's aria text says 'read each day', which fits all these daily series. ChartCanvas also repeats ariaLabel on the svg, as Split and Stacked already do.

<sub>Reported by: area:ui-components.</sub>

<a id="p037"></a>

## P037: Extract a gap-aware BandSeries and a shared band-chart margin for SplitAxisChart and StackedAreaChart

- **Status:** [x] done
- **Category:** ui-component · **Kind:** duplicate-implementation · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -70 across the two charts (2 × about 30 band lines plus 2 × about 7 isolated lines plus the MARGIN constants), about +45 in band-series.tsx, plus about 30 test lines
- **Depends on:** [P004](#p004)
- **Existing primitive:** `src/components/ui/chart/chart-frame.tsx:TimeSeriesFrame`

**Problem.** SplitAxisChart and StackedAreaChart each implement the same gap-aware band series (Area, LinePath and isolated-point dots) and their own isolated() neighbour check, and each declares the same MARGIN. Both are the two render modes of WorthChart. Any change to how gaps or isolated points draw must be made twice, and the stacked copy's defined and isolated predicates already disagree about undefined values.

**Sites (5).**

- [`src/components/ui/split-axis-chart.tsx:12, 35-42, 118-157`](../../src/components/ui/split-axis-chart.tsx#L12) — MARGIN {8,10,24,52}; isolated by value accessor; per-segment Area (y0 = constant floor, fillOpacity 0.14), LinePath (strokeWidth 1.5), r=3 dots
- [`src/components/ui/stacked-area-chart.tsx:12, 32-37, 97-130`](../../src/components/ui/stacked-area-chart.tsx#L12) — The same MARGIN; isolated by band index using `?? null`; per-band Area (y0 = stacked base, fillOpacity from FILL_OPACITY), LinePath (top band 1.5/1, others 1/0.7), r=3 dots; defined uses `!== null`
- [`src/components/composition/board/WorthChart.tsx:44-100`](../../src/components/composition/board/WorthChart.tsx#L44-L100) — Switches between the two charts for one series, so both must share plot geometry
- [`src/components/ui/chart/chart-frame.tsx:78-156`](../../src/components/ui/chart/chart-frame.tsx#L78-L156) — TimeSeriesFrame takes margin as a prop and the series as children. BandSeries slots in as children; no frame change is needed.
- [`src/components/ui/chart/line-chart.tsx:98-116`](../../src/components/ui/chart/line-chart.tsx#L98-L116) — AreaClosed and LinePath without defined gaps. A different concept, so it does not cover this.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/ui/trend-chart.tsx:8`](../../src/components/ui/trend-chart.tsx#L8) — Different MARGIN (8/8/24/44). Not part of the shared margin.
- [`src/components/ui/annotated-daily-chart.tsx:42, 157`](../../src/components/ui/annotated-daily-chart.tsx#L42) — Different MARGIN and a single LinePath with no band or gaps
- [`src/components/ui/bar-chart.tsx:30`](../../src/components/ui/bar-chart.tsx#L30) — A bar chart with its own margin
- [`src/components/ui/split-axis-chart.tsx:120-126, 158-167`](../../src/components/ui/split-axis-chart.tsx#L120-L126) — Per-segment ValueAxisGrid and the axis-break marker stay in SplitAxisChart

</details>

**Home.** `src/components/ui/chart/band-series.tsx`

**Boundary check.** The home is zone ui, and both consumers (ui/split-axis-chart.tsx, ui/stacked-area-chart.tsx) are zone ui, so these are same-zone imports and 'ui allow: []' only restricts cross-zone imports. band-series.tsx imports the @visx/shape package (already a dependency used by both charts) and nothing outside ui.

**API sketch.**

```ts
export const BAND_CHART_MARGIN = { top: 8, right: 10, bottom: 24, left: 52 } as const;
export function BandSeries<P extends { x: number }>(props: {
  points: P[];
  x: (p: P) => number;
  y0: (p: P) => number;
  y1: (p: P) => number;
  defined: (p: P) => boolean;
  color: string;
  fillOpacity: number;
  strokeWidth?: number;   // default 1.5
  strokeOpacity?: number; // omitted attribute when undefined
}): JSX.Element // <><Area/><LinePath y={y1}/>{dots keyed by p.x at isolated points}</>
// module-private: function isolatedAt<P>(points: readonly P[], i: number, defined: (p: P) => boolean): boolean
```

**Migration steps.**

1. Create src/components/ui/chart/band-series.tsx with BAND_CHART_MARGIN, a private isolatedAt and BandSeries. The LinePath uses y1 as y, fill="none". Dots are keyed by point.x (as today) with cx=x(p), cy=y1(p), r=3, fill=color.
2. Add src/components/ui/chart/band-series.test.ts (render inside an <svg> with renderToStaticMarkup): values [1,null,2,null,3] → 3 circles; [1,2,null,3] → 1 circle; all undefined → 0 circles; strokeOpacity attribute absent when not passed.
3. SplitAxisChart: replace lines 127-155 inside the existing <g key={segment.key} data-axis={segment.key}> with <BandSeries points={points} x={(p) => xScale(p.x)} y0={() => segment.floor} y1={(p) => segment.scale(segment.value(p) ?? 0)} defined={(p) => segment.value(p) !== null} color={toneHex[segment.tone]} fillOpacity={0.14} />. Delete isolated (35-42), replace MARGIN with BAND_CHART_MARGIN, and drop the Area and LinePath imports.
4. StackedAreaChart: replace lines 99-128 inside <g key={band.key} data-band={band.key}> with <BandSeries points={points} x={(p) => xScale(p.x)} y0={(p) => yScale(base(p, index))} y1={(p) => yScale(base(p, index) + (p.values[index] ?? 0))} defined={(p) => (p.values[index] ?? null) !== null} color={toneHex[band.tone]} fillOpacity={FILL_OPACITY[index] ?? 0.2} strokeWidth={index === bands.length - 1 ? 1.5 : 1} strokeOpacity={index === bands.length - 1 ? 1 : 0.7} />. Delete isolated (32-37), replace MARGIN with BAND_CHART_MARGIN, and drop the Area and LinePath imports.
5. Keep each chart's wrapping <g data-axis>/<g data-band> elements and keys; the existing tests assert them.

**Tests.** New: src/components/ui/chart/band-series.test.ts, as above. Existing guards that must stay green unchanged: src/components/ui/split-axis-chart.test.ts (data-axis upper/lower, data-axis-break, exactly 1 circle, empty for a single point, de-duplicated tick labels) and src/components/ui/stacked-area-chart.test.ts (2 data-band groups, 1 circle for a late-starting band, empty for a single point).

**Notes.** Drift: in stacked-area-chart, Area and LinePath use `defined={(point) => point.values[index] !== null}` (103-104, 112), which treats an undefined value (values shorter than bands) as defined and plots it as 0. isolated (35) uses `?? null` and treats undefined as missing. The isolated version is correct: an absent value means no data. Passing one `defined` predicate to BandSeries fixes this. It is unreachable today because WorthChart always passes [liquid, assets] for 2 bands. Preserve: the split-axis LinePath has no strokeOpacity attribute, so BandSeries must omit it when undefined rather than default it to 1, keeping the markup identical. Stroke widths (split 1.5; stacked top 1.5/1 and others 1/0.7) and fill opacities (0.14 vs 0.34/0.22/0.2) stay per caller. There is no real dependency on any TimeSeriesFrame port: BandSeries renders as TimeSeriesFrame children and touches neither the frame nor LineChart, so it can land independently. BAND_CHART_MARGIN lives in band-series.tsx, not as a TimeSeriesFrame default, because other time-series charts (trend-chart 8/8/24/44) use different margins.

<sub>Reported by: area:ui-components.</sub>

<a id="p317"></a>

## P317: Retire the vestigial sparkline module: ChartTone in tones, tests on chart-geometry, cssom tooltip into chart/

- **Status:** [ ] not started
- **Category:** simplification · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -20 / +5 (two test files merged, one module deleted)
- **Depends on:** [P004](#p004), [P037](#p037)
- **Existing primitive:** `src/components/ui/chart/chart-geometry.ts`

**Problem.** src/components/ui/sparkline.tsx holds no component. It defines SparklineTone (imported by 7 chart files, including app/(site)/admin/charts.tsx), SparklinePoint (one consumer, chart/line-chart.tsx), and re-exports extent, paddedDomain and nearestIndex purely for sparkline.test.ts. trend-chart.tsx re-exports tickIndices purely for trend-chart.test.ts. paddedDomain is reached only through that test re-export. use-cssom-tooltip.ts sits in the ui root although its only production consumer is chart/use-chart-hover.ts.

**Verifier revision.** sparkline.tsx is vestigial. It has no component, only a Tone subset type, a point type and a re-export of three chart-geometry helpers that only sparkline.test.ts reads. trend-chart.tsx:10 re-exports tickIndices only for trend-chart.test.ts. Tests are valid consumers in this repo (chart-geometry.test.ts imports chart-geometry directly), so the re-exports can go. Two changes to the proposal. (1) Rename rather than move under the old name: the type belongs beside ChipTone and DotTone in ui/tones.ts as ChartTone; keeping 'Sparkline' in the name after the component is gone keeps the confusion. (2) Do not collapse the three tooltip modules. tooltip-placement.ts (pure math), use-cssom-tooltip.ts (DOM layout effect, tested with mocked React hooks) and use-chart-hover.ts (visx glue) are separate because each is testable alone. Only co-locate use-cssom-tooltip.ts and its test under chart/. paddedDomain has no production consumer; its fate depends on F136.

**Sites (16).**

- [`src/components/ui/sparkline.tsx:1-10`](../../src/components/ui/sparkline.tsx#L1-L10) — Types plus test-only re-exports; no component
- [`src/components/ui/sparkline.test.ts:1-50`](../../src/components/ui/sparkline.test.ts#L1-L50) — Tests extent, paddedDomain and nearestIndex through the sparkline re-export
- [`src/components/ui/trend-chart.tsx:3-4, 10`](../../src/components/ui/trend-chart.tsx#L3-L4) — Imports SparklineTone; re-exports tickIndices for the test only
- [`src/components/ui/trend-chart.test.ts:1-18`](../../src/components/ui/trend-chart.test.ts#L1-L18) — Tests only tickIndices, via the trend-chart re-export
- [`src/components/ui/chart/chart-geometry.ts:1-58`](../../src/components/ui/chart/chart-geometry.ts#L1-L58) — Canonical home of extent, paddedDomain, nearestIndex, tickIndices, tickAnchor and continuousHoverTarget. paddedDomain has no production importer.
- [`src/components/ui/chart/chart-geometry.test.ts:1-2`](../../src/components/ui/chart/chart-geometry.test.ts#L1-L2) — Already imports chart-geometry directly (continuousHoverTarget, tickAnchor)
- [`src/components/ui/tones.ts:1-19`](../../src/components/ui/tones.ts#L1-L19) — Tone with the ChipTone and DotTone Extract subsets: the natural home for ChartTone
- [`src/components/ui/chart/line-chart.tsx:7, 27, 42`](../../src/components/ui/chart/line-chart.tsx#L7) — Only consumer of SparklinePoint; also uses SparklineTone
- [`src/components/ui/split-axis-chart.tsx:9`](../../src/components/ui/split-axis-chart.tsx#L9) — SparklineTone import
- [`src/components/ui/annotated-daily-chart.tsx:5`](../../src/components/ui/annotated-daily-chart.tsx#L5) — SparklineTone import
- [`src/components/ui/bar-chart.tsx:7`](../../src/components/ui/bar-chart.tsx#L7) — SparklineTone import
- [`src/components/ui/stacked-area-chart.tsx:9`](../../src/components/ui/stacked-area-chart.tsx#L9) — SparklineTone import
- [`src/app/(site)/admin/charts.tsx:6`](../../src/app/%28site%29/admin/charts.tsx#L6) — SparklineTone import from the app zone
- [`src/components/ui/use-cssom-tooltip.ts:1-25`](../../src/components/ui/use-cssom-tooltip.ts#L1-L25) — Imports ./chart/tooltip-placement; only production consumer is chart/use-chart-hover
- [`src/components/ui/chart/use-chart-hover.ts:1-22`](../../src/components/ui/chart/use-chart-hover.ts#L1-L22) — Imports '../use-cssom-tooltip'; consumed by annotated-daily-chart, bar-chart, line-chart and chart-frame
- [`src/components/composition/board/board-view-model.ts:309-316`](../../src/components/composition/board/board-view-model.ts#L309-L316) — fittedDomain: the F136 overlap with paddedDomain

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/ui/chart/tooltip-placement.ts:1-29`](../../src/components/ui/chart/tooltip-placement.ts#L1-L29) — Pure placement math with its own test (tooltip-placement.test.ts). Keep it separate; merging it into a hook loses the pure test.
- [`src/components/ui/use-cssom-tooltip.test.ts:1-57`](../../src/components/ui/use-cssom-tooltip.test.ts#L1-L57) — Mocks React's useRef and useLayoutEffect to test the hook alone. Inlining into use-chart-hover would make this test also carry visx useTooltip, so move the file instead of inlining it.
- [`src/components/ui/chart/chart-canvas.tsx:41-42`](../../src/components/ui/chart/chart-canvas.tsx#L41-L42) — The .sparkline-tooltip and .sparkline-tooltip-box class names are literal runtime classes in chart-canvas.css. Renaming is optional and must change the CSS and TSX together.

</details>

**Home.** `src/components/ui/tones.ts (ChartTone); src/components/ui/chart/chart-geometry.ts (ChartPoint and the helpers, already there); src/components/ui/chart/use-cssom-tooltip.ts (moved)`

**Boundary check.** Everything stays in the ui zone, which imports nothing outside itself. tones.ts and chart-geometry.ts are already imported within ui. app/(site)/admin/charts.tsx (app) importing ChartTone from @/components/ui/tones is allowed (the app rule allows ui). If F136 lands, board-view-model.ts (components-composition) may import ui per its rule.

**API sketch.**

```ts
// ui/tones.ts
export type ChartTone = Extract<Tone, 'green' | 'orange' | 'red' | 'blue' | 'purple' | 'teal'>;
// ui/chart/chart-geometry.ts
export type ChartPoint = { x: number; y: number };
// line-chart.tsx
export type LineChartProps<T extends ChartPoint> = { ... tone?: ChartTone ... }
```

**Migration steps.**

1. Add ChartTone to ui/tones.ts and ChartPoint to ui/chart/chart-geometry.ts.
2. Point the 7 SparklineTone importers (split-axis-chart, annotated-daily-chart, trend-chart, bar-chart, stacked-area-chart, chart/line-chart, app/(site)/admin/charts.tsx) at ChartTone, and line-chart's SparklinePoint at ChartPoint.
3. Move the extent, paddedDomain and nearestIndex cases from sparkline.test.ts and the tickIndices cases from trend-chart.test.ts into chart/chart-geometry.test.ts, importing from './chart-geometry'. Delete sparkline.test.ts and trend-chart.test.ts.
4. Delete src/components/ui/sparkline.tsx and line 10 of trend-chart.tsx (export { tickIndices }).
5. Move use-cssom-tooltip.ts and use-cssom-tooltip.test.ts into src/components/ui/chart/. Change its import to './tooltip-placement' and use-chart-hover's import to './use-cssom-tooltip'.
6. paddedDomain: if F136 makes board fittedDomain call it, keep it and widen its parameter (and extent's) to readonly number[]. Otherwise delete paddedDomain and its test cases rather than keep a test-only export.
7. Optional: adopt ChartPoint for the inline { x: number; y: number } shapes in ui (trend-chart.tsx:17, annotated-daily-chart.tsx:24/56, chart/hover.ts:7, chart/daily-chart-geometry.ts:2/28). This is cosmetic; skip it if it adds churn.

**Tests.** chart-geometry.test.ts takes over the extent, nearestIndex (including the empty → -1 case), tickIndices and, if kept, paddedDomain cases unchanged. The moved use-cssom-tooltip.test.ts must pass unchanged at its new path. tooltip-placement.test.ts and chart-frame.test.ts (which mocks './use-chart-hover') are unaffected. Typecheck guards the 7 type-import rewrites.

**Notes.** Drift between paddedDomain and fittedDomain (for F136): for an all-zero series paddedDomain([0,0]) returns [-1, 1], while fittedDomain([0,0]) returns [-0.1, 0.1] (board-view-model.test.ts:207 pins it). Swinging and flat non-zero series agree (10% padding). fittedDomain also takes readonly number[] and uses Math.min/Math.max spread, which is fine at chart sizes. If F136 adopts paddedDomain, it must pick one zero-series result and update the losing test. ChartTone must keep exactly the current six tones so the union does not widen.

<sub>Reported by: area:ui-components.</sub>

<a id="p318"></a>

## P318: Use paddedDomain in board-view-model, add one year-dropping date helper, and export readyData and the missing board data types

- **Status:** [ ] not started
- **Category:** simplification · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -25 / +12 (fittedDomain and its test, three regexes, three Extract types, five inline unwraps; plus one lib helper and its test, and three type exports)
- **Depends on:** [P317](#p317), [P089](wave-04-formatting-dates-and-names-have-one-home.md#p089)
- **Existing primitive:** `src/components/ui/chart/chart-geometry.ts:paddedDomain`

**Problem.** board-view-model keeps its own exported y-domain padder (fittedDomain) next to an unused ui primitive (paddedDomain) that implements the same rule with a different all-zero fallback. The board turns formatUtcDate output into a day-month form by regex in three places, which depends silently on the Intl format in lib/format/time.ts. Five section reads unwrap a ready BoardSection inline even though readyData already exists privately. Three ready-data types are rebuilt with Extract<...> because api-contract does not export them, unlike BoardSkillsData, BoardIndustryData and BoardNetWorthData. CharacterIdentity spells the same Pick type twice.

**Verifier revision.** The core holds. fittedDomain (board-view-model.ts:311-316) is the same y-padding rule as ui/chart paddedDomain, and paddedDomain has no production consumer: its only importer is sparkline.tsx:10, a re-export that sparkline.test.ts reads. The two differ only for an all-zero series ([-0.1,0.1] vs [-1,1]). Every other case, including the flat non-zero case the splitDomains test uses ([3200,3200] -> [2880,3520]), gives the same result. Three parts of the proposal change. (1) formatUtcDayMonth cannot replace the two chart tick regexes. TrendChart, StackedAreaChart and SplitAxisChart all type formatTick as (label: string) => string, and the label is formatUtcDate's output with the year, which tooltips need; re-parsing '29 Aug 2026' with new Date is implementation-defined and local-time. The shared primitive has to work on strings. (2) A new ReadySection<K> type is not needed. api-contract already exports named data types (BoardSkillsData, BoardIndustryData, BoardNetWorthData); export the three missing ones (journal, attributes, implants) the same way. (3) readyData can stay in board-view-model.ts and simply be exported. Its only consumers are components-composition section files that already import '../board-view-model', and no composition-zone code needs it, so moving it into the zod contract module adds nothing. The Math.min/max spread is not an efficiency problem: series are at most 365 days of history or about 30 journal days.

**Sites (17).**

- [`src/components/composition/board/board-view-model.ts:309-325`](../../src/components/composition/board/board-view-model.ts#L309-L325) — DOMAIN_PADDING and the exported fittedDomain; balanceChart uses it at 323 and builds year-bearing labels at 322
- [`src/components/composition/board/board-view-model.ts:663-668`](../../src/components/composition/board/board-view-model.ts#L663-L668) — bandDomain calls fittedDomain
- [`src/components/ui/chart/chart-geometry.ts:1-15`](../../src/components/ui/chart/chart-geometry.ts#L1-L15) — extent and paddedDomain take mutable number[]; same rule except the all-zero fallback is ±1
- [`src/components/ui/sparkline.tsx:10`](../../src/components/ui/sparkline.tsx#L10) — Re-exports extent, paddedDomain and nearestIndex only for sparkline.test.ts; paddedDomain has no production importer
- [`src/components/ui/sparkline.test.ts:18-30`](../../src/components/ui/sparkline.test.ts#L18-L30) — paddedDomain tests, including [0,0] -> [-1,1]
- [`src/components/composition/board/board-view-model.test.ts:22, 204-208`](../../src/components/composition/board/board-view-model.test.ts#L22) — Imports fittedDomain and pins [0,0] -> [-0.1,0.1]
- [`src/components/composition/board/board-view-model.test.ts:520-531`](../../src/components/composition/board/board-view-model.test.ts#L520-L531) — splitDomains tests; they give the same result under paddedDomain (flat 3200 pads by 320 either way)
- [`src/components/composition/board/BalanceTrend.tsx:35`](../../src/components/composition/board/BalanceTrend.tsx#L35) — formatTick={(label) => label.replace(/ \d{4}$/, '')}
- [`src/components/composition/board/WorthChart.tsx:39, 47, 68, 90`](../../src/components/composition/board/WorthChart.tsx#L39) — shortDate regex used as formatTick in both chart modes; label() keeps the year for tooltips
- [`src/components/composition/board/sections/WalletSection.tsx:13-14, 23, 61`](../../src/components/composition/board/sections/WalletSection.tsx#L13-L14) — Extract type for Journal, regex on formatUtcDate(row.date), inline netWorth unwrap
- [`src/components/composition/board/board-view-model.ts:21-23`](../../src/components/composition/board/board-view-model.ts#L21-L23) — Private readyData<T>(BoardSection<T>)
- [`src/components/composition/board/sections/SheetHeader.tsx:64-65`](../../src/components/composition/board/sections/SheetHeader.tsx#L64-L65) — Inline wallet and skills unwraps
- [`src/components/composition/board/sections/CharacterIdentity.tsx:10, 18, 64-65`](../../src/components/composition/board/sections/CharacterIdentity.tsx#L10) — Line 18 repeats the IdentityCharacter Pick from line 10; inline profile and status unwraps
- [`src/components/composition/board/sections/AttributesSection.tsx:20-21`](../../src/components/composition/board/sections/AttributesSection.tsx#L20-L21) — Extract types for Attributes and Implants
- [`src/composition/board/api-contract.ts:60, 75-84, 101-129`](../../src/composition/board/api-contract.ts#L60) — BoardSkillsData, BoardIndustryData and BoardNetWorthData are exported; the attributes, implants and journal schemas have no exported type
- [`src/lib/format/time.ts:1-13`](../../src/lib/format/time.ts#L1-L13) — UTC_DAY formatter whose ' YYYY' suffix the regexes strip
- [`src/components/ui/trend-chart.tsx:26, 41`](../../src/components/ui/trend-chart.tsx#L26) — formatTick is typed (label: string) => string, so a value formatter cannot be passed

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/log/map-event-copy.ts:71-79`](../../src/mapper/log/map-event-copy.ts#L71-L79) — formatEventTime uses local time and includes hours, minutes and seconds; a different concept
- [`src/app/(site)/admin/charts.tsx:77, 112`](../../src/app/%28site%29/admin/charts.tsx#L77) — s.slice(5) trims ISO yyyy-mm-dd day labels, not formatUtcDate output
- [`src/app/(site)/preview/primitives/data.tsx:89`](../../src/app/%28site%29/preview/primitives/data.tsx#L89) — shortDay slices ISO sample labels; preview-only
- [`src/components/composition/board/sections/SheetHeader.tsx:33`](../../src/components/composition/board/sections/SheetHeader.tsx#L33) — Early return that narrows status.data for destructuring; readyData would add a null check and gain nothing
- [`src/components/composition/board/sections/WalletSection.tsx:69`](../../src/components/composition/board/sections/WalletSection.tsx#L69) — JSX conditional that narrows journal.data; already minimal
- [`src/components/composition/board/sections/QueueSection.tsx:34`](../../src/components/composition/board/sections/QueueSection.tsx#L34) — Needs the whole section for queueHealth, not just its data
- [`src/components/composition/board/sections/SkillsSection.tsx:22`](../../src/components/composition/board/sections/SkillsSection.tsx#L22) — Unwrap and compute in one step; converting it is optional and marginal

</details>

**Home.** `src/components/ui/chart/chart-geometry.ts:paddedDomain (existing). New src/lib/format/time.ts:dropUtcYear. src/components/composition/board/board-view-model.ts:readyData, now exported. New type exports BoardJournalData, BoardAttributesData and BoardImplantsData in src/composition/board/api-contract.ts.`

**Boundary check.** Every consumer is in components-composition (src/components/composition/board/**). Importing paddedDomain from ui is allowed: the components-composition rule lists "ui". Importing dropUtcYear from lib is allowed: the rule lists "lib". Importing the new data types from api-contract (zone composition) is allowed: the rule lists "composition". readyData stays inside components-composition, so section files importing '../board-view-model' is same-zone. chart-geometry.ts (ui, allow []) and time.ts (lib, allow [config]) gain no imports.

**API sketch.**

```ts
// ui/chart/chart-geometry.ts (widen only)
export function extent(values: readonly number[]): [number, number];
export function paddedDomain(values: readonly number[]): [number, number];
// lib/format/time.ts
/** A formatUtcDate label without its year, for axis ticks and dense rows. */
export function dropUtcYear(label: string): string; // label.replace(/ \d{4}$/, '')
// board-view-model.ts
export function readyData<T>(section: BoardSection<T>): T | null;
// api-contract.ts
export type BoardJournalData = z.infer<typeof journalDataSchema>;
export type BoardAttributesData = z.infer<typeof attributesDataSchema>;
export type BoardImplantsData = z.infer<typeof implantsDataSchema>;
```

**Migration steps.**

1. chart-geometry.ts: change the extent and paddedDomain parameters to readonly number[]. The existing callers in line-chart, stacked-area-chart and split-axis-chart pass mutable arrays and still compile.
2. board-view-model.ts: import { paddedDomain } from '@/components/ui/chart/chart-geometry'. Replace fittedDomain(balances) at 323 and fittedDomain(values) at 664 with paddedDomain, then delete fittedDomain and DOMAIN_PADDING (309-316).
3. board-view-model.test.ts: remove the fittedDomain import (line 22) and the test at 204-208. The all-zero case is covered by sparkline.test.ts paddedDomain. Optionally add a splitDomains case for an all-zero ISK band that expects [-1, 1].
4. Optional cleanup in the same change: move the extent, paddedDomain and nearestIndex tests from sparkline.test.ts into ui/chart/chart-geometry.test.ts and delete the test-only re-export at sparkline.tsx:10.
5. time.ts: add dropUtcYear. In time.test.ts, assert dropUtcYear(formatUtcDate('2026-06-19')) === '19 Jun' and dropUtcYear('—') === '—', so a later change to the UTC_DAY format fails a test instead of silently breaking the ticks.
6. Replace the regexes: BalanceTrend.tsx:35 becomes formatTick={dropUtcYear}; in WorthChart.tsx delete shortDate (39) and pass dropUtcYear at 68 and 90; WalletSection.tsx:23 becomes dropUtcYear(formatUtcDate(row.date)). Tooltip labels (WorthChart:47, balanceChart labels) keep the year.
7. api-contract.ts: export BoardJournalData, BoardAttributesData and BoardImplantsData beside the existing BoardSkillsData, BoardIndustryData and BoardNetWorthData. WalletSection.tsx:13 becomes `type Journal = BoardJournalData` (or use the type directly), and AttributesSection.tsx:20-21 imports the two new types.
8. board-view-model.ts: export readyData. Replace SheetHeader.tsx:64-65, CharacterIdentity.tsx:64-65 and WalletSection.tsx:61 (`readyData(character.netWorth)?.total ?? null`) with readyData calls.
9. CharacterIdentity.tsx:18: type the prop as IdentityCharacter instead of repeating the Pick.

**Tests.** Guarding the change: sparkline.test.ts paddedDomain tests, board-view-model.test.ts splitDomains (520-531) and balanceChart (152-163, which expects the label '29 Aug 2026' with the year), and time.test.ts formatUtcDate. Add: dropUtcYear cases in src/lib/format/time.test.ts; optionally an all-zero splitDomains or balanceChart case in board-view-model.test.ts to pin the new ±1 fallback.

**Notes.** Behavior change: for an all-zero series, balanceChart and bandDomain return [-1,1] instead of [-0.1,0.1]. paddedDomain's ±1 is the better choice for ISK axes, since ±0.1 ISK ticks are meaningless, so adopt it rather than port 0.1 into ui. Empty input: fittedDomain([]) returns [Infinity,-Infinity] and paddedDomain([]) returns [NaN,NaN]. Neither is rendered, because BalanceTrend and WorthChart return null below 2 points and splitDomains only runs in 'broken' mode, which needs at least one worth. Ticks must keep receiving year-bearing labels because the same label string feeds the tooltips; that is why the helper works on strings rather than as a second Intl formatter. No drift bugs in the unwraps: all five sites are equivalent to readyData.

<sub>Reported by: area:components-composition.</sub>

<a id="p008"></a>

## P008: Route every EVE image URL through lib/eve-image (eveImageSrc) and promote EntityLogo to src/components/entity-logo.tsx as the corp/alliance counterpart of CharacterPortrait

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** Removes about 30 lines (3 raw EveImage blocks, the redundant portrait src fallbacks, the dead logoUrl field and mapping) and adds about 35 (EntityLogo grows a size map and placeholder; lib gains the path table). Roughly neutral; the gain is one owner for image URLs and one logo component.
- **Depends on:** —
- **Existing primitive:** `src/lib/eve-image.ts:corporationLogoUrl,characterPortraitUrl; src/components/character-portrait.tsx:CharacterPortrait; src/components/eve-image.tsx:EveImage`

**Problem.** lib/eve-image.ts declares seven image families and keeps the host private, but builds URLs only for portraits and corporation logos. TypeIcon and EntityLogo hard-code the host and path. EntityLogo, the only logo component and the only one that handles load failure, is stranded in components/composition/board. AccessListEditor, MapCatalogue and CorpJobsBoard therefore each render raw EveImage with corporationLogoUrl and their own size, border and alt choices. Their src fallbacks read a logoUrl field that nothing ever sets. On the portrait side, MapBlockList and AccessListEditor pass characterPortraitUrl(id, 64) to CharacterPortrait, which already builds that URL from characterId. The size baked into the URL is overwritten anyway, because EveImage's loader rewrites size.

**Verifier revision.** The core is real. src/lib/eve-image.ts keeps IMAGE_HOST private, yet TypeIcon (66) and the board's EntityLogo (15) hard-code https://images.evetech.net. EntityLogo hand-builds a corporation URL even though corporationLogoUrl exists. Three feature files render corporation logos with raw EveImage plus corporationLogoUrl, each with its own size, border and alt. CharacterPortrait has no logo counterpart, even though CorpJobsBoard's 36px raw corp logo sits beside IndustryJobsPanel's CharacterPortrait size=36. Six changes to the design. (1) The proposed lib name eveImageUrl collides with the existing exported Next loader eveImageUrl(family, loaderProps) in src/components/eve-image.tsx:28; name the lib builder eveImageSrc. (2) Removing FAMILY_SIZES and the family argument is out of scope. It is a no-op today, but lib/eve-image.test.ts:54-58 deliberately pins one canonical ladder per family, and removing it would cascade into the required family prop at 8 EveImage call sites and into two test mocks that assert data-eve-image-family. (3) EntityLogo needs no src prop: CorporationAccessOption.logoUrl is never populated, because the only producer, composition/map-access.ts:66-69, sets just corporationId and name. The `?? corporationLogoUrl(...)` fallbacks always fire, and the dead field should be deleted. (4) An allianceLogoUrl preset would have no caller other than EntityLogo, which can call eveImageSrc directly, so skip it to avoid an unused export. (5) Replacing the image with null on error would collapse the three feature sites' layout boxes, which persist today. Use a sized placeholder instead. (6) MapCatalogue.test.ts:177-178 asserts alt="", and every site shows the name beside the logo, so alt should default to ''.

**Sites (17).**

- [`src/lib/eve-image.ts:1-42`](../../src/lib/eve-image.ts#L1-L42) — Private IMAGE_HOST; builds only characterPortraitUrl and corporationLogoUrl; FAMILY_SIZES at 16-24 is uniform
- [`src/components/composition/board/sections/EntityLogo.tsx:1-24`](../../src/components/composition/board/sections/EntityLogo.tsx#L1-L24) — Hand-built `${host}/${PATH[kind]}/${id}/logo`; fixed 20px; alt `${name} logo`; returns null on error
- [`src/components/composition/board/sections/CharacterIdentity.tsx:43-62`](../../src/components/composition/board/sections/CharacterIdentity.tsx#L43-L62) — EntityLogo's only consumer (49 corp, 55 alliance); the name is shown beside the logo
- [`src/components/type-icon.tsx:61-74`](../../src/components/type-icon.tsx#L61-L74) — src hard-codes `https://images.evetech.net/types/${typeId}/${variant}`; IMAGE_FAMILY maps variant to family at 9-14
- [`src/features/maps/AccessListEditor.tsx:31-53`](../../src/features/maps/AccessListEditor.tsx#L31-L53) — PrincipalImage. Corp branch: raw EveImage 32px with border-border-idle and alt=name, src principal.imageUrl ?? corporationLogoUrl. Character branch: redundant characterPortraitUrl(…, 64) fallback
- [`src/features/maps/MapCatalogue.tsx:97-105`](../../src/features/maps/MapCatalogue.tsx#L97-L105) — Raw EveImage corp badge 24px, alt='', src corporation?.logoUrl ?? corporationLogoUrl (logoUrl is always undefined)
- [`src/features/industry-jobs/components/CorpJobsBoard.tsx:86-94`](../../src/features/industry-jobs/components/CorpJobsBoard.tsx#L86-L94) — Raw EveImage corp avatar 36px, border-border-soft, alt=''
- [`src/features/industry-jobs/components/IndustryJobsPanel.tsx:43-50`](../../src/features/industry-jobs/components/IndustryJobsPanel.tsx#L43-L50) — The character counterpart uses CharacterPortrait size=36, which shows the missing logo primitive
- [`src/features/maps/MapBlockList.tsx:101-106`](../../src/features/maps/MapBlockList.tsx#L101-L106) — src={characterPortraitUrl(block.characterId, 64)} duplicates CharacterPortrait's own derivation
- [`src/components/character-portrait.tsx:7-55`](../../src/components/character-portrait.tsx#L7-L55) — The sibling to mirror: a PortraitSize to class map, src ?? derived from characterId
- [`src/components/eve-image.tsx:28-50`](../../src/components/eve-image.tsx#L28-L50) — An existing export named eveImageUrl (the Next loader that overwrites size via snapEveImageSize), so the lib builder needs another name
- [`src/data/maps/access-contract.ts:8-12`](../../src/data/maps/access-contract.ts#L8-L12) — CorporationAccessOption.logoUrl?: dead optional field
- [`src/composition/map-access.ts:66-69`](../../src/composition/map-access.ts#L66-L69) — The only CorporationAccessOption producer; it never sets logoUrl
- [`src/features/maps/access-editor-model.ts:43-52`](../../src/features/maps/access-editor-model.ts#L43-L52) — Maps the dead logoUrl to imageUrl for corporation principals
- [`src/platform/auth/eve-sso.ts:262-264`](../../src/platform/auth/eve-sso.ts#L262-L264) — portraitUrl(characterId, size=128) is a pass-through preset over characterPortraitUrl, with callers at eve-sso.ts:258 and linked-characters.ts:88
- [`src/features/maps/MapCatalogue.test.ts:23-31,177-178`](../../src/features/maps/MapCatalogue.test.ts#L23-L31) — Mocks EveImage and asserts family='corporation-logo' and alt=''. It must keep passing
- [`src/lib/eve-image.test.ts:22-58`](../../src/lib/eve-image.test.ts#L22-L58) — Pins byte-identical builder URLs and one uniform ladder for every family

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/(site)/admin/users/[userId]/page.tsx:61-71,155-165`](../../src/app/%28site%29/admin/users/[userId]/page.tsx#L61-L71) — Raw EveImage character portraits (28px, 40px) owned by the LinkedCharacterRow opportunity
- [`src/components/composition/industry-workspace/MemberDetail.tsx:111`](../../src/components/composition/industry-workspace/MemberDetail.tsx#L111) — The characterPortraitUrl fallback is needed because CharacterIdentity's portraitUrl is a required string
- [`src/proxy.ts:32`](../../src/proxy.ts#L32) — The CSP img-src host is a security-header string. Sharing a constant is optional and does not affect URL building
- [`src/components/composition/industry-workspace/ProductionCapacity.tsx:47-54`](../../src/components/composition/industry-workspace/ProductionCapacity.tsx#L47-L54) — Static local asset (source='static'), not an image-server URL

</details>

**Home.** `src/lib/eve-image.ts (eveImageSrc builder; the existing presets delegate to it) and src/components/entity-logo.tsx (EntityLogo, moved from components/composition/board/sections)`

**Boundary check.** lib may import only config (rule 'lib -> [config]'); eveImageSrc is pure string building, and the family-to-path table lives in lib, so lib does not import data's TypeIconVariant. Consumers of lib: components (TypeIcon, EntityLogo, CharacterPortrait) allows 'lib'; features allows 'lib'; platform/auth (eve-sso) allows 'lib'. src/components/entity-logo.tsx matches the components zone pattern 'src/components/*.tsx'. It imports ./eve-image (same zone), ./ui/cn ('ui', allowed) and @/lib/eve-image ('lib', allowed). Consumers of components: components-composition (CharacterIdentity) allows 'components'; features (AccessListEditor, MapCatalogue, CorpJobsBoard) allows 'components'; app and mapper also allow it.

**API sketch.**

```ts
// src/lib/eve-image.ts
const FAMILY_PATH: Record<EveImageFamily, (id: number) => string> = {
  'character-portrait': (id) => `characters/${id}/portrait`,
  'corporation-logo': (id) => `corporations/${id}/logo`,
  'alliance-logo': (id) => `alliances/${id}/logo`,
  'type-icon': (id) => `types/${id}/icon`, 'type-render': (id) => `types/${id}/render`,
  'type-bp': (id) => `types/${id}/bp`, 'type-bpc': (id) => `types/${id}/bpc`,
};
export function eveImageSrc(family: EveImageFamily, id: number, size: EveImageSize = 64): string;
export const characterPortraitUrl = (id: number, size: EveImageSize = 64) => eveImageSrc('character-portrait', id, size);
export const corporationLogoUrl = (id: number, size: EveImageSize = 64) => eveImageSrc('corporation-logo', id, size);

// src/components/entity-logo.tsx ('use client')
export type LogoSize = 20 | 24 | 32 | 36;
export function EntityLogo({ kind, id, size, alt = '', className }: {
  kind: 'corporation' | 'alliance'; id: number; size: LogoSize; alt?: string; className?: string;
}): JSX.Element  // EveImage family=`${kind}-logo` src=eveImageSrc(family, id); on error -> <span aria-hidden> with the same box classes
```

**Migration steps.**

1. In src/lib/eve-image.ts, add FAMILY_PATH and eveImageSrc, and turn characterPortraitUrl and corporationLogoUrl into delegating presets. Leave FAMILY_SIZES and snapEveImageSize alone. lib/eve-image.test.ts already guards byte-identical output; add an eveImageSrc case for alliance-logo and the type families.
2. In TypeIcon (type-icon.tsx:66), use src={eveImageSrc(IMAGE_FAMILY[variant], typeId)}. The loader still rewrites size; StructureHullTile.test.ts's prefix assertion still matches.
3. Create src/components/entity-logo.tsx, mirroring CharacterPortrait: a LogoSize to class map (20 size-5, 24 size-6, 32 size-8, 36 size-9), base 'shrink-0 rounded-ctl object-cover', and className passthrough. On error, render a same-size aria-hidden span instead of null. Delete components/composition/board/sections/EntityLogo.tsx and repoint CharacterIdentity.tsx:8,49,55 to <EntityLogo kind id size={20} />. Its alt changes from '<name> logo' to '', since the name is visible beside it; pass alt to keep the old text.
4. Migrate CorpJobsBoard 86-94 to <EntityLogo kind="corporation" id={corp.corporationId} size={36} className="border border-border-soft" /> and MapCatalogue 97-105 to <EntityLogo kind="corporation" id={corporationId} size={24} />.
5. Migrate AccessListEditor PrincipalImage 31-53. Corporation branch: <EntityLogo kind="corporation" id={principal.ownerId} size={32} alt={principal.name} className="border border-border-idle" />. Character branch: src={principal.imageUrl}, dropping the characterPortraitUrl(…, 64) fallback that CharacterPortrait already derives.
6. Delete the dead logoUrl: remove `readonly logoUrl?: string` from data/maps/access-contract.ts:11 and `imageUrl: corporation.logoUrl` from access-editor-model.ts:50. Imports of corporationLogoUrl that become unused in MapCatalogue, AccessListEditor and CorpJobsBoard must go too, or Fallow will flag them.
7. In MapBlockList.tsx:105, drop src and the characterPortraitUrl import.
8. Optional: replace eve-sso.ts portraitUrl (262-264) with characterPortraitUrl(id, 128) at its two callers (eve-sso.ts:258, linked-characters.ts:88) and update eve-sso.test.ts:94-101. The URLs are byte-identical, which matters because stored portraitUrl values contain size=128.
9. Add src/components/entity-logo.test.ts.

**Tests.** New: src/components/entity-logo.test.ts. Render corporation and alliance logos and assert the src path (/corporations/ID/logo, /alliances/ID/logo), the family, alt '' by default and the size class. Then simulate the error state by calling the rendered element's onError and re-rendering through a small harness, or test the placeholder branch through a pure helper, and assert that a placeholder span with the same box classes renders. Extend src/lib/eve-image.test.ts for eveImageSrc across all 7 families. Existing guards: lib/eve-image.test.ts:22-43 (byte-identical presets), MapCatalogue.test.ts:177-178 (family and alt=''), HomeBoardView.test.ts:25-28 (EveImage mock with family), StructureHullTile.test.ts:9 (type icon URL prefix), and eve-image.test.ts (loader size rewrite).

**Notes.** Behavior differences: (a) On error, EntityLogo currently collapses to null. The three feature sites currently keep their box: with explicit width and height, a failed alt='' image still occupies its size and border. A sized placeholder preserves the feature layouts (CorpJobsBoard's header must stay aligned with CharacterPortrait cards) and leaves a blank 20px slot in CharacterIdentity. Confirm this with design, or keep returning null for 20px only. (b) Alt varies today: CharacterIdentity uses '<name> logo', AccessListEditor uses name, MapCatalogue and CorpJobsBoard use ''. Every site shows the name beside the logo, so '' is the correct default. MapCatalogue.test asserts ''; AccessListEditor can pass alt={principal.name} to match its CharacterPortrait sibling. (c) The size in builder URLs is cosmetic for EveImage consumers because the loader always rewrites ?size=; adding ?size=64 to TypeIcon's src changes no final URL. (d) FAMILY_SIZES is uniform and therefore a no-op today, but it is test-pinned policy. Removing it and the required family prop is a separate, optional simplification across 8 EveImage sites and 2 test mocks. (e) Related parts owned by other opportunities: the TypeIcon fallback, raw admin portraits, the facility placeholder tile, and dimmed-portrait styling.

<sub>Reported by: area:components-composition, area:lib-infra, area:mapper-signatures, area:ui-components, concern:ui-patterns.</sub>

<a id="p009"></a>

## P009: Derive TypeIcon's fallback monogram with initials() and make its size a typed union that includes 30

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -12/+8 (10 slice calls and one initials import removed, the size union added)
- **Depends on:** [P008](#p008)
- **Existing primitive:** `src/lib/format/names.ts:initials; src/components/type-icon.tsx:TypeIcon`

**Problem.** src/components/type-icon.tsx:44 builds the fallback text as (mono || alt || '?').slice(0, 2).toUpperCase(). JobRow passes mono={initials(name)}, so 'Heavy Water' becomes 'HW'. Ten other call sites pass name.slice(0, 2), which gives 'HE', so the same item gets different monograms on different screens. FALLBACK_SIZE_CLASS (lines 16-24) is a Record<number, string> with keys 22/26/32/40/64/88/112. Two sites use size 30 (NodeCard, CockpitRawLedger) and silently get the 32px class. CockpitRawLedger's grid reserves exactly 30px for the icon (grid-cols-[30px_...]), so a failed icon overflows that column by 2px. No call site uses 88.

**Verifier revision.** The monogram drift is real but small. JobRow builds its monogram with initials(), while 10 other call sites pass name.slice(0, 2). That only shows when an image fails to load, so the payoff is low. The 30px gap is also real: FALLBACK_SIZE_CLASS has no 30 key, so size 30 falls back to the 32 class. In CockpitRawLedger that overflows the fixed 30px grid column by 2px. In NodeCard the icon sits inside a 40px FRAME (NodeCard.tsx:24), so nothing jumps there; the tile only grows by 2px. The proposed fix cannot be built as written. eslint.config.mjs:8-14 bans every JSX `style` attribute, and no non-OG .tsx file uses one. EveImage sizes itself with next/image width/height attributes, which a span ignores. So instead of inline width/height, type `size` as a closed union keyed by the class map, the same way CharacterPortrait does with PortraitSize. Add 30 and drop the unused 88.

**Sites (14).**

- [`src/components/type-icon.tsx:16-24, 26-58`](../../src/components/type-icon.tsx#L16-L24) — FALLBACK_SIZE_CLASS has no 30 (unknown sizes fall back to 32) and an unused 88; the fallback text slices mono or alt
- [`src/lib/format/names.ts:1-5`](../../src/lib/format/names.ts#L1-L5) — Canonical initials(). For a single word it returns slice(0, 2).toUpperCase(), the same as today's fallback, so 2-letter monos such as 'Ra', 'BP', 'C3' and '→' are unchanged
- [`src/features/industry-jobs/components/JobRow.tsx:5, 27`](../../src/features/industry-jobs/components/JobRow.tsx#L5) — The only consumer of initials(): mono={initials(headlineName)}, size 22
- [`src/features/industry-planner/components/NodeCard.tsx:24, 170, 195`](../../src/features/industry-planner/components/NodeCard.tsx#L24) — size={30} mono={name.slice(0, 2)} twice. FRAME is 40px, so the 32px fallback fits and only renders 2px larger
- [`src/features/industry-planner/components/CockpitRawLedger.tsx:61-63`](../../src/features/industry-planner/components/CockpitRawLedger.tsx#L61-L63) — colsClass grid-cols-[30px_...] with TypeIcon size 30 and mono=row.name.slice(0, 2); a 32px fallback overflows the column
- [`src/features/industry-planner/components/ComponentDrawer.tsx:90-96, 147-152`](../../src/features/industry-planner/components/ComponentDrawer.tsx#L90-L96) — alt={sheet.name} mono={sheet.name.slice(0, 2)} (alt and mono redundant); mono={row.name.slice(0, 2)} with alt=''
- [`src/features/industry-planner/components/BlueprintSearch.tsx:55`](../../src/features/industry-planner/components/BlueprintSearch.tsx#L55) — mono={hit.label.slice(0, 2)}, size 32
- [`src/features/industry-planner/components/PlannerRail.tsx:88-94`](../../src/features/industry-planner/components/PlannerRail.tsx#L88-L94) — alt={structure.product.name} mono={structure.product.name.slice(0, 2)}, size 112
- [`src/features/industry-planner/components/BlueprintShelves.tsx:31-33`](../../src/features/industry-planner/components/BlueprintShelves.tsx#L31-L33) — mono={blueprint.name.slice(0, 2)}, size 26
- [`src/components/StructureHullTile.tsx:15`](../../src/components/StructureHullTile.tsx#L15) — mono={hullName?.slice(0, 2)}, size 40
- [`src/components/composition/GlobalSearch.tsx:157-167`](../../src/components/composition/GlobalSearch.tsx#L157-L167) — mono={row.iconText ?? row.label.slice(0, 2)}. iconText values are deliberate abbreviations ('BP', tool abbr, '→', wormhole class), and initials() leaves them unchanged
- [`src/components/composition/industry-workspace/AddFacilityRow.tsx:58`](../../src/components/composition/industry-workspace/AddFacilityRow.tsx#L58) — mono="Ra" precomputed; initials('Ra') === 'RA', unchanged
- [`eslint.config.mjs:8-14`](../../eslint.config.mjs#L8-L14) — Bans JSX `style` attributes, which rules out the proposed inline width/height
- [`src/components/character-portrait.tsx:7-18`](../../src/components/character-portrait.tsx#L7-L18) — Precedent: a PortraitSize union keyed into Record<PortraitSize, string> of Tailwind size classes

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/composition/board/sections/AttributesSection.tsx:75`](../../src/components/composition/board/sections/AttributesSection.tsx#L75) — No mono, alt='' gives a '?' fallback; size 22 is supported. Unaffected
- [`src/components/composition/board/sections/SheetHeader.tsx:45`](../../src/components/composition/board/sections/SheetHeader.tsx#L45) — alt={ship.typeName} with no mono; initials(alt) improves it automatically. No call-site change
- [`src/components/type-icon.tsx:61-73`](../../src/components/type-icon.tsx#L61-L73) — The EveImage path already sizes itself via width/height attributes. Only the fallback span is affected

</details>

**Home.** `src/components/type-icon.tsx (existing primitive), using src/lib/format/names.ts:initials`

**Boundary check.** type-icon.tsx is in the components zone (pattern src/components/*.tsx). The rule `components` allows `lib`, so importing @/lib/format/names is legal; it already imports @/lib/eve-image. Consumers keep their existing legal imports of components: features→components (features rule lists components), components-composition→components (allowed), components→components (same zone). No new edges.

**API sketch.**

```ts
export type TypeIconSize = 22 | 26 | 30 | 32 | 40 | 64 | 112;
const FALLBACK_SIZE_CLASS: Record<TypeIconSize, string> = { 22: 'size-icon-lg', 26: 'size-[26px]', 30: 'size-[30px]', 32: 'size-8', 40: 'size-10', 64: 'size-16', 112: 'size-28' };
export function TypeIcon(props: { typeId: number; variant?: TypeIconVariant; size: TypeIconSize; alt?: string; /** Full name the fallback monogram is derived from (initials()). Defaults to alt. */ mono?: string; className?: string }): JSX.Element
// fallback text: initials(mono || alt || '') || '?'
```

**Migration steps.**

1. In type-icon.tsx, add `export type TypeIconSize = 22 | 26 | 30 | 32 | 40 | 64 | 112`, retype FALLBACK_SIZE_CLASS as Record<TypeIconSize, string>, add 30 ('size-[30px]'), delete the unused 88 entry, and drop the `?? FALLBACK_SIZE_CLASS[32]` default (the type now guarantees a key).
2. Change the fallback text to `initials(mono || alt || '') || '?'`, importing initials from @/lib/format/names. The `|| '?'` covers whitespace-only input, where initials() returns ''.
3. Optionally move the fallback span into an exported `TypeIconFallback({ size, mono, alt, className })` that TypeIcon renders when failed, so it can be tested with renderToStaticMarkup. The repo has no DOM test environment to trigger onError.
4. Callers: replace every `mono={x.slice(0, 2)}` with `mono={x}` in NodeCard (170, 195), CockpitRawLedger (63), ComponentDrawer (151), BlueprintSearch (55), BlueprintShelves (33), StructureHullTile (15, as mono={hullName ?? undefined}) and GlobalSearch (164, as mono={row.iconText ?? row.label}). Where alt already equals the name (ComponentDrawer 93-94, PlannerRail 91-92), delete mono and let alt feed the monogram.
5. JobRow.tsx:27: pass mono={headlineName} and drop the initials import, leaving initials() with one consumer, TypeIcon.
6. Leave AddFacilityRow's mono="Ra" as is; it is unchanged under initials().

**Tests.** Extend src/components/type-icon.test.ts. Render the fallback (via an exported TypeIconFallback, or by refactoring the failed branch into a pure helper) and assert: 'Heavy Water' gives 'HW', a single word such as 'Tritanium' gives 'TR', 'BP' and '→' are unchanged, an empty mono and alt give '?', and size 30 uses the size-[30px] class. src/lib/format/names.test.ts already covers initials(). The tsc gate catches any unsupported size literal. Existing guards: type-icon.test.ts (image path); JobsCard.test.ts mocks TypeIcon's mono but asserts nothing on it.

**Notes.** JobRow (initials) is the correct copy, and every slice(0, 2) site has drifted from it. initials() returns the same result as today's slice for single-word names and for every precomputed 2-character mono, so the visible change is limited to multi-word item names. Known edge case in both versions: names with leading punctuation such as "'Moreau' Fortizar" give "'F" (initials) or "'M" (slice). Optionally make initials() skip leading non-letter/digit characters, with a test case in names.test.ts. Typing size as a union also makes the compiler reject future unsupported sizes, which is the real fix for the 30-vs-32 gap. An inline style is not allowed (eslint.config.mjs:8-14), and setting style.setProperty in an effect is overkill for a closed set of sizes.

<sub>Reported by: concern:formatting.</sub>

<a id="p012"></a>

## P012: Derive the linked-character health label once in platform/auth and render admin character portraits with CharacterPortrait

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** about -25/+8 (inline label and two EveImage blocks removed; characters-view.ts folded into scope-health.ts)
- **Depends on:** [P008](#p008)
- **Existing primitive:** `src/components/composition/account/LinkedCharactersCard.tsx:LinkedCharactersCard; src/components/character-portrait.tsx:CharacterPortrait; src/components/ui/row.tsx:EntityRow`

**Problem.** The rule for turning a character's token and scope state into a label has two copies. app/(site)/settings/characters/characters-view.ts:10-31 is canonical and tested, including 'Verification delayed'. admin/users/[userId]/page.tsx:52-55 and 79-83 re-derive it inline and drop the delayed state, so admins cannot see that a character's verification is paused, even though listLinkedCharacters already supplies authorizationDelayed. The admin detail page also renders both portraits (row at 61-71, header at 155-165) with raw EveImage as square rounded-ctl images. Every other page, including the admin users list, uses the round CharacterPortrait.

**Verifier revision.** The health-label duplication and its drift are real. Settings derives the label through deriveCharacterRowView. The admin detail page re-derives it inline as hasRefreshToken ? 'Missing scopes' : 'Disconnected' and never shows 'Verification delayed'. Contrary to the proposal, LinkedCharacter already carries authorizationDelayed (linked-characters.ts:63, populated at 91), so no data change is needed. Admin's square raw-EveImage portraits are drift rather than design: the sibling admin users list (admin/users/page.tsx:70-77) renders the same users with the round CharacterPortrait. The admin users list row is excluded: it renders an AdminUser with a linked name and a role badge, not a linked-character row. A full LinkedCharacterRow component is downgraded to optional. Once the label and portrait converge, the shared JSX is about 10 lines of chips, and the Active/Selected wording still needs a product decision.

**Sites (9).**

- [`src/app/(site)/settings/characters/characters-view.ts:10-31`](../../src/app/%28site%29/settings/characters/characters-view.ts#L10-L31) — Canonical label logic (Verification delayed / Missing scopes / Disconnected)
- [`src/app/(site)/settings/characters/page.tsx:55-99`](../../src/app/%28site%29/settings/characters/page.tsx#L55-L99) — CharacterRow: CharacterPortrait size 28, ID pill, 'Active' chip, health chip from view.healthLabel
- [`src/app/(site)/admin/users/[userId]/page.tsx:39-104`](../../src/app/%28site%29/admin/users/[userId]/page.tsx#L39-L104) — CharacterAdminRow: deriveCharacterHealth at 52-55; inline label at 79-83 (no delayed state); raw EveImage portrait at 61-71; 'Selected' chip at 78
- [`src/app/(site)/admin/users/[userId]/page.tsx:152-166`](../../src/app/%28site%29/admin/users/[userId]/page.tsx#L152-L166) — Header portrait: raw EveImage, 40px, square, preload
- [`src/platform/auth/linked-characters.ts:57-68, 91`](../../src/platform/auth/linked-characters.ts#L57-L68) — LinkedCharacter already has authorizationDelayed, populated by listLinkedCharacters
- [`src/platform/auth/scope-health.ts:41-46`](../../src/platform/auth/scope-health.ts#L41-L46) — deriveCharacterHealth, the natural home for the label derivation
- [`src/components/character-portrait.tsx:7-18, 39-53`](../../src/components/character-portrait.tsx#L7-L18) — PortraitSize lacks 40; always round
- [`src/app/(site)/admin/users/page.tsx:70-77`](../../src/app/%28site%29/admin/users/page.tsx#L70-L77) — The admin users list already uses the round CharacterPortrait at 28 for the same users, so the detail page's square portrait is drift
- [`src/app/(site)/settings/characters/characters-view.test.ts:1-50`](../../src/app/%28site%29/settings/characters/characters-view.test.ts#L1-L50) — Existing tests for all label states, to move with the function

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/(site)/admin/users/page.tsx:52-106`](../../src/app/%28site%29/admin/users/page.tsx#L52-L106) — AdminUserRow renders an AdminUser (linked name, 'Character ID' pill, role badge, role toggle): a different entity and chip set, not a linked-character row
- [`src/components/composition/account/LinkedCharactersCard.tsx:6-24`](../../src/components/composition/account/LinkedCharactersCard.tsx#L6-L24) — Already shared by both pages; no change

</details>

**Home.** `src/platform/auth/scope-health.ts (moved deriveCharacterRowView, renamed deriveLinkedCharacterStatus); existing src/components/character-portrait.tsx (add size 40)`

**Boundary check.** scope-health.ts is in platform/auth and already imports only ./eve-sso in the same zone; the moved function also needs listGrantedScopes from the same file. Consumers settings/characters/page.tsx and admin/users/[userId]/page.tsx are in the app zone, and app allows platform/auth. If the optional chips component is extracted into src/components/composition/account, components-composition→platform/auth is allowed and app→components-composition is allowed. character-portrait.tsx is in components; app→components is allowed.

**API sketch.**

```ts
// src/platform/auth/scope-health.ts
export type LinkedCharacterStatus = { needsReconnect: boolean; healthLabel: string | null; authorizationDelayed: boolean; scopes: GrantedScope[] };
export function deriveLinkedCharacterStatus(character: { scope: string | null; hasRefreshToken: boolean; authorizationDelayed?: boolean }): LinkedCharacterStatus;
// src/components/character-portrait.tsx
export type PortraitSize = 20 | 28 | 32 | 36 | 38 | 40 | 64 | 112 | 160; // 40: 'size-10'
```

**Migration steps.**

1. Move deriveCharacterRowView and its type from app/(site)/settings/characters/characters-view.ts into src/platform/auth/scope-health.ts as deriveLinkedCharacterStatus / LinkedCharacterStatus, unchanged in body. Move characters-view.test.ts's cases into scope-health.test.ts. Delete characters-view.ts and its test.
2. settings/characters/page.tsx: import deriveLinkedCharacterStatus from @/platform/auth/scope-health (line 21) and call it at line 64.
3. admin/users/[userId]/page.tsx CharacterAdminRow: replace deriveCharacterHealth (52-55) and the inline ternary (79-83) with `const status = deriveLinkedCharacterStatus(character)` and render `status.healthLabel` in the orange chip. Admins now also see 'Verification delayed'. Drop the now-unused deriveCharacterHealth import.
4. Add 40: 'size-10' to CharacterPortrait's PortraitSize and SIZE_CLASS. Replace the admin row EveImage (61-71) with <CharacterPortrait characterId={character.characterId} name={character.name} size={28} src={character.portraitUrl} />, and the header EveImage (155-165) with <CharacterPortrait name={targetUser.name} src={targetUser.portraitUrl} size={40} preload />. Drop the EveImage import. Confirm the square-to-round change with design; the admin users list is the precedent.
5. Optional, after product settles 'Active' vs 'Selected': extract LinkedCharacterChips({ characterId, activeLabel, healthLabel, children }) into src/components/composition/account and use it in both rows, with admin passing its 'linked <date>' pill as children.

**Tests.** Move the characters-view.test.ts cases (healthy, Disconnected, Missing scopes, Verification delayed, delayed ignored without a refresh token) into src/platform/auth/scope-health.test.ts against deriveLinkedCharacterStatus. Add an admin-row case if a render test exists. Today only user-detail-view.test.ts covers the admin detail, and it does not render rows, so rely on the moved unit tests. Existing guard: scope-health.test.ts for deriveCharacterHealth.

**Notes.** Settings' deriveCharacterRowView is the correct copy. The admin inline label is drifted because it omits 'Verification delayed', which only applies when hasRefreshToken is true and the health is otherwise fine. The admin page already has the data (LinkedCharacter.authorizationDelayed), so no query change is needed. The admin 'Selected' chip reflects the stored active character (getStoredActiveCharacterId), while settings' 'Active' reflects session.characterId; the wording is a product call, which is why the chips component is optional. Switching the portraits from square to round changes visuals; the admin users list's round portraits make round the consistent choice. EveImage passed loading='lazy' explicitly; CharacterPortrait leaves loading undefined, so next/image's default lazy behaviour is preserved, and the header keeps preload.

<sub>Reported by: area:app-site, concern:ui-patterns.</sub>

<a id="p010"></a>

## P010: Move the security formatter beside the security bands, add SecurityStatus/SystemWithSecurity, and resolve systems by id through one useSystemsById hook

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** about -45/+40: formatter moved (0), 5 inline fragments collapse (-12), new component file (+15), new hook replaces useSystemName's loader (net 0), id finds and 5 dead useSystemSearch mounts removed (-15), SecPill map (+4)
- **Depends on:** —
- **Existing primitive:** `src/data/eve-data/systems-search.ts:formatSec,loadSystems; src/data/eve-data/security.ts:securityStatusTextClass; src/components/composition/board/board-bits.tsx:SystemName`

**Problem.** The security-status display formats in data/eve-data/systems-search.ts (formatSec), while rounding and tone live in security.ts. system-identity and board-bits re-spell the format. The coloured name+security fragment is hand-written in FacilitiesPanel, StructuresManager and ComponentDrawer, and StructureComposer renders it as an uncoloured string in NameField and as a bare span in SystemField. StructureComposer's SecPill re-encodes systemSecurityClass's 0.45/0 thresholds inline and paints null red, where systemSecurityClass(null) is 'high'. Every id lookup mounts its own useSystemSearch (load effect, AbortController ref, parse/suggest callbacks the caller never uses) and linear-scans the whole system list. useSystemName separately has its own loader with a 15s retry that useSystemSearch lacks.

**Verifier revision.** Three things hold up. (1) The same `{name} <span className={securityStatusTextClass(s)}>{formatSec(s)}</span>` markup is hand-written at 3 sites, plus a security-only span at a 4th. (2) roundSecurityStatus(x).toFixed(1) is spelled out again outside the formatter in system-identity and board-bits. (3) Four components plus use-planner-profile mount useSystemSearch only to scan `systems` by id. Several claims need correcting. The bundle-size argument is false: every formatSec importer except systems-search's own source also imports use-system-search, which imports systems-search, and only ComponentDrawer imports formatSec alone. The efficiency claim is weak at realistic sizes: about 8k systems (queries.ts:259-273), at most 50 facilities, and tens of structures cost low single-digit ms per render. The real behavioural drift found is that useSystemSearch never retries a failed load (its catch is empty, lines 63-64), while useSystemName retries every 15s. Id-only consumers such as FacilitiesPanel therefore stay without system names until remount. Moving board-bits SystemName into src/components is rejected: it hides security for wormholes and null, is typed on composition's SystemRef with secClass, and all three of its consumers live in board. Only its inner span should switch to the shared component. Finally, StructureComposer's NameField meta (line 137) is a further site the finders missed: a plain-string 'hull · system sec' with the security uncoloured.

**Sites (17).**

- [`src/data/eve-data/systems-search.ts:16-44`](../../src/data/eve-data/systems-search.ts#L16-L44) — loadSystems keeps only the array (no id map); getLoadedSystems; formatSec at 42-44
- [`src/data/eve-data/security.ts:4-21, 48-53`](../../src/data/eve-data/security.ts#L4-L21) — Canonical thresholds (systemSecurityClass), roundSecurityStatus and securityStatusTextClass (null gives text-muted)
- [`src/components/use-system-search.ts:16-47`](../../src/components/use-system-search.ts#L16-L47) — systemNameFrom linear find; useSystemName loader with SYSTEM_NAME_RETRY_MS retry
- [`src/components/use-system-search.ts:49-94`](../../src/components/use-system-search.ts#L49-L94) — useSystemSearch: one load, empty catch (63-64), no retry; healedRef only repairs through suggest()
- [`src/components/composition/industry-workspace/FacilitiesPanel.tsx:9-11, 67-79, 178-190, 213`](../../src/components/composition/industry-workspace/FacilitiesPanel.tsx#L9-L11) — Inline name+sec span at 74; systemOf linear find per facility row (213) and per add option (184, 188)
- [`src/components/composition/industry-workspace/StructuresManager.tsx:43-54, 73-90, 249-256`](../../src/components/composition/industry-workspace/StructuresManager.tsx#L43-L54) — Lookups.systems array; readoutFor find (52) plus a StructureRow find (74) per row; inline span at 87; useSystemSearch used only for systems (251)
- [`src/features/industry-planner/components/ComponentDrawer.tsx:12-14, 113-131`](../../src/features/industry-planner/components/ComponentDrawer.tsx#L12-L14) — useSystemSearch only for systems; find at 119; inline span at 128
- [`src/features/industry-planner/components/use-planner-profile.ts:61-65, 112-118`](../../src/features/industry-planner/components/use-planner-profile.ts#L61-L65) — securityOf linear find fed to planFacilities; a second useSystemSearch plus a find in useProfileLocation
- [`src/features/custom-structures/components/StructureComposer.tsx:80-82`](../../src/features/custom-structures/components/StructureComposer.tsx#L80-L82) — SecPill: inline >=0.45 / >0 thresholds; null renders red
- [`src/features/custom-structures/components/StructureComposer.tsx:93-111, 131-139`](../../src/features/custom-structures/components/StructureComposer.tsx#L93-L111) — Id find at 95 and 132; NameField meta at 137 is a plain-string `${name} ${formatSec(sec)}` with uncoloured security (drift)
- [`src/features/custom-structures/components/StructureComposer.tsx:425-430, 440`](../../src/features/custom-structures/components/StructureComposer.tsx#L425-L430) — SystemField meta security span; SecPill trailing
- [`src/components/composition/board/board-bits.tsx:21-34`](../../src/components/composition/board/board-bits.tsx#L21-L34) — SystemName re-spells roundSecurityStatus(...).toFixed(1); shows security only when not wormhole and not null
- [`src/data/eve-data/system-identity.ts:104-115`](../../src/data/eve-data/system-identity.ts#L104-L115) — roundSecurityStatus(security).toFixed(1) re-spelled for the classification label
- [`src/mapper/signatures/scanner-leads-control.tsx:6-10, 101-109, 228`](../../src/mapper/signatures/scanner-leads-control.tsx#L6-L10) — formatSec consumer (null gives '' by caller choice); uses systems for prefix search, not id lookup
- [`src/data/eve-data/queries.ts:259-273`](../../src/data/eve-data/queries.ts#L259-L273) — The index is the full eveSolarSystems table (about 8k rows), sorted by name
- [`src/data/eve-data/schema.ts:242`](../../src/data/eve-data/schema.ts#L242) — security_status is nullable, so the null case for SecPill and SecurityStatus is reachable
- [`src/data/eve-data/universe-assets-client.ts:71-80`](../../src/data/eve-data/universe-assets-client.ts#L71-L80) — Precedent: systemById Map built once at load

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/composition/board/board-bits.tsx:21-34`](../../src/components/composition/board/board-bits.tsx#L21-L34) — Relocating SystemName is rejected: different semantics (hides wormhole and null security, name in text-name, inline-flex gap), typed on SystemRef.secClass, and all consumers (PilotRail:90, ClonesSection:57, SheetHeader:40) are in board. Only its inner span adopts SecurityStatus
- [`src/components/composition/board/sections/CharacterIdentity.tsx:73`](../../src/components/composition/board/sections/CharacterIdentity.tsx#L73) — Character security status: a different scale with no CCP rounding
- [`src/composition/jump-resolver/resolver.ts:145-152`](../../src/composition/jump-resolver/resolver.ts#L145-L152) — Server-side linear find over SystemDirectoryAsset (a different dataset and runtime); a separate lead, not this client index
- [`src/features/custom-structures/components/StructureComposer.tsx:103, 109`](../../src/features/custom-structures/components/StructureComposer.tsx#L103) — Name-based lookups (suggest names to entries, case-insensitive exact name) have one consumer and search semantics; they stay on the systems array
- [`src/mapper/authoring/HomePrompt.tsx:31, 41`](../../src/mapper/authoring/HomePrompt.tsx#L31) — Uses parse/suggest and useSystemName. Only useSystemName's internals change
- [`src/mapper/authoring/NodeAddMenu.tsx:38`](../../src/mapper/authoring/NodeAddMenu.tsx#L38) — parse/suggest only; unaffected

</details>

**Home.** `src/data/eve-data/security.ts (formatSecurityStatus); src/components/security-status.tsx (SecurityStatus, SystemWithSecurity); src/data/eve-data/systems-search.ts (getLoadedSystemsById) plus src/components/use-system-search.ts (useSystemsById)`

**Boundary check.** security.ts and systems-search.ts are in the data zone (autoDiscover src/data). Importers: components (security-status.tsx, use-system-search.ts), allowed by rule components→data; components-composition (FacilitiesPanel, StructuresManager, board-bits), allowed (data in its allow list); features (ComponentDrawer, StructureComposer, use-planner-profile), allowed; mapper (scanner-leads-control), allowed (mapper→data); data→data/eve-data (system-identity, systems-search), allowed. security-status.tsx matches the components pattern src/components/*.tsx and imports only data plus ui (cn), both allowed for components. Its consumers are components-composition, features, mapper and app, which all list `components` in their allow rules. use-system-search.ts stays in components, importing data and platform/search, both allowed.

**API sketch.**

```ts
// src/data/eve-data/security.ts
export function formatSecurityStatus(sec: number | null): string; // '—' for null, roundSecurityStatus(sec).toFixed(1)
// src/components/security-status.tsx
export function SecurityStatus({ security, className }: { security: number | null; className?: string }): JSX.Element; // <span className={cn(securityStatusTextClass(security), className)}>{formatSecurityStatus(security)}</span>
export function SystemWithSecurity({ system }: { system: { name: string; security: number | null } }): JSX.Element; // <>{system.name} <SecurityStatus security={system.security} /></>
// src/data/eve-data/systems-search.ts
export function getLoadedSystemsById(): ReadonlyMap<number, SystemSearchEntry> | null; // built once when loadSystems succeeds
// src/components/use-system-search.ts
export function useSystemsById(enabled?: boolean): ReadonlyMap<number, SystemSearchEntry> | null; // useSystemName's load + 15s retry policy
export function useSystemName(systemId: number | null): string | null; // useSystemsById(systemId !== null)?.get(systemId)?.name ?? null
```

**Migration steps.**

1. Formatter first: add formatSecurityStatus to security.ts, with the same body as formatSec. Delete formatSec from systems-search.ts and use the new function in systemsSource (line 83). Repoint FacilitiesPanel:11, StructuresManager:15, ComponentDrawer:14, StructureComposer:25 and scanner-leads-control:8. Use it in system-identity.ts:112 and board-bits.tsx:29 (both non-null branches). Move the formatSec cases from systems-search.test.ts (describe 'formatSec', around lines 52-59) into security.test.ts.
2. Add src/components/security-status.tsx with SecurityStatus and SystemWithSecurity. Replace the inline fragments at FacilitiesPanel:74, StructuresManager:87 and ComponentDrawer:128 with <SystemWithSecurity system={system} />, and StructureComposer:429 with <SecurityStatus security={s.security} />. Change StructureComposer:137 meta to JSX: hull, then ' · ' and <SystemWithSecurity>. That colours the security, matching every other site; flag it as a visible change. In board-bits.tsx:28-30, swap the inner span for <SecurityStatus security={security} /> and keep the showSecurity gate.
3. SecPill (StructureComposer:80-82): keep the pill and derive its tone from systemSecurityClass(security, null) through a local Record<SecurityClass, PillTone> ({ high: 'green', low: 'orange', null: 'red', wormhole: 'red' }), with an explicit `security === null` branch. Product must pick the null tone; 'neutral' is recommended, since today's red and systemSecurityClass's 'high' (green) are both wrong for an unknown value.
4. In systems-search.ts, build `loadedById = new Map(systems.map((s) => [s.id, s]))` alongside loadedIndex when loadSystems succeeds, and export getLoadedSystemsById(). The failure path already resets indexPromise, so a retry rebuilds the map.
5. In use-system-search.ts, lift useSystemName's effect into useSystemsById(enabled = true) (initial state from getLoadedSystemsById(); retry every SYSTEM_NAME_RETRY_MS on failure). Re-express useSystemName on top of it. Replace systemNameFrom with a map lookup and update use-system-search.test.ts.
6. Replace the id finds: FacilitiesPanel 178-181 (systemOf becomes byId?.get); StructuresManager, where Lookups.systems becomes systemById: ReadonlyMap | null (lines 45, 52, 74, 251-254); ComponentDrawer 115-119; use-planner-profile 61-65 (securityOf now depends on the map) and 112-114, dropping useSystemSearch from that file; StructureComposer 95 and 132, where NameField takes systemById instead of systems. StructureComposer keeps useSystemSearch for suggest and name lookups.

**Tests.** security.test.ts: formatSecurityStatus cases moved from systems-search.test.ts (0.9 to '0.9', -0.99 to '-1.0', 0.04 to '0.1', null to '—'). New src/components/security-status.test.ts using renderToStaticMarkup: the tone class from securityStatusTextClass, plus '—' with text-muted for null. systems-search.test.ts: extend the existing retry test ('retries after a failed load ... fills the snapshot on success') to assert getLoadedSystemsById is null before the load and resolves ids after it. use-system-search.test.ts: replace the systemNameFrom cases with map-lookup cases. StructureComposer.test.ts: SecPill tone for 0.5, 0.3, -0.2 and null. Existing guards: FacilitiesPanel.test.ts, StructuresManager.test.ts, system-identity.test.ts, HomeBoardView.test.ts.

**Notes.** Correct copies: formatSec's null handling ('—') and securityStatusTextClass's null-to-text-muted are canonical. scanner-leads-control intentionally shows '' for null and keeps its own guard. SecPill matches systemSecurityClass for every non-null value (>=0.45 high, >0 low), so the only drift is null, which is reachable because schema.ts:242 is nullable. board-bits SystemName deliberately hides security for wormhole systems; keep that. The new hook gives id-only consumers useSystemName's retry, fixing the missing-retry drift in useSystemSearch. Keep the map at module level so its identity is stable and the memo deps in StructuresManager.useLookups and use-planner-profile do not churn. The perf gain is minor (about 8k-entry scans times rows per render); the payoff is unified loading and retry plus simpler call sites. P011 builds on SystemWithSecurity.

<sub>Reported by: area:components-composition, area:data-eve, area:industry-planner, area:ui-components, concern:client-hooks, concern:efficiency, concern:formatting, concern:ui-patterns.</sub>

<a id="p011"></a>

## P011: Reuse FacilitySubline in StructureRow, share the placeholder tile, export the structure source groups, and build facility keys with facilityKey

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -30/+18
- **Depends on:** [P010](#p010)
- **Existing primitive:** `src/features/industry-planner/profiles/profile-document.ts:facilityKey; src/components/StructureHullTile.tsx:StructureHullTile`

**Problem.** The industry workspace re-implements small pieces it already has. StructureRow's subline (StructuresManager:82-90) duplicates FacilitySubline (FacilitiesPanel:67-79). FacilitiesPanel's NPC tile (48-53) copies StructureHullTile's '?' frame (StructureHullTile:6-11). AddFacilityRow.PICKER_GROUPS (28-31) and facilityOptionGroups (144-145) each define the source-to-label pairs. Keys are hand-built at AddFacilityRow:52 and facilities-model:136/141/149/152, while the `taken` set they are tested against comes from facilityKey (FacilitiesPanel:225 via facilityViews, facilities-model:42), so a format change in facilityKey would silently break de-duplication. FacilityTile and facilityKind also look up the same view's hull name twice.

**Verifier revision.** Four parts survive. (1) StructuresManager.StructureRow hand-writes the same subline that FacilitiesPanel already factors into FacilitySubline (identical classes and structure, only the kind string differs), so this bypasses a local primitive. (2) FacilitiesPanel's NPC tile copies StructureHullTile's 40px placeholder frame exactly, with only the label and text size changed. (3) The 'Corporation structures'/'Your structures' to source pairing is defined twice. (4) Five structure:/station: keys are hand-built although facilityKey exists and already produces the `taken` set they are checked against. Three parts are rejected. A FacilityIdentity 'single grid child' would break StructuresManager's rowGrid template areas, where the tile spans two rows on sm and the readout spans the full width on phones; FacilityHeader uses a different 3-column grid with a phone-only third line. A hull Map gains nothing: getStructureTypes returns about 15 published industry hulls. AddFacilityRow's StationTile (a 20px in-button chip with border-active and no background) and the dashed '+' label are different visuals, not copies.

**Sites (8).**

- [`src/components/composition/industry-workspace/StructuresManager.tsx:40-41, 56-98`](../../src/components/composition/industry-workspace/StructuresManager.tsx#L40-L41) — rowGrid template areas; StructureRow subline at 82-90 is FacilitySubline inlined (kind = hull?.name ?? 'Structure')
- [`src/components/composition/industry-workspace/FacilitiesPanel.tsx:45-64`](../../src/components/composition/industry-workspace/FacilitiesPanel.tsx#L45-L64) — FacilityTile NPC tile copies StructureHullTile's frame (text-micro tracking-copy instead of text-nav); hull found twice per view (56, 63)
- [`src/components/composition/industry-workspace/FacilitiesPanel.tsx:66-79, 93-101, 182-190`](../../src/components/composition/industry-workspace/FacilitiesPanel.tsx#L66-L79) — FacilitySubline, the local primitive; FacilityHeader grid; describe() reuses FacilitySubline for picks
- [`src/components/StructureHullTile.tsx:4-16`](../../src/components/StructureHullTile.tsx#L4-L16) — Placeholder frame: grid size-10 shrink-0 place-items-center rounded-ctl border border-border bg-bg-deep/60 font-display font-bold text-muted
- [`src/components/composition/industry-workspace/AddFacilityRow.tsx:28-31, 52, 70-71`](../../src/components/composition/industry-workspace/AddFacilityRow.tsx#L28-L31) — PICKER_GROUPS duplicates the group labels; hand-built `structure:${s.id}` key
- [`src/components/composition/industry-workspace/facilities-model.ts:35-51, 128-156`](../../src/components/composition/industry-workspace/facilities-model.ts#L35-L51) — facilityViews keys via facilityKey (42); facilityOptionGroups hand-builds keys at 136, 141, 149, 152; labels at 144-145
- [`src/features/industry-planner/profiles/profile-document.ts:47-49`](../../src/features/industry-planner/profiles/profile-document.ts#L47-L49) — facilityKey({kind, id}) with string ids; stationFacility already stores String(station.id) (facilities-model:91)
- [`src/features/custom-structures/components/StructureComposer.tsx:131-139`](../../src/features/custom-structures/components/StructureComposer.tsx#L131-L139) — A fourth 'hull · system sec' subline, as a string. Handled in P010 via SystemWithSecurity because features cannot import components-composition

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/composition/industry-workspace/AddFacilityRow.tsx:17-26`](../../src/components/composition/industry-workspace/AddFacilityRow.tsx#L17-L26) — StationTile is a 20px in-button chip (h-5 min-w-5, border-border-active, no background), a different visual from the 40px placeholder tile
- [`src/components/composition/industry-workspace/AddFacilityRow.tsx:124-130`](../../src/components/composition/industry-workspace/AddFacilityRow.tsx#L124-L130) — The '+' tile is a dashed <label> with cursor-text, not a placeholder copy
- [`src/components/composition/industry-workspace/StructuresManager.tsx:129, 150, 271`](../../src/components/composition/industry-workspace/StructuresManager.tsx#L129) — Hull finds over about 15 structure types (queries.ts getStructureTypes, 343-375); no efficiency case for a Map
- [`src/components/composition/industry-workspace/FacilitiesPanel.tsx:93-101`](../../src/components/composition/industry-workspace/FacilitiesPanel.tsx#L93-L101) — FacilityIdentity grid-child unification rejected: this 3-column grid differs from StructuresManager's rowGrid template areas (40-41)

</details>

**Home.** `src/components/composition/industry-workspace/facility-subline.tsx (FacilitySubline, moved out of FacilitiesPanel); src/components/StructureHullTile.tsx (PlaceholderTile); src/components/composition/industry-workspace/facilities-model.ts (STRUCTURE_SOURCE_GROUPS); existing facilityKey in profile-document.ts`

**Boundary check.** facility-subline.tsx and facilities-model.ts are in components-composition (src/components/composition/**). Their consumers FacilitiesPanel, StructuresManager and AddFacilityRow are in the same zone, which is legal. FacilitySubline imports SystemWithSecurity from src/components (P010), allowed by components-composition→components. PlaceholderTile stays in the components zone (src/components/*.tsx) and imports nothing new. FacilitiesPanel→components is allowed, and features (StructureComposer) may also import components. facilityKey is in features/industry-planner, and components-composition→features is allowed; facilities-model.ts:8 and FacilitiesPanel.tsx:18 already import it.

**API sketch.**

```ts
// facility-subline.tsx
export function FacilitySubline({ kind, system }: { kind: string; system: { name: string; security: number | null } | null }): JSX.Element;
// StructureHullTile.tsx
export function PlaceholderTile({ label, className }: { label: string; className?: string }): JSX.Element; // shared 40px frame; StructureHullTile renders <PlaceholderTile label="?" className="text-nav" />
// facilities-model.ts
export const STRUCTURE_SOURCE_GROUPS = [
  { label: 'Corporation structures', source: 'corp' },
  { label: 'Your structures', source: 'custom' },
] as const satisfies readonly { label: string; source: AvailableStructure['source'] }[];
```

**Migration steps.**

1. After P010 lands SystemWithSecurity: move FacilitySubline from FacilitiesPanel.tsx:66-79 into facility-subline.tsx, rendering `{kind}{system ? <>{' · '}<SystemWithSecurity system={system} /></> : null}` inside the existing truncate span. Import it in FacilitiesPanel. In StructuresManager.StructureRow, replace lines 82-90 with <FacilitySubline kind={hull?.name ?? 'Structure'} system={system} />.
2. In StructureHullTile.tsx, extract the frame classes into an exported PlaceholderTile({label, className}). StructureHullTile's null branch becomes <PlaceholderTile label="?" className="text-nav" />. FacilitiesPanel's FacilityTile station branch becomes <PlaceholderTile label="NPC" className="text-micro tracking-copy" />, keeping today's typography.
3. In FacilitiesPanel, compute the hull name once per view, e.g. a local hullNameOf(view, hulls), and pass it to both FacilityTile and facilityKind instead of two finds (56, 63).
4. Export STRUCTURE_SOURCE_GROUPS from facilities-model.ts. Build the first two groups of facilityOptionGroups by mapping it, keeping 'NPC stations' as the third group. Delete AddFacilityRow.PICKER_GROUPS and iterate the import at line 70.
5. Replace hand-built keys with facilityKey: facilities-model 136 and 141 become facilityKey({ kind: 'structure', id: structure.id }); 149 and 152 become facilityKey({ kind: 'station', id: String(station.id) }); AddFacilityRow:52 becomes facilityKey({ kind: 'structure', id: s.id }).

**Tests.** Existing guards: facilities-model.test.ts already asserts the group labels (around 83-98) and key strings (taken: 'structure:s1', 'station:60003760', 126-128), so it protects the key and group refactor unchanged. AddFacilityRow.test.ts, FacilitiesPanel.test.ts and StructuresManager.test.ts cover the rendered rows. Add a PlaceholderTile case to src/components/StructureHullTile.test.ts (renders the label, no image URL) and keep the existing '>?</span>' assertion. Add a StructuresManager.test.ts assertion that a row's subline shows 'Hull · System 0.9' with the sec tone class.

**Notes.** Preserve the typography differences. The NPC label uses text-micro tracking-copy and the '?' uses text-nav, so pass them via className rather than forcing one size. StructureRow's kind fallback is 'Structure', while facilityKind also yields 'NPC station' and 'No longer available'; FacilitySubline only takes the string. Keep the missing-structure grayscale wrapper in FacilityHeader (94) outside the tile. String(station.id) is required because facilityKey's id is a string (profile-document.ts:30), and it matches stationFacility's stored id (facilities-model.ts:91). StructureComposer's 'hull · system' meta cannot use FacilitySubline (features cannot import components-composition), which is why P010 puts SystemWithSecurity in src/components.

<sub>Reported by: area:components-composition.</sub>

<a id="p183"></a>

## P183: Derive owned-structure security classes through getSystemFacts

- **Status:** [ ] not started
- **Category:** server-pipeline · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -18 / +4 (SecPill step about +4 / -1)
- **Depends on:** [P010](#p010)
- **Existing primitive:** `src/data/eve-data/character-facts.ts:getSystemFacts`

**Problem.** saveCorpStructures re-implements system-security lookup by querying eve_solar_systems directly and mapping rows through systemSecurityClass, instead of calling the existing getSystemFacts in data/eve-data, which does exactly that. StructureComposer's SecPill also repeats the high/low thresholds inline. It renders unknown security as a red pill, while the same component renders it muted elsewhere.

**Verifier revision.** The core holds. deriveSecurityClasses in owned-structures/queries.ts is the only module outside data/eve-data that selects eveSolarSystems. It repeats getSystemFacts exactly: same three columns plus name, the same empty-ids guard, the same systemSecurityClass call. The fallback for a missing system is the same as today, because getSystemFacts omits unknown ids and the caller already falls back to systemSecurityClass(null, null). The merged SecPill part is narrower than stated. The 0.45 and >0 thresholds match systemSecurityClass. The null drift is real but almost unreachable: SDE systems always carry a security status. The correct reference for null is not systemSecurityClass, whose null maps to 'high' as a storage default. It is securityStatusTextClass, used in the same component at line 429, which maps null to muted. Keep SecPill as an optional low-priority step.

**Sites (7).**

- [`src/features/owned-structures/queries.ts:61-82`](../../src/features/owned-structures/queries.ts#L61-L82) — deriveSecurityClasses: direct eveSolarSystems select, systemSecurityClass mapping, fallback systemSecurityClass(null, null)
- [`src/features/owned-structures/queries.ts:90-101`](../../src/features/owned-structures/queries.ts#L90-L101) — the only consumer: saveCorpStructures reads securityByStructure with the same fallback
- [`src/data/eve-data/character-facts.ts:24-44`](../../src/data/eve-data/character-facts.ts#L24-L44) — getSystemFacts: same query and guard, returns secClass
- [`src/composition/board/name-book.ts:1-6, 22-29`](../../src/composition/board/name-book.ts#L1-L6) — existing consumer of getSystemFacts
- [`src/data/eve-data/security.ts:4-15, 48-53`](../../src/data/eve-data/security.ts#L4-L15) — systemSecurityClass (null maps to 'high', a storage default); securityStatusTextClass (null maps to 'text-muted', the display default)
- [`src/features/custom-structures/components/StructureComposer.tsx:80-82`](../../src/features/custom-structures/components/StructureComposer.tsx#L80-L82) — SecPill inline thresholds; null maps to red
- [`src/features/custom-structures/components/StructureComposer.tsx:429`](../../src/features/custom-structures/components/StructureComposer.tsx#L429) — the same component renders null security muted via securityStatusTextClass

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/industry-planner/structure-factors.ts:39-42`](../../src/features/industry-planner/structure-factors.ts#L39-L42) — already calls systemSecurityClass on a security number it already holds; no query to replace
- [`src/composition/jump-resolver/resolver.ts:171`](../../src/composition/jump-resolver/resolver.ts#L171) — uses systemSecurityClass on facts already loaded; a different concept (wormhole test)

</details>

**Home.** `Existing primitive: src/data/eve-data/character-facts.ts:getSystemFacts (zone data/eve-data). For the optional SecPill step: src/data/eve-data/security.ts:systemSecurityClass.`

**Boundary check.** features/owned-structures imports data/eve-data, allowed by the features rule ("data"); it already imports @/data/eve-data/schema and @/data/eve-data/security. features/custom-structures already imports @/data/eve-data/security. No new zone edges.

**API sketch.**

```ts
getSystemFacts(ids: number[]): Promise<Map<number, SystemFacts>> // existing; in saveCorpStructures: const facts = await getSystemFacts([...new Set(rows.map(r => r.system_id))]); securityClass: facts.get(r.system_id)?.secClass ?? systemSecurityClass(null, null)
```

**Migration steps.**

1. In src/features/owned-structures/queries.ts, delete deriveSecurityClasses (61-82). In saveCorpStructures, call getSystemFacts on the unique system ids and set securityClass from `facts.get(r.system_id)?.secClass ?? systemSecurityClass(null, null)`.
2. Remove the eveSolarSystems import. Keep inArray, which listCorpStructureSyncStates and getCorpStructureRigs still use.
3. Optional: in StructureComposer.tsx, replace SecPill's ternary with `security === null ? 'neutral' : SEC_TONE[systemSecurityClass(security, null)]`, where `SEC_TONE: Record<SecurityClass, PillTone> = { high: 'green', low: 'orange', null: 'red', wormhole: 'red' }`. Null now renders neutral, matching the muted rendering at line 429.

**Tests.** Add a case to src/features/owned-structures/queries.db.test.ts (the harness already includes eve_solar_systems). Seed a 0.3 system, a wormhole system (wormhole_class_id 3) and an unseeded system id; call saveCorpStructures; assert 'low', 'wormhole', 'high'. Today no test asserts the derived class. src/data/eve-data/character-facts.db.test.ts already guards getSystemFacts. For the optional SecPill step, add a StructureComposer render test for the 0.5, 0.2, -0.4 and null tones.

**Notes.** Semantics match exactly: same thresholds, same unknown-system fallback ('high'), same empty-input short-circuit (no DB call). getSystemFacts selects one extra column (name), which costs nothing. getSystemFacts lives in character-facts.ts, an odd home; moving it to a system-facts module is optional and not required. On the SecPill drift: the merged finding implies systemSecurityClass is the canonical rule for null. For display it is not. The canonical display rule for null is securityStatusTextClass's muted, so the correct pill tone for null is 'neutral', not 'green' and not 'red'.

<sub>Reported by: area:features-owned, dupes-triage-2.</sub>

<a id="p003"></a>

## P003: Share the focus-board rail, grids and view-model helpers between the home board and the industry workspace

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** About +80 (focus-rail.tsx, focusedView, backAction, tests) and about -120 (PilotRail, MemberRail, AddCharacter, the two details, models, grids). Net about -40.
- **Depends on:** [P018](wave-07-ui-kit-primitives-src-components-ui.md#p018)
- **Existing primitive:** `src/components/composition/board/use-focus-view.ts:useFocusView; src/components/composition/board/board-motion:pilotTransitionName; src/components/character-portrait.tsx:CharacterPortrait`

**Problem.** The industry profile workspace re-implements the home board's focus layout:
- PortraitRail nav strip: identical class string in both rails.
- Rail entry: same Button layout, ViewTransition(pilotTransitionName) + CharacterPortrait className, and truncating name span.
- Add tile: same dashed '+' disc.
- '← All …' back button and the overview/sheet grid constants.
- View-model helpers: memberView copies boardViewFrom's id parse and membership check, and profileHref hard-codes the 'character' query key that board-view-model keeps private as CHARACTER_PARAM.

Two copies have already drifted. BoardSkeleton's rail column is 240px against the live 17rem, so the skeleton jumps on load. The URL key is duplicated as a bare string literal in a sibling module.

**Verifier revision.** The copy-adapt is real: MemberRail's own doc comment says it mirrors the pilot rail. The nav strip classes are identical (PilotRail:29 = MemberRail:129). The rail-entry Button, ViewTransition portrait and name span repeat, as does the dashed '+' disc. The '← All …' button is duplicated, and the overview and sheet grid strings are repeated. Two drifts are real:
- BoardSkeleton uses lg:grid-cols-[240px…] while the live board and WorkspaceSkeleton use 17rem, so the board skeleton is 32px narrower than what it stands in for.
- profileHref deletes the literal 'character' while CHARACTER_PARAM is private in board-view-model, and use-focus-view writes the param through boardViewHref. Renaming the param would silently break profile switching.

memberView re-implements boardViewFrom's /^\d+$/ parse and membership check. The scope changes in three ways. (1) The new focus-board/ folder and the moves of use-focus-view and board-motion are dropped. Board and workspace share one zone, industry-workspace already imports board internals legitimately (useBoardLive, CharacterIdentity, StatFigure), and the motion CSS names are board-* in HomeBoardView.css, so the move adds churn with no boundary gain. (2) RailSkeleton is dropped. The two skeletons have different contents (main portrait and pilot names vs profile selector and member lines); only the grid constant should be shared. (3) BackToOverview becomes a ui class constant, because a third copy exists in features (PlannerRail '← Back to search' Link) and features cannot import components-composition.

**Sites (13).**

- [`src/components/composition/board/PilotRail.tsx:27-30, 49-76`](../../src/components/composition/board/PilotRail.tsx#L27-L30) — Nav strip class; RailPilot Button, ViewTransition portrait, name span (main/row variants)
- [`src/components/composition/industry-workspace/MemberRail.tsx:22-44, 66-80, 127-130`](../../src/components/composition/industry-workspace/MemberRail.tsx#L22-L44) — RailButton (same layout + dimmed when unlinked); AddMember dashed disc + Menu trigger classes; identical nav strip
- [`src/components/composition/board/AddCharacter.tsx:13-31`](../../src/components/composition/board/AddCharacter.tsx#L13-L31) — Dashed '+' disc (size-12 lg:max-xl:size-14 xl:size-16 ≡ MemberRail's size-12 lg:size-14 xl:size-16)
- [`src/components/composition/board/HomeBoardView.tsx:18, 56, 88, 104-107`](../../src/components/composition/board/HomeBoardView.tsx#L18) — SHEET_GRID and the overview grid string
- [`src/components/composition/industry-workspace/ProfileWorkspace.tsx:110-111, 151-152, 159, 178`](../../src/components/composition/industry-workspace/ProfileWorkspace.tsx#L110-L111) — OVERVIEW_GRID/SHEET_GRID copies (with scroll-mt-28 folded in); memberView resolver into useFocusView
- [`src/components/composition/board/CharacterDetail.tsx:44-55`](../../src/components/composition/board/CharacterDetail.tsx#L44-L55) — '← All characters' bare Button className
- [`src/components/composition/industry-workspace/MemberDetail.tsx:174-182`](../../src/components/composition/industry-workspace/MemberDetail.tsx#L174-L182) — Same className + self-start, '← All members'
- [`src/features/industry-planner/components/PlannerRail.tsx:64-70`](../../src/features/industry-planner/components/PlannerRail.tsx#L64-L70) — Third copy of the back affordance as a Link (features zone)
- [`src/components/composition/board/board-view-model.ts:154-173, 192-203`](../../src/components/composition/board/board-view-model.ts#L154-L173) — BoardView/OVERVIEW, private CHARACTER_PARAM, boardViewFrom (lone-pilot rule + parse), boardViewHref (strips '=' on empty values), characterParam
- [`src/components/composition/industry-workspace/workspace-model.ts:8, 41-55`](../../src/components/composition/industry-workspace/workspace-model.ts#L8) — memberView duplicates the parse; profileHref deletes literal 'character'
- [`src/components/composition/board/use-focus-view.ts:14, 25-31, 51-54`](../../src/components/composition/board/use-focus-view.ts#L14) — Writes and reads the focus param via boardViewHref/characterParam, the canonical owner of the key
- [`src/components/composition/board/BoardSkeleton.tsx:9`](../../src/components/composition/board/BoardSkeleton.tsx#L9) — lg:grid-cols-[240px_minmax(0,1fr)], which drifts from the live 17rem
- [`src/components/composition/industry-workspace/WorkspaceStates.tsx:12`](../../src/components/composition/industry-workspace/WorkspaceStates.tsx#L12) — 17rem (correct)

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/composition/board/use-focus-view.ts:1-126`](../../src/components/composition/board/use-focus-view.ts#L1-L126) — Already the shared hook and already imported by industry-workspace; moving it to a new folder is churn with no boundary benefit
- [`src/components/composition/board/board-motion.ts:1-23`](../../src/components/composition/board/board-motion.ts#L1-L23) — Already shared; its board-* transition names are tied to HomeBoardView.css. Keep in place
- [`src/components/composition/board/BoardSkeleton.tsx:10-32`](../../src/components/composition/board/BoardSkeleton.tsx#L10-L32) — Placeholder contents differ from WorkspaceSkeleton 13-31 (main portrait/pilot names vs profile selector/two-line members). Share only the grid constant, not a RailSkeleton
- [`src/components/composition/board/AddCharacter.tsx:19, 26`](../../src/components/composition/board/AddCharacter.tsx#L19) — 'column' placement is home-board-only; keep it local

</details>

**Home.** `New src/components/composition/board/focus-rail.tsx (PortraitRail, RailEntry, RailAddDisc, railAddTrigger, FOCUS_OVERVIEW_GRID, FOCUS_SHEET_GRID). focusedView goes in the existing src/components/composition/board/board-view-model.ts. backAction is a class constant in src/components/ui/button.tsx.`

**Boundary check.** focus-rail.tsx lives in the components-composition zone (src/components/composition/**). It imports:
- components (CharacterPortrait): the components-composition rule allows 'components'.
- ui (Button, cn, Pill): allows 'ui'.

Its consumers, board/* and industry-workspace/*, are in the same zone, so intra-zone imports need no rule. board-view-model.ts is already imported by workspace-model.ts (same zone).

backAction lives in the ui zone (rule allow: []; a plain string, no imports). Consumers: components-composition (CharacterDetail, MemberDetail), whose rule allows 'ui', and features (PlannerRail), whose rule allows 'ui'.

**API sketch.**

```ts
// board/focus-rail.tsx
export const FOCUS_OVERVIEW_GRID = 'grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-x-10';
export const FOCUS_SHEET_GRID = 'grid gap-x-10 gap-y-6 xl:grid-cols-[280px_minmax(0,1fr)]';
export function PortraitRail(p: { label: string; children: ReactNode }): JSX.Element; // the <nav> strip
export function RailEntry(p: {
  characterId: number; name: string; portraitUrl?: string;
  main?: boolean;            // 112px + lg:text-h3 vs 64px + lg:text-nav
  dimmed?: boolean;          // opacity-50 grayscale on the portrait
  tileAttribute: 'data-pilot-id' | 'data-member-id';
  ariaLabel?: string;
  nameAccessory?: ReactNode; // PilotRail's StatusDot
  onSelect: (characterId: number) => void;
  children?: ReactNode;      // the lg-only detail lines
}): JSX.Element;
export function RailAddDisc(): JSX.Element; // aria-hidden dashed '+' disc + <span className="max-lg:sr-only">Add character</span>
export const railAddTrigger: string;       // shared trigger classes for AddCharacter(rail) Button and AddMember Menu trigger
// board-view-model.ts
export function focusedView(param: string | null, has: (characterId: number) => boolean): BoardView;
// ui/button.tsx
export const backAction = 'inline-flex items-center gap-2 self-start rounded-ctl py-1 font-data text-ui text-muted hover:text-isk';
```

**Migration steps.**

1. In board-view-model.ts, add focusedView(param, has), which holds the /^\d+$/ parse plus the membership check. Rewrite boardViewFrom as the lone-pilot rule + focusedView(param, id => characters.some(...)).
2. In workspace-model.ts, change memberView to doc === null ? OVERVIEW : focusedView(param, id => doc.members.some(m => m.characterId === id)). Rewrite profileHref to set or delete 'profile' on URLSearchParams(search), then return boardViewHref(pathname, params.toString(), OVERVIEW). This deletes the 'character' literal.
3. Create board/focus-rail.tsx with the grid constants, PortraitRail, RailEntry, RailAddDisc and railAddTrigger, taken verbatim from PilotRail and AddCharacter (PilotRail is the source of truth).
4. PilotRail: use PortraitRail plus RailEntry, passing main, tileAttribute='data-pilot-id', nameAccessory=StatusDot and children for the training, health, system and reconnect lines. AddCharacter (rail placement) uses RailAddDisc and railAddTrigger.
5. MemberRail: use PortraitRail plus RailEntry, passing dimmed={!member.linked}, tileAttribute='data-member-id', ariaLabel and children for roleLine and the Not linked pill. AddMember's Menu trigger uses RailAddDisc and triggerClassName={railAddTrigger}.
6. HomeBoardView, ProfileWorkspace, BoardSkeleton and WorkspaceSkeleton: replace the grid strings with FOCUS_OVERVIEW_GRID / FOCUS_SHEET_GRID (+ 'scroll-mt-28' where used). This fixes BoardSkeleton's 240px.
7. Add backAction to ui/button.tsx. Use it in CharacterDetail 49-50, MemberDetail 178-179 and PlannerRail 67, which keeps mb-2 and no-underline as extras.
8. Delete the now-unused local constants and inline class strings.

**Tests.** Existing guards:
- board-view-model.test.ts covers boardViewFrom (lone pilot, bad ids, '') and boardViewHref/characterParam.
- workspace-model.test.ts:121-131 pins profileHref dropping character and keeping from=nav, plus the memberView cases. It must pass unchanged.
- HomeBoardView.test.ts covers data-pilot-id ordering and 'Add character' after the pilots; HomeBoardView.focus.test.ts covers focus restore via [data-pilot-id=…].
- ProfileWorkspace.test.ts covers data-member-id.
- e2e/home-board.spec.ts uses [data-pilot-id].

Add focusedView unit cases to board-view-model.test.ts. Add a focus-rail render test (renderToStaticMarkup) checking that RailEntry emits the tileAttribute and the dimmed classes, and that PortraitRail has its aria-label. Add a test that profileHref follows the focus key. One way is a characterParam(new URLSearchParams(profileHref(...).split('?')[1])) === null assertion.

**Notes.** Preserve the ViewTransition contract. The motion comment says every part the transition animates must be a direct child of the persistent container. RailEntry keeps ViewTransition inside the Button exactly as today, and PortraitRail must not wrap the rail in an extra element inside the OVERVIEW_MOTION ViewTransition.

Preserve tileAttribute names exactly: useFocusView restores focus with querySelector([attr="id"]), and e2e depends on data-pilot-id.

boardViewHref strips '=' from empty-valued params while profileHref did not. Routing profileHref through it only rewrites unrelated empty params, which is harmless, and the existing test still passes.

The main-pilot portrait is 112px only at xl (max-lg:size-12 lg:max-xl:size-14). BoardSkeleton's lg:size-28 main placeholder is a further small drift; fix it while touching the file.

If P002 lands first, RailEntry's sibling files import readoutSurface/SectionPanel from @/components/ui/section-panel.

<sub>Reported by: area:components-composition, concern:ui-patterns.</sub>

<a id="p005"></a>

## P005: Extract a ui ActionForm (plus a client ConfirmActionForm) for hidden-field POST buttons and fix the disabled-reason drift

- **Status:** [ ] not started
- **Category:** ui-component · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** About -150 across the 8 sites (3 'use client' files lose useId and the confirm blocks; RetryJobForm and the local statics ActionForm are deleted) and about +70 for the two ui files. Net about -80 before tests.
- **Depends on:** —
- **Existing primitive:** `src/components/ui/button.tsx:Button; src/components/ui/confirm-dialog.tsx:ConfirmDialog`

**Problem.** Eight components each render <form method=POST action=...>, hand-typed <input type=hidden> fields and one submit Button. The disabled-state explanation has drifted. AdminForceLogoutForm and AdminReassignCharacterForm link an sr-only reason through aria-describedby, which is correct and tested in admin-disabled-reasons.test.ts. UnlinkCharacterForm, AdminUnlinkCharacterForm and RoleToggleForm rely on title alone, which a screen reader does not announce for a disabled button and which never appears on touch. Three admin copies repeat the same window.confirm onSubmit block. The ui-adoption census has to list every one of these files under hiddenInputs, and five of them under disabledControlTitles.

**Verifier revision.** The core holds. All 8 census-pinned files build the same POST-form-plus-hidden-fields-plus-Button shell, and the accessibility drift is real: UnlinkCharacterForm, AdminUnlinkCharacterForm and RoleToggleForm explain the disabled state only through title, while AdminForceLogout and AdminReassign pair it with sr-only text and aria-describedby. Fallow's near-duplicate list also pairs AdminForceLogoutForm 6-44 with AdminReassignCharacterForm 6-51. Five things change. (1) The open useId question is settled: node_modules/react/cjs/react.react-server.development.js:841 (and next/dist/compiled/react ...:871) exports useId, so a ui ActionForm with no 'use client' can call it from Server Components. No id prop is needed. (2) The statics site is a local function already named ActionForm (lines 40-64). It uses Button's default md size and primary or danger variants, so the primitive needs variant and size props and the statics page must pass size='md'. (3) Drop the z.input<typeof schema> typing. With zod 4.5.4, z.coerce.number() has input type unknown, so that typing would not catch a missing key. A render-and-parse contract test is stronger. (4) The confirm variant should be a thin 'use client' wrapper that passes onSubmit to the shared ActionForm. The three admin wrappers can then lose 'use client' and useId. (5) A ninth candidate exists: LocalSyntheticPilotControl is a POST form with a Button and no hidden fields. Migrating it is optional.

**Sites (16).**

- [`src/components/composition/account/SwitchCharacterForm.tsx:3-12`](../../src/components/composition/account/SwitchCharacterForm.tsx#L3-L12) — Server component; hidden characterId; secondary sm whitespace-nowrap
- [`src/components/composition/account/UnlinkCharacterForm.tsx:3-25`](../../src/components/composition/account/UnlinkCharacterForm.tsx#L3-L25) — Server component; disabled reason through title only (drifted)
- [`src/components/composition/account/RoleToggleForm.tsx:5-36`](../../src/components/composition/account/RoleToggleForm.tsx#L5-L36) — Server component; q added only when currentQuery is truthy (22-24); title only (drifted); no whitespace-nowrap
- [`src/components/composition/account/AdminUnlinkCharacterForm.tsx:5-40`](../../src/components/composition/account/AdminUnlinkCharacterForm.tsx#L5-L40) — 'use client' only for the window.confirm onSubmit; title only (drifted)
- [`src/components/composition/account/AdminForceLogoutForm.tsx:6-44`](../../src/components/composition/account/AdminForceLogoutForm.tsx#L6-L44) — 'use client'; window.confirm; useId + sr-only + aria-describedby (correct). The sr-only span renders even when enabled; title text lacks the trailing period
- [`src/components/composition/account/AdminReassignCharacterForm.tsx:6-51`](../../src/components/composition/account/AdminReassignCharacterForm.tsx#L6-L51) — 'use client'; window.confirm; sr-only + aria-describedby (correct); className text-isk
- [`src/app/(site)/admin/queue/RetryJobForm.tsx:3-12`](../../src/app/%28site%29/admin/queue/RetryJobForm.tsx#L3-L12) — Same shell; method='post'; text-isk; no nowrap. Its only caller is QueueCards.tsx:61
- [`src/app/(site)/admin/statics/page.tsx:40-64`](../../src/app/%28site%29/admin/statics/page.tsx#L40-L64) — Local function already named ActionForm; optional snapshotId; default md size; variants primary, secondary and danger. Used at 239-256 and 308
- [`src/components/composition/LocalSyntheticPilotControl.tsx:9-18`](../../src/components/composition/LocalSyntheticPilotControl.tsx#L9-L18) — Same POST shell with no hidden fields (ghost sm). Optional adopter
- [`src/platform/auth/api-contract.ts:65-92`](../../src/platform/auth/api-contract.ts#L65-L92) — switch, unlink, adminRole, adminUnlink, adminReassign and adminRevokeSessions form schemas whose keys the hidden inputs must match
- [`src/data/wh-statics/api-contract.ts:4-17`](../../src/data/wh-statics/api-contract.ts#L4-L17) — whStaticsAdminFormSchema (action plus optional snapshotId) for the statics forms
- [`src/data/esi-refresh-jobs/api-contract.ts:18-20`](../../src/data/esi-refresh-jobs/api-contract.ts#L18-L20) — retryEsiRefreshJobFormSchema {jobId}
- [`src/composition/__tests__/ui-adoption-registry.ts:14-36`](../../src/composition/__tests__/ui-adoption-registry.ts#L14-L36) — hiddenInputs (8 files) and disabledControlTitles (5 files); both drop to []
- [`src/esi-datasets/ui-adoption.test.ts:9,62-75`](../../src/esi-datasets/ui-adoption.test.ts#L9) — The census skips the 'ui' directory, so moving the shell into ui empties both lists. The regexes become zero-ratchets
- [`src/components/composition/account/admin-disabled-reasons.test.ts:1-44`](../../src/components/composition/account/admin-disabled-reasons.test.ts#L1-L44) — Guards the correct sr-only plus aria-describedby markup; must keep passing
- [`src/app/(site)/admin/users/[userId]/page.tsx:88-99,202-206`](../../src/app/%28site%29/admin/users/[userId]/page.tsx#L88-L99) — Server-page callers of the three admin forms; they pass only serializable props

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/(site)/admin/users/page.tsx:150`](../../src/app/%28site%29/admin/users/page.tsx#L150) — A GET search form with a visible input, not an action button
- [`src/components/composition/account/AccountDangerZone.tsx:157-332`](../../src/components/composition/account/AccountDangerZone.tsx#L157-L332) — Uses apiFetch with ConfirmDialog, not a form POST. Different mechanism; it is only the model for the ConfirmDialog follow-up

</details>

**Home.** `src/components/ui/action-form.tsx (ActionForm, no directive) and src/components/ui/confirm-action-form.tsx ('use client' ConfirmActionForm)`

**Boundary check.** Home zone is ui, which may import nothing outside ui (rule 'ui -> []'). ActionForm needs only ./button and ./cn, and ConfirmActionForm needs only ./action-form, all inside ui. Consumer zones: components-composition (account forms) allows 'ui'; app (RetryJobForm/QueueCards, statics page) allows 'ui'; components (LocalSyntheticPilotControl, optional) allows 'ui'. The zod schemas stay in platform/auth and data. The contract tests that import them live in components-composition, which allows platform/auth, and in app, which allows platform/auth and data.

**API sketch.**

```ts
type ActionFormFields = Readonly<Record<string, string | number | undefined>>;
export function ActionForm(props: {
  action: string;
  fields?: ActionFormFields;            // undefined values are skipped
  children: ReactNode;                  // button label
  variant?: StyledButtonProps['variant']; // default 'secondary'
  size?: StyledButtonProps['size'];       // default 'sm'
  className?: string;                   // forwarded to Button (whitespace-nowrap, text-isk)
  disabled?: boolean;
  disabledReason?: string;              // rendered only when disabled: title + aria-describedby + <span id class="sr-only">
  onSubmit?: FormEventHandler<HTMLFormElement>; // only from client wrappers
}): JSX.Element  // uses useId() (legal in RSC)

'use client'
export function ConfirmActionForm(props: Omit<ActionFormProps, 'onSubmit'> & { confirm: string }) {
  return <ActionForm {...rest} onSubmit={(e) => { if (!window.confirm(confirm)) e.preventDefault(); }} />;
}
```

**Migration steps.**

1. Have docs-researcher confirm the React 19.2 rule that Server Components may call useId. The react-server build exports it (node_modules/react/cjs/react.react-server.development.js:841).
2. Add src/components/ui/action-form.tsx. Render <form method="post" action onSubmit> and one <input type="hidden"> per defined field, in key order. Render <Button type="submit" variant size className disabled aria-describedby={reason ? id : undefined} title={reason}>, plus <span id className="sr-only">{reason}</span> only when disabled && disabledReason.
3. Add src/components/ui/confirm-action-form.tsx ('use client'), which wraps ActionForm and supplies the window.confirm onSubmit.
4. Add src/components/ui/action-form.test.ts (renderToStaticMarkup) and confirm-action-form.test.ts. For the confirm test, use vi.stubGlobal('confirm') and call the rendered form element's onSubmit prop with a fake event; preventDefault must be called only when confirm returns false.
5. Migrate the server wrappers. SwitchCharacterForm becomes ActionForm action='/api/account/active-character' fields={{characterId}} className='whitespace-nowrap'. UnlinkCharacterForm passes disabledReason="You can't unlink your only character". RoleToggleForm passes fields={{userId, nextRole, q: currentQuery || undefined}}, keeping the truthy check so an empty q is still omitted, plus disabled={view.isSelf} and disabledReason.
6. Migrate the three admin forms to ConfirmActionForm with the same confirm strings and reasons. Remove 'use client' and useId from AdminUnlink, AdminForceLogout and AdminReassign; ConfirmActionForm is now the client boundary. Keep AdminReassign's className 'text-isk whitespace-nowrap'.
7. In src/app/(site)/admin/statics/page.tsx, delete the local ActionForm (40-64). Call the ui ActionForm with action='/api/admin/wh-statics' fields={{action, snapshotId}} size='md' and the current variants and disabled values, at 239-256 and 308.
8. Inline RetryJobForm into QueueCards.tsx:61 as <ActionForm action='/api/admin/esi-jobs/retry' fields={{jobId: row.id}} className='text-isk'>Retry</ActionForm> and delete RetryJobForm.tsx. Keeping it as a two-line wrapper is also fine.
9. Optional: give LocalSyntheticPilotControl ActionForm with variant='ghost'.
10. In the same commit, set uiAdoptionRegistry.hiddenInputs and disabledControlTitles to [] so the census pins zero outside ui.
11. Add a form-contract test. For each account wrapper, render it, collect the hidden name and value pairs, and parse them with the matching platform/auth schema. Do the same for statics and retry with the data schemas in an app-side test. This ties the field names to the schemas.
12. Follow-up (F356), not part of this change: swap ConfirmActionForm's window.confirm for ConfirmDialog plus form.requestSubmit().

**Tests.** New: src/components/ui/action-form.test.ts covers hidden-input order, skipped undefined values, the sr-only reason and aria-describedby only when disabled, and no span when enabled. New: confirm-action-form.test.ts covers preventDefault when confirm returns false. New: form-contract tests that parse the rendered hidden fields through switchCharacterFormSchema, unlinkCharacterFormSchema, adminRoleFormSchema, adminUnlinkFormSchema, adminReassignFormSchema, adminRevokeSessionsFormSchema, whStaticsAdminFormSchema and retryEsiRefreshJobFormSchema. Extend admin-disabled-reasons.test.ts to UnlinkCharacterForm, AdminUnlinkCharacterForm and RoleToggleForm, which now gain the sr-only reason. Existing guards: admin-disabled-reasons.test.ts (exact `<span id=... class="sr-only">` match), src/esi-datasets/ui-adoption.test.ts (census), and the route.test.ts for each endpoint under src/app/api/{account,admin}.

**Notes.** Behavior to preserve: (a) RoleToggleForm omits q when currentQuery is '' (a truthy check), so pass currentQuery || undefined. (b) Button classes differ per site: whitespace-nowrap on 5 sites, text-isk on AdminReassign and Retry, statics on md size. Forward them through className and size rather than baking them in. (c) AdminForceLogout's title has no trailing period but its sr-only text does; a single disabledReason string unifies them (the test checks the period version). (d) AdminForceLogout always renders its sr-only span; the primitive renders it only when disabled. This is harmless because aria-describedby is set only when disabled. (e) Keep title alongside aria-describedby for mouse hover. aria-describedby takes precedence for the accessible description, so nothing is announced twice. (f) The method attribute changes case from POST to post; HTML treats them the same. The correct copies are AdminForceLogoutForm and AdminReassignCharacterForm. The window.confirm to ConfirmDialog swap stays a follow-up, because ConfirmDialog needs client state and requestSubmit.

<sub>Reported by: area:components-composition, concern:ui-patterns.</sub>

<a id="p062"></a>

## P062: Share one StatusLevel tone module between EveStatusPanel and admin, keeping each surface's plain colour

- **Status:** [ ] not started
- **Category:** css-styling · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -25 / +20 (net about -5 prod lines plus a small test)
- **Depends on:** —
- **Existing primitive:** `src/app/(site)/admin/status-tone.ts:LEVEL_VALUE_CLASS`

**Problem.** EveStatusPanel.LEVEL_CLASS and admin status-tone.LEVEL_VALUE_CLASS duplicate the StatusLevel→severity text mapping in two zones. A future change to the amber or red treatment would have to be made twice. The differing green entry is intentional (each surface's plain value colour) and must be preserved.

**Verifier revision.** The two maps encode the same concept: StatusLevel to severity text class, with amber, red and neutral identical. The copy exists because components-composition cannot import app. The claimed green drift is not a bug, though. EveStatusPanel leaves green unclassed so it inherits PopoverRow's value colour (text-text, #b3bdc8), consistent with every other popover row. Admin surfaces have no base value colour, so their plain value is text-name (#f3f6fa). Choosing one green, as proposed, would visibly change one surface. Revised design: share the severity classes and let each surface pass its plain colour. LEVEL_DOT_TONE moves with them to keep the StatusLevel presentation in one module. Payoff is low (a 4-entry map, 2 consumers), but it is a real second consumer split across a boundary.

**Sites (10).**

- [`src/components/composition/EveStatusPanel.tsx:6-12, 21`](../../src/components/composition/EveStatusPanel.tsx#L6-L12) — LEVEL_CLASS; green undefined so it inherits PopoverRow's text-text
- [`src/app/(site)/admin/status-tone.ts:1-17`](../../src/app/%28site%29/admin/status-tone.ts#L1-L17) — LEVEL_DOT_TONE and LEVEL_VALUE_CLASS (green 'text-name')
- [`src/components/ui/popover.tsx:125-130`](../../src/components/ui/popover.tsx#L125-L130) — PopoverRow value span is 'text-text', the inherited plain colour
- [`src/app/(site)/admin/StatusLines.tsx:4, 9, 14`](../../src/app/%28site%29/admin/StatusLines.tsx#L4) — LEVEL_DOT_TONE and LEVEL_VALUE_CLASS via cn; no base colour, so text-name is the plain value
- [`src/app/(site)/admin/esi/EsiCards.tsx:26, 49`](../../src/app/%28site%29/admin/esi/EsiCards.tsx#L26) — LEVEL_VALUE_CLASS via cn
- [`src/app/(site)/admin/health/ServiceLevelRows.tsx:17, 230-232`](../../src/app/%28site%29/admin/health/ServiceLevelRows.tsx#L17) — LEVEL_DOT_TONE; LEVEL_VALUE_CLASS via template string
- [`src/app/(site)/admin/AdminOverviewCards.tsx:16, 23`](../../src/app/%28site%29/admin/AdminOverviewCards.tsx#L16) — LEVEL_DOT_TONE
- [`src/app/(site)/admin/health/StatusRow.tsx:6, 25`](../../src/app/%28site%29/admin/health/StatusRow.tsx#L6) — LEVEL_DOT_TONE
- [`src/app/(site)/page-coverage.test.ts:93, 188-189`](../../src/app/%28site%29/page-coverage.test.ts#L93) — imports both constants for coverage
- [`src/data/telemetry/health-metrics.ts:38`](../../src/data/telemetry/health-metrics.ts#L38) — StatusLevel union

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/ui/tones.ts:36-45`](../../src/components/ui/tones.ts#L36-L45) — toneTextClass uses a different palette (dps-mid #ffaa22, dps-high #ff5555, isk) from tone-orange #d68c3d and tone-red #dd4444; reusing it would change colours
- [`src/features/wormhole-sites/components/wormhole-styles.ts:56-61`](../../src/features/wormhole-sites/components/wormhole-styles.ts#L56-L61) — EWAR_TONE, which fallow paired with status-tone, is an unrelated EWAR→ChipTone map

</details>

**Home.** `src/components/status-level-tone.ts`

**Boundary check.** The home is in zone components (pattern src/components/*.ts). The components rule allows 'data' (type StatusLevel from src/data/telemetry/health-metrics) and 'ui' (type DotTone from src/components/ui/dot or ui/tones). Consumers: src/components/composition/EveStatusPanel.tsx (zone components-composition, whose allow list includes 'components') and src/app/(site)/admin/** plus page-coverage.test.ts (zone app, whose allow list includes 'components'). The current home in app is unreachable from components-composition, which is why the copy exists.

**API sketch.**

```ts
export const LEVEL_DOT_TONE: Record<StatusLevel, DotTone>;
/** Severity text class; green returns the surface's plain colour. */
export function statusValueClass(level: StatusLevel, plain = ''): string; // amber 'text-tone-orange', red 'text-tone-red', neutral 'text-muted', green plain
```

**Migration steps.**

1. Create src/components/status-level-tone.ts: move LEVEL_DOT_TONE verbatim and add statusValueClass(level, plain = '').
2. EveStatusPanel.tsx: delete LEVEL_CLASS and the StatusLevel import; use `className={statusValueClass(row.level) || undefined}` (or just the string; an empty class is harmless).
3. Admin value sites pass the admin plain colour: StatusLines.tsx:14 and EsiCards.tsx:49 `cn(..., statusValueClass(level, 'text-name'))`; ServiceLevelRows.tsx:232 `${statusValueClass(row.level, 'text-name')}`.
4. Repoint LEVEL_DOT_TONE imports in AdminOverviewCards.tsx:16, StatusLines.tsx:4, health/StatusRow.tsx:6 and health/ServiceLevelRows.tsx:17 to '@/components/status-level-tone'.
5. Delete src/app/(site)/admin/status-tone.ts and update page-coverage.test.ts:93,188-189 (move the coverage import to src/components/coverage.test.ts if that file enumerates components modules).

**Tests.** Add src/components/status-level-tone.test.ts. Assert statusValueClass returns '' for green with no plain argument, 'text-name' for green with 'text-name', and the fixed classes for amber, red and neutral regardless of plain; assert LEVEL_DOT_TONE covers all four levels. Existing admin render tests (StatusLines and ServiceLevelRows tests, if present) and page-coverage.test.ts guard the imports.

**Notes.** Neither copy is wrong. Green differs because each surface's plain value colour differs (popover text-text inherited; admin text-name explicit), so do NOT unify green; pass it per surface. cn is tailwind-merge with the repo's font-size groups, so 'text-name' and 'text-tone-red' never both apply via cn. ServiceLevelRows uses a template string, which is safe because statusValueClass returns exactly one colour class.

<sub>Reported by: area:components-composition.</sub>

<a id="p067"></a>

## P067: Add signOutAndLeave(target) and startEveSignIn(callbackURL) in platform/auth; migrate the four finally-style sign-outs and three EVE sign-ins

- **Status:** [ ] not started
- **Category:** client-data · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -20 lines at the call sites, +12 in platform/auth, plus about 40 lines of new tests
- **Depends on:** —
- **Existing primitive:** `src/platform/auth/reload-document-home.ts:reloadDocumentHome,forgetSignedInBrowser; src/platform/auth/link-character.ts:startCharacterLink; src/lib/eve-provider.ts:EVE_PROVIDER_ID`

**Problem.** Four sign-out controls hand-write `authClient.signOut().finally(...)`, followed by forgetting the browser's signed-in hint and doing a full navigation: the account menu, the flat LoginButton, log-out-everywhere and the revoke redirect. Two of them inline forgetSignedInBrowser plus `window.location.href = target`, because reloadDocumentHome only goes to '/'. Leaving out the forget step would start the reloaded shell in the signed-in layout. EVE sign-in is built by hand as `authClient.signIn.oauth2({ providerId: 'eve', callbackURL })` in EveSignInButton, PlannerRail and the command palette, and startCharacterLink also uses the literal 'eve' instead of EVE_PROVIDER_ID.

**Verifier revision.** Four sign-out sites share one exact sequence: signOut().finally(forget the browser, then full navigation to a target). AccountDangerZone and RevokeRedirectLightbox inline forgetSignedInBrowser plus `location.href = target` only because reloadDocumentHome is hard-wired to '/'. EVE sign-in is hand-built three times, and startCharacterLink also uses the literal 'eve', although lib/eve-provider exports EVE_PROVIDER_ID for client use (eve-sso.ts is a server-only root). Revision: the command palette's success-only sign-out is not accidental drift. commands-source.test.ts asserts 'navigates home only after sign-out succeeds', 'stays put when sign-out returns an error' and 'stays put when sign-out rejects'. Folding it into the `.finally` primitive would silently reverse tested behaviour. It already uses the shared navigation half (reloadDocumentHome), so it stays as is unless the owner explicitly chooses one policy.

**Sites (10).**

- [`src/components/composition/account/account-menu-items.tsx:9-20`](../../src/components/composition/account/account-menu-items.tsx#L9-L20) — signOut().finally(reloadDocumentHome)
- [`src/components/composition/account/LoginButton.tsx:25-54`](../../src/components/composition/account/LoginButton.tsx#L25-L54) — EveSignInButton: oauth2 with literal 'eve' at 36, no catch
- [`src/components/composition/account/LoginButton.tsx:84-95`](../../src/components/composition/account/LoginButton.tsx#L84-L95) — flat Log out: signOut().finally(() => reloadDocumentHome())
- [`src/components/composition/account/AccountDangerZone.tsx:224-235`](../../src/components/composition/account/AccountDangerZone.tsx#L224-L235) — log-out-everywhere: signOut().finally(forget + location.href = target)
- [`src/components/composition/account/RevokeRedirectLightbox.tsx:17-24`](../../src/components/composition/account/RevokeRedirectLightbox.tsx#L17-L24) — same sequence to EVE_AUTHORIZED_APPS_URL
- [`src/features/industry-planner/components/PlannerRail.tsx:114-122`](../../src/features/industry-planner/components/PlannerRail.tsx#L114-L122) — 'Create a profile': hand-built oauth2 with literal 'eve' to PROFILES_HREF
- [`src/composition/search/commands-source.ts:90-101`](../../src/composition/search/commands-source.ts#L90-L101) — palette sign-in: literal 'eve', with .catch (tested: 'navigates nowhere when sign-in rejects')
- [`src/platform/auth/reload-document-home.ts:1-20`](../../src/platform/auth/reload-document-home.ts#L1-L20) — forgetSignedInBrowser + reloadDocumentHome('/') with the relative-assign lint suppression
- [`src/platform/auth/link-character.ts:3-9`](../../src/platform/auth/link-character.ts#L3-L9) — startCharacterLink: the model to follow; literal 'eve'
- [`src/lib/eve-provider.ts:1-2`](../../src/lib/eve-provider.ts#L1-L2) — EVE_PROVIDER_ID, the client-safe home (eve-sso.ts is in server-only-boundary SERVER_ROOTS)

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/composition/search/commands-source.ts:73-89`](../../src/composition/search/commands-source.ts#L73-L89) — Palette 'Log out' navigates only when signOut returns no error and stays put on rejection. This is deliberate and pinned by commands-source.test.ts:82-111. It already uses reloadDocumentHome; do not switch it to .finally without an explicit decision

</details>

**Home.** `src/platform/auth/reload-document-home.ts (signOutAndLeave, with reloadDocumentHome generalised to a target) and src/platform/auth/link-character.ts (startEveSignIn)`

**Boundary check.** platform/auth: rule `from platform/auth allow [platform/esi, platform/purge, data, transport, db, lib, config]`. The helpers import ./auth-client (same zone) and @/lib/eve-provider (lib), both legal. Consumers: components-composition account/* (`allow [..., platform/auth, ...]`), composition/search/commands-source.ts (`from composition allow [..., platform/auth, ...]`), and features/industry-planner PlannerRail (`from features allow [platform/auth, ...]`).

**API sketch.**

```ts
// platform/auth/reload-document-home.ts
export function reloadDocumentHome(target: string = '/'): void // forgetSignedInBrowser(); window.location.href = target (single lint suppression stays here)
export function signOutAndLeave(target: string = '/'): void // void authClient.signOut().finally(() => reloadDocumentHome(target))
// platform/auth/link-character.ts
export function startEveSignIn(callbackURL: string = '/'): void // void authClient.signIn.oauth2({ providerId: EVE_PROVIDER_ID, callbackURL }).catch(() => {})
export function startCharacterLink(callbackURL = '/settings/characters'): void // providerId: EVE_PROVIDER_ID
```

**Migration steps.**

1. reload-document-home.ts: give reloadDocumentHome an optional `target = '/'` and add signOutAndLeave(target), which imports authClient from './auth-client'. Check that the `@next/next/no-location-assign-relative-destination` suppression is still needed once the value is a parameter. If the rule no longer fires, remove the directive rather than leave an unused one.
2. link-character.ts: import EVE_PROVIDER_ID from '@/lib/eve-provider', not eve-sso, which is server-only. Use it in startCharacterLink and add startEveSignIn with an internal .catch, which keeps commands-source's 'navigates nowhere when sign-in rejects'.
3. Sign-outs: account-menu-items.tsx:14 → `signOutAndLeave()`; LoginButton.tsx:87-91 → `signOutAndLeave()`; AccountDangerZone.tsx:231-234 → `signOutAndLeave(target)`; RevokeRedirectLightbox.tsx:20-23 → `signOutAndLeave(EVE_AUTHORIZED_APPS_URL)`.
4. Sign-ins: LoginButton.tsx:36 → `startEveSignIn(callbackURL)`; PlannerRail.tsx:119 → `startEveSignIn(PROFILES_HREF)`; commands-source.ts:97-98 → `startEveSignIn('/')`.
5. Leave commands-source.ts:79-86 on its tested success-only branch.
6. Remove now-unused authClient imports. forgetSignedInBrowser then has no consumer outside its own file; with ignoreExportsUsedInFile false, Fallow will flag the export, so un-export it.

**Tests.** Add src/platform/auth/reload-document-home.test.ts: signOutAndLeave forgets the hint and navigates to the target after a resolved and after a rejected signOut, and the default target is '/'. Add startEveSignIn tests (provider id from EVE_PROVIDER_ID, callback passthrough, a rejection is swallowed) beside link-character. Existing guard: commands-source.test.ts:82-125 must stay green. Its expectation `{ providerId: 'eve', callbackURL: '/' }` still holds because EVE_PROVIDER_ID === 'eve'. MapMenu.test.ts:61-62 and MapChromeVariants.test.ts mock auth-client and link-character; they keep working because the menu never calls startEveSignIn.

**Notes.** Policy note for the owner: two user-initiated 'Log out' paths (menu, flat LoginButton) navigate unconditionally, and the palette navigates only on success. Neither surfaces an error. The danger-zone and revoke flows must navigate unconditionally, because the server has already ended the sessions and signOut may fail benignly, so the primitive uses .finally. Whether the palette should match the menu is a product decision that requires rewriting commands-source.test.ts:93-111. EveSignInButton and PlannerRail currently `void` the oauth2 promise without a catch. Adding the catch inside startEveSignIn only removes a possible unhandled rejection; navigation is unchanged.

<sub>Reported by: area:components-composition, area:composition.</sub>

<a id="p271"></a>

## P271: Route the industry and site detail pages through buildPageMetadata (with a route-image mode) and loadNumericRouteEntity

- **Status:** [ ] not started
- **Category:** feature-skeleton · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** About -50 removed across five pages and the OG image, about +12 in page-metadata.ts and its test; net about -38.
- **Depends on:** [P247](wave-06-config-env-ids-and-shared-domain-vocabularies.md#p247)
- **Existing primitive:** `src/lib/page-metadata.ts:buildPageMetadata; src/transport/route-id.ts:loadNumericRouteEntity`

**Problem.** buildPageMetadata keeps title, description, canonical, Open Graph and Twitter aligned for 7 pages. The four industry pages and sites/[id] hand-roll Metadata, and the copies have drifted:
- jobs and planner have no openGraph or twitter, so they inherit og:url pointing at the home page and the generic 'LGI.tools' title.
- The industry landing's og:description describes the Planner, and its twitter block is inherited.
- The industry pages use /logo.png instead of the default card.
- sites/[id] cannot use the builder, because the builder hard-codes /opengraph-image, which would mask the route's own opengraph-image.tsx.

loadNumericRouteEntity already exists and is used by both generateMetadata functions. The page bodies and the site OG image still re-implement parse, notFound, load, notFound. Both detail pages also rebuild the same Home breadcrumb root with SITE_URL.

**Verifier revision.** Confirmed with real drift, and the Next merge rules make it worse than the finder said. Next merges metadata shallowly (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md:1344-1436), so industry/jobs and industry/planner inherit the root layout's openGraph and twitter. That gives og:url = SITE_URL (the home page), og:title 'LGI.tools' and the default description. scripts/verify-seo-metadata.py:81-82 treats an inherited 'LGI.tools' og:title as a failure, but these routes are not in PAGE_TITLES, so nothing catches it. The industry landing's og:description is the Planner copy, its twitter block is inherited ('LGI.tools'), and it and industry/[id] use /logo.png, while the house check (verify-seo-metadata.py:89-92) expects the 1200x630 /opengraph-image. The design is revised:
- Use one `socialImage: 'default' | 'route'` option. The P040 ogTitle option is not needed, because the builder's og:title = title convention is what the other 7 pages ship.
- resolve-metadata.js:137-158 applies a segment's file-based opengraph-image only when the page's openGraph/twitter has no own 'images' key. 'route' must therefore omit the key, not set it to undefined.
- The 'redundant cache()' claim is softened to an inconsistency: both loaders are 'use cache', but React cache() still dedupes per request. It is optional cleanup.
- Added a drift: on a miss, industry/[id] generateMetadata returns {} while sites/[id] calls notFound().

**Sites (14).**

- [`src/lib/page-metadata.ts:3-41`](../../src/lib/page-metadata.ts#L3-L41) — Existing builder; images hard-coded to /opengraph-image for openGraph and twitter.
- [`src/app/(site)/industry/page.tsx:10-23`](../../src/app/%28site%29/industry/page.tsx#L10-L23) — Hand-rolled. og:title 'Industry Planner — LGI.tools' does not match the title; og:description is the Planner copy; /logo.png; no twitter, so it inherits root 'LGI.tools'.
- [`src/app/(site)/industry/jobs/page.tsx:6-10`](../../src/app/%28site%29/industry/jobs/page.tsx#L6-L10) — No openGraph or twitter, so it inherits root og:url=SITE_URL and og:title 'LGI.tools'.
- [`src/app/(site)/industry/planner/page.tsx:6-10`](../../src/app/%28site%29/industry/planner/page.tsx#L6-L10) — Same inheritance bug as jobs.
- [`src/app/(site)/industry/[id]/page.tsx:21-52`](../../src/app/%28site%29/industry/[id]/page.tsx#L21-L52) — Hand-rolled; /logo.png in og and twitter; returns {} on a miss.
- [`src/app/(site)/industry/[id]/page.tsx:75-89`](../../src/app/%28site%29/industry/[id]/page.tsx#L75-L89) — Manual parseNumericRouteId, notFound, getBlueprintStructure, notFound; Home breadcrumb root.
- [`src/app/(site)/sites/[id]/page.tsx:22`](../../src/app/%28site%29/sites/[id]/page.tsx#L22) — cache(getPricedSiteDetail), while getPricedSiteDetail is already 'use cache' (src/features/wormhole-sites/queries.ts:395-398). The industry route does not wrap getBlueprintStructure (queries.ts:113-118), so the two are inconsistent.
- [`src/app/(site)/sites/[id]/page.tsx:29-57`](../../src/app/%28site%29/sites/[id]/page.tsx#L29-L57) — Hand-rolled; omits images on purpose so the segment's opengraph-image.tsx applies; calls notFound() on a miss.
- [`src/app/(site)/sites/[id]/page.tsx:126-138`](../../src/app/%28site%29/sites/[id]/page.tsx#L126-L138) — Manual parse and load; Home breadcrumb root.
- [`src/app/(site)/sites/[id]/opengraph-image.tsx:13-18`](../../src/app/%28site%29/sites/[id]/opengraph-image.tsx#L13-L18) — Manual parse, notFound, getPricedSiteDetail, notFound.
- [`src/transport/route-id.ts:1-16`](../../src/transport/route-id.ts#L1-L16) — parseNumericRouteId and loadNumericRouteEntity (returns null for a bad id or a missing entity).
- [`src/lib/structured-data.ts:1-12`](../../src/lib/structured-data.ts#L1-L12) — buildBreadcrumbList; both callers prepend { name: 'Home', url: `${SITE_URL}/` }.
- [`src/app/layout.tsx:40-60`](../../src/app/layout.tsx#L40-L60) — Root openGraph {title 'LGI.tools', url SITE_URL} and twitter that pages without their own blocks inherit; metadataBase makes relative canonicals absolute.
- [`scripts/verify-seo-metadata.py:21-27, 72-93, 128-130`](../../scripts/verify-seo-metadata.py#L21-L27) — House contract: aligned copy, no inherited root og:title, default 1200x630 card. Industry list pages are missing from PAGE_TITLES.

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/(site)/preview/primitives/page.tsx:10-13`](../../src/app/%28site%29/preview/primitives/page.tsx#L10-L13) — noindex preview pages, so social metadata is irrelevant (the same applies to preview/cards:8 and preview/widgets:9-12).
- [`src/app/not-found.tsx:4-7`](../../src/app/not-found.tsx#L4-L7) — noindex, follow:false.
- [`src/proxy.ts:5-13`](../../src/proxy.ts#L5-L13) — Uses parseNumericRouteId only, with no entity load; not the parse-and-load pattern.

</details>

**Home.** `src/lib/page-metadata.ts (extend buildPageMetadata); src/transport/route-id.ts (existing loadNumericRouteEntity); src/lib/structured-data.ts (optional Home-rooted breadcrumb)`

**Boundary check.** All consumers are in the app zone (src/app/(site)/**). The app rule allows 'lib' and 'transport', so buildPageMetadata, buildBreadcrumbList and loadNumericRouteEntity are legal imports. If buildBreadcrumbList starts prepending Home with SITE_URL, src/lib/structured-data.ts imports src/config/site-url.ts, which the rule {from: lib, allow: [config]} permits. No new zone is touched.

**API sketch.**

```ts
export type PageMetadataInput = {
  title: string;
  description: string;
  canonical: string;
  absoluteTitle?: boolean;
  /** 'default' (the default): the root 1200x630 card. 'route': omit the images keys entirely so the segment's opengraph-image file applies. */
  socialImage?: 'default' | 'route';
};
export function buildPageMetadata(input: PageMetadataInput): Metadata;

// optional
export function buildBreadcrumbList(trail: readonly { name: string; path: string }[]): object; // prepends Home, resolves paths against SITE_URL
```

**Migration steps.**

1. Extend buildPageMetadata with socialImage. For 'route', build the openGraph and twitter objects WITHOUT an images property (do not write images: undefined, because resolve-metadata.js:138 and :149 check hasOwnProperty('images')). Add cases to src/lib/page-metadata.test.ts.
2. sites/[id]/page.tsx: generateMetadata returns buildPageMetadata({ ...deriveSiteMeta(site), canonical: `/sites/${id}`, socialImage: 'route' }). Keep notFound() on a miss.
3. industry/[id]/page.tsx: generateMetadata returns buildPageMetadata({ title, description, canonical: `/industry/${id}` }). Switch the miss from `return {}` to notFound(), matching sites, and confirm locally that an unknown id returns 404.
4. industry/page.tsx, jobs/page.tsx, planner/page.tsx: replace each literal with buildPageMetadata({ title, description, canonical }). The landing keeps its workspace description, which drops the Planner og copy.
5. Replace the manual parse/load in PlannerContent (industry/[id]:76-81), SiteDetailContent (sites/[id]:126-131) and opengraph-image.tsx:14-18 with `const result = await loadNumericRouteEntity(params, loader); if (!result) notFound(); const { id, entity } = result;`. Drop the parseNumericRouteId imports from those files.
6. Optional: change buildBreadcrumbList to take path-relative crumbs and prepend Home with SITE_URL itself; update both callers and structured-data tests.
7. Optional: make the loader caching consistent, either by dropping cache() at sites/[id]:22 or by documenting why sites needs per-request memoisation and industry does not.
8. Add '/industry', '/industry/jobs' and '/industry/planner' to PAGE_TITLES in scripts/verify-seo-metadata.py. Run verify-seo-metadata.py and verify-og-cards.py against the local dev server.

**Tests.** src/lib/page-metadata.test.ts: add a 'route' case asserting `'images' in result.openGraph === false` and the same for twitter. Add a default-image case for the industry inputs. src/app/(site)/sites/[id]/page.test.ts already mocks notFound and getPricedSiteDetail and guards the body path after the switch to loadNumericRouteEntity. src/transport/route-id.test.ts guards the helper. src/app/(site)/page-coverage.test.ts imports every metadata export (lines 104-127), so the converted exports stay exercised. Run the two scripts manually against local dev.

**Notes.** Behaviour to preserve or decide:
- sites/[id] must keep inheriting its per-site card, so it uses 'route'.
- Switching the industry pages from /logo.png to /opengraph-image is a visible share-card change. The house SEO check expects the default card, but get owner sign-off.
- Canonical: the hand-rolled pages use a relative canonical with an absolute og:url (`${SITE_URL}/...`). The builder uses the relative path for both, and metadataBase (src/app/layout.tsx:41) resolves them to the same absolute URL.
- og:title for the landing becomes 'Industry Planner' instead of 'Industry Planner — LGI.tools', the same convention the other builder pages use.
- Miss handling drift: industry/[id] returns {} while sites/[id] uses notFound(). notFound() in generateMetadata is documented (generate-metadata.md:197) and gives HTML-limited bots a real 404. Pick it for both.
- Not a primitive gap: loadNumericRouteEntity already exists; only the page bodies bypass it.

<sub>Reported by: area:app-site, area:lib-infra.</sub>

← [Wave 7: UI kit primitives (src/components/ui)](wave-07-ui-kit-primitives-src-components-ui.md) · [Index](README.md#roadmap) · [Wave 9: Auth, routes and the mutation/transport pipeline](wave-09-auth-routes-and-the-mutation-transport-pipeline.md) →
