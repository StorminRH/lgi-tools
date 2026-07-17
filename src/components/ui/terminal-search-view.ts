/**
 * The suggestion read for the terminal-search input: which suggestions to show.
 * Suggestions are stored WITH the query they answered, so a stale resolution (from
 * a since-changed input) shows nothing rather than flashing a prior query's list;
 * suggestions are also withheld while the input is showing a parse error. Open/
 * closed state is owned by the underlying Combobox, so it isn't derived here.
 */
export function deriveTerminalDropdown(
  suggestions: { query: string; items: string[] },
  value: string,
  hasError: boolean,
): { visibleSuggestions: string[] } {
  const visibleSuggestions = suggestions.query === value && !hasError ? suggestions.items : [];
  return { visibleSuggestions };
}
