import { diffWordsWithSpace } from 'diff';
import type { CodexBlockNode, CodexNode } from './doc';
import { plainText } from './sections';
import type { CodexVideoRef } from './video';

export type CodexWordChange = { readonly op: 'same' | 'added' | 'removed'; readonly text: string };

const ATTRS_BY_TYPE = {
  dataBlock: ['source', 'key', 'fields', 'layout'],
  image: ['assetId', 'alt', 'caption'],
  video: ['provider', 'videoId', 'title'],
} as const;

type AttrBlockType = keyof typeof ATTRS_BY_TYPE;

export type CodexAttrChange = {
  readonly name: (typeof ATTRS_BY_TYPE)[keyof typeof ATTRS_BY_TYPE][number];
  readonly before: string;
  readonly after: string;
};

export interface CodexImageRef {
  readonly assetId: string;
  readonly alt: string;
  readonly caption: string;
}

export interface CodexVideoBlockRef extends CodexVideoRef {
  readonly title: string;
}

export type CodexBlockDiff =
  | {
      readonly kind: 'added' | 'removed';
      readonly id: string;
      readonly text: string;
      readonly image?: CodexImageRef;
      readonly video?: CodexVideoBlockRef;
    }
  | { readonly kind: 'moved'; readonly id: string; readonly from: number; readonly to: number }
  | { readonly kind: 'changed'; readonly id: string; readonly words: readonly CodexWordChange[] }
  | { readonly kind: 'changed'; readonly id: string; readonly change: 'format' }
  | { readonly kind: 'changed'; readonly id: string; readonly attrs: readonly CodexAttrChange[] };

function blockId(block: CodexBlockNode, index: number): string {
  return ('id' in block.attrs && block.attrs.id) || `#${index}`;
}

function attrText(value: unknown): string {
  return Array.isArray(value) ? value.join(', ') : String(value ?? '');
}

function attrChanges(before: CodexBlockNode, after: CodexBlockNode): CodexAttrChange[] {
  if (before.type !== after.type || !Object.hasOwn(ATTRS_BY_TYPE, before.type)) return [];
  const was = before.attrs as Record<string, unknown>;
  const now = after.attrs as Record<string, unknown>;
  return ATTRS_BY_TYPE[before.type as AttrBlockType].flatMap((name) => {
    const from = attrText(was[name]);
    const to = attrText(now[name]);
    return from === to ? [] : [{ name, before: from, after: to }];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// The editor gives nested paragraphs ids that stored documents may lack; only top-level ids align blocks.
function withoutId(node: CodexNode): unknown {
  if (node.type === 'text') return node;
  const { id: _id, ...attrs }: Record<string, unknown> = node.attrs;
  return { ...node, attrs, content: node.content.map(withoutId) };
}

export function canonicalBlock(block: CodexBlockNode): string {
  return JSON.stringify({ ...block, content: block.content.map(withoutId) }, (_, value: unknown) =>
    isRecord(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]])) : value,
  );
}

function blockText(block: CodexBlockNode): string {
  if (block.type === 'image') return `Image: ${block.attrs.alt}`;
  if (block.type === 'video') return `Video: ${block.attrs.title} (${block.attrs.provider} ${block.attrs.videoId})`;
  return plainText(block);
}

function wholeBlock(kind: 'added' | 'removed', id: string, block: CodexBlockNode): CodexBlockDiff {
  const text = blockText(block);
  if (block.type === 'image') {
    const { assetId, alt, caption } = block.attrs;
    return { kind, id, text, image: { assetId, alt, caption } };
  }
  if (block.type === 'video') {
    const { provider, videoId, title } = block.attrs;
    return { kind, id, text, video: { provider, videoId, title } };
  }
  return { kind, id, text };
}

function changeOf(id: string, before: CodexBlockNode, after: CodexBlockNode): CodexBlockDiff | null {
  if (canonicalBlock(before) === canonicalBlock(after)) return null;
  const attrs = attrChanges(before, after);
  if (attrs.length > 0) return { kind: 'changed', id, attrs };
  const was = blockText(before);
  const now = blockText(after);
  if (was === now) return { kind: 'changed', id, change: 'format' };
  const words = diffWordsWithSpace(was, now).map(
    (part): CodexWordChange => ({ op: part.added ? 'added' : part.removed ? 'removed' : 'same', text: part.value }),
  );
  return { kind: 'changed', id, words };
}

function indexed(blocks: readonly CodexBlockNode[]) {
  return new Map(blocks.map((block, index) => [blockId(block, index), block]));
}

export function diffCodexBlocks(
  before: readonly CodexBlockNode[],
  after: readonly CodexBlockNode[],
): CodexBlockDiff[] {
  const was = indexed(before);
  const now = indexed(after);
  const order = (ids: Iterable<string>, other: Map<string, CodexBlockNode>) =>
    new Map([...ids].filter((id) => other.has(id)).map((id, index) => [id, index]));
  const fromIndex = order(was.keys(), now);
  const toIndex = order(now.keys(), was);
  const diff: CodexBlockDiff[] = [];
  for (const [id, block] of was) {
    if (!now.has(id)) diff.push(wholeBlock('removed', id, block));
  }
  for (const [id, from] of fromIndex) {
    const to = toIndex.get(id)!;
    if (from !== to) diff.push({ kind: 'moved', id, from, to });
    const change = changeOf(id, was.get(id)!, now.get(id)!);
    if (change) diff.push(change);
  }
  for (const [id, block] of now) {
    if (!was.has(id)) diff.push(wholeBlock('added', id, block));
  }
  return diff;
}

const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

function wordChanges(entry: CodexBlockDiff): readonly CodexWordChange[] {
  if (entry.kind === 'added' || entry.kind === 'removed') return [{ op: entry.kind, text: entry.text }];
  return 'words' in entry ? entry.words : [];
}

export function wordStats(diff: readonly CodexBlockDiff[]): { added: number; removed: number } {
  const parts = diff.flatMap(wordChanges);
  const count = (op: CodexWordChange['op']) =>
    parts.reduce((sum, part) => (part.op === op ? sum + countWords(part.text) : sum), 0);
  return { added: count('added'), removed: count('removed') };
}
