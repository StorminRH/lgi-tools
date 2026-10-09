export type BarRows = { key: string; label: string; count: number }[];

function barRows<T extends { count: number }>(items: T[], keyOf: (t: T) => string): BarRows {
  return items.map((it) => ({ key: keyOf(it), label: keyOf(it), count: it.count }));
}

export function deriveTrafficView(input: {
  topPages: { path: string; count: number }[];
  topReferrers: { host: string; count: number }[];
  topEntryPages: { path: string; count: number }[];
}) {
  return {
    topPages: barRows(input.topPages, (r) => r.path),
    topReferrers: barRows(input.topReferrers, (r) => r.host),
    topEntryPages: barRows(input.topEntryPages, (r) => r.path),
  };
}
