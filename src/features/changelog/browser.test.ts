import { describe, expect, it } from 'vitest';
import type { ChangelogMaster } from './parse';
import {
  changelogMasterSlug,
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
  it('derives stable version slugs', () => {
    expect(changelogMasterSlug('3.7')).toBe('v3.7');
    expect(changelogMasterSlug('4.0')).toBe('v4.0');
  });

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

  it('preserves every master and sub-version while projecting documents', () => {
    const masters = [master('3.8', ['3.8.2', '3.8.1']), master('3.7', ['3.7.1'])];
    const documents = toChangelogDocuments(masters);
    expect(documents.map((document) => document.master)).toEqual(masters);
    expect(documents.flatMap((document) => document.master.subVersions)).toEqual(
      masters.flatMap((item) => item.subVersions),
    );
  });
});
