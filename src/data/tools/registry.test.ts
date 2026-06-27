import { describe, expect, it } from 'vitest';
import { isToolActive, TOOLS, visibleNavTools } from './registry';

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
