// Derives the zone-level dependency graph that both committed architecture-map
// artifacts render, straight from the `boundaries` block of `.fallowrc.json`.
// Nothing here is hand-drawn: the zone nodes, their dependency edges, the three
// edge classes, and the longest-path layers are all computed from the same
// configuration Fallow enforces, so the published picture cannot drift from the
// live rules.
//
// Generation is a pure function of the config bytes. Declaration order drives
// node and edge order, no timestamp or filesystem walk enters the output, and
// every path in the emitted text is repo-relative — so a second run against an
// unchanged config is byte-identical and the drift test can compare bytes.

/** Where the generator reads from and the two artifacts it owns, all repo-relative. */
export const ARCHITECTURE_MAP_ARTIFACTS = {
  config: '.fallowrc.json',
  mermaid: 'docs/architecture-map.md',
  module: 'src/features/devlog/architecture-map.generated.ts',
} as const;

const REGENERATE_COMMAND = 'pnpm generate:architecture-map';

/**
 * How a zone earns its files: an explicit pattern list, an `autoDiscover` group whose
 * child directories each become a slice, or a referenced child of such a group.
 */
export type ZoneKind = 'zone' | 'group' | 'reference-core';

/**
 * The three mechanically derived relations. `allow` is a declared permission between two
 * zones; `exception` is a permission naming a child of an `autoDiscover` group rather than
 * a declared zone; `carve-out` is not a permission at all but first-match classification
 * precedence, where an earlier zone's patterns are fully covered by a later zone's.
 */
export type EdgeKind = 'allow' | 'exception' | 'carve-out';

/** One zone in the graph, with its longest-path layer above the sinks. */
export type ArchitectureNode = {
  id: string;
  label: string;
  layer: number;
  kind: ZoneKind;
};

/** One classified relation between two zones, addressed by node id. */
export type ArchitectureEdge = { from: string; to: string; kind: EdgeKind };

/** The complete derived zone graph: nodes in declaration order, edges grouped by class. */
export type ArchitectureMap = {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
};

type ZoneDeclaration = { name: string; patterns: string[]; autoDiscover: string[] };
type RuleDeclaration = { from: string; allow: string[] };
type NodeDraft = Omit<ArchitectureNode, 'layer'>;
type LayerWalk = {
  targets: Map<string, string[]>;
  layer: Map<string, number>;
  visiting: Set<string>;
};

// Zone names reach the emitted TypeScript inside single quotes and the emitted
// Mermaid inside double quotes, so the accepted alphabet is pinned at the boundary
// rather than escaped downstream.
const ZONE_NAME = /^[A-Za-z0-9/_-]+$/;

const EDGE_CLASS_ORDER: readonly EdgeKind[] = ['allow', 'exception', 'carve-out'];

function fail(detail: string): never {
  throw new Error(`architecture-map: ${detail}`);
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${what} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) fail(`${what} must be an array`);
  return value;
}

function asStringArray(value: unknown, what: string): string[] {
  const items = asArray(value, what);
  if (items.some((item) => typeof item !== 'string')) fail(`${what} must contain only strings`);
  return items as string[];
}

function optionalStringArray(record: Record<string, unknown>, key: string, what: string): string[] {
  const value = record[key];
  return value === undefined ? [] : asStringArray(value, `${what}.${key}`);
}

function parseZone(raw: unknown, index: number): ZoneDeclaration {
  const what = `boundaries.zones[${index}]`;
  const record = asRecord(raw, what);
  const name = record['name'];
  if (typeof name !== 'string' || !ZONE_NAME.test(name)) {
    fail(`${what}.name must be a name matching ${String(ZONE_NAME)}`);
  }
  const patterns = optionalStringArray(record, 'patterns', what);
  const autoDiscover = optionalStringArray(record, 'autoDiscover', what);
  if (patterns.length === 0 && autoDiscover.length === 0) {
    fail(`zone "${name}" declares neither patterns nor autoDiscover`);
  }
  return { name, patterns, autoDiscover };
}

function parseRule(raw: unknown, index: number): RuleDeclaration {
  const what = `boundaries.rules[${index}]`;
  const record = asRecord(raw, what);
  const from = record['from'];
  if (typeof from !== 'string' || from === '') fail(`${what}.from must be a non-empty string`);
  return { from, allow: asStringArray(record['allow'], `${what}.allow`) };
}

function parseBoundaries(config: unknown): { zones: ZoneDeclaration[]; rules: RuleDeclaration[] } {
  const boundaries = asRecord(asRecord(config, 'config')['boundaries'], 'config.boundaries');
  const zones = asArray(boundaries['zones'], 'boundaries.zones').map(parseZone);
  const rules = asArray(boundaries['rules'], 'boundaries.rules').map(parseRule);
  if (zones.length === 0) fail('boundaries.zones declares no zones');
  return { zones, rules };
}

// Mermaid node ids and the generated module's keys share one identity, so both
// artifacts address a zone the same way. `/` becomes `__` to keep the band visible
// in the id; every other non-word character collapses to `_`.
function zoneId(name: string): string {
  return name.replace(/\//g, '__').replace(/[^A-Za-z0-9_]/g, '_');
}

function baseDrafts(zones: ZoneDeclaration[]): NodeDraft[] {
  return zones.map((zone) => ({
    id: zoneId(zone.name),
    label: zone.name,
    kind: zone.autoDiscover.length > 0 ? 'group' : 'zone',
  }));
}

// An allow target that is not itself a declared zone is legal only as a child slice of
// an `autoDiscover` group — the sanctioned reference-core shape.
function autoDiscoverParent(zones: ZoneDeclaration[], target: string): ZoneDeclaration | undefined {
  return zones.find((zone) => zone.autoDiscover.length > 0 && target.startsWith(`${zone.name}/`));
}

function classifyTarget(zones: ZoneDeclaration[], declared: Set<string>, from: string, target: string): EdgeKind {
  if (declared.has(target)) return 'allow';
  if (autoDiscoverParent(zones, target)) return 'exception';
  return fail(
    `rule "${from}" allows "${target}", which is neither a declared zone nor a child of an autoDiscover zone`,
  );
}

function appendReferenceCore(drafts: NodeDraft[], name: string): void {
  const id = zoneId(name);
  if (drafts.some((draft) => draft.id === id)) return;
  drafts.push({ id, label: name, kind: 'reference-core' });
}

// Walks the rules in config order, classifying each allow target and appending any
// referenced reference-core slice as its own node so no edge points at a missing node.
function classifyDependencies(
  zones: ZoneDeclaration[],
  rules: RuleDeclaration[],
  drafts: NodeDraft[],
): ArchitectureEdge[] {
  const declared = new Set(zones.map((zone) => zone.name));
  const edges: ArchitectureEdge[] = [];
  for (const rule of rules) {
    if (!declared.has(rule.from)) fail(`rule "from" names undeclared zone "${rule.from}"`);
    for (const target of rule.allow) {
      const kind = classifyTarget(zones, declared, rule.from, target);
      if (kind === 'exception') appendReferenceCore(drafts, target);
      edges.push({ from: zoneId(rule.from), to: zoneId(target), kind });
    }
  }
  return edges;
}

// Longest path to a sink, which is also the cycle guard: re-entering a node that is
// still on the stack means the allow graph is not one-directional, and the map must
// fail loudly rather than draw a wrong picture.
function longestPath(walk: LayerWalk, id: string, referrer: string): number {
  const cached = walk.layer.get(id);
  if (cached !== undefined) return cached;
  if (walk.visiting.has(id)) {
    fail(`dependency cycle — "${referrer}" allows "${id}", which already depends on "${referrer}"`);
  }
  walk.visiting.add(id);
  let depth = 0;
  for (const target of walk.targets.get(id) ?? []) {
    depth = Math.max(depth, longestPath(walk, target, id) + 1);
  }
  walk.visiting.delete(id);
  walk.layer.set(id, depth);
  return depth;
}

function withLayers(drafts: NodeDraft[], dependencies: ArchitectureEdge[]): ArchitectureNode[] {
  const targets = new Map<string, string[]>(drafts.map((draft) => [draft.id, []]));
  for (const edge of dependencies) {
    const known = targets.get(edge.from);
    if (!known) fail(`edge from unknown node "${edge.from}"`);
    known.push(edge.to);
  }
  const walk: LayerWalk = { targets, layer: new Map(), visiting: new Set() };
  for (const draft of drafts) longestPath(walk, draft.id, '');
  // Every draft id was walked above, so its layer is set by construction.
  return drafts.map((draft) => ({ ...draft, layer: walk.layer.get(draft.id)! }));
}

// Deliberately conservative glob containment over the vocabulary the config actually
// uses: `**` spans any depth, a bare `*` spans exactly one segment, and any other
// segment must match literally. A within-segment glob like `*.tsx` is treated as a
// literal, so this can only under-report coverage — never invent a carve-out.
function globCovers(outer: string[], inner: string[]): boolean {
  const [head, ...restOuter] = outer;
  if (head === undefined) return inner.length === 0;
  if (head === '**') return wildcardCovers(restOuter, inner);
  const [first, ...restInner] = inner;
  if (first === undefined || first === '**') return false;
  if (head !== '*' && head !== first) return false;
  return globCovers(restOuter, restInner);
}

function wildcardCovers(restOuter: string[], inner: string[]): boolean {
  for (let skipped = 0; skipped <= inner.length; skipped += 1) {
    if (globCovers(restOuter, inner.slice(skipped))) return true;
  }
  return false;
}

function coversEveryPattern(later: ZoneDeclaration, earlier: ZoneDeclaration): boolean {
  if (later.patterns.length === 0) return false;
  return earlier.patterns.every((pattern) =>
    later.patterns.some((candidate) => globCovers(candidate.split('/'), pattern.split('/'))),
  );
}

// Fallow classifies a file into the first zone whose pattern matches, so an earlier
// zone whose every pattern is also covered by a later zone is deliberately carved out
// of it. That precedence is a real relation between the two zones, but it is not a
// permission, so it never becomes a matrix cell.
function findCarveOuts(zones: ZoneDeclaration[]): ArchitectureEdge[] {
  const edges: ArchitectureEdge[] = [];
  zones.forEach((earlier, index) => {
    if (earlier.patterns.length === 0) return;
    for (const later of zones.slice(index + 1)) {
      if (coversEveryPattern(later, earlier)) {
        edges.push({ from: zoneId(earlier.name), to: zoneId(later.name), kind: 'carve-out' });
      }
    }
  });
  return edges;
}

function byEdgeClass(edges: ArchitectureEdge[]): ArchitectureEdge[] {
  return EDGE_CLASS_ORDER.flatMap((kind) => edges.filter((edge) => edge.kind === kind));
}

/** Derive the zone-level dependency graph from a parsed `.fallowrc.json`. */
export function buildArchitectureMap(config: unknown): ArchitectureMap {
  const { zones, rules } = parseBoundaries(config);
  const drafts = baseDrafts(zones);
  const dependencies = classifyDependencies(zones, rules, drafts);
  return {
    nodes: withLayers(drafts, dependencies),
    edges: byEdgeClass([...dependencies, ...findCarveOuts(zones)]),
  };
}

const MERMAID_LINKS: Record<EdgeKind, (edge: ArchitectureEdge) => string> = {
  allow: (edge) => `    ${edge.from} --> ${edge.to}`,
  exception: (edge) => `    ${edge.from} -.->|reference core| ${edge.to}`,
  'carve-out': (edge) => `    ${edge.from} -. first-match carve-out .- ${edge.to}`,
};

function countOf(map: ArchitectureMap, kind: EdgeKind): number {
  return map.edges.filter((edge) => edge.kind === kind).length;
}

function countsLine(map: ArchitectureMap): string {
  const permissions = countOf(map, 'allow') + countOf(map, 'exception');
  return (
    `Zones: ${map.nodes.length}. Declared permissions: ${permissions} ` +
    `(reference-core exceptions: ${countOf(map, 'exception')}). ` +
    `First-match carve-outs: ${countOf(map, 'carve-out')}.`
  );
}

function mermaidSource(map: ArchitectureMap): string[] {
  return [
    'flowchart TD',
    '    %% A --> B: A may import B, because the boundary rules declare that permission.',
    '    %% A -.-> B: sanctioned reference-core exception into an auto-discovered band.',
    '    %% A -. .- B: first-match carve-out — files under A classify before B claims them.',
    '    %% Any pair with no link is forbidden: the graph is deny-by-default.',
    ...map.nodes.map((node) => `    ${node.id}["${node.label}"]`),
    '',
    ...map.edges.map((edge) => MERMAID_LINKS[edge.kind](edge)),
  ];
}

/**
 * Emit `docs/architecture-map.md`: a minimal markdown wrapper around one fenced
 * `mermaid` flowchart, which is the form GitHub renders as a diagram.
 */
export function renderMermaid(map: ArchitectureMap): string {
  const lines = [
    '# Architecture map',
    '',
    `<!-- Generated from \`${ARCHITECTURE_MAP_ARTIFACTS.config}\` by \`${REGENERATE_COMMAND}\`.`,
    '     Do not edit by hand: a drift test byte-compares this file against a fresh run. -->',
    '',
    'The zone-level dependency graph LGI.tools enforces, derived from the `boundaries`',
    'block of the Fallow configuration. `docs/architecture-boundaries.md` is the prose',
    'owner of the same map; this file is its generated picture, and the public devlog',
    'renders it as a permission matrix.',
    '',
    countsLine(map),
    '',
    '```mermaid',
    ...mermaidSource(map),
    '```',
    '',
  ];
  return lines.join('\n');
}

function moduleEntry(fields: string): string {
  return `    { ${fields} },`;
}

/**
 * Emit `src/features/devlog/architecture-map.generated.ts`: the same graph as a typed,
 * import-free data module carrying structure, names, layers, and class kinds only —
 * never a colour, which the devlog resolves from theme tokens at render time.
 */
export function renderGeneratedModule(map: ArchitectureMap): string {
  const lines = [
    `// Generated from \`${ARCHITECTURE_MAP_ARTIFACTS.config}\` by \`${REGENERATE_COMMAND}\`.`,
    '// Do not edit by hand: a drift test byte-compares this file against a fresh run,',
    '// so an edit here fails the suite instead of shipping a map the rules disagree with.',
    '',
    '/** Zone-level dependency graph derived from the `boundaries` block of `.fallowrc.json`. */',
    'export const architectureMap = {',
    '  nodes: [',
    ...map.nodes.map((node) =>
      moduleEntry(`id: '${node.id}', label: '${node.label}', layer: ${node.layer}, kind: '${node.kind}'`),
    ),
    '  ],',
    '  edges: [',
    ...map.edges.map((edge) => moduleEntry(`from: '${edge.from}', to: '${edge.to}', kind: '${edge.kind}'`)),
    '  ],',
    '} as const;',
    '',
  ];
  return lines.join('\n');
}
