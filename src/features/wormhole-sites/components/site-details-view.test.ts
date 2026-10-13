import { describe, expect, it } from 'vitest';
import { siteDetail, siteResource, siteWave } from '../__tests__/site-fixtures';
import { deriveSiteDetailsView } from './site-details-view';

describe('deriveSiteDetailsView', () => {
  it('flags wave-driven sites and gas/resource/wave presence', () => {
    expect(deriveSiteDetailsView(siteDetail({ siteType: 'combat' })).isWaveDriven).toBe(true);
    expect(deriveSiteDetailsView(siteDetail({ siteType: 'relic' })).isWaveDriven).toBe(true);
    expect(deriveSiteDetailsView(siteDetail({ siteType: 'data' })).isWaveDriven).toBe(true);
    expect(deriveSiteDetailsView(siteDetail({ siteType: 'ore' })).isWaveDriven).toBe(false);
    expect(deriveSiteDetailsView(siteDetail({ siteType: 'gas' })).isWaveDriven).toBe(false);

    const view = deriveSiteDetailsView(
      siteDetail({ siteType: 'gas', resources: [siteResource()], waves: [siteWave()] }),
    );
    expect(view.isGas).toBe(true);
    expect(view.hasResources).toBe(true);
    expect(view.hasWaves).toBe(true);
  });
});
