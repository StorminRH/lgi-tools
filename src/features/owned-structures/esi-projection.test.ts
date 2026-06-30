import { describe, expect, it } from 'vitest';
import { parseCorpStructuresBody } from './esi-projection';

describe('parseCorpStructuresBody', () => {
  it('parses + sorts by structure id, stripping the non-projected fields', () => {
    const out = parseCorpStructuresBody([
      {
        structure_id: 1002,
        type_id: 35833, // Fortizar
        system_id: 30000142,
        name: 'B',
        services: [{ name: 'Manufacturing', state: 'online' }],
        state: 'shield_vulnerable',
        fuel_expires: '2026-07-01T00:00:00Z',
      },
      { structure_id: 1001, type_id: 35832, system_id: 30002187, name: 'A' },
    ]);
    expect(out).toEqual([
      { structure_id: 1001, type_id: 35832, system_id: 30002187, name: 'A' },
      { structure_id: 1002, type_id: 35833, system_id: 30000142, name: 'B' },
    ]);
  });

  it('accepts a structure with no name (the field is optional)', () => {
    const out = parseCorpStructuresBody([{ structure_id: 1, type_id: 35832, system_id: 30000142 }]);
    expect(out).toEqual([{ structure_id: 1, type_id: 35832, system_id: 30000142 }]);
  });

  it('returns null on a shape mismatch (keep the stored catalogue, retry next view)', () => {
    expect(parseCorpStructuresBody([{ structure_id: 'x', type_id: 1, system_id: 1 }])).toBeNull();
    expect(parseCorpStructuresBody([{ type_id: 1, system_id: 1 }])).toBeNull();
  });

  it('parses an empty list to an empty array', () => {
    expect(parseCorpStructuresBody([])).toEqual([]);
  });
});
