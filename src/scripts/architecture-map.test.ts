import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ARCHITECTURE_MAP_ARTIFACTS,
  buildArchitectureMap,
  renderGeneratedModule,
  renderMermaid,
  type ArchitectureMap,
} from './architecture-map';

// The drift lock. Both committed artifacts are read as BYTES and compared against a
// fresh generation from the live `.fallowrc.json`, so a boundary change that skips
// `pnpm generate:architecture-map` fails here instead of publishing a stale map.
//
// The generated module is deliberately never imported: `src/features/**` is off-limits
// to the `scripts` zone, and an import edge here would violate the very allow graph the
// map draws. Reading the file as text keeps the test honest about that boundary.

const readArtifact = (path: string) => readFileSync(path, 'utf8');
const liveConfig = () => JSON.parse(readArtifact(ARCHITECTURE_MAP_ARTIFACTS.config)) as unknown;
const liveMap = () => buildArchitectureMap(liveConfig());

// A minimal, self-contained config: two ordinary zones plus a sink, one auto-discovered
// band with a reference-core child, and a pattern pair that is a first-match carve-out.
const fixtureConfig = () => ({
  boundaries: {
    zones: [
      { name: 'api', patterns: ['src/app/api/**'] },
      { name: 'app', patterns: ['src/app/**'] },
      { name: 'data', autoDiscover: ['src/data'] },
      { name: 'lib', patterns: ['src/lib/**'] },
    ],
    rules: [
      { from: 'app', allow: ['data', 'lib'] },
      { from: 'api', allow: ['data'] },
      { from: 'data', allow: ['data/eve-data', 'lib'] },
      { from: 'lib', allow: [] },
    ],
  },
});

const kindsOf = (map: ArchitectureMap, kind: string) => map.edges.filter((e) => e.kind === kind);
const idsOf = (map: ArchitectureMap) => map.nodes.map((node) => node.id);
const layerOf = (map: ArchitectureMap, id: string) =>
  map.nodes.find((node) => node.id === id)?.layer;

describe('architecture map — committed artifacts match the live configuration', () => {
  it('regenerates docs/architecture-map.md byte-for-byte', () => {
    expect(renderMermaid(liveMap())).toBe(readArtifact(ARCHITECTURE_MAP_ARTIFACTS.mermaid));
  });

  it('regenerates the devlog data module byte-for-byte', () => {
    expect(renderGeneratedModule(liveMap())).toBe(readArtifact(ARCHITECTURE_MAP_ARTIFACTS.module));
  });

  it('is a pure function of the config bytes — two runs are identical', () => {
    const [first, second] = [liveMap(), liveMap()];
    expect(renderMermaid(first)).toBe(renderMermaid(second));
    expect(renderGeneratedModule(first)).toBe(renderGeneratedModule(second));
  });

  it('turns red when a seeded allow edge is not regenerated', () => {
    // Proves the byte-compare above is load-bearing: change one rule and the emitted
    // text must diverge from the committed file.
    const seeded = JSON.parse(readArtifact(ARCHITECTURE_MAP_ARTIFACTS.config)) as {
      boundaries: { rules: { from: string; allow: string[] }[] };
    };
    const target = seeded.boundaries.rules.find((rule) => rule.from === 'transport');
    // Depends on the live config, not on anything provable here, so say so plainly
    // rather than failing later with a bare TypeError.
    if (!target) throw new Error('fixture assumption broken: no "transport" rule in the live config');
    target.allow.push('config');

    expect(renderMermaid(buildArchitectureMap(seeded))).not.toBe(
      readArtifact(ARCHITECTURE_MAP_ARTIFACTS.mermaid),
    );
    expect(renderGeneratedModule(buildArchitectureMap(seeded))).not.toBe(
      readArtifact(ARCHITECTURE_MAP_ARTIFACTS.module),
    );
  });
});

describe('architecture map — the live graph is complete and one-directional', () => {
  it('names every declared zone plus the referenced reference-core slice', () => {
    const config = fixtureConfig();
    const declared = config.boundaries.zones.length;
    expect(idsOf(buildArchitectureMap(config))).toHaveLength(declared + 1);
    expect(idsOf(buildArchitectureMap(config))).toContain('data__eve_data');
  });

  it('lays every permitted edge strictly downhill, so the matrix is triangular', () => {
    const map = liveMap();
    const permissions = [...kindsOf(map, 'allow'), ...kindsOf(map, 'exception')];
    expect(permissions.length).toBeGreaterThan(0);
    for (const edge of permissions) {
      // Both endpoints are graph nodes, so layerOf resolves for each.
      expect(layerOf(map, edge.from)).toBeGreaterThan(layerOf(map, edge.to)!);
    }
  });

  it('sanitizes ids while keeping the real zone name as the label', () => {
    const map = liveMap();
    const referenceCore = map.nodes.find((node) => node.kind === 'reference-core');
    expect(referenceCore).toEqual({
      id: 'data__eve_data',
      label: 'data/eve-data',
      layer: 0,
      kind: 'reference-core',
    });
    expect(idsOf(map).every((id) => /^[A-Za-z0-9_]+$/.test(id))).toBe(true);
  });

  it('groups the emitted relations by class: allow, then exception, then carve-out', () => {
    const rank: Record<string, number> = { allow: 0, exception: 1, 'carve-out': 2 };
    // EdgeKind has exactly these three members, so every kind has a rank here.
    const ranks = liveMap().edges.map((edge) => rank[edge.kind]!);
    // Monotonically non-decreasing: any interleaved class would break this.
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(ranks).toContain(0);
    expect(ranks).toContain(1);
    expect(ranks).toContain(2);
  });
});

describe('architecture map — the pinned edge taxonomy', () => {
  // Today's derived special cases, pinned so a boundary change that adds or removes one
  // updates this census consciously instead of quietly redrawing the published map.
  it('derives exactly one reference-core exception: data → data/eve-data', () => {
    expect(kindsOf(liveMap(), 'exception')).toEqual([
      { from: 'data', to: 'data__eve_data', kind: 'exception' },
    ]);
  });

  it('derives exactly one first-match carve-out: api out of app', () => {
    expect(kindsOf(liveMap(), 'carve-out')).toEqual([
      { from: 'api', to: 'app', kind: 'carve-out' },
    ]);
  });

  it('counts the live graph at 23 zones and 108 declared permissions', () => {
    const map = liveMap();
    expect(map.nodes).toHaveLength(23);
    expect(kindsOf(map, 'allow')).toHaveLength(107);
    expect(kindsOf(map, 'exception')).toHaveLength(1);
    expect(Math.max(...map.nodes.map((node) => node.layer))).toBe(10);
  });

  it('renders the three link forms distinctly in the flowchart', () => {
    const mermaid = renderMermaid(liveMap());
    expect(mermaid).toContain('    api --> transport');
    expect(mermaid).toContain('    data -.->|reference core| data__eve_data');
    expect(mermaid).toContain('    api -. first-match carve-out .- app');
    expect(mermaid).toContain('```mermaid');
  });

  it('carries no style directive, timestamp, or absolute path', () => {
    const emitted = renderMermaid(liveMap()) + renderGeneratedModule(liveMap());
    expect(emitted).not.toMatch(/classDef|linkStyle|style /);
    expect(emitted).not.toMatch(/\d{4}-\d{2}-\d{2}T|\/Users\/|\/home\//);
  });
});

describe('architecture map — malformed configuration fails loudly', () => {
  it('throws when the boundaries block is missing', () => {
    expect(() => buildArchitectureMap({})).toThrow(/config\.boundaries must be an object/);
  });

  it('throws when a zone declares neither patterns nor autoDiscover', () => {
    const config = { boundaries: { zones: [{ name: 'orphan' }], rules: [] } };
    expect(() => buildArchitectureMap(config)).toThrow(
      /zone "orphan" declares neither patterns nor autoDiscover/,
    );
  });

  it('throws when a rule allows a target that is no zone and no auto-discovered child', () => {
    const config = fixtureConfig();
    // fixtureConfig declares four rules in this file, so index 0 exists by construction.
    config.boundaries.rules[0]!.allow.push('nowhere');
    expect(() => buildArchitectureMap(config)).toThrow(
      /rule "app" allows "nowhere", which is neither a declared zone nor a child/,
    );
  });

  it('throws when a rule is declared for an undeclared zone', () => {
    const config = fixtureConfig();
    config.boundaries.rules.push({ from: 'ghost', allow: [] });
    expect(() => buildArchitectureMap(config)).toThrow(/undeclared zone "ghost"/);
  });

  it('throws naming both ends when a seeded cycle breaks one-directionality', () => {
    const config = fixtureConfig();
    // lib is the sink; letting it reach back up to app closes a loop through
    // app → data → lib → app. The walk reports the edge it re-enters on, naming
    // both ends of that back edge. Index 3 is fixtureConfig's own lib rule.
    config.boundaries.rules[3]!.allow.push('app');
    expect(() => buildArchitectureMap(config)).toThrow(
      /dependency cycle — "app" allows "data", which already depends on "app"/,
    );
  });

  it('throws when zones or rules are not arrays', () => {
    expect(() => buildArchitectureMap({ boundaries: { zones: {}, rules: [] } })).toThrow(
      /boundaries\.zones must be an array/,
    );
    expect(() =>
      buildArchitectureMap({ boundaries: { zones: [{ name: 'a', patterns: ['x/**'] }], rules: {} } }),
    ).toThrow(/boundaries\.rules must be an array/);
  });

  it('rejects a zone name that could not survive the emitters intact', () => {
    const config = { boundaries: { zones: [{ name: "od'd", patterns: ['x/**'] }], rules: [] } };
    expect(() => buildArchitectureMap(config)).toThrow(/boundaries\.zones\[0\]\.name/);
  });

  it('refuses two zone names that reduce to one node id', () => {
    // zoneId maps every non-word character to '_', so these two distinct zones would both
    // become "owner_sync". The devlog indexes the matrix by id, so a collision would draw
    // one zone's permissions on the other zone's row.
    const config = {
      boundaries: {
        zones: [
          { name: 'owner-sync', patterns: ['a/**'] },
          { name: 'owner_sync', patterns: ['b/**'] },
        ],
        rules: [],
      },
    };
    expect(() => buildArchitectureMap(config)).toThrow(
      /zones "owner-sync" and "owner_sync" both reduce to node id "owner_sync"/,
    );
  });

  it('refuses a reference core that collides with a declared zone id', () => {
    const config = {
      boundaries: {
        zones: [
          { name: 'data', autoDiscover: ['src/data'] },
          { name: 'data__eve_data', patterns: ['b/**'] },
        ],
        rules: [{ from: 'data', allow: ['data/eve-data'] }],
      },
    };
    expect(() => buildArchitectureMap(config)).toThrow(/both reduce to node id "data__eve_data"/);
  });

  it('keeps every live node id unique', () => {
    const ids = liveMap().nodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rejects an allow target that could not survive the emitters intact', () => {
    // A target naming no declared zone becomes a reference-core node whose label is that
    // raw text, so an apostrophe would emit a generated module that does not parse and a
    // quote would break the Mermaid label. Both are refused at the boundary.
    for (const target of ["data/it's", 'data/say"hi"', 'data/semi;colon']) {
      const config = {
        boundaries: {
          zones: [{ name: 'data', autoDiscover: ['src/data'] }],
          rules: [{ from: 'data', allow: [target] }],
        },
      };
      expect(() => buildArchitectureMap(config)).toThrow(/boundaries\.rules\[0\]\.allow names/);
    }
  });

  it('still emits a valid module and flowchart for every live label', () => {
    // The positive half of the boundary check: nothing the live config produces needs
    // escaping, so both emitted texts stay parseable.
    const map = liveMap();
    for (const node of map.nodes) {
      expect(node.label).not.toMatch(/['"`;]/);
    }
    expect(renderGeneratedModule(map)).not.toMatch(/label: '[^']*'[^,]/);
  });
});

describe('architecture map — first-match carve-out detection', () => {
  it('finds the carve-out only when a later zone covers every earlier pattern', () => {
    const covered = buildArchitectureMap(fixtureConfig());
    expect(kindsOf(covered, 'carve-out')).toEqual([{ from: 'api', to: 'app', kind: 'carve-out' }]);
  });

  it('does not invent a carve-out for sibling directories', () => {
    const config = {
      boundaries: {
        zones: [
          { name: 'ui', patterns: ['src/components/ui/**'] },
          { name: 'components', patterns: ['src/components/*.tsx', 'src/components/telemetry/**'] },
        ],
        rules: [],
      },
    };
    expect(kindsOf(buildArchitectureMap(config), 'carve-out')).toEqual([]);
  });

  it('ignores declaration order — a later zone is never carved out of an earlier one', () => {
    const config = {
      boundaries: {
        zones: [
          { name: 'app', patterns: ['src/app/**'] },
          { name: 'api', patterns: ['src/app/api/**'] },
        ],
        rules: [],
      },
    };
    expect(kindsOf(buildArchitectureMap(config), 'carve-out')).toEqual([]);
  });
});
