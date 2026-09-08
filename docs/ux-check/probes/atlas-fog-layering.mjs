import {
  convexRun,
  fogMapId,
  fogRoute,
  waitForEditableMap,
} from '../lib/authoring-helpers.mjs';

const ANCHOR_SYSTEM_ID = 30_000_142;


const waitForHalo = (page) =>
  page.waitForFunction(
    () =>
      document.querySelectorAll('[data-chain-node-derived]').length >= 10 &&
      document.querySelectorAll('[data-chain-node-fogged]').length >= 1,
    null,
    { timeout: 90_000 },
  );

const waitForFogPaint = (page) =>
  page.waitForFunction(
    () => {
      const canvas = document.querySelector('[data-map-fog]');
      return canvas !== null && canvas.width > 1 && canvas.height > 1;
    },
    null,
    { timeout: 30_000 },
  );

const sampleAlpha = (page, points) =>
  page.evaluate((worldPoints) => {
    const canvas = document.querySelector('[data-map-fog]');
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return null;
    const left = parseFloat(canvas.style.left);
    const top = parseFloat(canvas.style.top);
    const scale = canvas.width / parseFloat(canvas.style.width);
    return worldPoints.map(({ x, y }) => {
      const px = Math.min(canvas.width - 1, Math.max(0, Math.round((x - left) * scale)));
      const py = Math.min(canvas.height - 1, Math.max(0, Math.round((y - top) * scale)));
      return context.getImageData(px, py, 1, 1).data[3] / 255;
    });
  }, points);

const readNodeFrames = (page) =>
  page.evaluate(() => {
    const parse = (transform) => {
      const match = /translate\(([-\d.]+)px(?:,\s*([-\d.]+)px)?\)/.exec(transform || '');
      return match === null ? null : { x: Number(match[1]), y: Number(match[2] ?? 0) };
    };
    const frameOf = (wrapper) => {
      const at = parse(wrapper.style.transform);
      return at === null
        ? null
        : { x: at.x, y: at.y, width: wrapper.offsetWidth, height: wrapper.offsetHeight };
    };
    const wrapperOf = (inner) => inner?.closest('.react-flow__node') ?? null;
    const authored = [...document.querySelectorAll('[data-chain-node]')].find(
      (inner) => !inner.hasAttribute('data-chain-node-derived'),
    );
    const drawnHalo = document.querySelector(
      '[data-chain-node-derived]:not([data-chain-node-fogged])',
    );
    const fogged = document.querySelector('[data-chain-node-fogged]');
    return {
      authored: authored ? frameOf(wrapperOf(authored)) : null,
      authoredId: wrapperOf(authored)?.getAttribute('data-id') ?? null,
      drawnHalo: drawnHalo ? frameOf(wrapperOf(drawnHalo)) : null,
      fogged: fogged ? frameOf(wrapperOf(fogged)) : null,
      foggedId: wrapperOf(fogged)?.getAttribute('data-id') ?? null,
      foggedOpacity: fogged ? getComputedStyle(fogged).opacity : null,
      foggedPointerEvents: fogged
        ? (wrapperOf(fogged)?.style.pointerEvents ?? null)
        : null,
    };
  });

const center = (frame) => ({
  x: frame.x + frame.width / 2,
  y: frame.y + frame.height / 2,
});

export default {
  name: 'atlas-fog-layering',
  get route() { return fogRoute(); },
  viewports: ['desktop'],
  requiresAuth: true,
  reducedMotion: true,
  async run({ page, check }) {
    const mapId = fogMapId();
    if (!mapId) throw new Error(`BLOCKED: required run-owned fixture unavailable`);
    await waitForEditableMap(page);

    await convexRun('mapFixturePlace:placeSystemFixture', {
      mapId,
      systemId: ANCHOR_SYSTEM_ID,
    });
    await waitForHalo(page);
    await waitForFogPaint(page);
    await page.waitForTimeout(1500);

    const frames = await readNodeFrames(page);
    check(
      'authored, drawn-halo, and fogged nodes are all present',
      frames.authored !== null && frames.drawnHalo !== null && frames.fogged !== null,
    );
    if (frames.authored === null || frames.drawnHalo === null || frames.fogged === null) {
      return;
    }
    const authoredCenter = center(frames.authored);
    const drawnCenter = center(frames.drawnHalo);
    const foggedCenter = center(frames.fogged);
    const farPoint = { x: authoredCenter.x + 2200, y: authoredCenter.y + 1400 };
    const alphas = await sampleAlpha(page, [
      authoredCenter,
      drawnCenter,
      foggedCenter,
      farPoint,
    ]);
    check('the canvas backing store is readable', alphas !== null);
    const [authoredAlpha, drawnAlpha, foggedAlpha, farAlpha] = alphas;
    check(
      `the reveal opens over the authored node (alpha ${authoredAlpha.toFixed(2)})`,
      authoredAlpha < 0.15,
    );
    check(
      `the reveal opens over a drawn halo node (alpha ${drawnAlpha.toFixed(2)})`,
      drawnAlpha < 0.15,
    );
    check(
      `the cloud covers the fogged ring-3 node (alpha ${foggedAlpha.toFixed(2)})`,
      foggedAlpha > 0.6,
    );
    check(`the cloud covers empty space (alpha ${farAlpha.toFixed(2)})`, farAlpha > 0.6);

    const hit = await page.evaluate((point) => {
      const canvas = document.querySelector('[data-map-fog]');
      const rect = canvas.getBoundingClientRect();
      const left = parseFloat(canvas.style.left);
      const top = parseFloat(canvas.style.top);
      const scaleX = rect.width / parseFloat(canvas.style.width);
      const clientX = rect.left + (point.x - left) * scaleX;
      const clientY = rect.top + (point.y - top) * scaleX;
      const element = document.elementFromPoint(clientX, clientY);
      return {
        onPane: element?.closest('.react-flow__pane') !== null,
        isCanvas: element?.hasAttribute('data-map-fog') ?? false,
      };
    }, foggedCenter);
    check(
      'pointer hits pass through the cloud to the pane',
      hit.onPane === true && hit.isCanvas === false,
    );

  },
};
