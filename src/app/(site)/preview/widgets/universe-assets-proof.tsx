'use client';

import { useEffect, useState } from 'react';
import { Banner } from '@/components/ui/banner';
import { Skeleton } from '@/components/ui/skeleton';
import {
  loadUniverseAssets,
  loadWormholeCodex,
} from '@/data/eve-data/universe-assets-client';

const JITA_ID = 30_000_142;

type ProofState =
  | { status: 'loading' }
  | {
      status: 'ready';
      version: string;
      systemName: string;
      neighbourCount: number;
      wormholeSummary: string;
    }
  | { status: 'error' };

function systemName(
  system: ReturnType<Awaited<ReturnType<typeof loadUniverseAssets>>['systemInfo']>,
): string {
  return system?.name ?? 'Unknown system';
}

function wormholeSummary(
  entry: ReturnType<Awaited<ReturnType<typeof loadWormholeCodex>>['byCode']>,
): string {
  if (entry === null || entry.farSide) return 'B274 unavailable';
  return `B274 ${entry.sizeClass} → class ${entry.targetClass}`;
}

async function loadProofState(): Promise<ProofState> {
  try {
    const [assets, codex] = await Promise.all([
      loadUniverseAssets(),
      loadWormholeCodex(),
    ]);
    const b274 = codex.byCode('B274');
    return {
      status: 'ready',
      version: assets.version,
      systemName: systemName(assets.systemInfo(JITA_ID)),
      neighbourCount: assets.neighbours(JITA_ID).length,
      wormholeSummary: wormholeSummary(b274),
    };
  } catch {
    return { status: 'error' };
  }
}

function ProofContent({ state }: { state: ProofState }) {
  if (state.status === 'loading') {
    return <Skeleton className="h-9 w-full rounded-ctl" label="Loading universe assets" />;
  }
  if (state.status === 'error') {
    return <Banner tone="warn">Universe reference assets could not be loaded.</Banner>;
  }
  return (
    <>
      <span className="font-data text-label tracking-label uppercase text-muted">
        Universe assets · v{state.version}
      </span>
      <span className="font-data text-ui text-text">
        {state.systemName} · {state.neighbourCount} gates
      </span>
      <span className="font-data text-ui text-text">{state.wormholeSummary}</span>
    </>
  );
}

export function UniverseAssetsProof() {
  const [state, setState] = useState<ProofState>({ status: 'loading' });

  useEffect(() => {
    let ignore = false;
    void loadProofState().then((nextState) => {
      if (!ignore) setState(nextState);
    });
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div className="mb-6 flex min-h-9 flex-wrap items-center gap-x-5 gap-y-2 rounded-card border border-border-idle bg-panel px-4 py-2 shadow-card">
      <ProofContent state={state} />
    </div>
  );
}
