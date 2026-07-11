// Two-letter typographic monogram for a name — the initials of the first two
// words, else the first two characters. Used by the industry recents/favorites
// rows and job table, where the icons are typographic rather than images.
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}
