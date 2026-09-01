import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import type { RegisteredTable } from './table-growth-registry';

export function tableGrowthKey(table: RegisteredTable): string {
  return is(table, PgTable) ? getTableConfig(table).name : `${table.schema}.${table.name}`;
}
