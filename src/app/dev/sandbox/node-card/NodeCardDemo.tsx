'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { NodeAdjusters } from '@/features/industry-planner/components/MeAdjuster';
import { NodeCard } from '@/features/industry-planner/components/NodeCard';
import { clampMe } from '@/features/industry-planner/me-overrides';
import { nodeFrameState } from '@/features/industry-planner/node-frame-state';
import { clampTe } from '@/features/industry-planner/te-overrides';
import type { OwnedComponentDetail } from '@/features/industry-planner/types';

// 3.7.5.7 node-card re-layout sandbox. The real NodeCard + the real inline ME/TE
// fields, driven by the actual override helpers over a hand-authored mock build —
// across owned / manual / unowned states, a raw (no fields), and both a narrow and a
// wide column so the layout can be judged at the widths the consolidated view packs.

// Owned ME/TE per (mock) producing blueprint id — only A and B are owned.
const OWNED_ME = new Map<number, number>([
  [101, 10],
  [102, 4],
]);
const OWNED_TE = new Map<number, number>([
  [101, 20],
  [102, 8],
]);

const DETAIL: Record<number, OwnedComponentDetail> = {
  101: {
    te: 20,
    ownerType: 'character',
    ownerName: 'Test Pilot',
    locationName: 'Jita IV-4 — Caldari Navy Assembly Plant',
    locationFlag: 'Hangar',
  },
  102: {
    te: 8,
    ownerType: 'corporation',
    ownerName: 'Lo-Gang Industries',
    locationName: 'Upwell structure',
    locationFlag: 'CorpSAG1',
  },
};

interface Node {
  typeId: number;
  bp?: number;
  name: string;
  label: string;
  qty: number;
  value: number;
}

const NODES: Node[] = [
  { typeId: 1, bp: 101, name: 'Capital Armor Plate', label: 'Component', qty: 56, value: 106_440_000 },
  { typeId: 2, bp: 102, name: 'Fullerene-Fibered Composites', label: 'Composite', qty: 18_900, value: 540_000_000 },
  { typeId: 3, bp: 103, name: 'Capital Capacitor Battery', label: 'Component', qty: 3, value: 41_040_000 },
  { typeId: 4, name: 'Tritanium', label: 'Mineral', qty: 540_000, value: 21_600_000 },
];

function useLocalOverrides(initial: Map<number, number>, clamp: (n: number) => number) {
  const [map, setMap] = useState<Map<number, number>>(initial);
  const set = (bp: number, v: number) => setMap((prev) => new Map(prev).set(bp, clamp(v)));
  const reset = (bp: number) =>
    setMap((prev) => {
      if (!prev.has(bp)) return prev;
      const next = new Map(prev);
      next.delete(bp);
      return next;
    });
  return { map, set, reset };
}

function Column({ width, label }: { width: string; label: string }) {
  // Node B starts with a manual ME override (orange) over its owned value; the rest
  // start owned (blue) / unowned (faint).
  const me = useLocalOverrides(new Map([[102, 7]]), clampMe);
  const te = useLocalOverrides(new Map(), clampTe);
  return (
    <div className={width}>
      <div className="mb-2 font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted">
        {label}
      </div>
      <Card>
        {NODES.map((n, i) => (
          <NodeCard
            key={n.typeId}
            typeId={n.typeId}
            name={n.name}
            label={n.label}
            qty={n.qty}
            value={n.value}
            detail={n.bp !== undefined ? DETAIL[n.bp] : undefined}
            selected={false}
            related={false}
            faded={false}
            onSelect={i % 2 === 0 ? () => undefined : undefined}
            efficiency={
              n.bp !== undefined
                ? {
                    state: nodeFrameState(n.bp, OWNED_ME, OWNED_TE, me.map, te.map),
                    adjusters: (
                      <NodeAdjusters
                        blueprintTypeId={n.bp}
                        name={n.name}
                        ownedMe={OWNED_ME}
                        meOverrides={me.map}
                        setMeOverride={me.set}
                        resetMeOverride={me.reset}
                        ownedTe={OWNED_TE}
                        teOverrides={te.map}
                        setTeOverride={te.set}
                        resetTeOverride={te.reset}
                      />
                    ),
                  }
                : undefined
            }
          />
        ))}
      </Card>
    </div>
  );
}

export function NodeCardDemo() {
  return (
    <div className="flex flex-wrap items-start justify-center gap-6">
      <Column width="w-[168px]" label="Narrow column (8-up)" />
      <Column width="w-[280px]" label="Wide column (2–3-up)" />
    </div>
  );
}
