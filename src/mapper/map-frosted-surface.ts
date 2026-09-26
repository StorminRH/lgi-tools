// Windows, prompts and the event log over the canvas: dense glass that keeps
// lists readable over a busy map. No sheen; it sits on the canvas rather than
// floating above the page.
export const mapFrostedSurface =
  'border border-border glass-dense text-text rounded-card shadow-card-edge';

// Near-transparent frost for overlays and the docked scanner.
export const mapOverlaySurface = 'glass-panel-faint';

// Sections inside the docked scanner. The dock's own backdrop-filter (and the
// scroller's fade mask) make it a backdrop root, so a blur here would only
// sample the dock and not the map. A plain tint keeps the rows legible.
export const mapNestedSurface = 'rounded-ctl border border-border bg-bg-deep/85 text-text';
