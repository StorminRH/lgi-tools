import { isFailedCall } from './availability';
import { keyBlock, keyGroupBlock, normalizeEsiPath, resolveRetryAfter } from './keys';
import type { EsiReport } from './types';

/** The lowest error-limit count ESI echoed across a batch (0 for a 420), with the reset that came with it. */
export interface ErrorEcho {
  readonly remain: number;
  readonly reset: number | null;
}

/** A group's lowest echoed Remaining across a batch, with the limit it is a share of. */
export interface GroupEcho {
  readonly remaining: number;
  readonly limit: number;
}

/**
 * Many answers as one scoreboard write: the counts summed, every echo at
 * its lowest (the scoreboard keeps the lowest anyway), each path's group
 * once, and each 429 block at its longest.
 */
export interface ReportBatch {
  readonly calls: number;
  readonly failures: number;
  readonly errors: number;
  readonly errorEcho: ErrorEcho | null;
  readonly groupOfPath: ReadonlyMap<string, string>;
  readonly groupEchoes: ReadonlyMap<string, GroupEcho>;
  /** Block key to the seconds it holds. */
  readonly retryBlocks: ReadonlyMap<string, number>;
}

function echoOf(report: EsiReport): ErrorEcho | null {
  if (report.status === 420) return { remain: 0, reset: report.errorLimitReset };
  return report.errorLimitRemain === null ? null : { remain: report.errorLimitRemain, reset: report.errorLimitReset };
}

function lowerEcho(current: ErrorEcho | null, next: ErrorEcho | null): ErrorEcho | null {
  if (next === null) return current;
  return current === null || next.remain < current.remain ? next : current;
}

function noteGroup(report: EsiReport, path: string, groupOfPath: Map<string, string>, echoes: Map<string, GroupEcho>): void {
  if (report.rlGroup === null) return;
  groupOfPath.set(path, report.rlGroup);
  if (report.rlRemaining === null || report.rlLimit === null) return;
  const held = echoes.get(report.rlGroup);
  if (held === undefined || report.rlRemaining < held.remaining) {
    echoes.set(report.rlGroup, { remaining: report.rlRemaining, limit: report.rlLimit });
  }
}

/** A 429 blocks the group it names, since every route in it shares the bucket; without a group, the path. */
function noteRetryBlock(report: EsiReport, path: string, blocks: Map<string, number>): void {
  if (report.status !== 429) return;
  const key = report.rlGroup === null ? keyBlock(path) : keyGroupBlock(report.rlGroup);
  blocks.set(key, Math.max(blocks.get(key) ?? 0, resolveRetryAfter(report.retryAfter)));
}

const count = (reports: readonly EsiReport[], counted: (report: EsiReport) => boolean): number =>
  reports.reduce((total, report) => total + (counted(report) ? 1 : 0), 0);

export function summarizeReports(reports: readonly EsiReport[]): ReportBatch {
  const groupOfPath = new Map<string, string>();
  const groupEchoes = new Map<string, GroupEcho>();
  const retryBlocks = new Map<string, number>();
  const paths = reports.map((report) => normalizeEsiPath(report.url));
  let errorEcho: ErrorEcho | null = null;
  for (const [i, report] of reports.entries()) {
    errorEcho = lowerEcho(errorEcho, echoOf(report));
    noteGroup(report, paths[i]!, groupOfPath, groupEchoes);
    noteRetryBlock(report, paths[i]!, retryBlocks);
  }
  return {
    calls: reports.length,
    failures: count(reports, (report) => isFailedCall(report.status)),
    errors: count(reports, (report) => report.status >= 400),
    errorEcho,
    groupOfPath,
    groupEchoes,
    retryBlocks,
  };
}
