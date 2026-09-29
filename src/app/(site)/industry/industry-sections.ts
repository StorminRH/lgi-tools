export type IndustrySectionId = 'research' | 'plan' | 'jobs' | 'templates';

export interface IndustrySection {
  id: IndustrySectionId;
  title: string;
  href: string;
  /** The child segment under /industry that opens this section; null is /industry itself. */
  segment: string | null;
}

/**
 * The workspace's sections, in tab order: research what to build, plan it,
 * follow the jobs, keep the builds worth repeating. A new page is a new entry
 * here plus its route.
 */
export const INDUSTRY_SECTIONS: readonly IndustrySection[] = [
  { id: 'research', title: 'Market research', href: '/industry', segment: null },
  { id: 'plan', title: 'Job plan', href: '/industry/plan', segment: 'plan' },
  { id: 'jobs', title: 'Active jobs', href: '/industry/jobs', segment: 'jobs' },
  { id: 'templates', title: 'Templates', href: '/industry/templates', segment: 'templates' },
];

const BLUEPRINT_SEGMENT = /^\d+$/;

/** The section a /industry child segment belongs to: a blueprint id is a job plan. */
export function industrySectionFor(segment: string | null): IndustrySectionId | null {
  if (segment !== null && BLUEPRINT_SEGMENT.test(segment)) return 'plan';
  return INDUSTRY_SECTIONS.find((section) => section.segment === segment)?.id ?? null;
}
