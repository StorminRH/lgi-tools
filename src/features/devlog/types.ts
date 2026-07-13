// The parsed shape of the "Under the Hood" dev log (content/devlog/). A
// dedicated, curated model — like the changelog's — not a general markdown AST:
// the source uses a fixed handful of constructs (headings as a two-level
// folder/document tree, a few inline marks, bullet lists, blockquotes, and
// footnote-style code-excerpt references), so the parser resolves each of those
// into exactly one node type instead of inviting arbitrary markdown.

// Inline runs inside a paragraph, list item, or blockquote. Code excerpts are NOT
// inline — a `<sup>` reference is lifted to a block-level `excerpt` (a <details>
// can't legally nest in a <p>), so nothing here renders a block element.
export type InlineToken =
  | { type: 'text'; value: string }
  | { type: 'link'; text: string; href: string }
  | { type: 'code'; value: string }
  | { type: 'bold'; value: string };

// Serialized syntax-highlight tokens for one excerpt: lines → tokens, each a slice
// of text with an optional theme color. Deliberately a plain JSON shape (no Shiki
// class objects) so loadDevlog's cached tree crosses the RSC boundary intact and
// the client renders them as JSX spans — never innerHTML.
export type ExcerptTokens = { content: string; color?: string }[][];

// One curated code excerpt, a point-in-time snapshot. `file`/`lines` are a display
// label only (e.g. `src/db/index.ts:20-24`); the parser never reads the repo.
// `file` may be an external reference ("GitHub PR #180 review thread") and `lines`
// may be a multi-range or a file-relative label — both are opaque strings.
export type Excerpt = {
  id: string;
  file: string;
  lines: string;
  lang: string;
  code: string;
  // A pinned 40-char commit SHA (the header's optional `ref=` attribute) for the
  // GitHub permalink; '' when the excerpt has no ref. Display/link only.
  ref: string;
  // Server-side syntax highlighting, attached by loadDevlog after parse (absent on
  // the raw parser output). Only the theme's token colors are consumed.
  tokens?: ExcerptTokens;
};

// A document's ordered content. An `excerpt` block is an inline-collapsed code
// excerpt rendered where its `<sup>` reference sat (always at a paragraph's end in
// the source), or — the safety net — appended when a definition is never
// referenced so no snapshot is ever silently dropped.
export type Block =
  | { type: 'paragraph'; tokens: InlineToken[] }
  | { type: 'list'; ordered: boolean; items: InlineToken[][] }
  | { type: 'blockquote'; tokens: InlineToken[] }
  | { type: 'excerpt'; excerpt: Excerpt };

export type DevlogDocument = {
  slug: string;
  title: string;
  blocks: Block[];
};

export type DevlogFolder = {
  slug: string;
  title: string;
  documents: DevlogDocument[];
};

// Two loose top-level documents (Introduction lands first), then folders that
// expand to the documents inside — the file-browser nav tree, in source order.
export type DevlogTree = {
  looseDocuments: DevlogDocument[];
  folders: DevlogFolder[];
};
