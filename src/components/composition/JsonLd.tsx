/**
 * This component's sole job is to inline JSON-LD structured data as a
 * `<script type="application/ld+json">` so search engines can parse it. The
 * `data` is a server-built object (catalogue/site data, not user input) and is
 * JSON.stringified — not raw HTML. As defense-in-depth we also escape every `<`
 * to its JSON unicode form so no value can close the script tag early (the
 * breadcrumb data includes a DB-sourced site name, and the production CSP allows
 * `'unsafe-inline'`). React preserves text children of a script element, so the
 * JSON remains parseable without an inline-HTML sink.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script type="application/ld+json">
      {JSON.stringify(data).replace(/</g, '\\u003c')}
    </script>
  );
}
