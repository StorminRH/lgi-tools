import { expect } from '@playwright/test';
import { installMemoryClipboard } from '../lib/planner-fixture.mjs';

const exportAtMe10 = 'Isogen\t450\nMexallon\t2250\nPyerite\t5400\nTritanium\t28800';
const exportAtMe0 = 'Isogen\t500\nMexallon\t2500\nPyerite\t6000\nTritanium\t32000';

async function exportedMaterials(page) {
  await page.getByRole('button', { name: 'Multibuy export' }).first().click();
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
  const result = await page.evaluate(() => window.__acceptanceClipboard);
  await page.keyboard.press('Escape');
  return result;
}

export default {
  name: 'me-planner', route: '/industry/691', viewports: ['desktop'], requiresAuth: true,
  async setup({ page }) {
    await installMemoryClipboard(page);
    await page.route('**/api/industry/owned-blueprints', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ blueprints: [{ blueprintTypeId: 691, me: 10, te: 20, ownerType: 'character', ownerName: 'Test Pilot', locationName: 'Jita IV-4', locationFlag: 'Hangar' }] }) }));
  },
  async run({ page }) {
    const main = page.getByRole('textbox', { name: 'main blueprint material efficiency' }).first();
    await expect(main).toHaveValue('10');
    expect(await exportedMaterials(page)).toBe(exportAtMe10);
    const decrement = page.getByRole('button', { name: 'Decrease main blueprint material efficiency' });
    for (let step = 0; step < 10; step++) await decrement.click();
    await expect(main).toHaveValue('0');
    expect(await exportedMaterials(page)).toBe(exportAtMe0);
  },
};
