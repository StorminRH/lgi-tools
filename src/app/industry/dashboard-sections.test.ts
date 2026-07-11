import { describe, expect, it } from 'vitest';
import {
  activeJobsHint,
  activeStatus,
  corpHint,
  corpStatus,
  type DashboardSectionId,
  deriveSectionRender,
  orderSections,
  PREFERRED_SECTION_ORDER,
  recentsStatus,
  savedStatus,
  type SectionStatus,
} from './dashboard-sections';

function status(
  overrides: Partial<Record<DashboardSectionId, SectionStatus>> = {},
): Record<DashboardSectionId, SectionStatus> {
  return { recents: 'populated', saved: 'populated', active: 'populated', corp: 'populated', ...overrides };
}

describe('orderSections', () => {
  // The three review-example states the rank model is pinned on.
  it('keeps the preferred order when every section is populated', () => {
    expect(orderSections(status())).toEqual(['recents', 'saved', 'active', 'corp']);
  });

  it('sinks an empty saved section below the populated ones', () => {
    expect(orderSections(status({ saved: 'empty' }))).toEqual([
      'recents',
      'active',
      'corp',
      'saved',
    ]);
  });

  it('sinks saved + active keeping preferred order within the empty group', () => {
    expect(orderSections(status({ saved: 'empty', active: 'empty' }))).toEqual([
      'recents',
      'corp',
      'saved',
      'active',
    ]);
  });

  it('treats pending as populated so nothing sinks before it settles', () => {
    expect(
      orderSections({ recents: 'pending', saved: 'pending', active: 'pending', corp: 'pending' }),
    ).toEqual([...PREFERRED_SECTION_ORDER]);
  });

  it('respects a custom preferred order (the future page-settings seam)', () => {
    expect(orderSections(status({ saved: 'empty' }), ['active', 'saved', 'corp', 'recents'])).toEqual([
      'active',
      'corp',
      'recents',
      'saved',
    ]);
  });
});

describe('recentsStatus', () => {
  it('is pending before the localStorage read lands', () => {
    expect(recentsStatus(null)).toBe('pending');
  });
  it('is empty on a read with nothing there', () => {
    expect(recentsStatus([])).toBe('empty');
  });
  it('is populated with entries', () => {
    expect(recentsStatus([{ typeId: 691 }])).toBe('populated');
  });
});

describe('savedStatus', () => {
  it('is pending before the list fetch settles', () => {
    expect(savedStatus(null, false)).toBe('pending');
  });
  it('sinks on a failed read instead of holding a slot open', () => {
    expect(savedStatus(null, true)).toBe('empty');
  });
  it('is empty on a settled empty list (incl. the anonymous {plans: []})', () => {
    expect(savedStatus([], false)).toBe('empty');
  });
  it('is populated with plans', () => {
    expect(savedStatus([{ id: 'a' }], false)).toBe('populated');
  });
});

describe('activeStatus', () => {
  it('is pending while the jobs read is in flight', () => {
    expect(activeStatus({ loading: true, rosterSize: 0, jobCount: 0 })).toBe('pending');
  });
  it('is empty signed out (empty roster)', () => {
    expect(activeStatus({ loading: false, rosterSize: 0, jobCount: 0 })).toBe('empty');
  });
  it('is empty with a roster but no jobs', () => {
    expect(activeStatus({ loading: false, rosterSize: 2, jobCount: 0 })).toBe('empty');
  });
  it('is populated with jobs', () => {
    expect(activeStatus({ loading: false, rosterSize: 2, jobCount: 3 })).toBe('populated');
  });
});

describe('corpStatus', () => {
  it('is empty (and silent) with no linked characters — no double prompt', () => {
    expect(
      corpStatus({ hasLinkedCharacters: false, eligibleCount: 0, loading: false, corpCount: 0 }),
    ).toBe('empty');
  });
  it('is populated when the scope-missing AccessGate applies (actionable CTA)', () => {
    expect(
      corpStatus({ hasLinkedCharacters: true, eligibleCount: 0, loading: true, corpCount: 0 }),
    ).toBe('populated');
  });
  it('is pending while eligible and loading', () => {
    expect(
      corpStatus({ hasLinkedCharacters: true, eligibleCount: 1, loading: true, corpCount: 0 }),
    ).toBe('pending');
  });
  it('is empty when settled with no corp rows', () => {
    expect(
      corpStatus({ hasLinkedCharacters: true, eligibleCount: 1, loading: false, corpCount: 0 }),
    ).toBe('empty');
  });
  it('is populated with corp rows (incl. needs_role rows — they render in-card)', () => {
    expect(
      corpStatus({ hasLinkedCharacters: true, eligibleCount: 1, loading: false, corpCount: 2 }),
    ).toBe('populated');
  });
});

describe('deriveSectionRender', () => {
  it('populated: meta shown, no hint, body shown', () => {
    expect(deriveSectionRender('populated', 'unused hint')).toEqual({ meta: true, hint: null, body: true });
  });

  it('pending: no meta, no hint, body still shown (optimistic)', () => {
    expect(deriveSectionRender('pending', 'h')).toEqual({ meta: false, hint: null, body: true });
  });

  it('empty with a hint: no meta, hint shown, no body', () => {
    expect(deriveSectionRender('empty', 'the hint')).toEqual({ meta: false, hint: 'the hint', body: false });
  });

  it('empty without a hint: silent (no meta/hint/body)', () => {
    expect(deriveSectionRender('empty', undefined)).toEqual({ meta: false, hint: null, body: false });
  });
});

describe('activeJobsHint', () => {
  it('empty roster prompts sign-in; a populated roster says no jobs', () => {
    expect(activeJobsHint(0)).toContain('Sign in');
    expect(activeJobsHint(3)).toBe('No industry jobs running.');
  });
});

describe('corpHint', () => {
  it('is silent without linked characters, else the sync line', () => {
    expect(corpHint(false)).toBeUndefined();
    expect(corpHint(true)).toContain('sync completes');
  });
});
