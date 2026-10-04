import { z } from 'zod';
import {
  CODEX_MARKS,
  CODEX_NODES,
  type CodexMarkName,
  type CodexNodeAttrs,
  type CodexNodeName,
  type CodexNodeSpec,
} from './nodes';

const MAX_DOC_BYTES = 256 * 1024;
// Each node level costs two JSON levels (node object, content array), so 64 allows about 30 node
// levels: room for deeply nested lists, and far below the roughly 300 node levels where the
// recursive schema, JSON.stringify, and the renderer exhaust the stack.
const MAX_JSON_DEPTH = 64;

export interface CodexMark {
  readonly type: CodexMarkName;
  readonly attrs: { readonly href?: string };
}

export interface CodexTextNode {
  readonly type: 'text';
  readonly text: string;
  readonly marks: readonly CodexMark[];
}

export type CodexBlockNode = {
  [K in Exclude<CodexNodeName, 'text'>]: {
    readonly type: K;
    readonly attrs: CodexNodeAttrs<K>;
    readonly content: readonly CodexNode[];
  };
}[Exclude<CodexNodeName, 'text'>];

export type CodexNode = CodexTextNode | CodexBlockNode;

export interface CodexDoc {
  readonly type: 'doc';
  readonly attrs: { readonly schemaVersion: 1 };
  readonly content: readonly CodexBlockNode[];
}

type Options = [z.ZodObject, ...z.ZodObject[]];

function closedUnion(kind: 'node' | 'mark', options: z.ZodObject[]) {
  return z.discriminatedUnion('type', options as Options, {
    error: (issue) =>
      issue.code === 'invalid_union'
        ? `${kind} type ${JSON.stringify((issue.input as { type?: unknown } | null)?.type)} is not allowed here`
        : undefined,
  });
}

const markSchema = closedUnion(
  'mark',
  Object.entries(CODEX_MARKS).map(([type, attrs]: [string, z.ZodObject]) =>
    z.object({ type: z.literal(type), attrs: attrs.prefault({}) }),
  ),
);

const nodeSchemas = new Map<string, z.ZodObject>();

function nodeSchema(type: CodexNodeName): z.ZodObject {
  const cached = nodeSchemas.get(type);
  if (cached) return cached;
  const spec: CodexNodeSpec = CODEX_NODES[type];
  const schema =
    spec.content === 'text'
      ? z.object({
          type: z.literal(type),
          text: z.string().min(1),
          marks: z.array(markSchema).default([]),
        })
      : z.object({
          type: z.literal(type),
          attrs: spec.attrs.prefault({}),
          content: childrenSchema(spec.content),
        });
  nodeSchemas.set(type, schema);
  return schema;
}

function childrenSchema(types: readonly string[] | null) {
  if (types === null) return z.array(z.never()).default([]);
  return z
    .array(z.lazy(() => closedUnion('node', types.map((type) => nodeSchema(type as CodexNodeName)))))
    .default([]);
}

const topLevelTypes = (Object.keys(CODEX_NODES) as CodexNodeName[]).filter(
  (type) => CODEX_NODES[type].topLevel,
);

const docSchema = z.object({
  type: z.literal('doc'),
  attrs: z.object({ schemaVersion: z.literal(1) }),
  content: childrenSchema(topLevelTypes),
});

function blockIdProblems(doc: CodexDoc): string[] {
  const problems: string[] = [];
  doc.content.forEach((block, index) => {
    if (!('id' in block.attrs) || !block.attrs.id) problems.push(`content.${index}: block has no id`);
  });
  const seen = new Set<string>();
  const visit = (nodes: readonly CodexNode[]) => {
    for (const node of nodes) {
      if (node.type === 'text') continue;
      const id = 'id' in node.attrs ? node.attrs.id : undefined;
      if (id !== undefined && seen.has(id)) problems.push(`duplicate block id ${JSON.stringify(id)}`);
      if (id !== undefined) seen.add(id);
      visit(node.content);
    }
  };
  visit(doc.content);
  return problems;
}

function nestsTooDeep(input: unknown): boolean {
  const stack: [unknown, number][] = [[input, 1]];
  while (stack.length > 0) {
    const [value, depth] = stack.pop()!;
    if (typeof value !== 'object' || value === null) continue;
    if (depth > MAX_JSON_DEPTH) return true;
    for (const child of Object.values(value)) stack.push([child, depth + 1]);
  }
  return false;
}

export function parseCodexDoc(
  input: unknown,
): { ok: true; doc: CodexDoc } | { ok: false; problems: string[] } {
  if (nestsTooDeep(input)) {
    return { ok: false, problems: [`document nests deeper than ${MAX_JSON_DEPTH} levels`] };
  }
  const bytes = new TextEncoder().encode(JSON.stringify(input) ?? '').byteLength;
  if (bytes > MAX_DOC_BYTES) {
    return { ok: false, problems: [`document is over the ${MAX_DOC_BYTES} byte limit`] };
  }
  const parsed = docSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map((issue) =>
        issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
      ),
    };
  }
  const doc = parsed.data as unknown as CodexDoc;
  const problems = blockIdProblems(doc);
  return problems.length > 0 ? { ok: false, problems } : { ok: true, doc };
}

export interface UntrustedNodeAt {
  readonly path: string;
  readonly node: Record<string, unknown> & { readonly type: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function findUntrustedNodes(blocks: readonly unknown[], types: ReadonlySet<string>): UntrustedNodeAt[] {
  const found: UntrustedNodeAt[] = [];
  const stack: { node: unknown; at: string }[] = [];
  const pushChildren = (nodes: readonly unknown[], path: string) => {
    for (let index = nodes.length - 1; index >= 0; index--) stack.push({ node: nodes[index], at: `${path}.${index}` });
  };
  pushChildren(blocks, 'content');
  while (stack.length > 0) {
    const { node, at } = stack.pop()!;
    if (!isRecord(node)) continue;
    if (typeof node.type === 'string' && types.has(node.type)) {
      found.push({ path: at, node: node as UntrustedNodeAt['node'] });
    }
    if (Array.isArray(node.content)) pushChildren(node.content, `${at}.content`);
  }
  return found;
}
