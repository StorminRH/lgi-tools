/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as corpIndustryJobs from "../corpIndustryJobs.js";
import type * as corpIndustryJobsSync from "../corpIndustryJobsSync.js";
import type * as crons from "../crons.js";
import type * as engine from "../engine.js";
import type * as http from "../http.js";
import type * as industryJobs from "../industryJobs.js";
import type * as industryJobsSync from "../industryJobsSync.js";
import type * as lib_bearerAuth from "../lib/bearerAuth.js";
import type * as lib_characterSync from "../lib/characterSync.js";
import type * as lib_corpSync from "../lib/corpSync.js";
import type * as lib_esiRead from "../lib/esiRead.js";
import type * as lib_subjects from "../lib/subjects.js";
import type * as onlineStatus from "../onlineStatus.js";
import type * as onlineStatusSync from "../onlineStatusSync.js";
import type * as purge from "../purge.js";
import type * as skills from "../skills.js";
import type * as skillsSync from "../skillsSync.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  corpIndustryJobs: typeof corpIndustryJobs;
  corpIndustryJobsSync: typeof corpIndustryJobsSync;
  crons: typeof crons;
  engine: typeof engine;
  http: typeof http;
  industryJobs: typeof industryJobs;
  industryJobsSync: typeof industryJobsSync;
  "lib/bearerAuth": typeof lib_bearerAuth;
  "lib/characterSync": typeof lib_characterSync;
  "lib/corpSync": typeof lib_corpSync;
  "lib/esiRead": typeof lib_esiRead;
  "lib/subjects": typeof lib_subjects;
  onlineStatus: typeof onlineStatus;
  onlineStatusSync: typeof onlineStatusSync;
  purge: typeof purge;
  skills: typeof skills;
  skillsSync: typeof skillsSync;
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
