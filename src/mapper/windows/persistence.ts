import { z } from 'zod';
import {
  DOCK_MODES,
  MIN_FLOATING_SIZE,
  type DockMode,
  type WindowRect,
} from './window-model';

/** Device-local key; probe helpers mirror this string across the docs zone. */
export const WINDOW_STORAGE_KEY = 'lgi:map:windows:v1';

const rectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().min(MIN_FLOATING_SIZE.width),
  height: z.number().finite().min(MIN_FLOATING_SIZE.height),
});

const recordSchema = z.object({
  v: z.literal(1),
  mode: z.enum(DOCK_MODES),
  rect: rectSchema.optional(),
});

/** Per-device dock mode and last floating rectangle; never synchronized. */
export interface WindowRecord {
  readonly v: 1;
  readonly mode: DockMode;
  readonly rect?: WindowRect;
}

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Reads validated device-local window presentation, returning `null` on any boundary failure. */
export function readWindowRecord(storage = safeStorage()): WindowRecord | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(WINDOW_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = recordSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Writes device-local window presentation and silently degrades when storage refuses it. */
export function writeWindowRecord(
  record: WindowRecord,
  storage = safeStorage(),
): void {
  if (storage === null) return;
  try {
    storage.setItem(WINDOW_STORAGE_KEY, JSON.stringify(recordSchema.parse(record)));
  } catch {
    // Local presentation must never make the map unavailable (private mode, quota, stale shape).
  }
}

/** Test-only key contract; production code consumes the helpers above. */
export const __TEST_ONLY__ = { STORAGE_KEY: WINDOW_STORAGE_KEY };
