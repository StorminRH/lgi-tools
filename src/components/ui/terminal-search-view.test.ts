import { describe, expect, it } from 'vitest';
import { deriveTerminalDropdown } from './terminal-search-view';

describe('deriveTerminalDropdown', () => {
  const suggestions = { query: 'trit', items: ['Tritanium', 'Trigger'] };

  it('shows the current-query suggestions when open and error-free', () => {
    expect(deriveTerminalDropdown(suggestions, 'trit', true, false)).toEqual({
      visibleSuggestions: ['Tritanium', 'Trigger'],
      showDropdown: true,
    });
  });

  it('hides a stale resolution whose query no longer matches the input', () => {
    const r = deriveTerminalDropdown(suggestions, 'pyer', true, false);
    expect(r.visibleSuggestions).toEqual([]);
    expect(r.showDropdown).toBe(false);
  });

  it('stays closed when the input is closed, empty of results, or showing an error', () => {
    expect(deriveTerminalDropdown(suggestions, 'trit', false, false).showDropdown).toBe(false);
    expect(deriveTerminalDropdown({ query: 'trit', items: [] }, 'trit', true, false).showDropdown).toBe(false);
    expect(deriveTerminalDropdown(suggestions, 'trit', true, true).showDropdown).toBe(false);
  });
});
