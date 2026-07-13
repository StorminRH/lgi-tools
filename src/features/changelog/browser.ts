import type { ContentNavModel } from '@/components/ui/content-browser';
import type { ChangelogMaster } from './parse';

export type ChangelogDocument = {
  slug: string;
  master: ChangelogMaster;
};

export function changelogMasterSlug(version: string): string {
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
    groups: [],
  };
}

export function findChangelogDocument(
  documents: ChangelogDocument[],
  slug: string,
): ChangelogDocument | undefined {
  return documents.find((document) => document.slug === slug);
}
