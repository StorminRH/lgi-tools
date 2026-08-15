import { describe, expect, it, vi } from 'vitest';
import { FAR_SIDE_WORMHOLE_CODE } from '@/data/eve-data/wormhole-contract';
import {
  commitScannerLeadsValue,
  scannerIdentifySuggestionGroups,
  scannerLeadsSeed,
  scannerLeadsSuggestionGroups,
  scannerLifeReadout,
  scannerMassReadout,
  scannerTypeSuggestionGroups,
} from './scanner-inline-cells';

const CODES = ['B274', 'N110', 'Z060', 'C247', 'P060'];

describe('scannerTypeSuggestionGroups', () => {
  it('lists statics then K162 when the query is empty', () => {
    expect(scannerTypeSuggestionGroups('', CODES, ['N110', 'Z060'])).toEqual([
      { label: 'Statics', items: ['N110', 'Z060'] },
      { label: 'Inbound', items: [FAR_SIDE_WORMHOLE_CODE] },
    ]);
  });

  it('prefix-filters the codex and keeps statics first', () => {
    expect(scannerTypeSuggestionGroups('n', CODES, ['N110', 'Z060'])).toEqual([
      { label: 'Matches', items: ['N110'] },
    ]);
  });

  it('surfaces K162 when the typed prefix matches', () => {
    expect(scannerTypeSuggestionGroups('k', CODES, ['N110'])).toEqual([
      { label: 'Matches', items: [FAR_SIDE_WORMHOLE_CODE] },
    ]);
  });
});

describe('scannerIdentifySuggestionGroups', () => {
  const classLabelOf = (code: string) => (code === 'N110' ? 'HS' : null);

  it('lists statics, K162, then short identify labels when empty', () => {
    expect(
      scannerIdentifySuggestionGroups('', CODES, ['N110', 'Z060'], classLabelOf),
    ).toEqual([
      {
        label: 'Statics',
        items: [
          { value: 'type:N110', text: 'N110', meta: 'HS' },
          { value: 'type:Z060', text: 'Z060', meta: '' },
        ],
      },
      {
        label: 'Inbound',
        items: [{ value: 'type:K162', text: 'K162', meta: '' }],
      },
      {
        label: 'Identify',
        items: [
          { value: 'group:Wormhole', text: 'Wormhole', meta: '' },
          { value: 'group:Combat Site', text: 'Combat', meta: '' },
          { value: 'group:Ore Site', text: 'Ore', meta: '' },
          { value: 'group:Gas Site', text: 'Gas', meta: '' },
          { value: 'group:Data Site', text: 'Data', meta: '' },
          { value: 'group:Relic Site', text: 'Relic', meta: '' },
        ],
      },
    ]);
  });

  it('filters hole codes and identify labels together', () => {
    expect(
      scannerIdentifySuggestionGroups('c', CODES, ['N110'], classLabelOf),
    ).toEqual([
      { label: 'Matches', items: [{ value: 'type:C247', text: 'C247', meta: '' }] },
      {
        label: 'Identify',
        items: [{ value: 'group:Combat Site', text: 'Combat', meta: '' }],
      },
    ]);
  });
});

describe('scannerLeadsSuggestionGroups', () => {
  const systems = [
    { id: 31_000_001, name: 'J120924', security: null },
    { id: 30_000_142, name: 'Jita', security: 0.9 },
  ];

  it('lists unset and class hints when the query is empty or still the seed', () => {
    const empty = scannerLeadsSuggestionGroups('', systems, '');
    expect(empty).toEqual([
      {
        label: 'Class',
        items: [
          { value: '', text: 'Unset', meta: '' },
          { value: 'hint:hisec', text: 'High-sec', meta: '' },
          { value: 'hint:lowsec', text: 'Low-sec', meta: '' },
          { value: 'hint:nullsec', text: 'Null-sec', meta: '' },
          { value: 'hint:unknown', text: 'Unknown (C1–C3)', meta: '' },
          { value: 'hint:dangerous', text: 'Dangerous (C4–C5)', meta: '' },
          { value: 'hint:deadly', text: 'Deadly (C6)', meta: '' },
          { value: 'hint:thera', text: 'Thera', meta: '' },
          { value: 'hint:pochven', text: 'Pochven', meta: '' },
          { value: 'hint:drifter', text: 'Drifter', meta: '' },
        ],
      },
    ]);
    expect(
      scannerLeadsSuggestionGroups('J120924 - C2', systems, 'J120924 - C2'),
    ).toEqual(empty);
  });

  it('surfaces named origin systems first on an empty click', () => {
    expect(
      scannerLeadsSuggestionGroups('', systems, '', [
        { connectionId: 'inbound', label: 'J160650 - C3' },
      ]),
    ).toEqual([
      {
        label: 'Origin',
        items: [{ value: 'origin:inbound', text: 'J160650 - C3', meta: '' }],
      },
      {
        label: 'Class',
        items: [
          { value: '', text: 'Unset', meta: '' },
          { value: 'hint:hisec', text: 'High-sec', meta: '' },
          { value: 'hint:lowsec', text: 'Low-sec', meta: '' },
          { value: 'hint:nullsec', text: 'Null-sec', meta: '' },
          { value: 'hint:unknown', text: 'Unknown (C1–C3)', meta: '' },
          { value: 'hint:dangerous', text: 'Dangerous (C4–C5)', meta: '' },
          { value: 'hint:deadly', text: 'Deadly (C6)', meta: '' },
          { value: 'hint:thera', text: 'Thera', meta: '' },
          { value: 'hint:pochven', text: 'Pochven', meta: '' },
          { value: 'hint:drifter', text: 'Drifter', meta: '' },
        ],
      },
    ]);
  });

  it('filters class hints and prefix-matches systems together', () => {
    expect(scannerLeadsSuggestionGroups('j12', systems, '')).toEqual([
      { label: 'Systems', items: [{ value: 'system:31000001', text: 'J120924', meta: '' }] },
    ]);
    expect(scannerLeadsSuggestionGroups('dang', systems, '')).toEqual([
      {
        label: 'Class',
        items: [{ value: 'hint:dangerous', text: 'Dangerous (C4–C5)', meta: '' }],
      },
    ]);
  });

  it('seeds the field from a settled destination or a class hint', () => {
    expect(scannerLeadsSeed(null, { label: 'J120924 - C2', tone: 'text-wh-c2' })).toBe(
      'J120924 - C2',
    );
    expect(scannerLeadsSeed('dangerous', null)).toBe('Dangerous (C4–C5)');
    expect(scannerLeadsSeed(null, null)).toBe('');
  });
});

describe('commitScannerLeadsValue', () => {
  it('clears, applies a class hint, or retargets a system', () => {
    const onChange = vi.fn();
    const onSetDestination = vi.fn();
    const onLinkOrigin = vi.fn();
    commitScannerLeadsValue('', onChange, onSetDestination, onLinkOrigin);
    expect(onSetDestination).toHaveBeenCalledWith(null);
    expect(onChange).toHaveBeenCalledWith(null);
    expect(onLinkOrigin).not.toHaveBeenCalled();
    onChange.mockClear();
    onSetDestination.mockClear();
    commitScannerLeadsValue('hint:dangerous', onChange, onSetDestination, onLinkOrigin);
    expect(onSetDestination).toHaveBeenCalledWith(null);
    expect(onChange).toHaveBeenCalledWith('dangerous');
    onChange.mockClear();
    onSetDestination.mockClear();
    commitScannerLeadsValue('system:31000001', onChange, onSetDestination, onLinkOrigin);
    expect(onSetDestination).toHaveBeenCalledWith(31_000_001);
    expect(onChange).not.toHaveBeenCalled();
    onSetDestination.mockClear();
    commitScannerLeadsValue('origin:inbound', onChange, onSetDestination, onLinkOrigin);
    expect(onLinkOrigin).toHaveBeenCalledWith('inbound');
    expect(onSetDestination).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('scanner mass and life abbreviations', () => {
  it('uses compact selected-state text', () => {
    expect(scannerMassReadout('stable')).toBe('>50%');
    expect(scannerMassReadout('reduced')).toBe('<50%');
    expect(scannerMassReadout('critical')).toBe('<10%');
    expect(scannerMassReadout(null)).toBe('—');
    expect(scannerLifeReadout('under_1_day')).toBe('<1d');
    expect(scannerLifeReadout('under_4_hours')).toBe('<4h');
    expect(scannerLifeReadout('under_1_hour')).toBe('<1h');
    expect(scannerLifeReadout('expired')).toBe('Exp');
    expect(scannerLifeReadout(null)).toBe('—');
  });
});
