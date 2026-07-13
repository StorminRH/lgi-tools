import { SITE_URL } from '@/config/site-url';
import { documentSummary } from './parse';
import type { DevlogDocument } from './types';

export function buildDevlogArticleJsonLd(document: DevlogDocument, canonicalPath: string) {
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;
  const organization = { '@id': `${SITE_URL}/#organization` };

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: document.title,
    description: documentSummary(document),
    datePublished: document.updated,
    dateModified: document.updated,
    url: canonicalUrl,
    mainEntityOfPage: canonicalUrl,
    author: organization,
    publisher: organization,
  };
}
