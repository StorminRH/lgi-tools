import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('toast actionButton styling', () => {
  it('owns the unstyled actionButton classNames slot for Undo toasts', () => {
    const source = readFileSync('src/components/ui/toast.tsx', 'utf8');
    expect(source).toContain('actionButton:');
    expect(source).toContain('ml-auto');
  });
});
