import { describe, expect, it } from 'vitest';
import { deriveTerminalDropdown } from './terminal-search-view';

describe('deriveTerminalDropdown', () => {
  const suggestions = { query: 'trit', items: ['Tritanium', 'Trigger'] };

  it('shows the current-query suggestions when error-free', () => {
    expect(deriveTerminalDropdown(suggestions, 'trit', false)).toEqual({
      visibleSuggestions: ['Tritanium', 'Trigger'],
    });
  });

  it('hides a stale resolution whose query no longer matches the input', () => {
    expect(deriveTerminalDropdown(suggestions, 'pyer', false).visibleSuggestions).toEqual([]);
  });

  it('withholds suggestions while an error is showing', () => {
    expect(deriveTerminalDropdown(suggestions, 'trit', true).visibleSuggestions).toEqual([]);
  });
});
