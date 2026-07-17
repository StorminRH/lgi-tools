import type { ContentNavModel } from '@/components/ui/content-browser';
import type { ChangelogMaster } from './parse';

/** Browseable changelog document with stable slug, master version, title, and ordered entries. */
export type ChangelogDocument = {
  slug: string;
  master: ChangelogMaster;
};

/** Returns the stable URL slug for one changelog master version. */
export function changelogMasterSlug(version: string): string {
  return `v${version}`;
}

/**
 * Flattens changelog masters into ordered browseable documents while preserving master grouping
 * and release dates.
 */
export function toChangelogDocuments(masters: ChangelogMaster[]): ChangelogDocument[] {
  return masters.map((master) => ({ slug: changelogMasterSlug(master.version), master }));
}

/** Builds ordered changelog navigation groups and active-document state from parsed masters. */
export function toChangelogNavModel(documents: ChangelogDocument[]): ContentNavModel {
  return {
    items: documents.map(({ slug, master }) => ({
      slug,
      title: master.title ? `v${master.version} — ${master.title}` : `v${master.version}`,
    })),
    groups: [],
  };
}

/** Returns one changelog document by stable slug, or null when it does not exist. */
export function findChangelogDocument(
  documents: ChangelogDocument[],
  slug: string,
): ChangelogDocument | undefined {
  return documents.find((document) => document.slug === slug);
}
