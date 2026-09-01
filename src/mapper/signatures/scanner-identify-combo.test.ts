import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { wormholeTypeSearch } from '../authoring/wormhole-type-search';
import {
  commitScannerIdentifyQuery,
  ScannerIdentifyCombo,
  scannerIdentifySuggestionGroups,
} from './scanner-identify-combo';

const CODES = ['B274', 'N110', 'Z060', 'C247', 'P060'];

it('groups identify suggestions from empty click through typed filters', () => {
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
});

it('commits typed identify text as a wormhole type or a site group', () => {
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
});

it('labels the unknown-row identify field', () => {
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
});
