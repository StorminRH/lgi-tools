import type { EsiReadSession } from '@/data/esi-store/session';
import type { OwnedDatasetPort } from '@/platform/owner-sync';
import type { OwnedAsset } from './esi-projection';

export type OwnedAssetsPort = OwnedDatasetPort<OwnedAsset, EsiReadSession>;
