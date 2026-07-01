import type { Excerpt } from '../types';

// One inline code excerpt, collapsed by default: a native <details> (the
// Collapsible invariant — the element owns open/closed, no React state) showing a
// mono `file:lines` label that expands the snapshot in place. `data-collapsible`
// drives the shared chevron-rotate rule in globals.css. The code is rendered as
// text through JSX (auto-escaped) — never innerHTML — so a snapshot containing
// markup stays inert. A standalone boxed excerpt owns its own border (the raw
// <details> idiom of the tree outline), rather than the Collapsible list divider.
export function CodeExcerpt({ excerpt }: { excerpt: Excerpt }) {
  return (
    <details data-collapsible className="devlog-excerpt group">
      <summary className="devlog-excerpt-summary list-none [&::-webkit-details-marker]:hidden">
        <span data-chevron className="devlog-excerpt-chevron" aria-hidden>
          ▸
        </span>
        <span className="devlog-excerpt-file">{excerpt.file}</span>
        {excerpt.lines && <span className="devlog-excerpt-lines">{excerpt.lines}</span>}
      </summary>
      <pre className="devlog-excerpt-code">
        <code>{excerpt.code}</code>
      </pre>
    </details>
  );
}
