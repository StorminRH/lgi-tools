import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import { retentionCutoff, type BatchedDeleteResult } from '@/lib/batched-delete';
import {
  codexBlobConfigured,
  codexBlobEnv,
  codexBlobStoreHost,
  defaultBlobPort,
  parsePendingUrl,
  pendingPrefix,
  variantKey,
  variantStem,
  type CodexBlobPort,
} from '@/lib/codex-blob';
import { processCodexImage, type CodexImageProcessResult, type CodexImageVariant } from '@/lib/codex-image-process';
import type { AnyPgDb } from '@/lib/db-types';
import { readUploadQuota } from './assets';
import { CODEX_UPLOAD_LIMITS, CODEX_UPLOAD_MAX_BYTES } from './constants';
import { codexAssets, codexProposals, type CodexAssetVariants } from './schema';

const ORPHAN_UPLOAD_AGE_MS = 60 * 60 * 1000;
const PRUNE_BATCH = 50;

export type CodexFinalizeResult =
  | {
      readonly status: 'created' | 'reused';
      readonly asset: { readonly id: string; readonly stem: string; readonly width: number; readonly height: number };
    }
  | {
      readonly status: 'forbidden-key' | 'missing' | 'too-large' | 'not-image' | 'too-many-pixels' | 'quota' | 'unconfigured';
    };

type AssetRow = Pick<typeof codexAssets.$inferSelect, 'id' | 'variants' | 'width' | 'height'>;

const assetColumns = {
  id: codexAssets.id,
  variants: codexAssets.variants,
  width: codexAssets.width,
  height: codexAssets.height,
};

function assetView({ id, variants, width, height }: AssetRow) {
  return { id, stem: variantStem(variants['1920']), width, height };
}

async function existingAsset(userId: string, sha256: string): Promise<AssetRow | null> {
  const [row] = await db
    .select(assetColumns)
    .from(codexAssets)
    .where(
      and(eq(codexAssets.userId, userId), eq(codexAssets.sha256, sha256), ne(codexAssets.status, 'removed')),
    );
  return row ?? null;
}

export interface FinalizeInput {
  readonly url: string;
  readonly userId: string;
  readonly characterId: number;
}

async function reuse(row: AssetRow): Promise<CodexFinalizeResult> {
  await db
    .update(codexAssets)
    .set({ createdAt: sql`now()` })
    .where(and(eq(codexAssets.id, row.id), eq(codexAssets.status, 'pending')));
  return { status: 'reused', asset: assetView(row) };
}

async function discardVariants(blob: CodexBlobPort, urls: readonly string[], why: string): Promise<void> {
  if (urls.length === 0) return;
  await blob.remove(urls).catch((error: unknown) => {
    console.error(`[codex] could not delete the copies of ${why}`, error);
  });
}

async function writeVariants(
  blob: CodexBlobPort,
  id: string,
  variants: readonly CodexImageVariant[],
): Promise<string[]> {
  const env = codexBlobEnv();
  const settled = await Promise.allSettled(
    variants.map(({ width, webp }) => blob.putVariant(variantKey(env, id, width), webp)),
  );
  const written = settled.flatMap((outcome) => (outcome.status === 'fulfilled' ? [outcome.value] : []));
  const failed = settled.find((outcome) => outcome.status === 'rejected');
  if (failed) {
    await discardVariants(blob, written, 'an image whose finalize failed');
    throw failed.reason;
  }
  return written;
}

async function insertAsset(input: FinalizeInput, processed: Extract<CodexImageProcessResult, { ok: true }>, id: string, urls: readonly string[]) {
  const variants = Object.fromEntries(
    processed.variants.map(({ width }, index) => [String(width), urls[index]!]),
  ) as unknown as CodexAssetVariants;
  const [created] = await db
    .insert(codexAssets)
    .values({
      id,
      sha256: processed.sha256,
      width: processed.width,
      height: processed.height,
      variants,
      userId: input.userId,
      characterId: input.characterId,
    })
    .onConflictDoNothing({
      target: [codexAssets.userId, codexAssets.sha256],
      where: sql`${codexAssets.status} <> 'removed'`,
    })
    .returning(assetColumns);
  return created;
}

async function storeUpload(input: FinalizeInput, blob: CodexBlobPort): Promise<CodexFinalizeResult> {
  if ((await readUploadQuota(input.userId)) >= CODEX_UPLOAD_LIMITS.perDay) return { status: 'quota' };
  const downloaded = await blob.download(input.url, CODEX_UPLOAD_MAX_BYTES);
  if (!downloaded.ok) return { status: downloaded.reason };
  const processed = await processCodexImage(downloaded.bytes);
  if (!processed.ok) return { status: processed.reason };

  const known = await existingAsset(input.userId, processed.sha256);
  if (known) return reuse(known);
  const id = crypto.randomUUID();
  const urls = await writeVariants(blob, id, processed.variants);
  let created: AssetRow | undefined;
  try {
    created = await insertAsset(input, processed, id, urls);
  } catch (error) {
    await discardVariants(blob, urls, 'an image whose finalize failed');
    throw error;
  }
  if (created) return { status: 'created', asset: assetView(created) };
  await discardVariants(blob, urls, 'an image finalized twice at once');
  const raced = await existingAsset(input.userId, processed.sha256);
  return raced ? { status: 'reused', asset: assetView(raced) } : { status: 'missing' };
}

export async function finalizeCodexUpload(
  input: FinalizeInput,
  blob: CodexBlobPort = defaultBlobPort,
): Promise<CodexFinalizeResult> {
  const storeHost = codexBlobStoreHost();
  if (!codexBlobConfigured() || storeHost === null) return { status: 'unconfigured' };
  const pending = parsePendingUrl(input.url, pendingPrefix(codexBlobEnv(), input.userId), storeHost);
  if (!pending.ok) return { status: 'forbidden-key' };
  try {
    return await storeUpload(input, blob);
  } finally {
    await blob.remove([input.url]).catch((error: unknown) => {
      console.error('[codex] could not delete a raw upload; the daily sweep will retry', error);
    });
  }
}

async function retireUnreferenced(database: AnyPgDb, cutoff: Date): Promise<void> {
  await database.execute(sql`
    UPDATE ${codexAssets} AS a SET status = 'removed'
    WHERE a.status = 'pending' AND a.created_at < ${cutoff.toISOString()}::timestamptz
      AND NOT EXISTS (
        SELECT 1 FROM ${codexProposals} AS p
        WHERE p.status = 'pending'
          AND p.doc @> jsonb_build_array(jsonb_build_object(
            'type', 'image', 'attrs', jsonb_build_object('assetId', a.id::text)))
      )
  `);
}

function removedBatch(database: AnyPgDb) {
  return database
    .select({ id: codexAssets.id, variants: codexAssets.variants })
    .from(codexAssets)
    .where(eq(codexAssets.status, 'removed'))
    .limit(PRUNE_BATCH);
}

export async function pruneExpiredCodexAssets(
  database: AnyPgDb,
  retentionDays: number,
  now: Date,
  deadline = Number.POSITIVE_INFINITY,
  blob: CodexBlobPort = defaultBlobPort,
): Promise<BatchedDeleteResult> {
  await retireUnreferenced(database, retentionCutoff(retentionDays, now));
  let deleted = 0;
  for (;;) {
    const batch = await removedBatch(database);
    if (batch.length === 0) return { deleted, finished: true };
    for (const row of batch) {
      if (Date.now() >= deadline) return { deleted, finished: false };
      try {
        await blob.remove(Object.values(row.variants));
      } catch (error) {
        console.error('[codex] could not delete the blobs of a removed image; retrying tomorrow', error);
        return { deleted, finished: false };
      }
      await database.delete(codexAssets).where(and(eq(codexAssets.id, row.id), eq(codexAssets.status, 'removed')));
      deleted += 1;
    }
  }
}

export async function sweepOrphanPendingBlobs(now: Date, blob: CodexBlobPort = defaultBlobPort): Promise<number> {
  const stale: string[] = [];
  for await (const upload of blob.listPending()) {
    if (now.getTime() - upload.uploadedAt.getTime() > ORPHAN_UPLOAD_AGE_MS) stale.push(upload.url);
  }
  if (stale.length > 0) await blob.remove(stale);
  return stale.length;
}
