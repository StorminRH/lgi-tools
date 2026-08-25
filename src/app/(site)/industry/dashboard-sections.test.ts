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

describe('section status + render', () => {
  it('classifies recents, saved, active, and corp from the live loading states', () => {
    expect(recentsStatus(null)).toBe('pending');
    expect(recentsStatus([])).toBe('empty');
    expect(recentsStatus([{ typeId: 691 }])).toBe('populated');

    expect(savedStatus(null, false)).toBe('pending');
    expect(savedStatus(null, true)).toBe('empty');
    expect(savedStatus([], false)).toBe('empty');
    expect(savedStatus([{ id: 'a' }], false)).toBe('populated');

    expect(activeStatus({ loading: true, rosterSize: 0, jobCount: 0 })).toBe('pending');
    expect(activeStatus({ loading: false, rosterSize: 0, jobCount: 0 })).toBe('empty');
    expect(activeStatus({ loading: false, rosterSize: 2, jobCount: 0 })).toBe('empty');
    expect(activeStatus({ loading: false, rosterSize: 2, jobCount: 3 })).toBe('populated');

    expect(
      corpStatus({ hasLinkedCharacters: false, eligibleCount: 0, loading: false, corpCount: 0 }),
    ).toBe('empty');
    expect(
      corpStatus({ hasLinkedCharacters: true, eligibleCount: 0, loading: true, corpCount: 0 }),
    ).toBe('populated');
    expect(
      corpStatus({ hasLinkedCharacters: true, eligibleCount: 1, loading: true, corpCount: 0 }),
    ).toBe('pending');
    expect(
      corpStatus({ hasLinkedCharacters: true, eligibleCount: 1, loading: false, corpCount: 0 }),
    ).toBe('empty');
    expect(
      corpStatus({ hasLinkedCharacters: true, eligibleCount: 1, loading: false, corpCount: 2 }),
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
