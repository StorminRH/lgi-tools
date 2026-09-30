import type { PgColumn, PgDatabase, PgTable } from 'drizzle-orm/pg-core';

export type PurgeTier = 'credential' | 'cache' | 'durable';

export type PurgeSubject =
  | { readonly kind: 'character'; readonly userId: string; readonly characterId: number }
  | { readonly kind: 'user'; readonly userId: string };

export type PurgeCharacterSubject = Extract<PurgeSubject, { kind: 'character' }>;
export type PurgeUserSubject = Extract<PurgeSubject, { kind: 'user' }>;

export interface RetainedTable {
  readonly table: PgTable;
  readonly reason: string;
}

export interface MergeSubject {
  readonly sourceUserId: string;
  readonly survivorUserId: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MergeTx = PgDatabase<any, any, any>;

export type TableMergeRule =
  | { readonly table: PgTable; readonly rule: 'rekey' }
  | { readonly table: PgTable; readonly rule: 'survivor-wins'; readonly key: readonly PgColumn[] }
  | { readonly table: PgTable; readonly rule: 'follows-character' }
  | { readonly table: PgTable; readonly rule: 'discard'; readonly reason: string }
  | {
      readonly tables: readonly PgTable[];
      readonly rule: 'custom';
      readonly reason: string;
      merge(tx: MergeTx, subject: MergeSubject): Promise<void>;
    };

export interface PurgeContributor {
  readonly name: string;
  readonly tier: PurgeTier;
  readonly claims: readonly PgTable[];
  readonly retained?: readonly RetainedTable[];
  readonly merge: readonly TableMergeRule[];
  purgeCharacter?(subject: PurgeCharacterSubject): Promise<void>;
  purgeUser?(subject: PurgeUserSubject): Promise<void>;
}
