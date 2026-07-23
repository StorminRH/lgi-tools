import { describe, expect, it } from 'vitest';
import { deriveRoleToggle } from './role-toggle-view';

describe('deriveRoleToggle', () => {
  it('flips an ADMIN toward USER with a revoke label', () => {
    const view = deriveRoleToggle('ADMIN', 'user-1', 'viewer-1');
    expect(view.nextRole).toBe('USER');
    expect(view.label).toBe('Revoke ADMIN');
  });

  it('flips a USER toward ADMIN with a grant label', () => {
    const view = deriveRoleToggle('USER', 'user-1', 'viewer-1');
    expect(view.nextRole).toBe('ADMIN');
    expect(view.label).toBe('Grant ADMIN');
  });

  it('marks the row as self when the target is the viewer', () => {
    expect(deriveRoleToggle('USER', 'same-id', 'same-id').isSelf).toBe(true);
  });

  it('marks the row as not self when the target differs from the viewer', () => {
    expect(deriveRoleToggle('USER', 'target-id', 'viewer-id').isSelf).toBe(false);
  });
});
