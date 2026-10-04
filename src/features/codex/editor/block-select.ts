import type { Editor } from '@tiptap/core';

export type DescribedBlock = 'image' | 'video';

const REQUIRED_TEXT: Record<DescribedBlock, string> = { image: 'alt', video: 'title' };

export const MISSING_TEXT: Record<DescribedBlock, string> = {
  image: 'Add alt text to every image before saving',
  video: 'Add a title to every video before saving',
};

export function firstBlockMissingText(blocks: readonly unknown[]): { type: DescribedBlock; index: number } | null {
  for (const [index, block] of blocks.entries()) {
    const node = block as { type?: unknown; attrs?: Record<string, unknown> } | null;
    if (typeof node?.type !== 'string' || !Object.hasOwn(REQUIRED_TEXT, node.type)) continue;
    const type = node.type as DescribedBlock;
    const value = node.attrs?.[REQUIRED_TEXT[type]];
    if (typeof value !== 'string' || value.trim() === '') return { type, index };
  }
  return null;
}

export function requiredTextProblem(blocked: DescribedBlock | null, type: DescribedBlock, value: string): string | null {
  return blocked === type && value.trim() === '' ? MISSING_TEXT[type] : null;
}

export function blockedBy(problem: string | null): DescribedBlock | null {
  return (Object.keys(MISSING_TEXT) as DescribedBlock[]).find((type) => MISSING_TEXT[type] === problem) ?? null;
}

export function selectBlock(
  editor: Editor,
  type: string,
  match: (attrs: Record<string, unknown>, index: number) => boolean,
  focusEditor = true,
): void {
  let found: number | null = null;
  editor.state.doc.forEach((node, offset, index) => {
    if (found === null && node.type.name === type && match(node.attrs, index)) found = offset;
  });
  if (found === null) return;
  const chain = editor.chain();
  (focusEditor ? chain.focus() : chain).setNodeSelection(found).run();
}

export function blockInsertPosition(editor: Editor): number {
  const { $from, to } = editor.state.selection;
  return $from.depth > 1 ? $from.after(1) : to;
}
