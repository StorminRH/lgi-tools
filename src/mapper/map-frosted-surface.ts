import { cardSurface } from '@/components/ui/card';

/**
 * Opaque in-map panel chrome — the same Card surface as home, sites, and
 * the industry planner. Frosted/faint glass stays on {@link mapOverlaySurface}
 * and the scanner-dock / map-switcher trigger only.
 */
export const mapFrostedSurface = cardSurface;

/**
 * Soft blur-only surface for content-sized map text overlays (current-system
 * dock). No tint, border, or shadow — nodes behind soften while copy stays
 * a floating caption.
 */
export const mapOverlaySurface = 'glass-panel-faint';
