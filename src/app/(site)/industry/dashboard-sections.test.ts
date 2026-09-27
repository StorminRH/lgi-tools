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
  settledSectionOrder,
} from './dashboard-sections';

function status(
  overrides: Partial<Record<DashboardSectionId, SectionStatus>> = {},
): Record<DashboardSectionId, SectionStatus> {
  return { recents: 'populated', saved: 'populated', active: 'populated', corp: 'populated', ...overrides };
}

describe('settledSectionOrder', () => {
  it('holds while any section is pending, so a painted grid is not reshuffled', () => {
    expect(settledSectionOrder(status({ corp: 'pending', saved: 'empty' }))).toBeNull();
  });

  it('sorts once every section has settled', () => {
    expect(settledSectionOrder(status({ saved: 'empty' }))).toEqual([
      'recents',
      'active',
      'corp',
      'saved',
    ]);
  });
});

describe('orderSections', () => {

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

describe('section status + render', () => {
  it('classifies recents, saved, active, and corp from the live loading states', () => {
    expect(recentsStatus(null)).toBe('pending');
    expect(recentsStatus([])).toBe('empty');
    expect(recentsStatus([{ typeId: 691 }])).toBe('populated');

    expect(savedStatus(null, false)).toBe('pending');
    expect(savedStatus(null, true)).toBe('empty');
    expect(savedStatus([], false)).toBe('empty');
    expect(savedStatus([{ id: 'a' }], false)).toBe('populated');

    expect(activeStatus({ loading: true, failed: false, rosterSize: 0, jobCount: 0 })).toBe('pending');
    expect(activeStatus({ loading: false, failed: false, rosterSize: 0, jobCount: 0 })).toBe('empty');
    expect(activeStatus({ loading: false, failed: false, rosterSize: 2, jobCount: 0 })).toBe('empty');
    expect(activeStatus({ loading: false, failed: false, rosterSize: 2, jobCount: 3 })).toBe('populated');

    expect(
      corpStatus({ hasLinkedCharacters: false, eligibleCount: 0, loading: false, failed: false, corpCount: 0 }),
    ).toBe('empty');
    expect(
      corpStatus({ hasLinkedCharacters: true, eligibleCount: 0, loading: true, failed: false, corpCount: 0 }),
    ).toBe('populated');
    expect(
      corpStatus({ hasLinkedCharacters: true, eligibleCount: 1, loading: true, failed: false, corpCount: 0 }),
    ).toBe('pending');
    expect(
      corpStatus({ hasLinkedCharacters: true, eligibleCount: 1, loading: false, failed: false, corpCount: 0 }),
    ).toBe('empty');
    expect(
      corpStatus({ hasLinkedCharacters: true, eligibleCount: 1, loading: false, failed: false, corpCount: 2 }),
    ).toBe('populated');
  });

  it('shows meta on populated, keeps the body while pending, and swaps in a hint when empty', () => {
    expect(deriveSectionRender('populated', 'unused hint')).toEqual({
      meta: true,
      hint: null,
      body: true,
    });
    expect(deriveSectionRender('pending', 'h')).toEqual({ meta: false, hint: null, body: true });
    expect(deriveSectionRender('empty', 'the hint')).toEqual({
      meta: false,
      hint: 'the hint',
      body: false,
    });
    expect(deriveSectionRender('empty', undefined)).toEqual({
      meta: false,
      hint: null,
      body: false,
    });
  });
});

describe('failed live feeds', () => {
  it('settle active and corp as empty so the grid can sort once', () => {
    expect(activeStatus({ loading: false, failed: true, rosterSize: 0, jobCount: 0 })).toBe('empty');
    expect(
      corpStatus({ hasLinkedCharacters: true, eligibleCount: 1, loading: false, failed: true, corpCount: 0 }),
    ).toBe('empty');
    expect(
      settledSectionOrder(status({ active: 'empty', corp: 'empty' })),
    ).toEqual(['recents', 'saved', 'active', 'corp']);
  });

  it('keeps anonymous and no-access corp states as they were', () => {
    expect(
      corpStatus({ hasLinkedCharacters: false, eligibleCount: 0, loading: false, failed: true, corpCount: 0 }),
    ).toBe('empty');
    expect(
      corpStatus({ hasLinkedCharacters: true, eligibleCount: 0, loading: false, failed: true, corpCount: 0 }),
    ).toBe('populated');
  });

  it('swap the empty hint for the failure line', () => {
    expect(activeJobsHint(0, true)).toBe('Couldn’t load your industry jobs — reload to try again.');
    expect(corpHint(true, true)).toBe(
      'Couldn’t load your corporation’s industry jobs — reload to try again.',
    );
    expect(corpHint(false, true)).toBeUndefined();
  });
});

describe('activeJobsHint', () => {
  it('empty roster prompts sign-in; a populated roster says no jobs', () => {
    expect(activeJobsHint(0, false)).toContain('Sign in');
    expect(activeJobsHint(3, false)).toBe('No industry jobs running.');
  });
});

describe('corpHint', () => {
  it('is silent without linked characters, else the sync line', () => {
    expect(corpHint(false, false)).toBeUndefined();
    expect(corpHint(true, false)).toContain('sync completes');
  });
});
