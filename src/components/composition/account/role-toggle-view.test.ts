import { describe, expect, it } from 'vitest';
import { deriveRoleToggle } from './role-toggle-view';

describe('deriveRoleToggle', () => {
  it('flips an ADMIN toward USER with a revoke label', () => {
    const view = deriveRoleToggle('ADMIN', 'user-1', 'viewer-1');
    expect(view.nextRole).toBe('USER');
    expect(view.label).toBe('Revoke ADMIN');
    expect(view.isSelf).toBe(false);
  });

  it('flips a USER toward ADMIN with a grant label, and marks self rows', () => {
    const other = deriveRoleToggle('USER', 'user-1', 'viewer-1');
    expect(other.nextRole).toBe('ADMIN');
    expect(other.label).toBe('Grant ADMIN');
    expect(other.isSelf).toBe(false);
    expect(deriveRoleToggle('USER', 'same-id', 'same-id').isSelf).toBe(true);
  });
});
