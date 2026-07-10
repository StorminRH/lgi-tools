import { describe, expect, it } from 'vitest';
import { systemNameFrom } from './use-system-search';

const SYSTEMS = [
  { id: 30000142, name: 'Jita', security: 0.9 },
  { id: 30000143, name: 'Niyabainen', security: 0.9 },
];

describe('systemNameFrom', () => {
  it('resolves a known id against the loaded index', () => {
    expect(systemNameFrom(SYSTEMS, 30000143)).toBe('Niyabainen');
  });

  it('is null before the index loads, for a null id, and for an unknown id', () => {
    expect(systemNameFrom(null, 30000143)).toBeNull();
    expect(systemNameFrom(SYSTEMS, null)).toBeNull();
    expect(systemNameFrom(SYSTEMS, 99)).toBeNull();
  });
});
