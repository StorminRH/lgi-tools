import { SITE_URL } from '@/config/site-url';

/** A schema.org BreadcrumbList rooted at Home; each crumb's site path resolves against SITE_URL. */
export function buildBreadcrumbList(trail: readonly { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [{ name: 'Home', path: '/' }, ...trail].map(({ name, path }, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name,
      item: `${SITE_URL}${path}`,
    })),
  };
}
