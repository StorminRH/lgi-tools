import { denseSurface } from '@/components/ui/card';

// Windows, prompts and the event log over the canvas.
export const mapFrostedSurface = denseSurface;

// Near-transparent frost for overlays and the docked scanner.
export const mapOverlaySurface = 'glass-panel-faint';

// Sections inside the docked scanner. The dock's own backdrop-filter (and the
// scroller's fade mask) make it a backdrop root, so a blur here would only
// sample the dock and not the map. A plain tint keeps the rows legible.
export const mapNestedSurface = 'rounded-ctl border border-border bg-bg-deep/85 text-text';
