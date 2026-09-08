import { describe, expect, it } from 'vitest';
import inventory from './probe-registry.json';
const { journeys } = inventory;

describe('retained Playwright journey definitions', () => {
  it('loads every retained stage and requires executable behavior for each selected viewport', async () => {
    for (const journey of journeys) {
      const stages = await Promise.all(journey.probes.map(async (name) => {
        const loaded = await import(`../docs/ux-check/probes/${name}.mjs`);
        const definition = loaded.default;
        expect(definition.name, name).toBe(name);
        expect(typeof definition.route, name).toBe('string');
        expect(typeof definition.run, name).toBe('function');
        return definition;
      }));
      for (const viewport of journey.viewports) {
        expect(stages.some(stage => (stage.viewports ?? ['desktop', 'mobile']).includes(viewport)),
          `${journey.id}/${viewport} cannot select an empty journey`).toBe(true);
      }
    }
  });
});
