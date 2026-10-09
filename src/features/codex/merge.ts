import { canonicalBlock } from './diff';
import type { CodexBlockNode, CodexDoc } from './doc';
import { sectionBounds } from './sections';

export interface CodexMergeConflict {
  readonly blockId: string;
  readonly base: CodexBlockNode | null;
  readonly head: CodexBlockNode | null;
  readonly proposal: CodexBlockNode | null;
}

export type CodexMerge =
  | { readonly kind: 'clean'; readonly doc: CodexDoc }
  | { readonly kind: 'conflict'; readonly doc: CodexDoc; readonly conflicts: readonly CodexMergeConflict[] };

export type CodexChoice = 'head' | 'proposal' | readonly unknown[];

type Verdict =
  | { readonly kind: 'keep'; readonly block: CodexBlockNode | null }
  | { readonly kind: 'conflict'; readonly conflict: CodexMergeConflict };

function canonical(block: CodexBlockNode | null): string | undefined {
  return block === null ? undefined : canonicalBlock(block);
}

function blockId(block: CodexBlockNode): string {
  return 'id' in block.attrs && block.attrs.id ? block.attrs.id : '';
}

function indexed(doc: CodexDoc): Map<string, CodexBlockNode> {
  return new Map(doc.content.map((block) => [blockId(block), block]));
}

function verdict(
  blockId: string,
  base: CodexBlockNode | null,
  head: CodexBlockNode | null,
  proposal: CodexBlockNode | null,
): Verdict {
  const [baseKey, headKey, proposalKey] = [canonical(base), canonical(head), canonical(proposal)];
  if (headKey === proposalKey || baseKey === proposalKey) return { kind: 'keep', block: head };
  if (baseKey === headKey) return { kind: 'keep', block: proposal };
  return { kind: 'conflict', conflict: { blockId, base, head, proposal } };
}

const sameSequence = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, index) => id === b[index]);

export function proposalDocument(base: CodexDoc, sectionId: string, blocks: readonly CodexBlockNode[]): CodexDoc | null {
  const bounds = sectionBounds(base.content, sectionId);
  if (!bounds) return null;
  return { ...base, content: [...base.content.slice(0, bounds.start), ...blocks, ...base.content.slice(bounds.end)] };
}

function verdictsOf(base: CodexDoc, head: CodexDoc, proposal: CodexDoc): Map<string, Verdict> {
  const [baseById, headById, proposalById] = [indexed(base), indexed(head), indexed(proposal)];
  const verdicts = new Map<string, Verdict>();
  for (const id of new Set([...baseById.keys(), ...headById.keys(), ...proposalById.keys()])) {
    verdicts.set(id, verdict(id, baseById.get(id) ?? null, headById.get(id) ?? null, proposalById.get(id) ?? null));
  }
  return verdicts;
}

function slotOf(entry: Verdict): CodexBlockNode | null {
  return entry.kind === 'keep' ? entry.block : (entry.conflict.head ?? entry.conflict.proposal);
}

function mergedOrder(skeleton: readonly string[], other: readonly string[], kept: (id: string) => boolean): string[] {
  const inSkeleton = new Set(skeleton);
  const after = new Map<string | null, string[]>();
  let anchor: string | null = null;
  for (const id of other) {
    if (inSkeleton.has(id)) anchor = id;
    else if (kept(id)) after.set(anchor, [...(after.get(anchor) ?? []), id]);
  }
  return [...(after.get(null) ?? []), ...skeleton.flatMap((id) => [id, ...(after.get(id) ?? [])])];
}

const ids = (doc: CodexDoc) => doc.content.map(blockId);

export function mergeCodexDocs(base: CodexDoc, head: CodexDoc, proposal: CodexDoc): CodexMerge {
  const verdicts = verdictsOf(base, head, proposal);
  const kept = (id: string) => slotOf(verdicts.get(id)!) !== null;
  const [headIds, proposalIds] = [ids(head), ids(proposal)];
  const order = sameSequence(headIds, ids(base))
    ? mergedOrder(proposalIds, headIds, kept)
    : mergedOrder(headIds, proposalIds, kept);
  const entries = order.map((id) => verdicts.get(id)!);
  const content = entries.flatMap((entry) => {
    const block = slotOf(entry);
    return block === null ? [] : [block];
  });
  const conflicts = entries.flatMap((entry) => (entry.kind === 'conflict' ? [entry.conflict] : []));
  const doc: CodexDoc = { ...head, content };
  return conflicts.length === 0 ? { kind: 'clean', doc } : { kind: 'conflict', doc, conflicts };
}

export function resolveCodexMerge(
  merge: CodexMerge,
  choices: Readonly<Record<string, CodexChoice>>,
): readonly unknown[] | null {
  if (merge.kind === 'clean') return merge.doc.content;
  if (merge.conflicts.some((conflict) => !Object.hasOwn(choices, conflict.blockId))) return null;
  const pick = (conflict: CodexMergeConflict, choice: CodexChoice): readonly unknown[] => {
    if (choice === 'head') return conflict.head ? [conflict.head] : [];
    if (choice === 'proposal') return conflict.proposal ? [conflict.proposal] : [];
    return choice;
  };
  const byId = new Map(merge.conflicts.map((conflict) => [conflict.blockId, conflict]));
  return merge.doc.content.flatMap((block) => {
    const conflict = byId.get(blockId(block));
    return conflict ? pick(conflict, choices[conflict.blockId]!) : [block];
  });
}
