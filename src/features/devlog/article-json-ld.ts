import { SITE_URL } from '@/config/site-url';
import { documentSummary } from './parse';
import type { DevlogDocument } from './types';

export function buildDevlogArticleJsonLd(document: DevlogDocument, canonicalPath: string) {
  const canonicalUrl = new URL(canonicalPath, SITE_URL).toString();
  const organization = { '@id': new URL('/#organization', SITE_URL).toString() };

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
