export type PercentDraftResult = { ok: true; value: number | null } | { ok: false };

/**
 * A percent typed into a PercentInput. Blank is `null` (nothing entered);
 * otherwise a plain non-negative decimal (`\d+(\.\d+)?`) no greater than `max`.
 * Exponent, hex, signed and bare-dot forms are rejected.
 */
export function parsePercentDraft(draft: string, max: number): PercentDraftResult {
  const t = draft.trim();
  if (t === '') return { ok: true, value: null };
  if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false };
  const n = Number(t);
  if (!Number.isFinite(n) || n > max) return { ok: false };
  return { ok: true, value: n };
}
