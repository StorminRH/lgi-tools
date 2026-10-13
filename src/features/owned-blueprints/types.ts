import type { EsiReadSession } from '@/data/esi-store/session';
import type { OwnedDatasetPort } from '@/platform/owner-sync';
import type { OwnedBlueprint } from './esi-projection';

export type OwnedBlueprintsPort = OwnedDatasetPort<OwnedBlueprint, EsiReadSession>;
