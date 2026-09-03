export async function installMotionMetrics(page) {
  await page.addInitScript(() => {
    const native = window.requestAnimationFrame.bind(window);
    const metrics = {
      rafCount: 0,
      frames: [],
      geometry: [],
      births: {},
    };
    window.__mapMotionMetrics = metrics;

    window.requestAnimationFrame = (callback) => {
      metrics.rafCount += 1;
      return native(callback);
    };

    metrics.loaf = [];
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) metrics.loaf.push(entry.duration);
      }).observe({ type: 'long-animation-frame', buffered: true });
    } catch {
    }

    const parseTranslate = (transform) => {
      const match = /translate\(([-\d.]+)px(?:,\s*([-\d.]+)px)?\)/.exec(
        transform || '',
      );
      return match === null
        ? null
        : { x: Number(match[1]), y: Number(match[2] ?? 0) };
    };

    const witness = (node) => {
      const id = node.getAttribute('data-id');
      if (!id || metrics.births[id] !== undefined) return;
      const record = { insert: parseTranslate(node.style.transform), frames: [] };
      metrics.births[id] = record;
      const start = performance.now();
      const sample = (timestamp) => {
        const inner = node.querySelector('[data-chain-node]');
        const style = inner === null ? null : getComputedStyle(inner);
        const position = parseTranslate(node.style.transform);
        record.frames.push({
          t: timestamp - start,
          x: position === null ? null : position.x,
          y: position === null ? null : position.y,
          scale: style === null ? null : style.scale,
          opacity: style === null ? null : Number(style.opacity),
        });
        if (timestamp - start < 1500) native(sample);
      };
      native(sample);
    };
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const added of mutation.addedNodes) {
          if (!(added instanceof HTMLElement)) continue;
          if (added.classList.contains('react-flow__node')) witness(added);
          for (const nested of added.querySelectorAll('.react-flow__node')) {
            witness(nested);
          }
        }
      }
    });
    const observe = () =>
      observer.observe(document.documentElement, { childList: true, subtree: true });
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', observe);
    } else {
      observe();
    }

    let capturingFrames = false;
    window.__mapMotionStartFrames = () => {
      metrics.frames = [];
      capturingFrames = true;
      const loop = (timestamp) => {
        if (!capturingFrames) return;
        metrics.frames.push(timestamp);
        native(loop);
      };
      native(loop);
    };
    window.__mapMotionStopFrames = () => {
      capturingFrames = false;
    };

    let samplingGeometry = false;
    window.__mapMotionStartGeometry = () => {
      metrics.geometry = [];
      samplingGeometry = true;
      const loop = (timestamp) => {
        if (!samplingGeometry) return;
        const nodes = [...document.querySelectorAll('.react-flow__node')].map(
          (node) => {
            const position = parseTranslate(node.style.transform);
            return {
              id: node.getAttribute('data-id'),
              x: position === null ? null : position.x,
              y: position === null ? null : position.y,
              width: node.offsetWidth,
              height: node.offsetHeight,
            };
          },
        );
        const edges = [...document.querySelectorAll('.react-flow__edge')].map(
          (edge) => {
            const path = edge.querySelector('.react-flow__edge-path');
            const match =
              path === null
                ? null
                : /M ([-\d.eE+]+),([-\d.eE+]+) L ([-\d.eE+]+),([-\d.eE+]+)/.exec(
                    path.getAttribute('d') || '',
                  );
            return {
              id: edge.getAttribute('data-id'),
              x1: match === null ? null : Number(match[1]),
              y1: match === null ? null : Number(match[2]),
              x2: match === null ? null : Number(match[3]),
              y2: match === null ? null : Number(match[4]),
            };
          },
        );
        metrics.geometry.push({ t: timestamp, nodes, edges });
        native(loop);
      };
      native(loop);
    };
    window.__mapMotionStopGeometry = () => {
      samplingGeometry = false;
    };
  });
}

export function startFrameCapture(page) {
  return page.evaluate(() => window.__mapMotionStartFrames());
}

export async function stopFrameCapture(page) {
  const timestamps = await page.evaluate(() => {
    window.__mapMotionStopFrames();
    return window.__mapMotionMetrics.frames;
  });
  return timestamps.slice(1).map((timestamp, index) => timestamp - timestamps[index]);
}

export function startGeometrySample(page) {
  return page.evaluate(() => window.__mapMotionStartGeometry());
}

export function stopGeometrySample(page) {
  return page.evaluate(() => {
    window.__mapMotionStopGeometry();
    return window.__mapMotionMetrics.geometry;
  });
}

export function readRafCount(page) {
  return page.evaluate(() => window.__mapMotionMetrics.rafCount);
}

export function readBirths(page) {
  return page.evaluate(() => window.__mapMotionMetrics.births);
}

export function readLoaf(page) {
  return page.evaluate(() => window.__mapMotionMetrics.loaf);
}

export function frameStats(deltas) {
  if (deltas.length === 0) return { count: 0, p50: null, p95: null };
  const sorted = [...deltas].sort((a, b) => a - b);
  const at = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
  return { count: sorted.length, p50: at(0.5), p95: at(0.95) };
}
