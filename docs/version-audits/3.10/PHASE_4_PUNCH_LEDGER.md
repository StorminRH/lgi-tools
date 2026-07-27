# Phase 4 punch ledger

Session: `3.10.4.3.1`
Operator resolution declaration: **Resolved — the operator approved every delivered punch item across the planner, site-wide, and final related-input sittings**

This is the live disposition record for the final presentation pass. `Pending
operator review` is intentionally non-terminal: the operator must keep, revise,
revert, backlog, or approve each experiment at its sitting gate.

## Punch items

| ID | Surface | Report / hypothesis | Reproduction or evidence | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| PL-001 | Planner KPI row | Mixed label/control heights move figures off one internal plane. | Six-tile row reproduced; `KpiHead` now reserves one label plane. | `kpi-tile.tsx` | Fixed; first-sitting operator approved |
| PL-002 | Planner ME/TE | Ownership tone meaning was repeated at component call sites. | Tone census found local frame/glyph/value mappings. | `industry-styles.ts` | Fixed; first-sitting operator approved |
| PL-003 | Loading presentation | Content-shaped holes often collapsed to a word. | Route matrix and fallback inventory recorded below. | Loading primitives and route pages | Fixed; site-wide sitting operator approved |
| PL-004 | Routed matrix diagnostics | Prior capture noted negative performance timestamps and aborted dev requests. | Two complete 14-pair capture runs on Next 16.2.6: no negative timestamps or aborted requests; the first run only lacked Convex, and the full-stack rerun was clean. | `ux-check` evidence | No-change; first-sitting operator confirmed |
| PL-005 | Route shells | Audit every classified route for its richest honest shell. | Every route in `route-classification.json` is recorded below. | Route owners | Fixed; site-wide sitting operator approved |
| PL-006 | House style | Static-shell and fallback composition rules were incomplete. | Installed Cache Components guide plus current route audit. | `src/AGENTS.md`, loading primitives | Fixed; site-wide sitting operator approved |
| PL-007 | Live prices | Seed confirmation needs an in-progress and just-updated affordance. | Shared `LivePrice` primitive owns the approved pulse, flash, bounce, reduced-motion behavior, and every plan-authorized sites/planner consumer. | `live-price.tsx` | Fixed; line-free candidate first-sitting operator approved |
| PL-008 | Toasts | Concurrent template and sync toasts overlap/collapse. | Sonner default collapsed non-front cards; expanded measured offsets pass `toast-stack` on desktop and mobile. | `toast.tsx` | Fixed; first-sitting operator approved |
| PL-009 | Planner ownership | Owned blueprint outline should read green; gem/value blue is a taste question. | Green frame with blue owned glyph/value is on the live planner. | `industry-styles.ts` | Kept; first-sitting operator approved |
| PL-010 | Industry jobs imagery | Science corp jobs showed monograms. | Live rows with activities 3/4/5 repeated the blueprint as `product_type_id`; `/icon` returned 400 while `/bp` returned 200. Resolver is now activity-aware. | `type-images.ts` | Fixed; authenticated site-wide sitting operator approved |
| PL-011 | Planner hero | Blueprint rendition may communicate the build better than the 3D product render. | Hero now uses `/types/{blueprintTypeId}/bp` as a reversible experiment. | `type-images.ts`, `HeroCard.tsx` | Kept; first-sitting operator approved |
| PL-012 | Multibuy copy | Hand-rolled clipboard/toast path bypassed `CopyButton`. | Shared copied/unavailable cycle and durable probe now cover the export. | `CopyButton`, `MultibuyPanel` | Fixed; first-sitting operator approved |
| PL-013 | Planner disclosures | Multibuy and raw-ledger triggers read as plain labels. | Pressable Chip structure with the shared recessed field/dropdown surface, neutral border, and green text. | Planner components | Operator approved the controls with the darker token revision |
| PL-014 | Planner templates | Templates trigger reads as plain text. | Pressable Chip structure with the shared recessed field/dropdown surface, neutral border, and green text. | `TemplatesMenu.tsx` | Operator approved the control with the darker token revision |
| PL-015 | Planner glyphs | Gem sits optically right of the hourglass. | Gem geometry receives a half-pixel optical correction. | `MeAdjuster.tsx` | Fixed; first-sitting operator approved |
| PL-016 | Planner skill bonus | The whole icon/value string obscures that the breakdown is interactive. | Icon-only hourglass buttons open the existing manufacturing and reaction breakdowns. | `BuildSkillsIndicator.tsx` | Kept after percentage removal; first-sitting operator approved |
| PL-017 | Related inputs | A thin related-row border may improve chain scanning; connector lines would require new overlay machinery. | The existing `related` state now adds a one-pixel inset ISK-green border through the planner tone-map owner without changing row geometry; unrelated rows deepen from 25% to 20% opacity by operator direction. | `industry-styles.ts`, `node-card-view.ts` | Kept; final-sitting operator approved border and stronger fade; connector-line expansion not pursued |
| PL-018 | Header account slot | A broad mobile capture rendered the signed-out login button on the server and the pending account skeleton during hydration. | `/sites/3` mobile emitted one React hydration mismatch; six immediate repeats were clean, while `AuthProvider` source confirmed the server/client store-state race. | `AuthProvider.tsx` | Fixed; site-wide sitting operator approved |
| PL-019 | Root scrolling | The viewport rubber-bands when scrolling past the top or bottom boundary. | The document root owns page scrolling; its existing Tailwind utility now sets `overscroll-behavior: none` without changing bounded internal scrollers. | `layout.tsx` | Fixed; operator approved the firm boundary behavior |

## PL-005 classified-route audit

The current reality is the recorded render mode. The richest honest destination
is the listed keep/fix decision: dynamic handlers stay dynamic, deploy-static
content stays static, and request-only state remains in the smallest practical
partial-render hole.

| Route | Current reality | Destination / disposition |
| --- | --- | --- |
| `/` | `partial` | Keep — meaningful shell exists; request state stays isolated |
| `/opengraph-image` | `dynamic` | Keep — metadata image handler is honestly dynamic |
| `/admin` | `partial` | Keep — meaningful shell exists; request state stays isolated |
| `/admin/access` | `partial` | Keep — meaningful shell exists; request state stays isolated |
| `/admin/access/[userId]` | `partial` | Keep — meaningful shell exists; request state stays isolated |
| `/changelog` | `static` | Keep — full meaningful content already prerenders |
| `/changelog/[slug]` | `partial` | Keep — meaningful shell exists; request state stays isolated |
| `/contact` | `static` | Keep — full meaningful content already prerenders |
| `/devlog` | `static` | Keep — full meaningful content already prerenders |
| `/devlog/[slug]` | `partial` | Keep — meaningful shell exists; request state stays isolated |
| `/skills` | `partial` | Fix — preserve content geometry with Skeleton fallbacks |
| `/jobs` | `partial` | Fix — preserve content geometry with Skeleton fallbacks |
| `/industry` | `partial` | Fix — preserve content geometry with Skeleton fallbacks |
| `/industry/[id]` | `partial` | Fix — preserve content geometry with Skeleton fallbacks |
| `/industry/templates` | `static` | Keep — full meaningful content already prerenders |
| `/legal` | `static` | Keep — full meaningful content already prerenders |
| `/preview/cards` | `static` | Keep — full meaningful content already prerenders |
| `/preview/primitives` | `partial` | Keep — meaningful shell exists; request state stays isolated |
| `/robots.txt` | `static` | Keep — full meaningful content already prerenders |
| `/sitemap.xml` | `static` | Keep — full meaningful content already prerenders |
| `/sites` | `partial` | Fix — cached catalogue supplies the page/filter shell and streamed results; saved-view cookie and nested URL sort remain request-time holes |
| `/sites/[id]` | `partial` | Keep — meaningful shell exists; request state stays isolated |
| `/sites/[id]/opengraph-image` | `dynamic` | Keep — metadata image handler is honestly dynamic |
| `/characters` | `partial` | Fix — preserve content geometry with Skeleton fallbacks |
| `/settings` | `partial` | Keep — meaningful shell exists; request state stays isolated |
| `/structures` | `partial` | Keep — meaningful shell exists; request state stays isolated |
| `/api/account/active-character` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/account/characters` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/account/characters/unlink` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/account/purge-character` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/account/delete` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/account/sessions/revoke` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/account/skills` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/account/industry-jobs` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/account/industry-slots` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/account/corp-industry-jobs` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/account/corp-structures` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/account/corp-structures/sharing` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/account/corp-structures/rigs` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/account/custom-structures` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/account/custom-structures/delete` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/account/custom-structures/parse-fit` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/account/custom-structures/set-pin` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/account/custom-structures/set-tax` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/account/saved-plans` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/account/saved-plans/delete` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/account/saved-plans/favorite` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/account/saved-plans/rename` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/account/structures` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/admin/characters/reassign` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/admin/characters/unlink` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/admin/esi-jobs/retry` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/admin/role` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/admin/sessions/revoke` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/auth/[...all]` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/cron/drain-esi-refresh-jobs` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/cron/refresh-affiliations` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/cron/refresh-gsc` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/cron/refresh-industry-indices` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/eve/names` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/cron/refresh-prices` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/cron/refresh-sde` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/cron/sync-sweeper` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/feedback` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/industry/blueprints` | `static` | Keep — deploy-static read-only JSON asset |
| `/api/industry/systems` | `static` | Keep — deploy-static read-only JSON asset |
| `/api/industry/build-location` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/industry/owned-assets` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/industry/owned-blueprints` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/industry/skill-levels` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/internal/eve-characters` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/internal/eve-token` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/market-prices/refresh` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/market-history/refresh` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/preferences` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/sites` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/sites/[id]` | `dynamic` | Keep — handler is honestly request-driven |
| `/api/telemetry` | `dynamic` | Keep — handler is honestly request-driven |
