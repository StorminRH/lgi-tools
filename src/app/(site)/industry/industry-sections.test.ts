import { describe, expect, it } from 'vitest';
import { INDUSTRY_SECTIONS, industrySectionFor } from './industry-sections';

describe('industrySectionFor', () => {
  it('maps the layout page to market research', () => {
    expect(industrySectionFor(null)).toBe('research');
  });

  it('maps each section segment to its section', () => {
    expect(industrySectionFor('jobs')).toBe('jobs');
    expect(industrySectionFor('plan')).toBe('plan');
    expect(industrySectionFor('templates')).toBe('templates');
  });

  it('treats a blueprint id as the job plan', () => {
    expect(industrySectionFor('11567')).toBe('plan');
  });

  it('selects nothing for an unknown segment', () => {
    expect(industrySectionFor('not-a-section')).toBeNull();
  });
});

describe('INDUSTRY_SECTIONS', () => {
  it('links every section under /industry with a unique segment', () => {
    const segments = INDUSTRY_SECTIONS.map((section) => section.segment);
    expect(new Set(segments).size).toBe(segments.length);
    for (const section of INDUSTRY_SECTIONS) {
      expect(section.href).toBe(section.segment === null ? '/industry' : `/industry/${section.segment}`);
    }
  });
});
