import { afterEach, expect, test, vi } from 'vitest';
import { acquireWormholePainter } from './painter';
import { discBodyAppearance } from './palette';

const leases: ReturnType<typeof acquireWormholePainter>[] = [];
afterEach(() => {
  leases.splice(0).forEach((lease) => lease.release());
  vi.unstubAllGlobals();
});

function acquire() {
  const lease = acquireWormholePainter();
  leases.push(lease);
  return lease;
}

function graphics(failure?: 'context' | 'shader' | 'link' | 'buffer') {
  const program = { linked: false };
  const buffer = {};
  const loseContext = vi.fn();
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, TRIANGLES: 8,
    createShader: vi.fn((kind: number) => ({ kind })),
    shaderSource: vi.fn(), compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => failure !== 'shader'), deleteShader: vi.fn(),
    createProgram: vi.fn(() => program), attachShader: vi.fn(),
    linkProgram: vi.fn(() => { program.linked = failure !== 'link'; }),
    getProgramParameter: vi.fn(() => program.linked), deleteProgram: vi.fn(),
    createBuffer: vi.fn(() => failure === 'buffer' ? null : buffer), deleteBuffer: vi.fn(),
    useProgram: vi.fn(), bindBuffer: vi.fn(), bufferData: vi.fn(),
    getAttribLocation: vi.fn(() => 0), enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(), viewport: vi.fn(),
    getUniformLocation: vi.fn((_: unknown, name: string) => ({ name })),
    uniform1f: vi.fn(), uniform3f: vi.fn(), drawArrays: vi.fn(),
    isContextLost: vi.fn(() => false),
    getExtension: vi.fn(() => ({ loseContext })),
  };
  const source = {
    width: 0, height: 0,
    getContext: vi.fn(() => failure === 'context' ? null : gl),
  };
  const createElement = vi.fn(() => source);
  vi.stubGlobal('document', { createElement });
  const target = {
    canvas: { width: 146, height: 120 }, clearRect: vi.fn(), drawImage: vi.fn(),
  };
  return {
    gl, program, buffer, source, createElement, target, loseContext,
    context: target as unknown as CanvasRenderingContext2D,
  };
}

const classPalette = (classId: number) =>
  discBodyAppearance({ kind: 'wormhole', classId, effect: null }, () => '').palette;
const paint = {
  palette: classPalette(3), time: 4.5, age: 1.2, seed: 0.3,
  mode: 3, tint: [0.1, 0.2, 0.3] as const, focus: 0.4,
};

test('nodes acquire lazily and reuse one bounded WebGL surface until the last release', () => {
  const env = graphics();
  const early = acquire();
  early.release();
  early.release();
  expect(early.paint(env.context, paint)).toBe(false);
  expect(env.createElement).not.toHaveBeenCalled();
  const first = acquire();
  const second = acquire();
  expect(env.createElement).not.toHaveBeenCalled();
  expect(first.paint(env.context, paint)).toBe(true);
  expect(second.paint(env.context, paint)).toBe(true);
  expect(env.createElement).toHaveBeenCalledOnce();
  expect(env.source.getContext).toHaveBeenCalledOnce();
  expect(env.source).toMatchObject({ width: 256, height: 256 });
  first.release(); first.release();
  expect(env.loseContext).not.toHaveBeenCalled();
  expect(first.paint(env.context, paint)).toBe(false);
  expect(second.paint(env.context, paint)).toBe(true);
  second.release(); second.release();
  expect(env.gl.deleteBuffer).toHaveBeenCalledExactlyOnceWith(env.buffer);
  expect(env.gl.deleteProgram).toHaveBeenCalledExactlyOnceWith(env.program);
  expect(env.loseContext).toHaveBeenCalledOnce();
  expect(acquire().paint(env.context, paint)).toBe(true);
  expect(env.source.getContext).toHaveBeenCalledTimes(2);
});

test('each paint sends the palette, body mode, tint, focus and timing, then copies to its target size', () => {
  const env = graphics();
  const lease = acquire();
  expect(lease.paint(env.context, paint)).toBe(true);
  expect(env.gl.uniform1f).toHaveBeenCalledWith({ name: 'clock' }, paint.time);
  expect(env.gl.uniform1f).toHaveBeenCalledWith({ name: 'rippleAge' }, paint.age);
  expect(env.gl.uniform1f).toHaveBeenCalledWith({ name: 'seed' }, paint.seed);
  expect(env.gl.uniform1f).toHaveBeenCalledWith({ name: 'mode' }, 3);
  expect(env.gl.uniform1f).toHaveBeenCalledWith({ name: 'focus' }, 0.4);
  expect(env.gl.uniform3f).toHaveBeenCalledWith({ name: 'tintColor' }, 0.1, 0.2, 0.3);
  for (const key of ['core', 'accent', 'dark', 'highlight', 'halo'] as const) {
    expect(env.gl.uniform3f).toHaveBeenCalledWith({ name: `${key}Color` }, ...paint.palette[key]);
  }
  expect(env.target.clearRect).toHaveBeenCalledWith(0, 0, 146, 120);
  expect(env.target.drawImage).toHaveBeenCalledWith(env.source, 0, 0, 146, 120);
  expect(env.gl.drawArrays.mock.invocationCallOrder[0]).toBeLessThan(env.target.drawImage.mock.invocationCallOrder[0]!);
  const next = { ...paint, palette: classPalette(6) };
  lease.paint(env.context, next);
  expect(env.gl.uniform3f).toHaveBeenCalledWith({ name: 'coreColor' }, ...next.palette.core);
  expect(env.gl.uniform3f).toHaveBeenCalledWith({ name: 'haloColor' }, ...next.palette.halo);
  expect(env.gl.createProgram).toHaveBeenCalledOnce();
});

test.each(['shader', 'link', 'buffer'] as const)(
  '%s failure returns fallback, frees that attempt, and retries on the next paint',
  (failure) => {
    const env = graphics(failure);
    const first = acquire();
    const second = acquire();
    expect(first.paint(env.context, paint)).toBe(false);
    expect(second.paint(env.context, paint)).toBe(false);
    expect(env.source.getContext).toHaveBeenCalledTimes(2);
    expect(env.target.drawImage).not.toHaveBeenCalled();
    for (const result of env.gl.createShader.mock.results) {
      expect(env.gl.deleteShader).toHaveBeenCalledWith(result.value);
    }
    expect(env.gl.deleteProgram).toHaveBeenCalledWith(env.program);
    if (failure !== 'buffer') expect(env.gl.deleteBuffer).toHaveBeenCalledWith(env.buffer);
    expect(env.loseContext).toHaveBeenCalledTimes(2);
    first.release(); second.release();
    expect(env.loseContext).toHaveBeenCalledTimes(2);
  },
);

test('unavailable context stays on fallback and the next paint tries WebGL again', () => {
  const env = graphics('context');
  expect(acquire().paint(env.context, paint)).toBe(false);
  expect(acquire().paint(env.context, paint)).toBe(false);
  expect(env.source.getContext).toHaveBeenCalledTimes(2);
  expect(env.gl.createProgram).not.toHaveBeenCalled();
  expect(env.target.drawImage).not.toHaveBeenCalled();
});

test('lost GPU context reports fallback without clearing or copying stale pixels', () => {
  const env = graphics();
  const lease = acquire();
  lease.paint(env.context, paint);
  env.target.clearRect.mockClear(); env.target.drawImage.mockClear();
  env.gl.drawArrays.mockClear(); env.gl.isContextLost.mockReturnValue(true);
  expect(lease.paint(env.context, paint)).toBe(false);
  expect(env.gl.drawArrays).not.toHaveBeenCalled();
  expect(env.target.clearRect).not.toHaveBeenCalled();
  expect(env.target.drawImage).not.toHaveBeenCalled();
  env.gl.isContextLost.mockReturnValue(false);
  expect(lease.paint(env.context, paint)).toBe(true);
  expect(env.source.getContext).toHaveBeenCalledTimes(2);
});
