import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { FAR_SIDE_WORMHOLE_CODE } from '@/data/eve-data/wormhole-contract';
import {
  ScannerTypeCombo,
  scannerTypeSuggestionGroups,
} from './scanner-type-combo';

const CODES = ['B274', 'N110', 'Z060', 'C247', 'P060'];

it('groups type suggestions from empty click through typed filters', () => {
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
});

it('labels the type combo field and keeps the destination class on a typed hole', () => {
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
});
