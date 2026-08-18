import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { FAR_SIDE_WORMHOLE_CODE } from '@/data/eve-data/wormhole-contract';
import { UNSET_FIELD } from '../authoring/connection-field-group';
import { wormholeTypeSearch } from '../authoring/wormhole-type-search';
import {
  commitScannerIdentifyQuery,
  commitScannerLeadsQuery,
  commitScannerLeadsValue,
  ScannerIdentifyCombo,
  ScannerLeadsControl,
  ScannerTypeCombo,
  scannerIdentifySuggestionGroups,
  scannerLeadsSeed,
  scannerLeadsSuggestionGroups,
  scannerLifeReadout,
  scannerMassReadout,
  scannerTypeSuggestionGroups,
} from './scanner-inline-cells';

const CODES = ['B274', 'N110', 'Z060', 'C247', 'P060'];

it('groups type, identify, and destination suggestions from empty click through typed filters', () => {
  expect(scannerTypeSuggestionGroups('', CODES, ['N110', 'Z060'])).toEqual([
    { label: 'Statics', items: ['N110', 'Z060'] },
    { label: 'Inbound', items: [FAR_SIDE_WORMHOLE_CODE] },
  ]);
  expect(scannerTypeSuggestionGroups('n', CODES, ['N110', 'Z060'])).toEqual([
    { label: 'Matches', items: ['N110'] },
  ]);
  expect(scannerTypeSuggestionGroups('k', CODES, ['N110'])).toEqual([
    { label: 'Matches', items: [FAR_SIDE_WORMHOLE_CODE] },
  ]);

  const classLabelOf = (code: string) => (code === 'N110' ? 'HS' : null);
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
  expect(
    scannerIdentifySuggestionGroups('c', CODES, ['N110'], classLabelOf),
  ).toEqual([
    { label: 'Matches', items: [{ value: 'type:C247', text: 'C247', meta: '' }] },
    {
      label: 'Identify',
      items: [{ value: 'group:Combat Site', text: 'Combat', meta: '' }],
    },
  ]);

  const systems = [
    { id: 31_000_001, name: 'J120924', security: null },
    { id: 30_000_142, name: 'Jita', security: 0.9 },
  ];
  const emptyClass = scannerLeadsSuggestionGroups('', systems, '');
  expect(emptyClass).toEqual([
    {
      label: 'Class',
      items: [
        { value: UNSET_FIELD, text: 'Unset', meta: '' },
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
  ).toEqual(emptyClass);
  expect(
    scannerLeadsSuggestionGroups('', systems, '', [
      { connectionId: 'inbound', label: 'J160650 - C3', systemId: 31_000_002 },
    ]),
  ).toEqual([
    {
      label: 'Origin',
      items: [{ value: 'origin:inbound', text: 'J160650 - C3', meta: '' }],
    },
    {
      label: 'Class',
      items: emptyClass[0]!.items,
    },
  ]);
  expect(scannerLeadsSuggestionGroups('j12', systems, '')).toEqual([
    { label: 'Systems', items: [{ value: 'system:31000001', text: 'J120924', meta: '' }] },
  ]);
  expect(scannerLeadsSuggestionGroups('dang', systems, '')).toEqual([
    {
      label: 'Class',
      items: [{ value: 'hint:dangerous', text: 'Dangerous (C4–C5)', meta: '' }],
    },
  ]);
  expect(scannerLeadsSeed(null, { label: 'J120924 - C2', tone: 'text-wh-c2' })).toBe(
    'J120924 - C2',
  );
  expect(scannerLeadsSeed('dangerous', null)).toBe('Dangerous (C4–C5)');
  expect(scannerLeadsSeed(null, null)).toBe('');
});

it('commits identify and destination picks, including unique/ambiguous inbound and no-ops on settled systems', () => {
  const parseType = wormholeTypeSearch(CODES, { preferredCodes: ['N110'] }).parse;
  const onIdentify = vi.fn();
  commitScannerIdentifyQuery('C247', parseType, onIdentify);
  expect(onIdentify).toHaveBeenCalledWith('Wormhole', 'C247');
  onIdentify.mockClear();
  commitScannerIdentifyQuery('gas', parseType, onIdentify);
  expect(onIdentify).toHaveBeenCalledWith('Gas Site');
  onIdentify.mockClear();
  commitScannerIdentifyQuery('zzzz', parseType, onIdentify);
  expect(onIdentify).not.toHaveBeenCalled();

  const onChange = vi.fn();
  const onSetDestination = vi.fn();
  const onLinkOrigin = vi.fn();
  commitScannerLeadsValue(UNSET_FIELD, onChange, onSetDestination, onLinkOrigin);
  expect(onSetDestination).toHaveBeenCalledWith(null);
  expect(onChange).not.toHaveBeenCalled();
  expect(onLinkOrigin).not.toHaveBeenCalled();
  onChange.mockClear();
  onSetDestination.mockClear();
  commitScannerLeadsValue('hint:dangerous', onChange, onSetDestination, onLinkOrigin);
  expect(onSetDestination).not.toHaveBeenCalled();
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
  onLinkOrigin.mockClear();
  commitScannerLeadsValue(
    'system:31000001',
    onChange,
    onSetDestination,
    onLinkOrigin,
    31_000_001,
  );
  expect(onSetDestination).not.toHaveBeenCalled();
  onSetDestination.mockClear();
  commitScannerLeadsValue(
    'system:31000002',
    onChange,
    onSetDestination,
    onLinkOrigin,
    31_000_001,
    [{ connectionId: 'inbound', label: 'J160650 - C3', systemId: 31_000_002 }],
  );
  expect(onLinkOrigin).toHaveBeenCalledWith('inbound');
  expect(onSetDestination).not.toHaveBeenCalled();
  onLinkOrigin.mockClear();
  commitScannerLeadsValue(
    'system:31000002',
    onChange,
    onSetDestination,
    onLinkOrigin,
    31_000_001,
    [
      { connectionId: 'inbound-a', label: 'J160650 - C3', systemId: 31_000_002 },
      { connectionId: 'inbound-b', label: 'J160650 - C3', systemId: 31_000_002 },
    ],
  );
  expect(onLinkOrigin).not.toHaveBeenCalled();
  expect(onSetDestination).toHaveBeenCalledWith(31_000_002);

  const parseSystem = (input: string) =>
    input.startsWith('J12')
      ? { ok: true as const, params: { system: { id: 31_000_001 } } }
      : { ok: false as const };
  const leads = [{
    connectionId: 'inbound',
    label: 'J160650 - C3',
    systemId: 31_000_002,
  }];
  onChange.mockClear();
  onSetDestination.mockClear();
  onLinkOrigin.mockClear();
  commitScannerLeadsQuery('', parseSystem, leads, onChange, onSetDestination, onLinkOrigin);
  expect(onSetDestination).toHaveBeenCalledWith(null);
  expect(onChange).not.toHaveBeenCalled();
  onChange.mockClear();
  onSetDestination.mockClear();
  commitScannerLeadsQuery(
    'J160650',
    parseSystem,
    leads,
    onChange,
    onSetDestination,
    onLinkOrigin,
  );
  expect(onLinkOrigin).toHaveBeenCalledWith('inbound');
  onLinkOrigin.mockClear();
  commitScannerLeadsQuery(
    'Dangerous (C4–C5)',
    parseSystem,
    [],
    onChange,
    onSetDestination,
    onLinkOrigin,
  );
  expect(onSetDestination).not.toHaveBeenCalled();
  expect(onChange).toHaveBeenCalledWith('dangerous');
  onChange.mockClear();
  onSetDestination.mockClear();
  commitScannerLeadsQuery(
    'J120924 - C2',
    parseSystem,
    [],
    onChange,
    onSetDestination,
    onLinkOrigin,
  );
  expect(onSetDestination).toHaveBeenCalledWith(31_000_001);
  onSetDestination.mockClear();
  commitScannerLeadsQuery(
    'J120924 - C2',
    parseSystem,
    [{ connectionId: 'inbound', label: 'J160650 - C3', systemId: 31_000_001 }],
    onChange,
    onSetDestination,
    onLinkOrigin,
  );
  expect(onLinkOrigin).toHaveBeenCalledWith('inbound');
  expect(onSetDestination).not.toHaveBeenCalled();
  onLinkOrigin.mockClear();
  commitScannerLeadsQuery(
    '  J120924 - C2  ',
    parseSystem,
    [],
    onChange,
    onSetDestination,
    onLinkOrigin,
  );
  expect(onSetDestination).toHaveBeenCalledWith(31_000_001);
  onSetDestination.mockClear();
  commitScannerLeadsQuery(
    'J120924 - C2',
    parseSystem,
    [],
    onChange,
    onSetDestination,
    onLinkOrigin,
    31_000_001,
  );
  expect(onSetDestination).not.toHaveBeenCalled();
  onSetDestination.mockClear();
  onLinkOrigin.mockClear();
  onChange.mockClear();
  commitScannerLeadsQuery(
    'J160650',
    () => ({ ok: false }),
    [
      { connectionId: 'first', label: 'J160650 - C3', systemId: 31_000_002 },
      { connectionId: 'second', label: 'J160650 - C3', systemId: 31_000_002 },
    ],
    onChange,
    onSetDestination,
    onLinkOrigin,
  );
  expect(onLinkOrigin).not.toHaveBeenCalled();
  expect(onSetDestination).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
});

it('labels scanner combo fields and uses compact mass/life selected-state text', () => {
  const type = renderToStaticMarkup(
    createElement(ScannerTypeCombo, {
      code: 'C247',
      className: 'C3',
      codes: CODES,
      preferredCodes: ['C247'],
      classLabelOf: () => 'C3',
      rowId: 'WHL-001',
      disabled: false,
      onCommit: vi.fn(),
    }),
  );
  expect(type).toContain('aria-label="Type WHL-001"');
  expect(type).toContain('placeholder="Unresolved"');
  expect(type).toContain('data-signature-class');
  expect(type).toContain('C3');

  const identify = renderToStaticMarkup(
    createElement(ScannerIdentifyCombo, {
      codes: CODES,
      preferredCodes: ['N110'],
      classLabelOf: () => 'HS',
      rowId: 'ABC-123',
      disabled: false,
      onIdentify: vi.fn(),
    }),
  );
  expect(identify).toContain('aria-label="Name ABC-123"');
  expect(identify).toContain('placeholder="Unresolved"');

  const leads = renderToStaticMarkup(
    createElement(ScannerLeadsControl, {
      hint: null,
      destination: { label: 'J120924 - C2', tone: 'text-wh-c2' },
      originLeads: [],
      originSystemId: 31_000_142,
      rowId: 'WHL-001',
      disabled: false,
      onChange: vi.fn(),
      onSetDestination: vi.fn(),
      onLinkOrigin: vi.fn(),
    }),
  );
  expect(leads).toContain('aria-label="Destination WHL-001"');
  expect(leads).toContain('J120924 - C2');

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
