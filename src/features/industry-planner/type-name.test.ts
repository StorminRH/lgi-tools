import { expect, test } from 'vitest';
import { typeName, typeNamer } from './type-name';

test('typeName reads materialNames and falls back to the unresolved type label', () => {
  const structure = { materialNames: { 34: 'Tritanium' } };
  expect(typeName(structure, 34)).toBe('Tritanium');
  expect(typeName(structure, 35)).toBe('Type 35');

  const nameOf = typeNamer(structure);
  expect([34, 35].map(nameOf)).toEqual(['Tritanium', 'Type 35']);
});
