/**
 * Shared frosted chrome for in-map overlays (windows, dials, audit log).
 * Wears the one glass-panel surface from globals.css (the pop-out tier now
 * sits at this chrome's 65% density), so tray tweaks and the blur/saturation
 * knobs live on one token layer instead of an ad-hoc bg/backdrop-blur combo
 * here.
 */
export const mapFrostedSurface = 'border border-border-idle glass-panel shadow-dd';
