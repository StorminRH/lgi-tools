// API wire contracts owned by the wormhole-sites feature (3.4.T). The detail
// response is `SiteDetail` and errors are `ApiError` — both already exported
// wire shapes in ./types (no Date fields, so the TS type IS the wire truth).
import { z } from 'zod';
import { SITE_TYPES, WORMHOLE_CLASSES } from './schema';
import type { SiteListItem } from './types';

// ── GET /api/sites ──────────────────────────────────────────────────────

/**
 * Boundary validator for sites query schema; successful parsing yields the normalized wormhole
 * sites input consumed internally.
 */
export const sitesQuerySchema = z.object({
  type: z.enum(SITE_TYPES).optional(),
  class: z.enum(WORMHOLE_CLASSES).optional(),
});

/**
 * List response row: makes the ISK source explicit so consumers can't mistake
 * the Sheet's static rollup for the live-overlaid value returned by
 * /api/sites/[id]. The list endpoint never applies the live overlay.
 */
export type SiteListApiItem = Omit<SiteListItem, 'resourceValueIsk'> & {
  sheetResourceValueIsk: SiteListItem['resourceValueIsk'];
};

// ── GET /api/sites/[id] ─────────────────────────────────────────────────

// Postgres `serial` is signed 32-bit, so site IDs cannot exceed this. Reject
// anything outside that range up-front so we don't hand the DB a number it'll
// refuse with a 500.
const PG_SERIAL_MAX = 2_147_483_647;

/**
 * Plain positive decimal only — no leading zeros, no signs, no whitespace,
 * no hex/scientific notation, no trailing garbage that parseInt would
 * silently strip.
 */
export const siteIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().positive().max(PG_SERIAL_MAX)),
});
