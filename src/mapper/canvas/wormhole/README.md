# WormholeVisual

Decorative Atlas primitive extracted from the approved liquid sphere prototype:
compact lensed sphere with a smooth dark interior, muted class color at the rim,
and simultaneous center ripples / damped
wobble on activation. `SystemNode` owns its labels, handles and React Flow state.

```tsx
<WormholeVisual
  whClassId={data.whClassId}
  active={hovered || selected}
  paused={dragging}
  seed={id}
  size={75}
/>
```

| Input | Meaning |
| --- | --- |
| `whClassId` | Numeric SDE destination/system class; null or unsupported values use neutral colors. |
| `active` | Parent-controlled hover or selection. False→true starts the impulse; sustained true continues slow internal drift after settling. |
| `paused` | Immediately stills all motion, even when active. Used during drag and for inert nodes. Does not clear the parent's active intent, so a selected node does not replay the impulse when it is revealed again. |
| `seed` | Stable string, normally the system/node ID, for deterministic lighting variation. |
| `size` | Entire visual diameter in CSS pixels, including the narrow rim glow. Default 75; the core is approximately 55px. Clamped to 32–512. |
| `shipSize` | Optional `small`, `medium`, `large`, `capital`, or `unknown` aura palette. Default unknown. Supply only for a particular connection. |

Do not infer ship size from class. A system can have several wormholes with
separate mass limits. Ordinary system nodes deliberately leave the aura neutral.
Remaining total mass and lifetime are also connection facts, not system facts.

## Palette research

The eye shows the **destination nebula**; the outer field lines encode the
**per-jump ship-size limit**. These are separate inputs. The following palettes
are art-directed approximations, not official CCP RGB values or extracted assets.

| Class | Core inspiration |
| --- | --- |
| C1 | Gray clouds with blue/cyan details |
| C2 | Brown-gray clouds and a dark lens |
| C3 | Gray clouds with a red patch |
| C4 | Dark red/purple, black details, bright white clouds |
| C5 | Red with brown/warm tones and softer pale clouds |
| C6 | Strong orange-red and black details |

The aura is royal blue for small, teal for medium, gray-white for large, and gold
for capital-capable connections. `unknown` is a neutral UI treatment, not an
in-game classification. Existing Atlas classification text colors stay intact.
Unknown class and special destinations (Thera, C13, Drifter) stay neutral until
their distinct skybox treatment is verified. Broad hints such as “unknown” or
“dangerous” do not assert an exact class; a sole-class hint may resolve one.
Known k-space nodes retain their existing disc.

Sources:
- [CCP: September 2019 wormhole update](https://www.eveonline.com/news/view/september-release-wormholes-and-stars-get-an-update)
- [EVE University: visual identification](https://wiki.eveuniversity.org/Visual_wormhole_identification)
- [Ashy: screenshot identification guide](https://ashy.vargur.dev/wormhole-identification/)

## Rendering and lifecycle

All mounted visuals share one lazy, bounded 256×256 WebGL surface. Each node has
a 2D canvas retaining its last frame, so idle nodes schedule no animation work.
Offscreen nodes and hidden tabs stop; dragging and reduced-motion preferences
immediately still the effect. Release eases the internal drift to rest. Unmount cleans
observers/listeners/frames; the final consumer releases GPU resources.

Static CSS fallback remains available before hydration, without WebGL, or after
first-paint GPU failure. A later lost GPU context keeps the last 2D bitmap and
drops the shared painter so the next paint can rebuild it. A visible unpaused
host schedules one delayed retry; hidden-tab and offscreen hosts wait for the
next synchronize. They do not spin while lost.
Remounting after all consumers release also recreates the renderer. The primitive
performs no fetching or persistence.

The shader stays pointer-inert. Atlas retains its 150×110 node frame, 55px
interaction disc, centered handles, classification chip and presence badge.
The previous whole-disc hover breathing is suppressed only for shader nodes.
Hover and selection still apply the static glow ring, including under reduced
motion, so a still shader does not lose the active state.
