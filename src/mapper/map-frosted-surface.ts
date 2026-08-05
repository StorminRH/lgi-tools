/**
 * Shared frosted chrome for in-map overlays (windows, dials, audit log).
 * Wears the ambient glass-chrome tier from globals.css (lighter tint than
 * the glass-panel popups — seeing the map move underneath is the point), so
 * tray tweaks and the blur/saturation knobs live on one token layer instead
 * of an ad-hoc bg/backdrop-blur combo here.
 */
export const mapFrostedSurface = 'border border-border-idle glass-chrome shadow-dd';
