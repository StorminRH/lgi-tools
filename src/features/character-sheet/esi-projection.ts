import { z } from 'zod';
import type {
  AttributesPart,
  CharacterPart,
  ClonesPart,
  OnlinePart,
  OrdersPart,
  ShipPart,
  StructureName,
} from './types';

const characterBodySchema = z.object({
  birthday: z.string(),
  security_status: z.number().optional(),
});

const shipBodySchema = z.object({
  ship_type_id: z.number().int(),
  ship_item_id: z.number().int(),
  ship_name: z.string(),
});

const onlineBodySchema = z.object({
  online: z.boolean(),
  last_login: z.string().optional(),
  last_logout: z.string().optional(),
});

const attributesBodySchema = z.object({
  charisma: z.number().int(),
  intelligence: z.number().int(),
  memory: z.number().int(),
  perception: z.number().int(),
  willpower: z.number().int(),
  bonus_remaps: z.number().int().optional(),
  last_remap_date: z.string().optional(),
  accrued_remap_cooldown_date: z.string().optional(),
});

const implantsBodySchema = z.array(z.number().int());

const cloneLocationSchema = z.object({
  location_id: z.number().int(),
  location_type: z.enum(['station', 'structure']),
});

const clonesBodySchema = z.object({
  home_location: cloneLocationSchema.optional(),
  jump_clones: z.array(
    cloneLocationSchema.extend({
      jump_clone_id: z.number().int(),
      implants: z.array(z.number().int()),
      name: z.string().optional(),
    }),
  ),
  last_clone_jump_date: z.string().optional(),
});

const walletBodySchema = z.number();

const journalEntrySchema = z.object({
  id: z.number().int(),
  date: z.string(),
  ref_type: z.string(),
  amount: z.number().optional(),
  balance: z.number().optional(),
  description: z.string(),
});
const journalBodySchema = z.array(journalEntrySchema);

export type EsiJournalEntry = z.infer<typeof journalEntrySchema>;

const structureBodySchema = z.object({
  name: z.string(),
});

const marketOrderSchema = z.object({
  type_id: z.number().int(),
  volume_remain: z.number().int(),
  is_buy_order: z.boolean().optional(),
  is_corporation: z.boolean(),
  escrow: z.number().optional(),
});
const ordersBodySchema = z.array(marketOrderSchema);

export function parseCharacterBody(body: unknown): CharacterPart | null {
  const parsed = characterBodySchema.safeParse(body);
  if (!parsed.success) return null;
  return {
    birthday: parsed.data.birthday,
    securityStatus: parsed.data.security_status ?? null,
  };
}

export function parseCurrentShipBody(body: unknown): ShipPart | null {
  const parsed = shipBodySchema.safeParse(body);
  if (!parsed.success) return null;
  return {
    shipTypeId: parsed.data.ship_type_id,
    shipItemId: parsed.data.ship_item_id,
    shipName: parsed.data.ship_name,
  };
}

export function parseOnlineStatusBody(body: unknown): OnlinePart | null {
  const parsed = onlineBodySchema.safeParse(body);
  if (!parsed.success) return null;
  return {
    online: parsed.data.online,
    lastLogin: parsed.data.last_login ?? null,
    lastLogout: parsed.data.last_logout ?? null,
  };
}

export function parseAttributesBody(body: unknown): AttributesPart | null {
  const parsed = attributesBodySchema.safeParse(body);
  if (!parsed.success) return null;
  return {
    intelligence: parsed.data.intelligence,
    memory: parsed.data.memory,
    perception: parsed.data.perception,
    willpower: parsed.data.willpower,
    charisma: parsed.data.charisma,
    bonusRemaps: parsed.data.bonus_remaps ?? 0,
    lastRemapDate: parsed.data.last_remap_date ?? null,
    accruedRemapCooldownDate: parsed.data.accrued_remap_cooldown_date ?? null,
  };
}

export function parseImplantsBody(body: unknown): number[] | null {
  const parsed = implantsBodySchema.safeParse(body);
  if (!parsed.success) return null;
  return [...parsed.data].sort((a, b) => a - b);
}

export function parseClonesBody(body: unknown): ClonesPart | null {
  const parsed = clonesBodySchema.safeParse(body);
  if (!parsed.success) return null;
  const home = parsed.data.home_location;
  return {
    home: home === undefined ? null : { locationId: home.location_id, locationType: home.location_type },
    jumpClones: parsed.data.jump_clones.map((clone) => ({
      jumpCloneId: clone.jump_clone_id,
      location: { locationId: clone.location_id, locationType: clone.location_type },
      implantTypeIds: [...clone.implants].sort((a, b) => a - b),
      name: clone.name ?? null,
    })),
    lastCloneJumpDate: parsed.data.last_clone_jump_date ?? null,
  };
}

export function parseWalletBody(body: unknown): number | null {
  const parsed = walletBodySchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export function parseJournalNewestFirst(body: unknown): EsiJournalEntry[] | null {
  const parsed = journalBodySchema.safeParse(body);
  if (!parsed.success) return null;
  return [...parsed.data].sort(
    (a, b) => Date.parse(b.date) - Date.parse(a.date) || b.id - a.id,
  );
}

export function parseStructureBody(body: unknown): StructureName | null {
  const parsed = structureBodySchema.safeParse(body);
  return parsed.success ? { kind: 'named', name: parsed.data.name } : null;
}

/** Open personal orders only; orders placed for a corporation are corporate property, as CCP counts them. */
export function parseOrdersBody(body: unknown): OrdersPart | null {
  const parsed = ordersBodySchema.safeParse(body);
  if (!parsed.success) return null;
  const open = parsed.data
    .filter((order) => !order.is_corporation)
    .map((order) => ({
      typeId: order.type_id,
      volumeRemain: order.volume_remain,
      isBuyOrder: order.is_buy_order ?? false,
      escrow: order.is_buy_order === true ? (order.escrow ?? 0) : 0,
    }))
    .sort((a, b) => a.typeId - b.typeId || Number(a.isBuyOrder) - Number(b.isBuyOrder));
  return { open };
}
