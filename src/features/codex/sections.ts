import type { CodexBlockNode, CodexDoc, CodexNode } from './doc';
import { CODEX_NODES, type CodexNodeSpec } from './nodes';

export const LEAD_SECTION_ID = 'lead';

export const PAGE_SCOPE = 'page';

export type HeadingBlock = Extract<CodexBlockNode, { type: 'heading' }>;

export interface CodexSection {
  readonly id: string;
  readonly heading: HeadingBlock | null;
  readonly blocks: readonly CodexBlockNode[];
}

function isSectionHeading(block: CodexBlockNode): block is HeadingBlock {
  return block.type === 'heading' && block.attrs.level === 2;
}

export function codexSections(doc: CodexDoc): CodexSection[] {
  const sections: { id: string; heading: HeadingBlock | null; blocks: CodexBlockNode[] }[] = [
    { id: LEAD_SECTION_ID, heading: null, blocks: [] },
  ];
  for (const block of doc.content) {
    if (isSectionHeading(block)) {
      sections.push({ id: block.attrs.id ?? '', heading: block, blocks: [] });
    } else {
      sections.at(-1)!.blocks.push(block);
    }
  }
  return sections.filter((section) => section.heading !== null || section.blocks.length > 0);
}

export type InfoboxBlock = Extract<CodexBlockNode, { type: 'dataBlock' }>;

export function leadInfobox(doc: CodexDoc): InfoboxBlock | null {
  const first = doc.content[0];
  return first?.type === 'dataBlock' && first.attrs.layout === 'infobox' ? first : null;
}

const isBlankText = (node: CodexNode) => node.type === 'text' && node.text.trim() === '';

export function isBlankSection(blocks: readonly CodexBlockNode[]): boolean {
  return blocks.every((block) => block.type === 'paragraph' && block.content.every(isBlankText));
}

export function sectionBounds(
  content: readonly CodexBlockNode[],
  sectionId: string,
): { start: number; end: number } | null {
  const start =
    sectionId === LEAD_SECTION_ID
      ? 0
      : content.findIndex((block) => isSectionHeading(block) && block.attrs.id === sectionId) + 1;
  if (start === 0 && sectionId !== LEAD_SECTION_ID) return null;
  const next = content.findIndex((block, index) => index >= start && isSectionHeading(block));
  return { start, end: next === -1 ? content.length : next };
}

export function plainText(node: CodexNode): string {
  if (node.type === 'text') return node.text;
  const children: CodexNodeSpec['content'] = CODEX_NODES[node.type].content;
  const inline = Array.isArray(children) && children.includes('text');
  return node.content.map(plainText).join(inline ? '' : '\n');
}
