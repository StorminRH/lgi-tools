/**
 * Shared frosted chrome for in-map overlays (windows, dials, audit log).
 * Keeps translucent map chrome on one token so tray tweaks do not drift.
 * Opaque recessed trays stay on `panelSurface` in `dropdown-panel.ts`.
 */
export const mapFrostedSurface =
  'border border-border-idle bg-bg-deep/65 shadow-dd backdrop-blur-md';
