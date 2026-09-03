export function formatStationName(name: string): string {

  const collapsed = name.replace(/ - Moon (\d+) - /, '-$1 — ');
  if (collapsed !== name) return collapsed;

  return name.replace(' - ', ' — ');
}
