import { expect, test } from 'vitest';
import { codesBySystem, compareSystemCodes } from './code-sets';

test('codesBySystem collapses repeated pairs into one code set per system', () => {
  const grouped = codesBySystem([
    { systemId: 31000005, code: 'N766' },
    { systemId: 31000005, code: 'C247' },
    { systemId: 31000005, code: 'N766' },
    { systemId: 30000142, code: 'K162' },
  ]);

  expect(grouped).toEqual(
    new Map([
      [31000005, new Set(['N766', 'C247'])],
      [30000142, new Set(['K162'])],
    ]),
  );
});

test('compareSystemCodes classifies the key union in numeric order with default-sorted codes', () => {
  const left = codesBySystem([
    { systemId: 10, code: 'N766' },
    { systemId: 10, code: 'C247' },
    { systemId: 9, code: 'B449' },
    { systemId: 100, code: 'b449' },
    { systemId: 100, code: 'C247' },
    { systemId: 2, code: 'A641' },
  ]);
  const right = codesBySystem([
    { systemId: 100, code: 'C247' },
    { systemId: 100, code: 'b449' },
    { systemId: 9, code: 'B449' },
    { systemId: 9, code: 'A641' },
    { systemId: 30, code: 'Z060' },
    { systemId: 30, code: 'H296' },
  ]);

  expect(compareSystemCodes(left, right)).toEqual([
    { kind: 'left-only', systemId: 2, left: ['A641'] },
    { kind: 'different', systemId: 9, left: ['B449'], right: ['A641', 'B449'] },
    { kind: 'left-only', systemId: 10, left: ['C247', 'N766'] },
    { kind: 'right-only', systemId: 30, right: ['H296', 'Z060'] },
    { kind: 'equal', systemId: 100 },
  ]);
  expect(compareSystemCodes(right, left)).toEqual([
    { kind: 'right-only', systemId: 2, right: ['A641'] },
    { kind: 'different', systemId: 9, left: ['A641', 'B449'], right: ['B449'] },
    { kind: 'right-only', systemId: 10, right: ['C247', 'N766'] },
    { kind: 'left-only', systemId: 30, left: ['H296', 'Z060'] },
    { kind: 'equal', systemId: 100 },
  ]);
});

test('compareSystemCodes keeps code order to the default sort, not locale order', () => {
  const comparison = compareSystemCodes(
    codesBySystem([
      { systemId: 1, code: 'b449' },
      { systemId: 1, code: 'N766' },
    ]),
    codesBySystem([
      { systemId: 1, code: 'N766' },
      { systemId: 1, code: 'C247' },
    ]),
  );

  expect(comparison).toEqual([
    { kind: 'different', systemId: 1, left: ['N766', 'b449'], right: ['C247', 'N766'] },
  ]);
});
