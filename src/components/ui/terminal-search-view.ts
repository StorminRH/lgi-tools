// The dropdown read for the terminal-search input: which suggestions to show and
// whether the list is open. Suggestions are stored WITH the query they answered,
// so a stale resolution (from a since-changed input) shows nothing rather than
// flashing a prior query's list; the dropdown only opens when the input is open,
// has current-query results, and isn't showing an error.
export function deriveTerminalDropdown(
  suggestions: { query: string; items: string[] },
  value: string,
  open: boolean,
  hasError: boolean,
): { visibleSuggestions: string[]; showDropdown: boolean } {
  const visibleSuggestions = suggestions.query === value ? suggestions.items : [];
  return {
    visibleSuggestions,
    showDropdown: open && visibleSuggestions.length > 0 && !hasError,
  };
}
