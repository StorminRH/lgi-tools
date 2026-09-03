import {
  convexRun,
  fogMapId,
  fogRoute,
  waitForEditableMap,
} from '../lib/authoring-helpers.mjs';
import {
  installMotionMetrics,
  readRafCount,
} from '../lib/motion-metrics.mjs';

const ANCHOR_SYSTEM_ID = 30_000_142;

const FOG_EDGE_CUT_FRACTION = 0.55;

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

const readFogStructure = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('[data-map-fog]');
    if (canvas === null) return null;
    const style = getComputedStyle(canvas);
    const node = document.querySelector('.react-flow__node');
    return {
      inPortal:
        canvas.parentElement?.classList.contains('react-flow__viewport-portal') ??
        false,
      position: style.position,
      zIndex: style.zIndex,
      pointerEvents: style.pointerEvents,
      nodeZIndex: node === null ? null : getComputedStyle(node).zIndex,
    };
  });

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

const readFogboundEdge = (page, foggedId) =>
  page.evaluate((fogged) => {
    const parse = (transform) => {
      const match = /translate\(([-\d.]+)px(?:,\s*([-\d.]+)px)?\)/.exec(transform || '');
      return match === null ? null : { x: Number(match[1]), y: Number(match[2] ?? 0) };
    };
    const frameOf = (id) => {
      const wrapper = document.querySelector(`.react-flow__node[data-id="${id}"]`);
      const at = wrapper === null ? null : parse(wrapper.style.transform);
      return at === null
        ? null
        : { x: at.x, y: at.y, width: wrapper.offsetWidth, height: wrapper.offsetHeight };
    };
    const edge = [...document.querySelectorAll('.react-flow__edge')].find((el) => {
      const id = el.getAttribute('data-id') ?? '';
      return (
        id.startsWith('halo:') &&
        (id.endsWith(`>${fogged}`) || id.includes(`:${fogged}>`))
      );
    });
    const path = edge?.querySelector('.react-flow__edge-path');
    const match =
      path === null || path === undefined
        ? null
        : /M ([-\d.eE+]+),([-\d.eE+]+) L ([-\d.eE+]+),([-\d.eE+]+)/.exec(path.getAttribute('d') || '');
    if (match === null) return null;
    const id = edge.getAttribute('data-id');
    const [a, b] = id.slice('halo:'.length).split('>');
    const centerOf = (frame) => ({
      x: frame.x + frame.width / 2,
      y: frame.y + frame.height / 2,
    });
    const clip = (frame, dx, dy) => {
      const tx = dx === 0 ? Infinity : frame.width / 2 / Math.abs(dx);
      const ty = dy === 0 ? Infinity : frame.height / 2 / Math.abs(dy);
      return Math.min(tx, ty);
    };
    const fromFrame = frameOf(a);
    const toFrame = frameOf(b);
    if (fromFrame === null || toFrame === null) return null;
    const from = centerOf(fromFrame);
    const to = centerOf(toFrame);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const start = clip(fromFrame, dx, dy);
    const end = 1 - clip(toFrame, dx, dy);
    const fullLength = Math.hypot(dx, dy) * Math.max(0, end - start);
    const stubLength = Math.hypot(
      Number(match[3]) - Number(match[1]),
      Number(match[4]) - Number(match[2]),
    );
    return { id, fullLength, stubLength };
  }, foggedId);

export default {
  name: 'atlas-fog-layering',
  route: fogRoute(),
  viewports: ['desktop'],
  requiresAuth: true,
  reducedMotion: true,
  settle: 2500,
  async setup({ page }) {
    await installMotionMetrics(page);
  },
  async run({ page, check }) {
    const mapId = fogMapId();
    if (!mapId) {
      check('UX_FOG_MAP_ID is set for a dedicated empty map', false);
      return;
    }
    await waitForEditableMap(page);

    await convexRun('mapFixturePlace:placeSystemFixture', {
      mapId,
      systemId: ANCHOR_SYSTEM_ID,
    });
    await waitForHalo(page);
    await waitForFogPaint(page);
    await page.waitForTimeout(1500);

    const structure = await readFogStructure(page);
    check('the fog canvas is the direct ViewportPortal child', structure?.inPortal === true);
    check(
      `the canvas carries the negative z-index below the node layer (${structure?.zIndex} vs node ${structure?.nodeZIndex})`,
      structure?.position === 'absolute' &&
        structure?.zIndex === '-1' &&
        Number(structure?.nodeZIndex ?? 0) >= 0,
    );
    check(
      'the canvas is pointer-inert (inherited none)',
      structure?.pointerEvents === 'none',
    );

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
    if (alphas === null) return;
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

    const corridor = await sampleAlpha(page, [
      {
        x: (authoredCenter.x + drawnCenter.x) / 2,
        y: (authoredCenter.y + drawnCenter.y) / 2,
      },
    ]);
    check(
      `the corridor reveal opens along a fully-drawn edge (alpha ${corridor?.[0]?.toFixed(2)})`,
      corridor !== null && corridor[0] < 0.35,
    );

    check(
      `the fogged node renders invisible (opacity ${frames.foggedOpacity})`,
      frames.foggedOpacity === '0',
    );
    check(
      'the fogged node is inert (node-level pointer-events none)',
      frames.foggedPointerEvents === 'none',
    );

    const fogbound = await readFogboundEdge(page, frames.foggedId);
    check('a fogged-endpoint halo edge is rendered', fogbound !== null);
    if (fogbound !== null) {
      const expected = fogbound.fullLength * FOG_EDGE_CUT_FRACTION;
      check(
        `the line draws only its stub (${fogbound.stubLength.toFixed(1)}px of ${fogbound.fullLength.toFixed(1)}px)`,
        Math.abs(fogbound.stubLength - expected) <= 2,
      );
    }

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

    await page.waitForTimeout(1200);
    const idleStart = await readRafCount(page);
    await page.waitForTimeout(2500);
    const idleEnd = await readRafCount(page);
    check(
      `the settled fog registers zero animation frames across 2.5s (${idleEnd - idleStart} registrations)`,
      idleEnd === idleStart,
    );
  },
};
