# Atlas system intel studies

This is a disposable design prototype for PR #511. It compares three icon sets and three system summaries before changing Atlas. It does not add an application route or alter production components.

Open `index.html` in a browser. The page is self-contained and works offline. Icons and a subset of the existing JetBrains Mono font are embedded. No installation, login, or data connection is needed.

## Compare the options

Choose an icon set, a system fixture, and a display. Use **All layouts** to compare the same information side by side, or isolate one layout. Click a category to expand its site names. The brief layout also collapses pilot details.

| Icon set | Treatment | Tradeoff |
| --- | --- | --- |
| Thin line | Custom SVG outlines | Consistent and unobtrusive. Recommended. |
| Solid | Custom SVG silhouettes | Stronger at small sizes, with more visual weight. |
| CCP | Original CCP PNGs | Familiar to EVE players, with less consistent color and weight. |

All sets cover harvestables, hacking, combat, friendlies, market, statics, and disclosure. Statics are an additional summary mark. Disclosure stays a custom SVG in the CCP set. The page shows 16px specimens and 14px map marks around 55px nodes.

| Summary | Treatment | Tradeoff |
| --- | --- | --- |
| Compact rows | Aligned label, count, and estimate | Most explicit and balanced. Recommended. |
| Stat strip | Larger counts above small labels | Faster count comparison, narrower expanded details. |
| Brief | Total sites with collapsed friendlies | Less detail at rest, with an extra click for pilots. |

The popout study is 288px wide and 232px tall. PR #511's current popout is 208px tall. The extra 24px lets the populated fixture show its pilot rows without expanding the card width. Both views scroll internally when content grows. The current-system option removes the border and connector to compare a quieter overlay.

The five fixtures cover populated wormhole space, known space, no sites or friendlies, partial intel, and long names. Routes, counts, names, and estimates are illustrative. Only harvestables have an estimated ISK value. An unavailable estimate is a dash, never zero. Duplicate site names remain distinct rows. Map site marks indicate presence, while pilot counts appear only above one.

## Source and attribution

The CCP direction follows [LGI-125](https://linear.app/lgitools/issue/LGI-125/official-ccp-npc-ship-and-wormhole-icon-inventory-for-sites-future). Embedded PNGs are copied from `eve-icons-react@0.1.14` without tracing or modification.

| Role | Package asset |
| --- | --- |
| Harvestables | `Icons/Scanner/Gas-scanned.png` |
| Hacking | `Icons/Scanner/Data-scanned.png` |
| Combat | `Icons/Scanner/Combat-scanned.png` |
| Friendlies | `Icons/UI/Peopleandplaces.png` |
| Market | `Icons/UI/Market.png` |
| Statics | `Icons/Overview/Icon_bracket_wormhole.png` |

Gas represents the combined gas and ore category. Data represents the combined data and relic category. Ship-class and faction assets in LGI-125 are outside this system-summary scope.

EVE Online and these image assets belong to CCP hf. Their use follows the project's existing EVE developer-license precedent. CCP artwork is not covered by the repository's MIT license. JetBrains Mono uses the SIL Open Font License included in [JetBrainsMono-OFL.txt](JetBrainsMono-OFL.txt). The embedded subset retains the original copyright and license metadata.

## Verification

A separate code review found and fixed hidden stat-strip labels and a map-mark overlap. A local DOM check exercised all 120 icon, fixture, display, and layout-comparison combinations. It also checked category disclosure markup, duplicate site names, and unknown estimates. No production source, dependencies, or tests changed.

Browser rendering was blocked by this environment. No screenshot or pixel-level verification is claimed. Review the HTML in a browser before choosing a production direction.
