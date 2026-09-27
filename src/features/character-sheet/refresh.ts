import { freshnessGate, type FreshnessGate } from '@/lib/esi-datasets/freshness';
import {
  makeCharacterDescriptor,
  type OwnerSyncDescriptor,
  type OwnerSyncResult,
  type OwnerSyncRunOptions,
  runOwnerSync,
} from '@/platform/owner-sync';
import {
  planSectionRead,
  planStructures,
  readSectionState,
  referencedStructureIds,
  unresolvedStructureIds,
} from './plan';
import { SHEET_SECTION_KEYS, SHEET_SECTIONS, TIER_ENTRY } from './sections';
import { canSyncSection } from './sync-eligibility';
import type {
  DirectSectionKey,
  DirectSectionSpec,
  PartEtags,
  SectionEnvelope,
  SectionSyncState,
  SheetEsiRead,
  SheetPart,
  SheetPort,
  SheetSectionKey,
} from './types';

const DIRECT_SECTION_KEYS = SHEET_SECTION_KEYS.filter(
  (key): key is DirectSectionKey => key !== 'structures',
);

function sectionGate(key: SheetSectionKey): FreshnessGate {
  return freshnessGate(TIER_ENTRY[SHEET_SECTIONS[key].tier]);
}

const SECTION_GATES = Object.fromEntries(
  SHEET_SECTION_KEYS.map((key) => [key, sectionGate(key)]),
) as Record<SheetSectionKey, FreshnessGate>;

interface SectionSave<K extends SheetSectionKey> {
  envelope: SectionEnvelope<K>;
}

async function readParts<K extends DirectSectionKey>(
  port: SheetPort,
  characterId: number,
  accessToken: string,
  spec: DirectSectionSpec<K>,
  heldEtags: PartEtags<K>,
): Promise<Record<SheetPart<K>, SheetEsiRead>> {
  const parts = Object.keys(spec.parts) as SheetPart<K>[];
  const reads = await Promise.all(
    parts.map((part) =>
      port.readEndpoint(characterId, spec.parts[part].endpoint, accessToken, heldEtags[part] ?? null),
    ),
  );
  return Object.fromEntries(parts.map((part, i) => [part, reads[i]])) as Record<SheetPart<K>, SheetEsiRead>;
}

function sectionDescriptor<K extends DirectSectionKey>(
  port: SheetPort,
  spec: DirectSectionSpec<K>,
): OwnerSyncDescriptor<number, SectionSyncState<K>, SectionSave<K>> {
  return makeCharacterDescriptor<SectionSyncState<K>, SectionSave<K>>(
    {
      now: port.now,
      listCharacters: port.listCharacters,
      vendToken: port.vendToken,
      readSyncState: async (characterId) => readSectionState(await port.readSheet(characterId), spec.key),
      stampFresh: (characterId) => port.stampSection(characterId, spec.key),
    },
    {
      isStale: SECTION_GATES[spec.key].isStale,
      eligible: (owner) => canSyncSection(spec.key, owner),
      fetchAndPlan: async (characterId, accessToken, state) => {
        const reads = await readParts(port, characterId, accessToken, spec, state?.heldEtags ?? {});
        return planSectionRead(spec, reads, state?.previous ?? null, port.now());
      },
      save: (characterId, payload) => port.mergeSection(characterId, spec.key, payload.envelope),
    },
  );
}

interface StructuresSyncState extends SectionSyncState<'structures'> {
  referenced: number[];
  unresolved: number[];
}

function structuresDescriptor(
  port: SheetPort,
): OwnerSyncDescriptor<number, StructuresSyncState, SectionSave<'structures'>> {
  return makeCharacterDescriptor<StructuresSyncState, SectionSave<'structures'>>(
    {
      now: port.now,
      listCharacters: port.listCharacters,
      vendToken: port.vendToken,
      readSyncState: async (characterId) => {
        const sheet = await port.readSheet(characterId);
        return {
          ...readSectionState(sheet, 'structures'),
          referenced: referencedStructureIds(sheet),
          unresolved: unresolvedStructureIds(sheet),
        };
      },
      stampFresh: (characterId) => port.stampSection(characterId, 'structures'),
    },
    {
      isStale: SECTION_GATES.structures.isStale,
      eligible: (owner) => canSyncSection('structures', owner),
      fetchAndPlan: async (characterId, accessToken, state) => {
        const unresolved = state?.unresolved ?? [];
        const reads = await Promise.all(
          unresolved.map(async (id) => [id, await port.readStructure(id, accessToken)] as const),
        );
        return planStructures(
          state?.referenced ?? [],
          state?.previous?.data ?? null,
          new Map(reads),
          port.now(),
        );
      },
      save: (characterId, payload) => port.mergeSection(characterId, 'structures', payload.envelope),
    },
  );
}

async function refreshDirectSections(
  port: SheetPort,
  userId: string,
  options?: OwnerSyncRunOptions,
): Promise<OwnerSyncResult[]> {
  const results = await Promise.all(
    DIRECT_SECTION_KEYS.map((key) => runOwnerSync(sectionDescriptor(port, SHEET_SECTIONS[key]), userId, options)),
  );
  return results.flat();
}

function refreshStructureNames(
  port: SheetPort,
  userId: string,
  options?: OwnerSyncRunOptions,
): Promise<OwnerSyncResult[]> {
  return runOwnerSync(structuresDescriptor(port), userId, options);
}

export async function refreshCharacterSheetForUser(
  port: SheetPort,
  userId: string,
  options?: OwnerSyncRunOptions,
): Promise<OwnerSyncResult[]> {
  const direct = await refreshDirectSections(port, userId, options);
  const structures = await refreshStructureNames(port, userId, options);
  return [...direct, ...structures];
}
