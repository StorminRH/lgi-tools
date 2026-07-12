// Curated parser for the "Under the Hood" dev log (content/devlog/). Like the
// changelog parser, this is deliberately not a general markdown library: the
// source is a fixed, hand-maintained format, so a small typed parser that renders
// to React elements is safer than a library that invites arbitrary syntax (and
// than one that emits HTML strings, which the repo's no-innerHTML rule forbids).
//
// Source format:
//   # Folder            → a nav folder
//   ## Document          → a document under the current folder (or a loose
//                          top-level document if it appears before any folder)
//   prose / - lists / > quotes, with a trailing `<sup><a href="#code-<id>">N</a></sup>`
//     footnote-style reference marking where a code excerpt belongs (always at the
//     end of a paragraph in this doc)
//   <!-- uth:code-excerpts:start --> … <!-- uth:code-excerpts:end --> per section:
//     each `<!-- uth:code id="…" file="…" lines="…" lang="…" -->` header followed
//     by a fenced block is one excerpt DEFINITION, keyed by id. An optional
//     `ref="<40-char commit sha>"` pins a GitHub permalink for the excerpt.
//
// The parser resolves each `<sup>` reference into an inline-collapsed excerpt block
// where it sat; a definition that is never referenced is appended at the end of its
// document (a safety net so no snapshot is silently dropped). `file`/`lines` are a
// display label only — the parser never reads the repo.

import type {
  Block,
  DevlogDocument,
  DevlogFolder,
  DevlogNavModel,
  DevlogTree,
  Excerpt,
  InlineToken,
} from './types';

const DOC_HEADING = /^##\s+(.+?)\s*$/;
const FOLDER_HEADING = /^#\s+(.+?)\s*$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+\.\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const EXCERPTS_START = 'uth:code-excerpts:start';
const EXCERPTS_END = 'uth:code-excerpts:end';
const CODE_HEADER = /uth:code\s+id=/;

const ATTR_ID = /id="(code-[a-z0-9-]+)"/;
const ATTR_FILE = /file="([^"]*)"/;
const ATTR_LINES = /lines="([^"]*)"/;
const ATTR_LANG = /lang="([^"]*)"/;
const ATTR_REF = /ref="([^"]*)"/;

const GITHUB_BLOB = 'https://github.com/StorminRH/lgi-tools/blob';
// A full 40-char commit SHA. A branch name or abbreviated ref would build a MOVING
// link that drifts off the snapshot, so only a pinned SHA earns a permalink.
const COMMIT_SHA = /^[0-9a-f]{40}$/i;

// A whole `<sup><a href="#code-…">N</a></sup>` marker. Global so every reference on
// a paragraph is captured (and stripped) in document order.
const REF = /<sup><a href="#(code-[a-z0-9-]+)">\d+<\/a><\/sup>/g;

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/y;
const INLINE_CODE = /`([^`]+)`/y;
const BOLD = /\*\*([^*]+?)\*\*/y;

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// The gutter's first line number: the first integer in a `lines` label, or 1 when
// there isn't one. Only trusted as a true source line for a clean single range
// (see isCleanSingleRange) — a multi-range/path-prefixed label falls back to a
// relative 1..N gutter, so a stray digit in a path prefix never misleads.
export function parseStartLine(lines: string): number {
  const m = lines.match(/\d+/);
  return m ? Number(m[0]) : 1;
}

// A `lines` label is a clean single range when it is exactly one line number or one
// `start-end` pair — no comma multi-range, no semicolon, no path prefix. Gates both
// the permalink `#L…` fragment and the absolute-line gutter, so the two agree.
export function isCleanSingleRange(lines: string): boolean {
  return /^\d+(?:-\d+)?$/.test(lines.trim());
}

// The `#L<start>-L<end>` (or `#L<n>` for a single line) permalink fragment, but only
// for a clean single range; '' otherwise, so a multi-range excerpt links to the file
// at the pinned SHA with no (rotting) line anchor.
export function lineFragment(lines: string): string {
  const clean = lines.trim();
  if (!isCleanSingleRange(clean)) return '';
  const [start, end] = clean.split('-');
  return end && end !== start ? `#L${start}-L${end}` : `#L${start}`;
}

// A pinned-SHA GitHub permalink for an excerpt, or null when one can't be built: a
// full 40-char commit `ref` and a repo `file` path are both required — a branch name
// or abbreviated ref is rejected (it would drift off the snapshot), and an excerpt
// whose `file` is prose ("GitHub PR #… review thread") must carry no ref. The line
// fragment is appended only for a clean single range (unpinned line links rot).
export function githubUrl(excerpt: Pick<Excerpt, 'ref' | 'file' | 'lines'>): string | null {
  const ref = excerpt.ref.trim();
  if (!COMMIT_SHA.test(ref) || !excerpt.file) return null;
  return `${GITHUB_BLOB}/${ref}/${excerpt.file}${lineFragment(excerpt.lines)}`;
}

// Try to match one inline mark anchored at `i` (sticky regex). Returns the token
// and how many characters it consumed, or null if nothing opens here.
function matchMark(re: RegExp, text: string, i: number, make: (m: RegExpExecArray) => InlineToken) {
  re.lastIndex = i;
  const m = re.exec(text);
  return m ? { token: make(m), length: m[0].length } : null;
}

function markAt(text: string, i: number) {
  const c = text[i];
  if (c === '`') return matchMark(INLINE_CODE, text, i, (m) => ({ type: 'code', value: m[1] ?? '' }));
  if (c === '*' && text[i + 1] === '*') return matchMark(BOLD, text, i, (m) => ({ type: 'bold', value: m[1] ?? '' }));
  if (c === '[') return matchMark(LINK, text, i, (m) => ({ type: 'link', text: m[1] ?? '', href: m[2] ?? '' }));
  return null;
}

// Split a run of prose into inline tokens. Whichever mark (inline code, bold, link)
// opens earliest at the cursor wins, so precedence falls out of a single scan; no
// mark spans a block boundary. Any residual reference marker is dropped (references
// are lifted to block level before this runs).
export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let buf = '';
  const flush = () => {
    if (buf) tokens.push({ type: 'text', value: buf });
    buf = '';
  };
  let i = 0;
  while (i < text.length) {
    const mark = markAt(text, i);
    if (mark) {
      flush();
      tokens.push(mark.token);
      i += mark.length;
    } else {
      buf += text[i];
      i += 1;
    }
  }
  flush();
  return tokens;
}

// Peel every reference marker off a paragraph, returning the prose without them and
// the referenced excerpt ids in order.
function extractRefs(text: string): { clean: string; ids: string[] } {
  const ids: string[] = [];
  const clean = text.replace(REF, (_full, id: string) => {
    ids.push(id);
    return '';
  });
  return { clean: clean.trim(), ids };
}

// A code excerpt's body is bounded by its header and the next header / `:end`
// delimiter — never by counting fences, so a `lang="md"` excerpt whose body itself
// contains ``` blocks is captured whole. Strip the opening fence line, the single
// trailing fence line, and surrounding blank lines; keep everything between verbatim.
function finalizeBody(lines: string[]): string {
  const b = lines.slice();
  while (b.length && b[0]?.trim() === '') b.shift();
  if (b.length && b[0]?.startsWith('```')) b.shift();
  while (b.length && b[b.length - 1]?.trim() === '') b.pop();
  if (b.length && b[b.length - 1]?.startsWith('```')) b.pop();
  return b.join('\n');
}

function parseAttrs(line: string): Omit<Excerpt, 'code' | 'tokens'> | null {
  const id = line.match(ATTR_ID)?.[1];
  if (!id) return null;
  return {
    id,
    file: line.match(ATTR_FILE)?.[1] ?? '',
    lines: line.match(ATTR_LINES)?.[1] ?? '',
    lang: line.match(ATTR_LANG)?.[1] ?? '',
    ref: line.match(ATTR_REF)?.[1] ?? '',
  };
}

// One document's raw content before excerpt references are resolved.
type RawBlock =
  | { k: 'para'; text: string }
  | { k: 'list'; ordered: boolean; items: string[] }
  | { k: 'quote'; text: string };

type Entry = { kind: 'folder'; title: string } | { kind: 'doc'; title: string; body: string[] };

// Split the whole doc into ordered folder markers and documents (with their body
// lines). Excerpt-block-aware: a `#`/`##` inside an excerpt definition is not a
// heading, so a `lang="md"` excerpt containing `## …` never starts a section.
function splitEntries(md: string): Entry[] {
  const entries: Entry[] = [];
  let inExcerpts = false;
  let doc: Extract<Entry, { kind: 'doc' }> | null = null;
  for (const line of md.split('\n')) {
    if (line.includes(EXCERPTS_START)) inExcerpts = true;
    else if (line.includes(EXCERPTS_END)) inExcerpts = false;
    if (!inExcerpts) {
      const dm = line.match(DOC_HEADING);
      if (dm) {
        // DOC_HEADING's title capture group is mandatory when the line matches.
        doc = { kind: 'doc', title: dm[1]!, body: [] };
        entries.push(doc);
        continue;
      }
      const fm = line.match(FOLDER_HEADING);
      if (fm) {
        // FOLDER_HEADING's title capture group is mandatory when the line matches.
        entries.push({ kind: 'folder', title: fm[1]! });
        doc = null;
        continue;
      }
    }
    if (doc) doc.body.push(line);
  }
  return entries;
}

// Pull the excerpt definitions out of a document body, returning them (with their
// source order) plus the prose-only lines with the excerpt regions removed.
function collectExcerpts(body: string[]): {
  excerpts: Map<string, Excerpt>;
  order: string[];
  prose: string[];
} {
  const excerpts = new Map<string, Excerpt>();
  const order: string[] = [];
  const prose: string[] = [];
  let inExcerpts = false;
  let attrs: Omit<Excerpt, 'code' | 'tokens'> | null = null;
  let bodyLines: string[] = [];
  const commit = () => {
    if (attrs) {
      excerpts.set(attrs.id, { ...attrs, code: finalizeBody(bodyLines) });
      order.push(attrs.id);
    }
    attrs = null;
    bodyLines = [];
  };
  for (const line of body) {
    if (!inExcerpts) {
      if (line.includes(EXCERPTS_START)) inExcerpts = true;
      else prose.push(line);
    } else if (line.includes(EXCERPTS_END)) {
      commit();
      inExcerpts = false;
    } else if (CODE_HEADER.test(line)) {
      commit();
      attrs = parseAttrs(line);
    } else if (attrs) {
      bodyLines.push(line);
    }
  }
  commit();
  return { excerpts, order, prose };
}

// Parse prose-only lines into raw blocks: paragraphs, bullet/numbered lists, and
// blockquotes, split on blank lines.
function parseProse(lines: string[]): RawBlock[] {
  const raw: RawBlock[] = [];
  let para: string[] = [];
  let items: string[] = [];
  let ordered = false;
  let quote: string[] = [];
  const flushPara = () => {
    if (para.length) raw.push({ k: 'para', text: para.join(' ') });
    para = [];
  };
  const flushList = () => {
    if (items.length) raw.push({ k: 'list', ordered, items });
    items = [];
  };
  const flushQuote = () => {
    if (quote.length) raw.push({ k: 'quote', text: quote.join(' ') });
    quote = [];
  };
  for (const line of lines) {
    const bullet = line.match(BULLET);
    const numbered = line.match(NUMBERED);
    const quoted = line.match(QUOTE);
    if (line.trim() === '') {
      flushPara();
      flushList();
      flushQuote();
    } else if (bullet || numbered) {
      flushPara();
      flushQuote();
      const isOrdered = Boolean(numbered);
      if (items.length && isOrdered !== ordered) flushList();
      ordered = isOrdered;
      items.push((bullet ?? numbered)![1] ?? '');
    } else if (quoted) {
      flushPara();
      flushList();
      quote.push(quoted[1] ?? '');
    } else {
      flushList();
      flushQuote();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  flushQuote();
  return raw;
}

function resolveBlock(
  rb: RawBlock,
  excerpts: Map<string, Excerpt>,
  used: Set<string>,
  out: Block[],
): void {
  if (rb.k === 'list') {
    out.push({ type: 'list', ordered: rb.ordered, items: rb.items.map(parseInline) });
    return;
  }
  if (rb.k === 'quote') {
    out.push({ type: 'blockquote', tokens: parseInline(rb.text) });
    return;
  }
  const { clean, ids } = extractRefs(rb.text);
  if (clean) out.push({ type: 'paragraph', tokens: parseInline(clean) });
  for (const id of ids) {
    const ex = excerpts.get(id);
    if (ex) {
      out.push({ type: 'excerpt', excerpt: ex });
      used.add(id);
    }
  }
}

function resolveDocument(
  raw: RawBlock[],
  excerpts: Map<string, Excerpt>,
  order: string[],
): Block[] {
  const blocks: Block[] = [];
  const used = new Set<string>();
  for (const rb of raw) resolveBlock(rb, excerpts, used, blocks);
  // Safety net: a definition no reference reached still renders, appended in source
  // order, so a curation slip never silently drops a snapshot.
  for (const id of order) {
    if (!used.has(id)) blocks.push({ type: 'excerpt', excerpt: excerpts.get(id)! });
  }
  return blocks;
}

function makeSlugger(): (title: string) => string {
  const used = new Set<string>();
  return (title) => {
    const base = slugify(title) || 'section';
    let slug = base;
    let n = 2;
    while (used.has(slug)) slug = `${base}-${n++}`;
    used.add(slug);
    return slug;
  };
}

export function parseDevlog(md: string): DevlogTree {
  const looseDocuments: DevlogDocument[] = [];
  const folders: DevlogFolder[] = [];
  const slug = makeSlugger();
  let folder: DevlogFolder | null = null;

  for (const entry of splitEntries(md)) {
    if (entry.kind === 'folder') {
      folder = { slug: slug(entry.title), title: entry.title, documents: [] };
      folders.push(folder);
      continue;
    }
    const { excerpts, order, prose } = collectExcerpts(entry.body);
    const doc: DevlogDocument = {
      slug: slug(entry.title),
      title: entry.title,
      blocks: resolveDocument(parseProse(prose), excerpts, order),
    };
    (folder ? folder.documents : looseDocuments).push(doc);
  }

  return { looseDocuments, folders };
}

// The document that lands at /devlog (the first loose top-level document).
export function introDocument(tree: DevlogTree): DevlogDocument | undefined {
  return tree.looseDocuments[0];
}

// Every document in nav order (loose documents first, then each folder's).
export function flattenDocuments(tree: DevlogTree): DevlogDocument[] {
  return [...tree.looseDocuments, ...tree.folders.flatMap((f) => f.documents)];
}

export function findDocument(tree: DevlogTree, slug: string): DevlogDocument | undefined {
  return flattenDocuments(tree).find((d) => d.slug === slug);
}

// A short plain-text summary (the first paragraph, truncated) for a document's meta
// description.
export function documentSummary(doc: DevlogDocument, max = 155): string {
  const para = doc.blocks.find((b): b is Extract<Block, { type: 'paragraph' }> => b.type === 'paragraph');
  if (!para) return 'A behind-the-scenes look at how LGI.tools is built.';
  const text = para.tokens
    .map((t) => (t.type === 'link' ? t.text : t.type === 'text' || t.type === 'code' || t.type === 'bold' ? t.value : ''))
    .join('');
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

// Strip document content down to the titles + slugs the file-browser rail renders,
// so the client nav never serializes any document's blocks.
export function toNavModel(tree: DevlogTree): DevlogNavModel {
  const doc = (d: DevlogDocument) => ({ slug: d.slug, title: d.title });
  return {
    looseDocuments: tree.looseDocuments.map(doc),
    folders: tree.folders.map((f) => ({
      slug: f.slug,
      title: f.title,
      documents: f.documents.map(doc),
    })),
  };
}
