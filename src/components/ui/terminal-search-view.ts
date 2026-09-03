export function deriveTerminalDropdown(
  suggestions: { query: string; items: string[] },
  value: string,
  hasError: boolean,
): { visibleSuggestions: string[] } {
  const visibleSuggestions = suggestions.query === value && !hasError ? suggestions.items : [];
  return { visibleSuggestions };
}
