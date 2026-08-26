import { describe, expect, it } from 'vitest';
import { deriveNavToolItem, isToolActive, TOOLS, visibleNavTools } from './registry';

const sites = TOOLS.find((t) => t.label === 'Wormhole Sites')!;

describe('nav tools', () => {
  it('hides unfinished tools and resolves active, soon, and disabled items', () => {
    const labels = visibleNavTools().map((t) => t.label);
    expect(labels).toContain('Wormhole Sites');
    expect(labels).toContain('Industry Planner');
    expect(labels).not.toContain('Atlas');
    expect(labels).not.toContain('Skill Queues');
    expect(labels).not.toContain('Industry Jobs');

    expect(isToolActive(sites, '/sites')).toBe(true);
    expect(isToolActive(sites, '/sites/30002')).toBe(true);
    expect(isToolActive(sites, '/industry')).toBe(false);
    expect(isToolActive(sites, null)).toBe(false);
    expect(isToolActive({ label: 'X', abbr: 'X', href: '/x' }, '/x')).toBe(false);

    expect(deriveNavToolItem(sites, '/sites/30002')).toEqual({
      kind: 'link',
      label: 'Wormhole Sites',
      href: '/sites',
      active: true,
      title: 'Wormhole Sites',
    });
    expect(deriveNavToolItem(sites, '/industry')).toEqual({
      kind: 'link',
      label: 'Wormhole Sites',
      href: '/sites',
      active: false,
      title: 'Wormhole Sites',
    });
    expect(deriveNavToolItem({ label: 'Soon', abbr: 'SN', href: null }, '/x')).toEqual({
      kind: 'soon',
      label: 'Soon',
      title: 'Soon — coming soon',
    });
    expect(deriveNavToolItem({ label: 'Held', abbr: 'HD', href: '/held', navDisabled: true }, '/x')).toEqual({
      kind: 'soon',
      label: 'Held',
      title: 'Held',
    });
  });
});
