import { and, eq, gt, inArray, ne, sql, type SQL } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/db';
import { characters } from '@/db/auth-schema';
import { variantStem } from '@/lib/codex-blob';
import { withColdStartRetry } from '@/lib/neon-cold-start-retry';
import { findUntrustedNodes, type CodexNode } from './doc';
import { codexCacheTags } from './queries';
import { codexAssets } from './schema';
import type { CodexSubject } from './subjects';

export type CodexViewer =
  | { readonly kind: 'reader' }
  | { readonly kind: 'user'; readonly userId: string }
  | { readonly kind: 'admin' };

export interface CodexAssetView {
  readonly id: string;
  readonly stem: string;
  readonly width: number;
  readonly height: number;
  readonly status: 'pending' | 'published';
  readonly credit: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE_TYPES = new Set(['image']);

export function collectCodexAssetIds(nodes: readonly CodexNode[]): string[] {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (node.type === 'image') ids.add(node.attrs.assetId);
  }
  return [...ids];
}

function visibleTo(viewer: CodexViewer): SQL {
  if (viewer.kind === 'admin') return sql`true`;
  const pendingVisible = viewer.kind === 'user' ? eq(codexAssets.userId, viewer.userId) : sql`false`;
  return sql`(${codexAssets.status} = 'published' OR ${pendingVisible})`;
}

export async function loadCodexAssetViews(
  ids: readonly string[],
  viewer: CodexViewer,
): Promise<Map<string, CodexAssetView>> {
  const wanted = ids.filter((id) => UUID.test(id));
  if (wanted.length === 0) return new Map();
  const rows = await withColdStartRetry(() =>
    db
      .select({
        id: codexAssets.id,
        variants: codexAssets.variants,
        width: codexAssets.width,
        height: codexAssets.height,
        status: codexAssets.status,
        credit: characters.name,
      })
      .from(codexAssets)
      .leftJoin(characters, eq(characters.characterId, codexAssets.characterId))
      .where(and(inArray(codexAssets.id, wanted), ne(codexAssets.status, 'removed'), visibleTo(viewer))),
  );
  return new Map(
    rows.map(({ variants, status, ...row }) => [
      row.id,
      { ...row, stem: variantStem(variants['1920']), status: status as CodexAssetView['status'] },
    ]),
  );
}

async function loadPublishedCodexAssetViews(
  { kind, key }: CodexSubject,
  ids: readonly string[],
): Promise<[string, CodexAssetView][]> {
  'use cache';
  cacheLife('max');
  cacheTag(codexCacheTags.page(kind, key), codexCacheTags.credits);
  return [...(await loadCodexAssetViews(ids, { kind: 'reader' }))];
}

export async function loadCodexPageAssets(
  subject: CodexSubject,
  nodes: readonly CodexNode[],
  viewer: CodexViewer,
): Promise<Map<string, CodexAssetView>> {
  const ids = collectCodexAssetIds(nodes);
  if (ids.length === 0) return new Map();
  if (viewer.kind === 'reader') return new Map(await loadPublishedCodexAssetViews(subject, ids));
  return loadCodexAssetViews(ids, viewer);
}

export async function codexAssetProblems(
  blocks: readonly unknown[],
  actor: { readonly userId: string; readonly isAdmin: boolean },
): Promise<string[]> {
  const images = findUntrustedNodes(blocks, IMAGE_TYPES).flatMap(({ path, node }) => {
    const assetId = (node.attrs as { assetId?: unknown } | undefined)?.assetId;
    return typeof assetId === 'string' && UUID.test(assetId) ? [{ path, assetId }] : [];
  });
  if (images.length === 0) return [];
  const rows = await withColdStartRetry(() =>
    db
      .select({ id: codexAssets.id, status: codexAssets.status, uploader: codexAssets.userId })
      .from(codexAssets)
      .where(inArray(codexAssets.id, [...new Set(images.map((image) => image.assetId))])),
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  return images.flatMap(({ path, assetId }) => {
    const row = byId.get(assetId);
    const problem = (text: string) => [`${path} (image): asset "${assetId}" ${text}`];
    if (!row) return problem('does not exist');
    if (row.status === 'removed') return problem('is removed');
    if (row.status === 'pending' && !actor.isAdmin && row.uploader !== actor.userId) {
      return problem('belongs to another pilot and is not published');
    }
    return [];
  });
}

export async function readUploadQuota(userId: string): Promise<number> {
  const [row] = await withColdStartRetry(() =>
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(codexAssets)
      .where(and(eq(codexAssets.userId, userId), gt(codexAssets.createdAt, sql`now() - interval '1 day'`))),
  );
  return row?.count ?? 0;
}

export function withImageSources(
  blocks: readonly CodexNode[],
  assets: ReadonlyMap<string, CodexAssetView>,
): CodexNode[] {
  return blocks.map((block) => {
    if (block.type !== 'image') return block;
    const asset = assets.get(block.attrs.assetId);
    return asset ? { ...block, attrs: { ...block.attrs, src: asset.stem } } : block;
  });
}
