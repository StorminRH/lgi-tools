import { describe, expect, it } from 'vitest';
import { ESI_DATASET_ENTRIES } from '@/lib/esi-datasets/entries';
import {
  characterLocationPath,
  characterOnlinePath,
  characterRolesPath,
  characterShipPath,
  universeStructurePath,
} from './paths';

const registrySpecPaths = new Set<string>(
  ESI_DATASET_ENTRIES.flatMap((entry) => (entry.upstream.kind === 'esi' ? [...entry.upstream.specPaths] : [])),
);

const BUILDERS = [
  { name: 'characterLocationPath', builder: characterLocationPath, placeholder: '{character_id}' },
  { name: 'characterShipPath', builder: characterShipPath, placeholder: '{character_id}' },
  { name: 'characterOnlinePath', builder: characterOnlinePath, placeholder: '{character_id}' },
  { name: 'characterRolesPath', builder: characterRolesPath, placeholder: '{character_id}' },
  { name: 'universeStructurePath', builder: universeStructurePath, placeholder: '{structure_id}' },
];

describe('shared ESI path builders', () => {
  it.each(BUILDERS)('$name spells a path the ESI dataset registry declares', ({ builder, placeholder }) => {
    const template = builder(1_099_000_000_001).replace('/1099000000001/', `/${placeholder}/`);
    expect(registrySpecPaths.has(template), `${template} missing from the registry`).toBe(true);
  });
});
