import type { PgTable } from 'drizzle-orm/pg-core';

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

export interface PurgeContributor {
  readonly name: string;
  readonly tier: PurgeTier;
  readonly claims: readonly PgTable[];
  readonly retained?: readonly RetainedTable[];
  purgeCharacter?(subject: PurgeCharacterSubject): Promise<void>;
  purgeUser?(subject: PurgeUserSubject): Promise<void>;
}
