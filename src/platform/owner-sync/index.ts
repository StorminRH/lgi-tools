export { makeCharacterDescriptor } from './character';
export type { CharacterSyncBase } from './character';
export { makeCorpDescriptor } from './corp';
export type { CorpSyncBase } from './corp';
export { firstCorpCredential } from './credential';
export { corporationsOf, runOwnerSync } from './engine';
export { makeOwnedDescriptor, ownedResourcePath } from './owned';
export type { OwnedDatasetPort, OwnedDatasetSpec, PagedOwnerReadResult } from './owned';
export { errorVerdict, planRead } from './plan';
export type {
  CharacterOwner,
  EnumeratedOwner,
  OwnerKey,
  OwnerSyncDescriptor,
  OwnerSyncResult,
  PagedOwnerSyncState,
  PersistVerdict,
  ReadSession,
  SingleOwnerRead,
  VendedToken,
} from './types';
export { hasToken } from './types';
