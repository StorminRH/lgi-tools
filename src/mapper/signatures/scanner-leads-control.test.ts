import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { UNSET_FIELD } from '../authoring/connection-field-group';
import {
  commitScannerLeadsQuery,
  commitScannerLeadsValue,
  ScannerLeadsControl,
  scannerLeadsSeed,
  scannerLeadsSuggestionGroups,
} from './scanner-leads-control';

it('groups destination suggestions from empty click through typed filters', () => {
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

it('commits destination picks, including unique/ambiguous inbound and no-ops on settled systems', () => {
  const setLeadsTo = vi.fn();
  const setDestination = vi.fn();
  const linkToOrigin = vi.fn();
  const commit = { setLeadsTo, setDestination, linkToOrigin };
  commitScannerLeadsValue(UNSET_FIELD, commit);
  expect(setDestination).toHaveBeenCalledWith(null);
  expect(setLeadsTo).not.toHaveBeenCalled();
  expect(linkToOrigin).not.toHaveBeenCalled();
  setLeadsTo.mockClear();
  setDestination.mockClear();
  commitScannerLeadsValue('hint:dangerous', commit);
  expect(setDestination).not.toHaveBeenCalled();
  expect(setLeadsTo).toHaveBeenCalledWith('dangerous');
  setLeadsTo.mockClear();
  setDestination.mockClear();
  commitScannerLeadsValue('system:31000001', commit);
  expect(setDestination).toHaveBeenCalledWith(31_000_001);
  expect(setLeadsTo).not.toHaveBeenCalled();
  setDestination.mockClear();
  commitScannerLeadsValue('origin:inbound', commit);
  expect(linkToOrigin).toHaveBeenCalledWith('inbound');
  expect(setDestination).not.toHaveBeenCalled();
  expect(setLeadsTo).not.toHaveBeenCalled();
  linkToOrigin.mockClear();
  commitScannerLeadsValue('system:31000001', {
    ...commit,
    originSystemId: 31_000_001,
  });
  expect(setDestination).not.toHaveBeenCalled();
  setDestination.mockClear();
  commitScannerLeadsValue('system:31000002', {
    ...commit,
    originSystemId: 31_000_001,
    originLeads: [
      { connectionId: 'inbound', label: 'J160650 - C3', systemId: 31_000_002 },
    ],
  });
  expect(linkToOrigin).toHaveBeenCalledWith('inbound');
  expect(setDestination).not.toHaveBeenCalled();
  linkToOrigin.mockClear();
  commitScannerLeadsValue('system:31000002', {
    ...commit,
    originSystemId: 31_000_001,
    originLeads: [
      { connectionId: 'inbound-a', label: 'J160650 - C3', systemId: 31_000_002 },
      { connectionId: 'inbound-b', label: 'J160650 - C3', systemId: 31_000_002 },
    ],
  });
  expect(linkToOrigin).not.toHaveBeenCalled();
  expect(setDestination).toHaveBeenCalledWith(31_000_002);

  const parseSystem = (input: string) =>
    input.startsWith('J12')
      ? { ok: true as const, params: { system: { id: 31_000_001 } } }
      : { ok: false as const };
  const leads = [{
    connectionId: 'inbound',
    label: 'J160650 - C3',
    systemId: 31_000_002,
  }];
  setLeadsTo.mockClear();
  setDestination.mockClear();
  linkToOrigin.mockClear();
  commitScannerLeadsQuery('', parseSystem, { ...commit, originLeads: leads });
  expect(setDestination).toHaveBeenCalledWith(null);
  expect(setLeadsTo).not.toHaveBeenCalled();
  setLeadsTo.mockClear();
  setDestination.mockClear();
  commitScannerLeadsQuery('J160650', parseSystem, {
    ...commit,
    originLeads: leads,
  });
  expect(linkToOrigin).toHaveBeenCalledWith('inbound');
  linkToOrigin.mockClear();
  commitScannerLeadsQuery('Dangerous (C4–C5)', parseSystem, {
    ...commit,
    originLeads: [],
  });
  expect(setDestination).not.toHaveBeenCalled();
  expect(setLeadsTo).toHaveBeenCalledWith('dangerous');
  setLeadsTo.mockClear();
  setDestination.mockClear();
  commitScannerLeadsQuery('J120924 - C2', parseSystem, {
    ...commit,
    originLeads: [],
  });
  expect(setDestination).toHaveBeenCalledWith(31_000_001);
  setDestination.mockClear();
  commitScannerLeadsQuery('J120924 - C2', parseSystem, {
    ...commit,
    originLeads: [
      { connectionId: 'inbound', label: 'J160650 - C3', systemId: 31_000_001 },
    ],
  });
  expect(linkToOrigin).toHaveBeenCalledWith('inbound');
  expect(setDestination).not.toHaveBeenCalled();
  linkToOrigin.mockClear();
  commitScannerLeadsQuery('  J120924 - C2  ', parseSystem, {
    ...commit,
    originLeads: [],
  });
  expect(setDestination).toHaveBeenCalledWith(31_000_001);
  setDestination.mockClear();
  commitScannerLeadsQuery('J120924 - C2', parseSystem, {
    ...commit,
    originLeads: [],
    originSystemId: 31_000_001,
  });
  expect(setDestination).not.toHaveBeenCalled();
  setDestination.mockClear();
  linkToOrigin.mockClear();
  setLeadsTo.mockClear();
  commitScannerLeadsQuery('J160650', () => ({ ok: false }), {
    ...commit,
    originLeads: [
      { connectionId: 'first', label: 'J160650 - C3', systemId: 31_000_002 },
      { connectionId: 'second', label: 'J160650 - C3', systemId: 31_000_002 },
    ],
  });
  expect(linkToOrigin).not.toHaveBeenCalled();
  expect(setDestination).not.toHaveBeenCalled();
  expect(setLeadsTo).not.toHaveBeenCalled();
});

it('labels the destination combo field', () => {
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
});
