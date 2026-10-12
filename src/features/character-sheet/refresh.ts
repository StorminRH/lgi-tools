import { expiryFor, isExpired } from '@/data/esi-store';
import type { EsiReadSession } from '@/data/esi-store/session';
import { routeDeclaration } from '@/lib/esi-datasets/routes';
import { mapByIdDroppingNulls } from '@/lib/fan-out';
import { memoizeAsync } from '@/lib/memoize';
import {
  makeCharacterDescriptor,
  type OwnerSyncDescriptor,
  type OwnerSyncResult,
  runOwnerSync,
  type SingleOwnerRead,
} from '@/platform/owner-sync';
import { STRUCTURE_LOOKUP_CONCURRENCY, STRUCTURE_LOOKUP_ROUTE } from './keys';
import {
  planSectionRead,
  planStructures,
  readSectionState,
  referencedStructureIds,
  unresolvedStructureIds,
} from './plan';
import { SHEET_SECTION_KEYS, SHEET_SECTIONS } from './sections';
import { canSyncSection } from './sync-eligibility';
import type {
  DirectSectionKey,
  DirectSectionSpec,
  SectionEnvelope,
  SectionSyncState,
  SheetPart,
  SheetPort,
  SheetSectionKey,
  SheetSections,
} from './types';

const DIRECT_SECTION_KEYS = SHEET_SECTION_KEYS.filter(
  (key): key is DirectSectionKey => key !== 'structures',
);

/**
 * A hidden structure name is a 403 the lookup answered with no Expires, so
 * it is retried at CCP's published cache time for the route, counted from
 * the section's stamp: still CCP's number, not a window of ours.
 */
const STRUCTURE_LOOKUP_CACHE_SECONDS = routeDeclaration(STRUCTURE_LOOKUP_ROUTE).specCacheSeconds;

interface SectionSave<K extends SheetSectionKey> {
  envelope: SectionEnvelope<K>;
}

async function readParts<K extends DirectSectionKey>(
  port: SheetPort,
  session: EsiReadSession,
  characterId: number,
  accessToken: string,
  spec: DirectSectionSpec<K>,
): Promise<Record<SheetPart<K>, SingleOwnerRead>> {
  const parts = Object.keys(spec.parts) as SheetPart<K>[];
  const reads = await Promise.all(
    parts.map((part) => port.readEndpoint(session, characterId, spec.parts[part].endpoint, accessToken)),
  );
  return Object.fromEntries(parts.map((part, i) => [part, reads[i]])) as Record<SheetPart<K>, SingleOwnerRead>;
}

function sectionDescriptor<K extends DirectSectionKey>(
  port: SheetPort,
  spec: DirectSectionSpec<K>,
): OwnerSyncDescriptor<number, SectionSyncState<K>, SectionSave<K>, EsiReadSession> {
  return makeCharacterDescriptor<SectionSyncState<K>, SectionSave<K>, EsiReadSession>(
    {
      now: port.now,
      listCharacters: port.listCharacters,
      vendToken: port.vendToken,
      isDue: (characterId) => port.isSectionDue(characterId, spec.key),
      openSession: port.openSession,
      readSyncState: async (characterId) => readSectionState(await port.readSheet(characterId), spec.key),
      stampFresh: (characterId) => port.stampSection(characterId, spec.key),
      recordRefusal: (characterId, expiresAt) => port.recordSectionRefusal(characterId, spec.key, expiresAt),
    },
    {
      eligible: (owner) => canSyncSection(spec.key, owner),
      fetchAndPlan: async (characterId, accessToken, state, session) => {
        const reads = await readParts(port, session, characterId, accessToken, spec);
        const plan = planSectionRead(spec, reads, state?.previous ?? null, port.now());
        // A denied envelope keeps none of the parts that answered 200: their
        // expiries are recorded, their ETags are not, so recovery reads bodies.
        if (plan.kind === 'save' && plan.envelope.denied === true) session.discardBodies();
        return plan;
      },
      save: (characterId, payload) => port.mergeSection(characterId, spec.key, payload.envelope),
    },
  );
}

interface StructuresSyncState extends SectionSyncState<'structures'> {
  referenced: number[];
  unresolved: number[];
}

/** Whether the hidden names in the stored section may be asked for again. */
function hiddenRetryDue(previous: SectionEnvelope<'structures'> | null, now: Date): boolean {
  if (previous?.data == null) return false;
  const hidden = Object.values(previous.data.names).some((name) => name.kind === 'hidden');
  return hidden && isExpired(expiryFor(null, STRUCTURE_LOOKUP_CACHE_SECONDS, Date.parse(previous.refreshedAt)), now.getTime());
}

/** The structures section has no stored answer of its own: it is due for a reference it has never resolved, or a hidden name it may retry. */
function structuresDue(sheet: SheetSections | null, now: Date): boolean {
  return unresolvedStructureIds(sheet).length > 0 || hiddenRetryDue(sheet?.structures ?? null, now);
}

function structuresDescriptor(
  port: SheetPort,
): OwnerSyncDescriptor<number, StructuresSyncState, SectionSave<'structures'>, EsiReadSession> {
  // The due check and the state read see one row per character for this pass.
  const readSheet = memoizeAsync((characterId: number) => port.readSheet(characterId));
  return makeCharacterDescriptor<StructuresSyncState, SectionSave<'structures'>, EsiReadSession>(
    {
      now: port.now,
      listCharacters: port.listCharacters,
      vendToken: port.vendToken,
      isDue: async (characterId) => structuresDue(await readSheet(characterId), port.now()),
      openSession: port.openSession,
      readSyncState: async (characterId) => {
        const sheet = await readSheet(characterId);
        return {
          ...readSectionState(sheet, 'structures'),
          referenced: referencedStructureIds(sheet),
          unresolved: unresolvedStructureIds(sheet),
        };
      },
      stampFresh: (characterId) => port.stampSection(characterId, 'structures'),
    },
    {
      eligible: (owner) => canSyncSection('structures', owner),
      fetchAndPlan: async (characterId, accessToken, state, session) => {
        const previous = state?.previous ?? null;
        const retryHidden = hiddenRetryDue(previous, port.now());
        const unresolved = new Set(state?.unresolved ?? []);
        const readIds = (state?.referenced ?? []).filter((id) =>
          unresolved.has(id) || (retryHidden && previous?.data?.names[String(id)]?.kind === 'hidden'),
        );
        const reads = await mapByIdDroppingNulls(readIds, (id) => port.readStructure(session, id, accessToken), STRUCTURE_LOOKUP_CONCURRENCY);
        return planStructures(state?.referenced ?? [], previous?.data ?? null, reads, port.now());
      },
      save: (characterId, payload) => port.mergeSection(characterId, 'structures', payload.envelope),
    },
  );
}

async function refreshDirectSections(
  port: SheetPort,
  userId: string,
): Promise<OwnerSyncResult[]> {
  // Each direct section reads and writes only its own key, so one row snapshot per
  // character serves the whole phase. The structures phase reads the merged row afresh.
  const phasePort: SheetPort = { ...port, readSheet: memoizeAsync((characterId) => port.readSheet(characterId)) };
  const results = await Promise.all(
    DIRECT_SECTION_KEYS.map((key) => runOwnerSync(sectionDescriptor(phasePort, SHEET_SECTIONS[key]), userId)),
  );
  return results.flat();
}

function refreshStructureNames(
  port: SheetPort,
  userId: string,
): Promise<OwnerSyncResult[]> {
  return runOwnerSync(structuresDescriptor(port), userId);
}

export async function refreshCharacterSheetForUser(
  port: SheetPort,
  userId: string,
): Promise<OwnerSyncResult[]> {
  const direct = await refreshDirectSections(port, userId);
  const structures = await refreshStructureNames(port, userId);
  return [...direct, ...structures];
}
