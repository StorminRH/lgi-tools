# Historical probe coverage

This maps the 64 probes present before LGI-114. It records source disposition, not browser runtime acceptance. The executable inventory is `e2e/probe-registry.json`. Related retained stages execute as native Playwright steps inside selected journeys. The audit prose totals were inconsistent; its individual dispositions total 20 keep, 35 merge, 6 move and 3 remove.

| Previous probe | Decision | Current journey | Lane | Behavior and reason |
| --- | --- | --- | --- | --- |
| atlas-afk-gate | merge | atlas-background-tracking | local-mutation | into heartbeat/background tracking: retain active→hidden threshold→warning→paused→Continue; use controlled time and one coordinator fixture. |
| atlas-ambiguous-jump | keep | atlas-ambiguous-jump | local-mutation | as a critical multi-client journey: three unresolved wormholes, no destination before selection, alternate K162 choice, persisted selected edge, named hole remains unresolved. |
| atlas-authoring-add | merge | atlas-authoring | local-mutation | into one authoring journey: retain right-click node→Add connection→system search; drop placeholder/presence-only checks. |
| atlas-authoring-connection | merge | atlas-authoring | local-mutation | into that authoring journey: retain edge edit, editable fields, delete affordance, and a persisted field outcome; remove retired-control absence checks. |
| atlas-authoring-home | merge | atlas-authoring | local-mutation | as the beginning of the authoring journey: empty owned map→set home→one root node. Remove stale-copy assertions. |
| atlas-authoring-intelligence | merge | atlas-authoring | local-mutation | after connection typing: retain type-driven locked/read-only intelligence and explicit expected values; remove heading/chrome absence checks. |
| atlas-authoring-ledger | merge | atlas-subscriptions | local-mutation | into a subscription-resource suite with signature subscriptions: retain closed=zero, open=one, close=zero, reopen=current. |
| atlas-authoring-two-clients | keep | atlas-authoring | local-mutation | as critical collaboration behavior: home/add/edit fan-out. Split authorization into seeded owner/editor/viewer principals; current same-storage clients prove synchronization only. |
| atlas-automatic-jump | merge | atlas-automatic-jump | local-mutation | retain one unambiguous tracked jump, portrait tracking toggle, mass update, and no prompt; remove its second ambiguous branch because `atlas-ambiguous-jump` owns that behavior. |
| atlas-background-tracking | merge | atlas-background-tracking | local-mutation | with heartbeat/AFK: retain presence following a hidden-tab jump, continued pre-threshold heartbeats, pause after threshold, presence removal, and resume. Remove duplicate helper implementations. |
| atlas-halo | keep | atlas-halo | local-mutation | multi-client deterministic halo membership and derived-node→authored-node in-place upgrade are valuable browser synchronization/render behavior. Keep mutation-wire exclusion narrowly scoped. |
| atlas-heartbeat-coordination | keep | atlas-heartbeat-logout | local-mutation | as critical browser semantics: one interval writer, active-hint union, visibility ownership transfer, BFCache lifecycle, silent-owner recovery, server-fenced leave, logout stop. |
| atlas-map-access | keep | atlas-access | local-mutation | seed owner/editor/viewer; perform real revoke and prove another principal loses edit/access. Current empty-private and Cancel-only branches are insufficient. |
| atlas-map-catalogue | keep | atlas-map-lifecycle | local-mutation | , split into explicit empty and populated fixtures. Retain landing/canvas boundary and opening the selected map; replace data-dependent branching. |
| atlas-map-create | merge | atlas-map-lifecycle | local-mutation | into lifecycle: create→pending state→successful selected map→home prompt. Remove the uncontrolled five-second elapsed assertion. |
| atlas-map-lifecycle | keep | atlas-map-lifecycle | local-mutation | as create→delete→trash→restore with run-owned cleanup. Current restored map remains behind. |
| atlas-map-switcher | keep | atlas-map-switching | local-mutation | with two run-owned maps and cleanup: exact selected map, no stale prior-map content after URL commit, browser Back. |
| atlas-signature-lifecycle | keep | atlas-signatures | local-mutation | as a critical journey: paste/fan-out, missing/remove/undo, static elimination/restoration, real doorbell resolution, auto-resolution, current-system update. Split independent stages without breaking each coherent chain. |
| atlas-signature-subscriptions | merge | atlas-subscriptions | local-mutation | into the resource suite: retain scoped map/system query additions and removal on close. |
| atlas-signature-viewer | keep | atlas-signature-viewer | local-mutation | matched site opens, unmatched site stays inert, anchored shared panel, Escape/outside dismissal. |
| atlas-wall | merge | atlas-guest | mandatory-production | into mandatory/deployed route contracts: signed-out `/atlas` must show the guest landing and sign-in, with catalogue/canvas/chrome absent. |
| atlas-fog-budget | move | fog-benchmark | benchmark | cap/chain math to existing halo/fog/layout unit tests and p50/p95/LoAF to an opt-in calibrated benchmark. Merge one full-load painted/settled behavior into the fog scenario if still needed. |
| atlas-fog-layering | merge | atlas-fog | local-mutation | into one browser fog interaction case: retain painted reveal/cloud distinction and pointer pass-through; move alpha geometry/cut math lower and remove DOM parent/z-index assertions. |
| atlas-layout-cross-engine | move | layout-cross-browser | benchmark | to an optional cross-browser compatibility lane. Exact `0.01px` CSS read-back must not be a mandatory product gate; deterministic coordinates already belong to layout tests. |
| atlas-layout-lock | keep | atlas-layout-lock | local-mutation | manual drag while unlocked, arrival does not move the pinned node/camera, relock returns to computed layout. Replace direct persistent fixture injection with run-owned setup/cleanup. |
| atlas-layout-two-clients | merge | atlas-authoring | local-mutation | convergence evidence into the two-client authoring or halo journey; remove duplicate exact-coordinate comparison. |
| atlas-layout-worker | remove | lower-level coverage | lower-level | “a worker exists” and absent/inconclusive LoAF attribution do not prove layout stayed off the main thread. Existing kernel/layout tests own computation behavior. |
| atlas-motion-birth | merge | atlas-motion | local-mutation | into one motion behavior suite: retain in-place birth and scale/opacity transition; remove direct Convex mutation from scenario body. |
| atlas-motion-drag | merge | atlas-motion | local-mutation | retain successful drag and settled destination. Remove p50/p95 and the “every sampled frame equals pointer” latency claim. |
| atlas-motion-glide | merge | atlas-motion | local-mutation | retain visible intermediate glide and edges following endpoints; move timing distributions to benchmark. |
| atlas-motion-idle | merge | atlas-motion | local-mutation | only hover response/reversion if it protects a named regression; remove rAF-registration-as-idle-performance. |
| atlas-motion-reduced | merge | atlas-motion | local-mutation | into the motion suite and retain deterministic reduced-motion outcomes: fade-only birth and immediate stable landing. |
| atlas-signature-chrome | merge | atlas-windows | local-mutation | meaningful scanner/chip accessibility into the window suite; remove quadrant, duplicated-identity, and development-chrome layout assertions. |
| atlas-window-dock | merge | atlas-windows | local-mutation | into the persistent-window journey: dock survives interaction and stays click-through. |
| atlas-window-dom | remove | lower-level coverage | lower-level | sibling placement, pointer-inert layer, and primitive identity are implementation topology already covered by `MapWindow`/window model tests. |
| atlas-window-isolation | merge | atlas-windows | local-mutation | using a real product input/scroll control. Remove injected `[data-window-probe-input]`. |
| atlas-window-reload | merge | atlas-windows | local-mutation | into persistent-window journey: dock survives reload. |
| atlas-window-stacking | merge | atlas-windows | local-mutation | into persistent-window journey: popup above card, ordered Escape dismissal, passive dock survives, exposed canvas remains interactive. |
| atlas-window-track | keep | atlas-windows | local-mutation | as the summary-card journey: open a real non-root system, track through pan/zoom/direct drag, deselect while dock survives. |
| asset-ledger | merge | planner-assets | local-mutation | with mocked asset ownership: retain signed-out empty behavior, keyboard/touch open/close, totals. |
| asset-ring-mock | merge | planner-assets | local-mutation | into the same deterministic asset journey: retain corporation/character holdings and rendered progress. |
| changelog-browser | merge | content-navigation | local-mutation | with contents navigation: retain canonical soft navigation, active document, metadata, and real scroll chaining. Remove “twelve masters,” “current v4.0,” and repeated sticky/CSS measurements; parsing/order/sitemap membership belong lower. |
| combobox-global | keep | global-search | local-mutation | keyboard and real mobile touch selection must land on the exact chosen route; retain Escape/focus behavior. |
| combobox-terminal | merge | planner-materials | local-mutation | into the planner journey: select a known system and assert the exact committed field/business effect; retain Escape semantics. |
| content-browser-scroll | merge | content-navigation | local-mutation | with changelog/contents: retain reachability and actual internal-scroll versus page-scroll behavior; remove exact sticky offsets and scrollbar CSS. |
| contents-drawer | keep | content-navigation | local-mutation | as the mobile changelog journey: open, focus transfer, choose another document, close, restore focus, Escape. Move transition-duration literals out. |
| cost-basis | merge | planner-materials | local-mutation | into a deterministic planner scenario with known fixture and exact expected figure. Arithmetic remains in lower-level tests; “values differ” is deleted. |
| dialog-open | merge | sites-details | local-mutation | into the sites detail journey: real card→lightbox→Escape, with explicit fixture. |
| eve-image-network | keep | eve-images | local-mutation | as a scoped network contract: require expected first-party/EVE image response success and decoded visible image; keep “no Next optimizer” only if routing policy remains intentional. |
| feedback-dialog | keep | feedback | local-mutation | with controlled request interception: field/category/focus plus explicit submission success and error outcomes; do not send a real ticket. |
| instant-nav-atlas | move | dev-navigation-atlas | dev-only | to a tagged dev-only `@next/playwright` lane; add eventual useful-content assertion after release. |
| instant-nav-planner | move | dev-navigation-planner | dev-only | to the same dev-only lane; replace “skeleton or title” with exact interim and eventual contracts. |
| instant-nav-session | move | dev-navigation-session | dev-only | to the dev-only lane, table-driven by route; keep routes independent and assert eventual ready content. |
| instant-nav-sites | move | dev-navigation-sites | dev-only | to the dev-only lane; retain soft navigation shell plus eventual catalogue content. |
| me-planner | merge | planner-materials | local-mutation | into deterministic planner behavior: known owned ME, real override, exact displayed quantity. Calculation stays in `me-overrides`/build tests. |
| multibuy-panel | keep | planner-export | local-mutation | tier selection, exact deterministic export, clipboard success and failure fallback are browser-worthy. Formatting arithmetic remains lower. |
| nav-menu | keep | responsive-navigation | local-mutation | as a responsive navigation journey: desktop/collapsed state, touch/keyboard open, exact `/sites` navigation, close/unmount, Escape. Remove divider/alignment style checks. |
| nav-page-settings | merge | responsive-navigation | local-mutation | into responsive nav: exact route-specific controls, selection persistence, absent section on unsupported route. |
| overlay-open | merge | planner-materials | local-mutation | one keyboard and one touch disclosure into the planner journey; avoid repeating primitive behavior for each label. |
| page-modes | remove | lower-level coverage | lower-level | exact max-width/padding/footer/CSS assertions. Keep responsive overflow in operator review or a narrowly justified visual/layout case. |
| sites-lazy-detail | keep | sites-details | local-mutation | around user-observable behavior: controlled cards/table, one detail opens, view/sort survives navigation/reload. Avoid asserting wrapper emptiness as the primary outcome. |
| sites-standalone-detail | merge | sites-details | local-mutation | into sites detail: exact site identity/content and related sites; remove width-fraction and card-chrome assertions. |
| templates-menu | merge | planner-notifications | local-mutation | with planner/toast behavior: signed-out save failure and unknown-plan URL cleanup; lower tests own failure mapping. |
| toast-stack | keep | planner-notifications | local-mutation | as a small browser layout/accessibility case for concurrent readable, non-overlapping status messages; fix the apparent undeclared `syncToast` reference during migration. |
