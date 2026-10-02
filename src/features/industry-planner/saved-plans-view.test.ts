import { describe, expect, it } from 'vitest';
import type { SavedPlanRow } from './api-contract';
import {
  echoOutcome,
  savedPlanRowLabels,
  savedPlansViewState,
  saveErrorCopy,
  templatesEmptyLine,
} from './saved-plans-view';

function plan(id: string, favorite = false): SavedPlanRow {
  return {
    id,
    name: `Plan ${id}`,
    favorite,
    blueprintTypeId: 691,
    productTypeId: 587,
    productName: 'Rifter',
    snapshot: { v: 1, blueprintTypeId: 691 },
    updatedAt: '2026-07-01T00:00:00Z',
  };
}

describe('echoOutcome', () => {
  it('returns the echoed list on success', () => {
    const plans = [plan('a')];
    expect(echoOutcome({ ok: true, data: { plans } }, () => 'nope')).toEqual({ plans });
  });

  it('maps a failure status through the endpoint-specific copy', () => {
    expect(
      echoOutcome({ ok: false, status: 401 }, (status) => (status === 401 ? 'sign in' : 'other')),
    ).toEqual({ error: 'sign in' });
  });

  it('treats a network failure (null) as status 0', () => {
    expect(echoOutcome(null, (status) => `status ${status}`)).toEqual({ error: 'status 0' });
    expect(
      echoOutcome(
        { ok: false, kind: 'network', aborted: false, cause: new Error('offline') },
        (status) => `status ${status}`,
      ),
    ).toEqual({ error: 'status 0' });
  });
});

describe('savedPlansViewState', () => {
  it('is blank while the first list read is still in flight', () => {
    expect(savedPlansViewState(null, null, false)).toEqual({ kind: 'blank' });
    expect(savedPlansViewState([], null, false)).toEqual({ kind: 'blank' });
  });

  it('is empty (with a cause line) for failed / signed-out / settled-empty lists', () => {
    // A failed read wins over a signed-out viewer.
    expect(savedPlansViewState([], [], true)).toEqual({
      kind: 'empty',
      line: "Couldn't load your saved templates",
    });
    expect(savedPlansViewState([], [], false)).toEqual({
      kind: 'empty',
      line: 'Sign in to save build templates',
    });
    expect(savedPlansViewState([], [{ id: 'c' }], false)).toEqual({
      kind: 'empty',
      line: 'No saved templates yet — save one from the planner',
    });
  });

  it('is a list when there are plans', () => {
    expect(savedPlansViewState([plan('1')], [{ id: 'c' }], false)).toEqual({ kind: 'list' });
  });
});

describe('templatesEmptyLine', () => {
  it('reads the cause: failed, signed out, loading, or genuinely empty', () => {
    expect(templatesEmptyLine({ listFailed: true, buildCharacters: [{}], plans: [] })).toBe(
      "Couldn't load your saved templates",
    );
    expect(templatesEmptyLine({ listFailed: false, buildCharacters: [], plans: [] })).toBe(
      'Sign in to save build templates',
    );
    expect(templatesEmptyLine({ listFailed: false, buildCharacters: [{}], plans: null })).toBe('Loading…');
    expect(templatesEmptyLine({ listFailed: false, buildCharacters: [{}], plans: [] })).toBe(
      'No saved templates yet',
    );
  });
});

describe('saveErrorCopy', () => {
  it('names the anonymous and quota cases, else a generic failure', () => {
    expect(saveErrorCopy(401)).toBe('Sign in to save build templates');
    expect(saveErrorCopy(409)).toBe('Template limit reached — delete one first');
    expect(saveErrorCopy(0)).toBe("Couldn't save the template");
    expect(saveErrorCopy(500)).toBe("Couldn't save the template");
  });
});

describe('savedPlanRowLabels', () => {
  it('builds favorite/delete labels, glyphs, and state classes', () => {
    const fav = savedPlanRowLabels({ name: 'Rifter', favorite: true }, false);
    expect(fav.favoriteAria).toBe('Unfavorite Rifter');
    expect(fav.favoriteGlyph).toBe('★');
    expect(fav.favoriteClass).toContain('text-isk');
    expect(fav.deleteAria).toBe('Delete Rifter');
    expect(fav.deleteClass).toBe('');
  });

  it('reflects the un-favorited + armed-delete states', () => {
    const armed = savedPlanRowLabels({ name: 'Rifter', favorite: false }, true);
    expect(armed.favoriteAria).toBe('Favorite Rifter');
    expect(armed.favoriteGlyph).toBe('☆');
    expect(armed.deleteAria).toBe('Confirm deleting Rifter');
    expect(armed.deleteClass).toContain('text-tone-red');
  });
});
