// Server-side syntax highlighting for dev-log code excerpts. Runs only inside the
// cached loadDevlog (build/deploy time), so zero Shiki reaches the client: each
// excerpt's tokens are serialized to a plain `{ content, color? }[][]` shape that
// rides the cached tree across the RSC boundary and renders as JSX spans — never
// innerHTML, never Shiki's `codeToHtml`.
//
// Fine-grained core bundle (shiki/core): only the grammars the dev log actually
// uses, one theme, and the pure-JS regex engine (no WASM — this is a one-shot
// build-time pass over a fixed corpus, and the JS engine sidesteps every serverless
// WASM-bundling question). The theme BACKGROUND is discarded; only token colors are
// consumed, so excerpts keep the site's `--color-bg-deep` surface.
import css from '@shikijs/langs/css';
import dotenv from '@shikijs/langs/dotenv';
import js from '@shikijs/langs/javascript';
import json from '@shikijs/langs/json';
import jsonc from '@shikijs/langs/jsonc';
import markdown from '@shikijs/langs/markdown';
import ts from '@shikijs/langs/typescript';
import tsx from '@shikijs/langs/tsx';
import yaml from '@shikijs/langs/yaml';
import githubDarkDefault from '@shikijs/themes/github-dark-default';
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import type { DevlogDocument, DevlogTree, Excerpt, ExcerptTokens } from './types';

const THEME = 'github-dark-default';

// The distinct `lang="…"` values across the dev log (content/devlog/) (ts/tsx/json/js/md/yaml/
// jsonc/dotenv/css), plus the grammars' own aliases, are all covered by these nine
// modules. An unknown or empty lang falls back to plaintext (see tokenize).
type Highlighter = Awaited<ReturnType<typeof createHighlighterCore>>;

let highlighterPromise: Promise<Highlighter> | null = null;

// Lazily built, once per worker — never at import time, so importing this module
// (or the pure helpers below) instantiates no grammars in contexts that never
// highlight.
function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighterCore({
    themes: [githubDarkDefault],
    langs: [ts, tsx, json, js, markdown, yaml, jsonc, dotenv, css],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  return highlighterPromise;
}

// Every line rendered as a single uncolored token — the plaintext fallback for an
// unknown/empty lang or any tokenizer error, so an excerpt never breaks the build.
function plaintextLines(code: string): ExcerptTokens {
  return code.split('\n').map((line) => [{ content: line }]);
}

// Tokenize one excerpt's code to the serializable shape. An unknown/empty lang maps
// to the built-in `text` grammar (never throws); any other error falls back to plain
// lines. Whitespace/punctuation carry the theme's default colour — that's fine.
function tokenize(code: string, lang: string, hl: Highlighter, loaded: Set<string>): ExcerptTokens {
  const use = loaded.has(lang) ? lang : 'text';
  try {
    const { tokens } = hl.codeToTokens(code, { lang: use, theme: THEME });
    return tokens.map((line) =>
      line.map((t) => (t.color ? { content: t.content, color: t.color } : { content: t.content })),
    );
  } catch {
    return plaintextLines(code);
  }
}

/**
 * Highlight a single excerpt, returning a NEW object with `tokens` attached (never
 * mutates). Thin wrapper over tokenize; the batch path (highlightTree) shares the
 * same tokenizer so the two never diverge.
 */
export async function highlightExcerpt(excerpt: Excerpt): Promise<Excerpt> {
  const hl = await getHighlighter();
  const loaded = new Set(hl.getLoadedLanguages());
  return { ...excerpt, tokens: tokenize(excerpt.code, excerpt.lang, hl, loaded) };
}

// Every excerpt block's excerpt across the tree, in nav order. Instances that share
// one definition share the SAME object reference, so dedup by id highlights each
// definition once.
function eachExcerpt(tree: DevlogTree): Excerpt[] {
  const out: Excerpt[] = [];
  const scan = (d: DevlogDocument) => {
    for (const b of d.blocks) if (b.type === 'excerpt') out.push(b.excerpt);
  };
  tree.looseDocuments.forEach(scan);
  tree.folders.forEach((f) => f.documents.forEach(scan));
  return out;
}

/**
 * Rebuild the tree with each excerpt block pointing at its highlighted object (by
 * id). PURE and sync — no Shiki — so it's unit-testable with a hand-built map, and
 * it never mutates the input tree.
 */
export function rebuildTree(tree: DevlogTree, byId: Map<string, Excerpt>): DevlogTree {
  const mapDoc = (d: DevlogDocument): DevlogDocument => ({
    ...d,
    blocks: d.blocks.map((b) =>
      b.type === 'excerpt' ? { ...b, excerpt: byId.get(b.excerpt.id) ?? b.excerpt } : b,
    ),
  });
  return {
    looseDocuments: tree.looseDocuments.map(mapDoc),
    folders: tree.folders.map((f) => ({ ...f, documents: f.documents.map(mapDoc) })),
  };
}

/**
 * Attach tokens to every excerpt in the tree, highlighting each distinct definition
 * exactly once. Called from the cached loadDevlog, so the whole pass is paid once
 * per deploy.
 */
export async function highlightTree(tree: DevlogTree): Promise<DevlogTree> {
  const hl = await getHighlighter();
  const loaded = new Set(hl.getLoadedLanguages());
  const byId = new Map<string, Excerpt>();
  for (const ex of eachExcerpt(tree)) {
    if (byId.has(ex.id)) continue;
    byId.set(ex.id, { ...ex, tokens: tokenize(ex.code, ex.lang, hl, loaded) });
  }
  return rebuildTree(tree, byId);
}
