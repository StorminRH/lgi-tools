/* eslint-disable no-restricted-syntax --
 * This component's sole job is to inline JSON-LD structured data as a
 * `<script type="application/ld+json">` so search engines can parse it. The
 * `data` is a trusted object built server-side from our own site/catalogue data
 * (never user input) and is JSON.stringified — not raw HTML — so this is not an
 * XSS sink. JSX children would HTML-escape the JSON and break the parser, which
 * is why the inline-HTML route is required here. See CLAUDE.md > CSP. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
