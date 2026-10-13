import { createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { FAR_SIDE_WORMHOLE_CODE } from '@/data/eve-data/wormhole-contract';
import { ScannerCombo } from './scanner-combo-panel';
import { SignatureClassChip } from './scanner-row-cells';
import {
  ScannerTypeCombo,
  scannerTypeSuggestionGroups,
} from './scanner-type-combo';

// The real shell renders; the spy keeps the props the type combo hands it.
vi.mock('./scanner-combo-panel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./scanner-combo-panel')>();
  return { ...actual, ScannerCombo: vi.fn(actual.ScannerCombo) };
});

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
      onCommit: vi.fn(),
    }),
  );
  expect(type).toContain('aria-label="Type WHL-001"');
  expect(type).toContain('placeholder="Unresolved"');
  expect(type).toContain('data-signature-class');
  expect(type).toContain('C3');
});

it('commits a pressed or entered code only when it parses, and chips the class of the committed code', () => {
  const onCommit = vi.fn();
  const comboFor = (code: string | null, className: string | null) => {
    renderToStaticMarkup(
      createElement(ScannerTypeCombo, {
        code,
        className,
        codes: CODES,
        preferredCodes: ['N110'],
        classLabelOf: (hole) => (hole === 'N110' ? 'HS' : 'C3'),
        rowId: 'WHL-001',
        onCommit,
      }),
    );
    const props = vi.mocked(ScannerCombo).mock.lastCall?.[0];
    if (props === undefined) return expect.unreachable('ScannerCombo did not render');
    return props;
  };

  const typed = comboFor('C247', 'C3');
  expect(typed.query).toBe('C247');
  expect(typed.browsing).toBe(false);
  expect(typed.fieldClassName).not.toContain('font-normal');
  const chip = typed.aside;
  if (!isValidElement(chip)) return expect.unreachable('no class chip');
  expect(chip.type).toBe(SignatureClassChip);
  expect(chip.props).toEqual({ label: 'C3' });

  typed.onCommitValue('n110');
  typed.onCommitQuery(' b274 ');
  typed.onCommitValue('Q999');
  typed.onCommitQuery('not a hole');
  typed.onCommitQuery('');
  expect(onCommit.mock.calls).toEqual([['N110'], ['B274'], [null]]);

  // No class, or no code: the field keeps its row but shows no chip.
  expect(comboFor('C247', null).aside).toBeNull();
  const unresolved = comboFor(null, null);
  expect(unresolved.aside).toBeNull();
  expect(unresolved.query).toBe('');
  expect(unresolved.browsing).toBe(true);
  expect(unresolved.fieldClassName).toContain('font-normal');
  expect(unresolved.groups).toEqual([
    { label: 'Statics', items: [{ value: 'N110', text: 'N110', meta: 'HS' }] },
    {
      label: 'Inbound',
      items: [{ value: FAR_SIDE_WORMHOLE_CODE, text: FAR_SIDE_WORMHOLE_CODE, meta: '' }],
    },
  ]);
});
