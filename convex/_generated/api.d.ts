/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as characterLocationAccess from "../characterLocationAccess.js";
import type * as characterLocationApply from "../characterLocationApply.js";
import type * as characterLocationPurge from "../characterLocationPurge.js";
import type * as characterLocationReads from "../characterLocationReads.js";
import type * as characterLocationSync from "../characterLocationSync.js";
import type * as crons from "../crons.js";
import type * as engine from "../engine.js";
import type * as engineComplete from "../engineComplete.js";
import type * as engineLeave from "../engineLeave.js";
import type * as engineScan from "../engineScan.js";
import type * as engineSweep from "../engineSweep.js";
import type * as http from "../http.js";
import type * as httpEngine from "../httpEngine.js";
import type * as httpJump from "../httpJump.js";
import type * as httpLocation from "../httpLocation.js";
import type * as httpMapAccess from "../httpMapAccess.js";
import type * as lib_bearerAuth from "../lib/bearerAuth.js";
import type * as lib_characterSync from "../lib/characterSync.js";
import type * as lib_engineCore from "../lib/engineCore.js";
import type * as lib_httpAuth from "../lib/httpAuth.js";
import type * as lib_indexedQuery from "../lib/indexedQuery.js";
import type * as lib_locationCoverage from "../lib/locationCoverage.js";
import type * as lib_mapAccess from "../lib/mapAccess.js";
import type * as lib_mapConnectionLookup from "../lib/mapConnectionLookup.js";
import type * as lib_mapEntityContracts from "../lib/mapEntityContracts.js";
import type * as lib_mapScanApply from "../lib/mapScanApply.js";
import type * as lib_mapScanElimination from "../lib/mapScanElimination.js";
import type * as lib_mapScanSelection from "../lib/mapScanSelection.js";
import type * as lib_mapScanState from "../lib/mapScanState.js";
import type * as lib_mapSignatureCleanup from "../lib/mapSignatureCleanup.js";
import type * as lib_mapSignatures from "../lib/mapSignatures.js";
import type * as lib_mapSystemLookup from "../lib/mapSystemLookup.js";
import type * as lib_observationKey from "../lib/observationKey.js";
import type * as lib_subjects from "../lib/subjects.js";
import type * as lib_syncFields from "../lib/syncFields.js";
import type * as mapAccessProjection from "../mapAccessProjection.js";
import type * as mapAuthoringCollapse from "../mapAuthoringCollapse.js";
import type * as mapAuthoringEvents from "../mapAuthoringEvents.js";
import type * as mapAuthoringFields from "../mapAuthoringFields.js";
import type * as mapAuthoringHome from "../mapAuthoringHome.js";
import type * as mapAuthoringSweep from "../mapAuthoringSweep.js";
import type * as mapAuthoringTombstone from "../mapAuthoringTombstone.js";
import type * as mapChainAccess from "../mapChainAccess.js";
import type * as mapChainCleanup from "../mapChainCleanup.js";
import type * as mapChainConnections from "../mapChainConnections.js";
import type * as mapChainEvents from "../mapChainEvents.js";
import type * as mapChainPage from "../mapChainPage.js";
import type * as mapChainSystems from "../mapChainSystems.js";
import type * as mapFixtureHoles from "../mapFixtureHoles.js";
import type * as mapFixtureNotes from "../mapFixtureNotes.js";
import type * as mapFixturePlace from "../mapFixturePlace.js";
import type * as mapFixtureRemove from "../mapFixtureRemove.js";
import type * as mapFixtureSignatures from "../mapFixtureSignatures.js";
import type * as mapFixtureTracking from "../mapFixtureTracking.js";
import type * as mapFixtures from "../mapFixtures.js";
import type * as mapHallwayBackfill from "../mapHallwayBackfill.js";
import type * as mapJumpAuthoring from "../mapJumpAuthoring.js";
import type * as mapJumpBookkeeping from "../mapJumpBookkeeping.js";
import type * as mapJumpEvidence from "../mapJumpEvidence.js";
import type * as mapJumpIdentity from "../mapJumpIdentity.js";
import type * as mapJumpReads from "../mapJumpReads.js";
import type * as mapPurge from "../mapPurge.js";
import type * as mapScan from "../mapScan.js";
import type * as mapTrackingIds from "../mapTrackingIds.js";
import type * as mapTrackingLive from "../mapTrackingLive.js";
import type * as mapTrackingOptIn from "../mapTrackingOptIn.js";
import type * as mapTrackingTeardown from "../mapTrackingTeardown.js";
import type * as onlineStatus from "../onlineStatus.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  characterLocationAccess: typeof characterLocationAccess;
  characterLocationApply: typeof characterLocationApply;
  characterLocationPurge: typeof characterLocationPurge;
  characterLocationReads: typeof characterLocationReads;
  characterLocationSync: typeof characterLocationSync;
  crons: typeof crons;
  engine: typeof engine;
  engineComplete: typeof engineComplete;
  engineLeave: typeof engineLeave;
  engineScan: typeof engineScan;
  engineSweep: typeof engineSweep;
  http: typeof http;
  httpEngine: typeof httpEngine;
  httpJump: typeof httpJump;
  httpLocation: typeof httpLocation;
  httpMapAccess: typeof httpMapAccess;
  "lib/bearerAuth": typeof lib_bearerAuth;
  "lib/characterSync": typeof lib_characterSync;
  "lib/engineCore": typeof lib_engineCore;
  "lib/httpAuth": typeof lib_httpAuth;
  "lib/indexedQuery": typeof lib_indexedQuery;
  "lib/locationCoverage": typeof lib_locationCoverage;
  "lib/mapAccess": typeof lib_mapAccess;
  "lib/mapConnectionLookup": typeof lib_mapConnectionLookup;
  "lib/mapEntityContracts": typeof lib_mapEntityContracts;
  "lib/mapScanApply": typeof lib_mapScanApply;
  "lib/mapScanElimination": typeof lib_mapScanElimination;
  "lib/mapScanSelection": typeof lib_mapScanSelection;
  "lib/mapScanState": typeof lib_mapScanState;
  "lib/mapSignatureCleanup": typeof lib_mapSignatureCleanup;
  "lib/mapSignatures": typeof lib_mapSignatures;
  "lib/mapSystemLookup": typeof lib_mapSystemLookup;
  "lib/observationKey": typeof lib_observationKey;
  "lib/subjects": typeof lib_subjects;
  "lib/syncFields": typeof lib_syncFields;
  mapAccessProjection: typeof mapAccessProjection;
  mapAuthoringCollapse: typeof mapAuthoringCollapse;
  mapAuthoringEvents: typeof mapAuthoringEvents;
  mapAuthoringFields: typeof mapAuthoringFields;
  mapAuthoringHome: typeof mapAuthoringHome;
  mapAuthoringSweep: typeof mapAuthoringSweep;
  mapAuthoringTombstone: typeof mapAuthoringTombstone;
  mapChainAccess: typeof mapChainAccess;
  mapChainCleanup: typeof mapChainCleanup;
  mapChainConnections: typeof mapChainConnections;
  mapChainEvents: typeof mapChainEvents;
  mapChainPage: typeof mapChainPage;
  mapChainSystems: typeof mapChainSystems;
  mapFixtureHoles: typeof mapFixtureHoles;
  mapFixtureNotes: typeof mapFixtureNotes;
  mapFixturePlace: typeof mapFixturePlace;
  mapFixtureRemove: typeof mapFixtureRemove;
  mapFixtureSignatures: typeof mapFixtureSignatures;
  mapFixtureTracking: typeof mapFixtureTracking;
  mapFixtures: typeof mapFixtures;
  mapHallwayBackfill: typeof mapHallwayBackfill;
  mapJumpAuthoring: typeof mapJumpAuthoring;
  mapJumpBookkeeping: typeof mapJumpBookkeeping;
  mapJumpEvidence: typeof mapJumpEvidence;
  mapJumpIdentity: typeof mapJumpIdentity;
  mapJumpReads: typeof mapJumpReads;
  mapPurge: typeof mapPurge;
  mapScan: typeof mapScan;
  mapTrackingIds: typeof mapTrackingIds;
  mapTrackingLive: typeof mapTrackingLive;
  mapTrackingOptIn: typeof mapTrackingOptIn;
  mapTrackingTeardown: typeof mapTrackingTeardown;
  onlineStatus: typeof onlineStatus;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
