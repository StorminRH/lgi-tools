import { githubUrl, isCleanSingleRange, parseStartLine } from '../parse';
import type { Excerpt, ExcerptTokens } from '../types';

// The syntax-highlighted body: one row per line, a non-selectable line-number gutter
// down the left, then the line's tokens. Colours come from the server-side Shiki pass
// (build time) as plain data — rendered through JSX (auto-escaped), never innerHTML.
// The gutter shows real source line numbers for a clean single range (they line up
// with the permalink's #L… fragment) and a relative 1..N otherwise, so a multi-range
// excerpt never implies lines it elided.
function ExcerptLines({ tokens, lines }: { tokens: ExcerptTokens; lines: string }) {
  const gutterStart = isCleanSingleRange(lines) ? parseStartLine(lines) : 1;
  return (
    <>
      {tokens.map((line, i) => (
        <span key={i} className="devlog-excerpt-line">
          <span className="devlog-excerpt-gutter" aria-hidden>
            {gutterStart + i}
          </span>
          <span className="devlog-excerpt-code-line">
            {line.map((tok, j) =>
              tok.color ? (
                <span
                  key={j}
                  // eslint-disable-next-line no-restricted-syntax -- Shiki per-token theme colour: a build-time value, not a call-site literal, and the theme palette can't be Tailwind utilities. House-style inline-style opt-out (CSP permits it).
                  style={{ color: tok.color }}
                >
                  {tok.content}
                </span>
              ) : (
                <span key={j}>{tok.content}</span>
              ),
            )}
          </span>
        </span>
      ))}
    </>
  );
}

// One inline code excerpt, collapsed by default: a native <details> (the Collapsible
// invariant — the element owns open/closed, no React state) showing a mono `file:lines`
// label that expands the snapshot in place. When the excerpt carries a pinned-SHA
// permalink, a "view on GitHub" link sits above the code (outside <summary>, so it
// never toggles the details). The code renders as JSX — never innerHTML — so a snapshot
// containing markup stays inert; when the build attached no tokens, it falls back to the
// raw text. A standalone boxed excerpt owns its own border (the raw <details> idiom of
// the tree outline), rather than the Collapsible list divider.
export function CodeExcerpt({ excerpt }: { excerpt: Excerpt }) {
  const href = githubUrl(excerpt);
  return (
    <details data-collapsible className="devlog-excerpt group">
      <summary className="devlog-excerpt-summary list-none [&::-webkit-details-marker]:hidden">
        <span data-chevron className="devlog-excerpt-chevron" aria-hidden>
          ▸
        </span>
        <span className="devlog-excerpt-file">{excerpt.file}</span>
        {excerpt.lines && <span className="devlog-excerpt-lines">{excerpt.lines}</span>}
      </summary>
      {href && (
        <div className="devlog-excerpt-permalink">
          <a href={href} target="_blank" rel="noopener noreferrer">
            view on GitHub ↗
          </a>
        </div>
      )}
      <pre className="devlog-excerpt-code">
        <code>
          {excerpt.tokens ? (
            <ExcerptLines tokens={excerpt.tokens} lines={excerpt.lines} />
          ) : (
            excerpt.code
          )}
        </code>
      </pre>
    </details>
  );
}
