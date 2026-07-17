/**
 * Compact a full ESI station name for the build-location picker. CCP's name is
 * verbose ("Jita IV - Moon 4 - Caldari Navy Assembly Plant"); the cockpit shows
 * the familiar shorthand ("Jita IV-4 — Caldari Navy Assembly Plant").
 *
 * Conservative on purpose: it only collapses the "\{Planet\} - Moon \{n\}" celestial
 * (the common shape) and promotes the location/operation separator to an em dash.
 * Anything else (planet-direct, asteroid belts, unusual shapes) keeps CCP's
 * wording, with at most the first separator em-dashed — never mangled.
 */
export function formatStationName(name: string): string {
  // "{Planet} - Moon {n} - {Owner Operation}" → "{Planet}-{n} — {Owner Operation}".
  const collapsed = name.replace(/ - Moon (\d+) - /, '-$1 — ');
  if (collapsed !== name) return collapsed;
  // No planet/moon shape: just promote the first separator to an em dash.
  return name.replace(' - ', ' — ');
}
