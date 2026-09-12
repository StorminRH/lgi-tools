import type { ChromeFace, NodeMarkToken } from '@/components/ui/chrome-glyph';
import type { GlanceBucket } from '../signatures/signature-model';
import type { SystemPresence } from '../tracking/presence-model';

export const HUB_FACE = {
  glyph: 'station',
  tone: 'yellow',
} as const satisfies ChromeFace;

const GLANCE_FACE = {
  harvestables: { glyph: 'gas-cloud', tone: 'teal' },
  hacking: { glyph: 'hacking-chip', tone: 'blue' },
  combat: { glyph: 'combat-reticle', tone: 'red' },
} as const satisfies { readonly [K in GlanceBucket]: ChromeFace };

const PRESENCE_FACE = { glyph: 'pilot', tone: 'green' } as const satisfies ChromeFace;

export type TrackProbe =
  | { readonly kind: 'glance'; readonly bucket: GlanceBucket }
  | { readonly kind: 'presence' };

export type TrackOccupant = {
  readonly token: NodeMarkToken;
  readonly probe: TrackProbe;
};

function glanceOccupant(bucket: GlanceBucket): TrackOccupant {
  return {
    token: { ...GLANCE_FACE[bucket], info: { kind: 'bare' } },
    probe: { kind: 'glance', bucket },
  };
}

function presenceOccupant(presence: SystemPresence | null): TrackOccupant | null {
  const count = presence?.pilots.length ?? 0;
  if (count === 0) return null;
  return {
    token: {
      ...PRESENCE_FACE,
      info:
        count > 1
          ? { kind: 'count', value: count, dataKey: 'data-pilot-presence-count' }
          : { kind: 'bare' },
    },
    probe: { kind: 'presence' },
  };
}

export function visibleTrackOccupants(
  marks: readonly GlanceBucket[],
  presence: SystemPresence | null,
): readonly TrackOccupant[] {
  const glances = marks.map(glanceOccupant);
  const presenceSeat = presenceOccupant(presence);
  return presenceSeat === null ? glances : [...glances, presenceSeat];
}
