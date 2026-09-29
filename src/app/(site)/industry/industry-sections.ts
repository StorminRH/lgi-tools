export type IndustrySectionId = 'overview' | 'jobs' | 'plan' | 'research' | 'templates';

export interface IndustrySection {
  id: IndustrySectionId;
  title: string;
  href: string;
  /** The child segment under /industry that opens this section; null is /industry itself. */
  segment: string | null;
}

/** The workspace's sections, in tab order. A new page is a new entry here plus its route. */
export const INDUSTRY_SECTIONS: readonly IndustrySection[] = [
  { id: 'overview', title: 'Overview', href: '/industry', segment: null },
  { id: 'jobs', title: 'Active jobs', href: '/industry/jobs', segment: 'jobs' },
  { id: 'plan', title: 'Job plan', href: '/industry/plan', segment: 'plan' },
  { id: 'research', title: 'Market research', href: '/industry/research', segment: 'research' },
  { id: 'templates', title: 'Templates', href: '/industry/templates', segment: 'templates' },
];

const BLUEPRINT_SEGMENT = /^\d+$/;

/** The section a /industry child segment belongs to: a blueprint id is a job plan. */
export function industrySectionFor(segment: string | null): IndustrySectionId | null {
  if (segment !== null && BLUEPRINT_SEGMENT.test(segment)) return 'plan';
  return INDUSTRY_SECTIONS.find((section) => section.segment === segment)?.id ?? null;
}
