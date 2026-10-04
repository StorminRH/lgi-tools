import { z } from 'zod';

export interface CodexNodeSpec {
  readonly topLevel: boolean;
  readonly attrs: z.ZodObject;
  readonly content: readonly string[] | 'text' | null;
  readonly injected?: true;
}

const blockId = z.string().min(1).optional();
const blockAttrs = z.object({ id: blockId });
const cellAttrs = z.object({
  colspan: z.int().min(1).max(20).default(1),
  rowspan: z.int().min(1).max(50).default(1),
});
const FLOW = ['paragraph', 'bulletList', 'orderedList'] as const;

const CODEX_BLOCK_LAYOUTS = ['infobox', 'table', 'card'] as const;
export type CodexDataLayout = (typeof CODEX_BLOCK_LAYOUTS)[number] | 'inline';

const ident = z.string().min(1).max(40).regex(/^[a-z][A-Za-z0-9]*$/);
const dataRef = {
  source: ident,
  key: z.string().min(1).max(80),
  fields: z
    .array(ident)
    .max(16)
    .default([])
    .refine((fields) => new Set(fields).size === fields.length, { error: 'fields must be unique' }),
};

export const CODEX_NODES = {
  paragraph: { topLevel: true, attrs: blockAttrs, content: ['text', 'dataInline'] },
  heading: {
    topLevel: true,
    attrs: z.object({ id: blockId, level: z.union([z.literal(2), z.literal(3), z.literal(4)]) }),
    content: ['text'],
  },
  bulletList: { topLevel: true, attrs: blockAttrs, content: ['listItem'] },
  orderedList: {
    topLevel: true,
    attrs: z.object({ id: blockId, start: z.int().min(1).default(1) }),
    content: ['listItem'],
  },
  listItem: { topLevel: false, attrs: blockAttrs, content: FLOW },
  blockquote: { topLevel: true, attrs: blockAttrs, content: FLOW },
  callout: {
    topLevel: true,
    attrs: z.object({ id: blockId, tone: z.enum(['tip', 'warning']).default('tip') }),
    content: FLOW,
  },
  table: { topLevel: true, attrs: blockAttrs, content: ['tableRow'] },
  tableRow: { topLevel: false, attrs: blockAttrs, content: ['tableHeader', 'tableCell'] },
  tableHeader: { topLevel: false, attrs: cellAttrs, content: ['paragraph'] },
  tableCell: { topLevel: false, attrs: cellAttrs, content: ['paragraph'] },
  horizontalRule: { topLevel: true, attrs: blockAttrs, content: null },
  dataBlock: {
    topLevel: true,
    injected: true,
    attrs: z.object({ id: blockId, ...dataRef, layout: z.enum(CODEX_BLOCK_LAYOUTS) }),
    content: null,
  },
  dataInline: { topLevel: false, injected: true, attrs: z.object(dataRef), content: null },
  image: {
    topLevel: true,
    injected: true,
    attrs: z.object({
      id: blockId,
      assetId: z.uuid(),
      alt: z.string().trim().min(1).max(300),
      caption: z.string().trim().max(300).default(''),
    }),
    content: null,
  },
  text: { topLevel: false, attrs: z.object({}), content: 'text' },
} as const satisfies Record<string, CodexNodeSpec>;

export type CodexNodeName = keyof typeof CODEX_NODES;

export type CodexNodeAttrs<K extends CodexNodeName> = z.output<(typeof CODEX_NODES)[K]['attrs']>;

export const CODEX_CALLOUT_LABELS: Record<CodexNodeAttrs<'callout'>['tone'], string> = {
  tip: 'Tip',
  warning: 'Warning',
};

export type CodexInjectedNodeName = {
  [K in CodexNodeName]: (typeof CODEX_NODES)[K] extends { injected: true } ? K : never;
}[CodexNodeName];

const SITE_ORIGIN = 'https://base.invalid';

export function isSafeHref(href: string): boolean {
  if (/[\s\p{Cc}]/u.test(href)) return false;
  if (href.startsWith('/')) return URL.canParse(href, SITE_ORIGIN) && new URL(href, SITE_ORIGIN).origin === SITE_ORIGIN;
  return URL.canParse(href) && new URL(href).protocol === 'https:';
}

export const CODEX_MARKS = {
  bold: z.object({}),
  italic: z.object({}),
  code: z.object({}),
  link: z.object({
    href: z.string().refine(isSafeHref, {
      error: (issue) => `link ${JSON.stringify(issue.input)} is not an https or site-relative URL`,
    }),
  }),
} as const satisfies Record<string, z.ZodObject>;

export type CodexMarkName = keyof typeof CODEX_MARKS;
