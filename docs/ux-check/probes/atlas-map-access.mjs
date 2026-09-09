import { assertPrincipal, assertMapRole } from '../../../e2e/route-contracts.cjs';
import { expect } from '@playwright/test';
import { atlasMain, atlasVisible, authoringMapId, authoringRoute, waitForEditableMap } from '../lib/authoring-helpers.mjs';

export default {
  name: 'atlas-map-access', get route() { return authoringRoute(); },
  viewports: ['desktop'], requiresAuth: true,
  async run({ page, createContext, fixtures, baseUrl, diagnostics }) {
    const mapId = authoringMapId();
    if (!mapId) throw new Error('BLOCKED: run-owned map missing');
    for (const [role, required] of [['owner', 'admin'], ['editor', 'editor'], ['viewer', 'viewer']]) {
      assertMapRole({ actual: await fixtures.readRole(role, mapId), required });
    }
    expect(await fixtures.readRole('unauthorized', mapId)).toBeNull();
    await waitForEditableMap(page);
    const editor = await createContext({ role: 'editor' });
    const viewer = await createContext({ role: 'viewer' });
    const denied = await createContext({ role: 'unauthorized' });
    const clients = [
      { page, principal: fixtures.principals.owner, required: 'admin' },
      { page: editor.page, principal: fixtures.principals.editor, required: 'editor' },
      { page: viewer.page, principal: fixtures.principals.viewer, required: 'viewer' },
      { page: denied.page, principal: fixtures.principals.unauthorized, required: null },
    ];
    const labels = { 'Your access: Admin': 'admin', 'Your access: Write': 'editor', 'Your access: Read-only': 'viewer' };
    for (const client of clients) {
      await client.page.goto(new URL('/atlas', baseUrl).href);
      const session = await client.page.request.get(new URL('/api/auth/get-session', baseUrl).href);
      expect(session.ok()).toBe(true);
      assertPrincipal({ session: await session.json(), expected: client.principal });
      const card = atlasMain(client.page).locator(`[data-map-catalogue-card="${mapId}"]`);
      if (client.required === null) await expect(card).toHaveCount(0);
      else {
        const role = card.getByText(/^Your access:/);
        await expect(role).toBeVisible();
        assertMapRole({ actual: labels[(await role.innerText()).trim()], required: client.required });
      }
      await client.page.goto(new URL(authoringRoute(), baseUrl).href);
    }
    await waitForEditableMap(editor.page);
    await expect(atlasVisible(viewer.page, '[data-map-canvas]')).toBeVisible();
    await expect(atlasVisible(viewer.page, '[data-map-can-edit="true"]')).toHaveCount(0);
    await expect(atlasVisible(denied.page, '[data-chain-no-access]')).toBeVisible();
    await atlasMain(page).locator('[data-map-switcher-trigger]').click();
    await atlasVisible(page, `[data-map-switcher-manage="${mapId}"]`).click();
    const dialog = page.getByRole('dialog', { name: /^Manage / });
    await expect(dialog).toBeVisible();
    const grant = dialog.locator(`[data-map-access-principal="character:${fixtures.principals.editor.characterId}"]`);
    await expect(grant).toBeVisible();
    await grant.getByRole('button', { name: 'Revoke' }).click();
    const confirm = page.getByRole('dialog', { name: 'Revoke map access?' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(grant).toBeVisible();
    await grant.getByRole('button', { name: 'Revoke' }).click();
    await confirm.getByRole('button', { name: /Revoke/ }).click();
    await expect(grant).toHaveCount(0);
    expect(await fixtures.readRole('editor', mapId)).toBeNull();
    await expect(atlasVisible(editor.page, '[data-chain-no-access]')).toBeVisible();
    await expect(atlasVisible(editor.page, '[data-map-can-edit="true"]')).toHaveCount(0);
    await expect(atlasVisible(viewer.page, '[data-map-canvas]')).toBeVisible();
    await expect(atlasVisible(page, '[data-map-can-edit="true"]')).toBeVisible();
    diagnostics.expectHttp({ pathname: '/api/maps/access', method: 'POST', status: 403 });
    const rejected = await editor.page.evaluate(async ({ mapId, characterId }) => {
      const response = await fetch('/api/maps/access', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operation: 'upsert', mapId, grant: { ownerType: 'character', ownerId: characterId, role: 'admin' } }),
      });
      return { status: response.status, body: await response.json() };
    }, { mapId, characterId: fixtures.principals.editor.characterId });
    expect(rejected.status).toBe(403);
    expect(rejected.body).toMatchObject({ code: 'map_admin_required' });
    await expect(atlasVisible(editor.page, '[data-map-can-edit="true"]')).toHaveCount(0);
  },
};
