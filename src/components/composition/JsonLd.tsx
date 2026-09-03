export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script type="application/ld+json">
      {JSON.stringify(data).replace(/</g, '\\u003c')}
    </script>

  );
}
