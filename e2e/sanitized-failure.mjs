import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const DEFAULT_SANITIZED_FAILURE_DIR = path.join(
  'docs/ux-check/captures/sanitized-failures',
);

/** @typedef {{ directory?: string, id?: string }} SanitizedFailurePersistOptions */

/** @param {string} [value] */
export function sanitizedFailureId(value) {
  const raw = typeof value === 'string' ? value : '';
  return raw.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'unknown';
}

/**
 * @param {{
 *   scenario?: string,
 *   lane?: string,
 *   diagnostics?: unknown[],
 *   classification?: string,
 *   [key: string]: unknown,
 * }} [input]
 */
export function sanitizedFailurePayload(input = {}) {
  return {
    scenario: typeof input.scenario === 'string' && input.scenario ? input.scenario : 'unknown',
    lane: typeof input.lane === 'string' && input.lane ? input.lane : 'unknown',
    diagnostics: Array.isArray(input.diagnostics) ? input.diagnostics : [],
    classification: input.classification === 'prerequisite' ? 'prerequisite' : 'failure',
  };
}

/**
 * @param {{ scenario: string, lane: string, diagnostics: unknown[], classification: string }} payload
 * @param {SanitizedFailurePersistOptions} [options]
 */
export function persistSanitizedFailure(payload, options = {}) {
  const destDir = path.resolve(options.directory ?? DEFAULT_SANITIZED_FAILURE_DIR);
  mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, `${sanitizedFailureId(payload.scenario)}-${sanitizedFailureId(options.id)}.json`);
  writeFileSync(dest, `${JSON.stringify(payload, null, 2)}\n`);
  return dest;
}

function attachmentText(item) {
  if (item?.body != null) {
    return Buffer.isBuffer(item.body) ? item.body.toString('utf8') : String(item.body);
  }
  if (item?.path && existsSync(item.path)) return readFileSync(item.path, 'utf8');
  return null;
}

export function readSanitizedFailureAttachment(item) {
  const text = attachmentText(item);
  if (text == null) return null;
  try {
    return sanitizedFailurePayload(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   name?: string,
 *   body?: string | Buffer,
 *   path?: string,
 *   contentType?: string,
 * } | null | undefined} item
 * @param {SanitizedFailurePersistOptions} [options]
 */
export function persistSanitizedFailureAttachment(item, options = {}) {
  const payload = readSanitizedFailureAttachment(item);
  if (!payload) return undefined;
  return persistSanitizedFailure(payload, options);
}
