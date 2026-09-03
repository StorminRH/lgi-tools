import type { ContentNavModel } from '@/components/ui/content-browser';
import type { ChangelogMaster } from './parse';

export type ChangelogDocument = {
  slug: string;
  master: ChangelogMaster;
};

function changelogMasterSlug(version: string): string {
  return `v${version}`;
}

export function toChangelogDocuments(masters: ChangelogMaster[]): ChangelogDocument[] {
  return masters.map((master) => ({ slug: changelogMasterSlug(master.version), master }));
}

export function toChangelogNavModel(documents: ChangelogDocument[]): ContentNavModel {
  return {
    items: documents.map(({ slug, master }) => ({
      slug,
      title: master.title ? `v${master.version} — ${master.title}` : `v${master.version}`,
    })),
  };
}

/** Returns one changelog document by stable slug, or null when it does not exist. */
export function findChangelogDocument(
  documents: ChangelogDocument[],
  slug: string,
): ChangelogDocument | undefined {
  return documents.find((document) => document.slug === slug);
}
