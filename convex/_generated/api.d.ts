/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as characterLocation from "../characterLocation.js";
import type * as characterLocationSync from "../characterLocationSync.js";
import type * as crons from "../crons.js";
import type * as engine from "../engine.js";
import type * as http from "../http.js";
import type * as lib_bearerAuth from "../lib/bearerAuth.js";
import type * as lib_characterSync from "../lib/characterSync.js";
import type * as lib_mapAccess from "../lib/mapAccess.js";
import type * as lib_mapChainCleanup from "../lib/mapChainCleanup.js";
import type * as lib_mapConnectionLookup from "../lib/mapConnectionLookup.js";
import type * as lib_mapEntityContracts from "../lib/mapEntityContracts.js";
import type * as lib_mapSignatureCleanup from "../lib/mapSignatureCleanup.js";
import type * as lib_mapSignatures from "../lib/mapSignatures.js";
import type * as lib_mapSystemLookup from "../lib/mapSystemLookup.js";
import type * as lib_observationKey from "../lib/observationKey.js";
import type * as lib_subjects from "../lib/subjects.js";
import type * as lib_syncFields from "../lib/syncFields.js";
import type * as mapAccessProjection from "../mapAccessProjection.js";
import type * as mapAuthoring from "../mapAuthoring.js";
import type * as mapChain from "../mapChain.js";
import type * as mapFixtures from "../mapFixtures.js";
import type * as mapJump from "../mapJump.js";
import type * as mapJumpBookkeeping from "../mapJumpBookkeeping.js";
import type * as mapScan from "../mapScan.js";
import type * as mapTracking from "../mapTracking.js";
import type * as onlineStatus from "../onlineStatus.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  characterLocation: typeof characterLocation;
  characterLocationSync: typeof characterLocationSync;
  crons: typeof crons;
  engine: typeof engine;
  http: typeof http;
  "lib/bearerAuth": typeof lib_bearerAuth;
  "lib/characterSync": typeof lib_characterSync;
  "lib/mapAccess": typeof lib_mapAccess;
  "lib/mapChainCleanup": typeof lib_mapChainCleanup;
  "lib/mapConnectionLookup": typeof lib_mapConnectionLookup;
  "lib/mapEntityContracts": typeof lib_mapEntityContracts;
  "lib/mapSignatureCleanup": typeof lib_mapSignatureCleanup;
  "lib/mapSignatures": typeof lib_mapSignatures;
  "lib/mapSystemLookup": typeof lib_mapSystemLookup;
  "lib/observationKey": typeof lib_observationKey;
  "lib/subjects": typeof lib_subjects;
  "lib/syncFields": typeof lib_syncFields;
  mapAccessProjection: typeof mapAccessProjection;
  mapAuthoring: typeof mapAuthoring;
  mapChain: typeof mapChain;
  mapFixtures: typeof mapFixtures;
  mapJump: typeof mapJump;
  mapJumpBookkeeping: typeof mapJumpBookkeeping;
  mapScan: typeof mapScan;
  mapTracking: typeof mapTracking;
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
  workpool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"workpool">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
