import { describe, expect, it } from 'vitest';
import { deriveNavToolItem, isToolActive, TOOLS, visibleNavTools } from './registry';

const sites = TOOLS.find((t) => t.label === 'Wormhole Sites')!;

describe('visibleNavTools', () => {
  it('drops nav-hidden tools', () => {
    const labels = visibleNavTools().map((t) => t.label);
    expect(labels).toContain('Wormhole Sites');
    expect(labels).toContain('Industry Planner');
    expect(labels).not.toContain('Skill Queues'); // navHidden
    expect(labels).not.toContain('Industry Jobs'); // navHidden
  });

  it('returns only tools the registry marks visible', () => {
    expect(visibleNavTools().every((t) => !t.navHidden)).toBe(true);
  });
});

describe('isToolActive', () => {
  it('is active on the exact prefix and its sub-routes', () => {
    expect(isToolActive(sites, '/sites')).toBe(true);
    expect(isToolActive(sites, '/sites/30002')).toBe(true);
  });

  it('is inactive on a different route', () => {
    expect(isToolActive(sites, '/industry')).toBe(false);
  });

  it('is inactive when the pathname is null (static shell)', () => {
    expect(isToolActive(sites, null)).toBe(false);
  });

  it('is inactive for a tool with no matchPrefix', () => {
    expect(isToolActive({ label: 'X', abbr: 'X', href: '/x' }, '/x')).toBe(false);
  });
});

describe('deriveNavToolItem', () => {
  it('renders a live tool as a link with its active state resolved', () => {
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
  });

  it('renders a null-href tool as an inert "coming soon" span', () => {
    expect(deriveNavToolItem({ label: 'Soon', abbr: 'SN', href: null }, '/x')).toEqual({
      kind: 'soon',
      label: 'Soon',
      title: 'Soon — coming soon',
    });
  });

  it('renders a nav-disabled tool as a plain inert span (its own label as title)', () => {
    expect(deriveNavToolItem({ label: 'Held', abbr: 'HD', href: '/held', navDisabled: true }, '/x')).toEqual({
      kind: 'soon',
      label: 'Held',
      title: 'Held',
    });
  });
});
