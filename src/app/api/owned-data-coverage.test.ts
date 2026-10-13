import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import {
  filesMatching,
  listRouteFiles,
  stripComments,
  valueImportSpecifiers,
} from '@/lib/__tests__/source-scan';

const API_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(API_DIR, '..', '..', '..');

// A `*OnView` reader serves the viewer's owned data and schedules its refresh.
const ON_VIEW_CALL = /\b\w+OnView\(/g;
// The same call made as the `read` of a measureOwnedDataRead input.
const MEASURED_ON_VIEW_READ = /\bmeasureOwnedDataRead\(\{[^}]*?\bread:\s*\(\)\s*=>\s*\w+OnView\(/g;

const readRoute = (file: string): string =>
  stripComments(readFileSync(join(REPO_ROOT, file), 'utf8'));

const ON_VIEW_ROUTES = filesMatching(listRouteFiles(), ON_VIEW_CALL, readRoute).map((file) =>
  relative('src/app/api', file),
);

it.each(ON_VIEW_ROUTES)('%s measures each OnView read as an owned_data_read', (route) => {
  const source = readRoute(join('src/app/api', route));

  expect(valueImportSpecifiers(source)).toContain('@/app/api/owned-data-telemetry');
  expect(source.match(MEASURED_ON_VIEW_READ)?.length).toBe(source.match(ON_VIEW_CALL)?.length);
});
