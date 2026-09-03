import { roundSecurityStatus, securityStatusTextClass } from './security';
import {
  destinationHintSoleClassId,
  type WormholeDestinationHint,
} from './wormhole-contract';

const CLASS_TEXT_BY_ID = new Map<number, string>([
  [1, 'C1'],
  [2, 'C2'],
  [3, 'C3'],
  [4, 'C4'],
  [5, 'C5'],
  [6, 'C6'],
  [7, 'HS'],
  [8, 'LS'],
  [9, 'NS'],
  [12, 'Thera'],
  [13, 'C13'],

  [14, 'Drifter'],
  [15, 'Drifter'],
  [16, 'Drifter'],
  [17, 'Drifter'],
  [18, 'Drifter'],
  [25, 'Pochven'],
]);

export function systemClassText(whClassId: number | null): string | null {
  if (whClassId === null) return null;
  return CLASS_TEXT_BY_ID.get(whClassId) ?? null;
}

export interface SystemIdentityFacts {
  readonly name: string;

  readonly security: number | null;

  readonly whClassId: number | null;
}

export interface SystemIdentityReadout {
  readonly label: string;
  readonly tone: string;
}

export interface SystemClassificationReadout {
  readonly label: string;
  readonly tone: string;
}

const CLASS_TONES_BY_ID = new Map<number, string>([
  [1, 'text-wh-c1'],
  [2, 'text-wh-c2'],
  [3, 'text-wh-c3'],
  [4, 'text-wh-c4'],
  [5, 'text-wh-c5'],
  [6, 'text-wh-c6'],
  [12, 'text-tone-teal'],
  [13, 'text-wh-c6'],
  [14, 'text-tone-purple'],
  [15, 'text-tone-purple'],
  [16, 'text-tone-purple'],
  [17, 'text-tone-purple'],
  [18, 'text-tone-purple'],
  [25, 'text-tone-red'],
]);

const DESTINATION_CLASS_TONES_BY_ID = new Map<number, string>([
  [7, 'text-sec-10'],
  [8, 'text-sec-04'],
  [9, 'text-sec-null'],
]);

export function systemDestinationClassReadout(
  whClassId: number | null,
): SystemClassificationReadout | null {
  if (whClassId === null) return null;
  const label = systemClassText(whClassId);
  const tone = CLASS_TONES_BY_ID.get(whClassId)
    ?? DESTINATION_CLASS_TONES_BY_ID.get(whClassId);
  return label === null || tone === undefined ? null : { label, tone };
}

const HINT_BUCKET_READOUT: Partial<
  Record<WormholeDestinationHint, SystemClassificationReadout>
> = {

  unknown: { label: 'C1–C3', tone: 'text-wh-c2' },
  dangerous: { label: 'C4–C5', tone: 'text-wh-c4' },
};

export function systemDestinationHintReadout(
  hint: WormholeDestinationHint | null,
): SystemClassificationReadout | null {
  if (hint === null) return null;
  const soleClassId = destinationHintSoleClassId(hint);
  if (soleClassId !== null) return systemDestinationClassReadout(soleClassId);
  return HINT_BUCKET_READOUT[hint] ?? null;
}

export function systemClassificationReadout(
  facts: Pick<SystemIdentityFacts, 'security' | 'whClassId'>,
): SystemClassificationReadout | null {
  const { security, whClassId } = facts;
  if (whClassId !== null && CLASS_TONES_BY_ID.has(whClassId)) {
    return systemDestinationClassReadout(whClassId);
  }
  if (security === null) return null;
  return {
    label: roundSecurityStatus(security).toFixed(1),
    tone: securityStatusTextClass(security),
  };
}

export function systemIdentityReadout(
  facts: SystemIdentityFacts,
): SystemIdentityReadout {
  const classification = systemClassificationReadout(facts);
  if (classification === null) return { label: facts.name, tone: 'text-name' };
  return {
    label: `${facts.name} - ${classification.label}`,
    tone: classification.tone,
  };
}
