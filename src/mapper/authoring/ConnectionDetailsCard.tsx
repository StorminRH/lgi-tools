'use client';

import { useStoreApi } from '@xyflow/react';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Select } from '@/components/ui/select';
import { TerminalSearch } from '@/components/ui/terminal-search';
import {
  CONNECTION_MASS_STATES,
  WORMHOLE_LIFE_STAGES,
  WORMHOLE_SIZE_CLASSES,
  type ConnectionMassState,
  type WormholeLifeStage,
  type WormholeSizeClass,
} from '@/data/eve-data/wormhole-contract';
import { loadWormholeCodex } from '@/data/eve-data/universe-assets-client';
import type { ChainNode } from '../canvas/SystemNode';
import { SYSTEM_DISC_RADIUS } from '../canvas/SystemNode';
import type { ConnectionDetail } from '../chain/use-map-chain';
import { isAdoptedPopupOpen, MapWindow } from '../windows/MapWindow';
import {
  createEdgeFollower,
  type NodeFollowerStore,
} from '../windows/follower-model';
import { keydownAction } from '../windows/window-model';
import {
  wormholeTypeSearch,
  type WormholeTypeErr,
  type WormholeTypeParams,
} from './wormhole-type-search';

const UNSET = '';

const MASS_ITEMS = [
  { value: UNSET, label: 'Unset' },
  ...CONNECTION_MASS_STATES.map((value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
  })),
];

const SIZE_ITEMS = [
  { value: UNSET, label: 'Unset' },
  ...WORMHOLE_SIZE_CLASSES.map((value) => ({ value, label: value })),
];

const LIFE_LABELS: Record<WormholeLifeStage, string> = {
  under_1_day: 'Less than 1 day',
  under_4_hours: 'Less than 4 hours',
  under_1_hour: 'Less than 1 hour',
  expired: 'Expired',
};

const LIFE_ITEMS = [
  { value: UNSET, label: 'Unset' },
  ...WORMHOLE_LIFE_STAGES.map((value) => ({
    value,
    label: LIFE_LABELS[value],
  })),
];

/** Field-scoped setters the card calls for one connection. */
export interface ConnectionFieldSetters {
  readonly setWormholeType: (value: string | null) => void;
  readonly setShipSize: (value: WormholeSizeClass | null) => void;
  readonly setMassState: (value: ConnectionMassState | null) => void;
  readonly setLifeStage: (value: WormholeLifeStage | null) => void;
}

/** Props for the edge-anchored connection details card. */
export interface ConnectionDetailsCardProps {
  readonly connection: ConnectionDetail;
  readonly setters: ConnectionFieldSetters;
  readonly onClose: () => void;
}

function useWormholeTypeCodes(): readonly string[] {
  const [codes, setCodes] = useState<readonly string[]>([]);
  useEffect(() => {
    let alive = true;
    loadWormholeCodex()
      .then((codex) => {
        if (alive) setCodes(codex.codes());
      })
      .catch(() => {
        // Null-degradation: empty suggestions until the memoized loader heals.
      });
    return () => {
      alive = false;
    };
  }, []);
  return codes;
}

/**
 * Edge-anchored card for human-authored connection facts. Type search uses the
 * session wormhole codex as vocabulary only — no auto-fill of other fields.
 */
export function ConnectionDetailsCard({
  connection,
  setters,
  onClose,
}: ConnectionDetailsCardProps) {
  const store = useStoreApi<ChainNode>();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const codes = useWormholeTypeCodes();
  const search = useMemo(() => wormholeTypeSearch(codes), [codes]);
  const followerStore = useMemo<NodeFollowerStore>(
    () => ({
      getState: () => store.getState(),
      subscribe: (listener) => store.subscribe(listener),
    }),
    [store],
  );

  useLayoutEffect(() => {
    const element = cardRef.current;
    if (element === null) return;
    return createEdgeFollower(
      followerStore,
      String(connection.fromSystemId),
      String(connection.toSystemId),
      SYSTEM_DISC_RADIUS,
      (transform) => {
        element.style.setProperty('--map-window-transform', transform);
      },
    );
  }, [
    connection.fromSystemId,
    connection.toSystemId,
    followerStore,
  ]);

  useEffect(() => {
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      const action = keydownAction({
        key: event.key,
        surfaceKind: 'card',
        popupOpen: isAdoptedPopupOpen(),
        defaultPrevented: event.defaultPrevented,
      });
      if (action === 'dismiss-card') onClose();
    };
    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => document.removeEventListener('keydown', handleDocumentKeyDown);
  }, [onClose]);

  const typeInitial =
    connection.wormholeTypeCode === null ? '' : connection.wormholeTypeCode;

  return (
    <div
      data-map-connection-details
      className="pointer-events-none absolute inset-0 z-sticky"
    >
      <MapWindow
        ref={cardRef}
        windowId="connection-details"
        title="Connection"
        placement={{
          kind: 'edge-anchored',
          fromSystemId: connection.fromSystemId,
          toSystemId: connection.toSystemId,
        }}
        stackIndex={3}
        onClose={onClose}
        onActivate={() => undefined}
      >
        <div className="flex flex-col gap-3">
          <FieldBlock label="Wormhole type">
            <TerminalSearch<WormholeTypeParams, WormholeTypeErr>
              key={`${connection.connectionId}:${typeInitial}`}
              initialValue={typeInitial}
              placeholder="Type code — e.g. B274 or K162"
              parse={search.parse}
              suggest={search.suggest}
              errorMessage={() => 'No wormhole type matches that code.'}
              onSubmit={(params) => setters.setWormholeType(params.code)}
              onClear={() => setters.setWormholeType(null)}
              errorLabel="Type"
            />
          </FieldBlock>
          <FieldBlock label="Ship size">
            <Select
              ariaLabel="Ship size"
              value={connection.shipSize ?? UNSET}
              items={SIZE_ITEMS}
              onValueChange={(value) =>
                setters.setShipSize(
                  value === UNSET ? null : (value as WormholeSizeClass),
                )
              }
            />
          </FieldBlock>
          <FieldBlock label="Stability">
            <Select
              ariaLabel="Mass stability"
              value={connection.massState ?? UNSET}
              items={MASS_ITEMS}
              onValueChange={(value) =>
                setters.setMassState(
                  value === UNSET ? null : (value as ConnectionMassState),
                )
              }
            />
          </FieldBlock>
          <FieldBlock label="Life stage">
            <Select
              ariaLabel="Life stage"
              value={connection.lifeStage ?? UNSET}
              items={LIFE_ITEMS}
              onValueChange={(value) =>
                setters.setLifeStage(
                  value === UNSET ? null : (value as WormholeLifeStage),
                )
              }
            />
          </FieldBlock>
        </div>
      </MapWindow>
    </div>
  );
}

function FieldBlock({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-data text-label uppercase tracking-label text-isk">
        {label}
      </span>
      {children}
    </label>
  );
}
