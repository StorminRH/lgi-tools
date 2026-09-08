import { expect } from '@playwright/test';
import { atlasWindowRoute, exerciseWindowInput, waitForWindowMap } from '../lib/window-helpers.mjs';
import { openFirstEdgeEditor } from '../lib/authoring-helpers.mjs';

export default {
  name: 'atlas-window-isolation', get route() { return atlasWindowRoute(); },
  viewports: ['desktop'], requiresAuth: true,
  async run({ page }) {
    await waitForWindowMap(page);
    await openFirstEdgeEditor(page);
    const result = await exerciseWindowInput(page, 'signature-editor');
    expect(result.value).toBe('B274');
    expect(result.after, 'typing and wheel in the real editor leave the map camera unchanged').toBe(result.before);
  },
};
