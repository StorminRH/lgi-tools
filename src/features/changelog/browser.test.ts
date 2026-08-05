import { describe, expect, it } from 'vitest';
import type { ChangelogMaster } from './parse';
import {
  findChangelogDocument,
  toChangelogDocuments,
  toChangelogNavModel,
} from './browser';

function master(
  version: string,
  entryVersions: string[] = [],
  title: string | null = null,
): ChangelogMaster {
  return {
    version,
    title,
    summary: [],
    subVersions: entryVersions.map((entryVersion) => ({
      version: entryVersion,
      date: '2026-07-12',
      groups: [],
    })),
  };
}

describe('changelog browser model', () => {
  it('preserves master order and includes available version titles', () => {
    const documents = toChangelogDocuments([
      master('3.8', [], 'Undock Checklist'),
      master('3.7'),
    ]);
    expect(toChangelogNavModel(documents)).toEqual({
      items: [
        { slug: 'v3.8', title: 'v3.8 — Undock Checklist' },
        { slug: 'v3.7', title: 'v3.7' },
      ],
      groups: [],
    });
  });

  it('finds known documents and rejects unknown slugs', () => {
    const documents = toChangelogDocuments([master('3.8'), master('3.7')]);
    expect(findChangelogDocument(documents, 'v3.7')?.master.version).toBe('3.7');
    expect(findChangelogDocument(documents, 'v9.9')).toBeUndefined();
  });
});
