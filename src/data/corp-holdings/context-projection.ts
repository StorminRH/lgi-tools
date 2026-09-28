import { z } from 'zod';
import type { MemberBase } from './context';
import type { HangarDivision, HoldingIndex, Interior } from './placement';

const STRUCTURE_ID_FLOOR = 1_000_000_000_000;

const id = z.number().int().positive();

const corporationSchema = z.object({ home_station_id: id.optional() });

const divisionsSchema = z.object({
  hangar: z.array(z.object({ division: z.number().int().min(1).max(7), name: z.string().optional() })).optional(),
});

const memberTrackingSchema = z.array(z.object({ character_id: id, base_id: id.optional() }));

const assetNamesSchema = z.array(z.object({ item_id: id, name: z.string() }));

const structureSchema = z.object({ name: z.string() });

/** The public corporation record: the HQ station, absent for a corp with no home station. */
export function parseCorporationBody(body: unknown): { hqStationId: number | null } | null {
  const parsed = corporationSchema.safeParse(body);
  return parsed.success ? { hqStationId: parsed.data.home_station_id ?? null } : null;
}

/** The divisions record: only the hangar divisions the corp renamed carry a name. */
export function parseDivisionsBody(body: unknown): Partial<Record<HangarDivision, string>> | null {
  const parsed = divisionsSchema.safeParse(body);
  if (!parsed.success) return null;
  const names: Partial<Record<HangarDivision, string>> = {};
  for (const entry of parsed.data.hangar ?? []) {
    if (entry.name !== undefined && entry.name.length > 0) names[entry.division as HangarDivision] = entry.name;
  }
  return names;
}

/** The member tracking list, kept to the given linked characters. */
export function parseMemberTrackingBody(body: unknown, linkedCharacterIds: ReadonlySet<number>): MemberBase[] | null {
  const parsed = memberTrackingSchema.safeParse(body);
  if (!parsed.success) return null;
  return parsed.data
    .filter((member) => linkedCharacterIds.has(member.character_id))
    .map((member) => ({ characterId: member.character_id, baseId: member.base_id ?? null }));
}

/** The asset names reply: item id → name, keyed as the profile stores it. */
export function parseAssetNamesBody(body: unknown): Record<string, string> | null {
  const parsed = assetNamesSchema.safeParse(body);
  if (!parsed.success) return null;
  return Object.fromEntries(parsed.data.filter((row) => row.name.length > 0).map((row) => [String(row.item_id), row.name]));
}

/** The public structure record. */
export function parseStructureBody(body: unknown): string | null {
  const parsed = structureSchema.safeParse(body);
  return parsed.success ? parsed.data.name : null;
}

function rootOf(interior: Interior): number | null {
  return interior.kind === 'within' ? interior.placement.rootId : interior.rootId;
}

/** Every container the index knows, outermost and nested alike; each is its own parent node. */
export function unnamedContainerIds(index: HoldingIndex, named: ReadonlyMap<number, string>): number[] {
  const ids = new Set<number>();
  for (const interior of index.interiors.values()) {
    const innermost = interior.kind === 'within' ? interior.placement.containers.at(-1) : undefined;
    if (innermost !== undefined && !named.has(innermost.itemId)) ids.add(innermost.itemId);
  }
  return [...ids];
}

/** Upwell structures the index roots items at; NPC stations resolve through public names instead. */
export function unnamedStructureIds(index: HoldingIndex, named: ReadonlyMap<number, string>): number[] {
  const ids = new Set<number>();
  for (const interior of index.interiors.values()) {
    const rootId = rootOf(interior);
    if (rootId !== null && rootId >= STRUCTURE_ID_FLOOR && !named.has(rootId)) ids.add(rootId);
  }
  return [...ids];
}

export function mergeNames(prior: ReadonlyMap<number, string>, fresh: Record<string, string>): Record<string, string> {
  return { ...Object.fromEntries([...prior].map(([key, name]) => [String(key), name])), ...fresh };
}
