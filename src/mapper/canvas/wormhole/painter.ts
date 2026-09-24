import type { RGB, WormholePalette } from './palette';
import { WORMHOLE_FRAGMENT, WORMHOLE_VERTEX } from './shaders';

export interface WormholePaint {
  readonly palette: WormholePalette;
  readonly seed: number;
  readonly time: number;
  readonly age: number;
  readonly mode: number;
  readonly tint: RGB;
  readonly focus: number;
}

interface Painter {
  paint(target: CanvasRenderingContext2D, input: WormholePaint): boolean;
  dispose(): void;
}

function shader(gl: WebGLRenderingContext, kind: number, source: string): WebGLShader | null {
  const result = gl.createShader(kind);
  if (result === null) return null;
  gl.shaderSource(result, source);
  gl.compileShader(result);
  if (gl.getShaderParameter(result, gl.COMPILE_STATUS)) return result;
  gl.deleteShader(result);
  return null;
}

function linkProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vertex = shader(gl, gl.VERTEX_SHADER, WORMHOLE_VERTEX);
  const fragment = shader(gl, gl.FRAGMENT_SHADER, WORMHOLE_FRAGMENT);
  const program = gl.createProgram();
  if (vertex !== null && fragment !== null && program !== null) {
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
  }
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (program !== null && gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
  gl.deleteProgram(program);
  return null;
}

function createPainter(): Painter | null {
  const source = document.createElement('canvas');
  // One bounded GPU surface for the entire map, copied to each node's 2D canvas.
  source.width = source.height = 256;
  const gl = source.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
  if (gl === null) return null;
  const program = linkProgram(gl);
  const buffer = gl.createBuffer();
  if (program === null || buffer === null) {
    gl.deleteProgram(program);
    gl.deleteBuffer(buffer);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return null;
  }
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.viewport(0, 0, 256, 256);
  const scalar = {
    time: gl.getUniformLocation(program, 'clock'),
    age: gl.getUniformLocation(program, 'rippleAge'),
    seed: gl.getUniformLocation(program, 'seed'),
    mode: gl.getUniformLocation(program, 'mode'),
    focus: gl.getUniformLocation(program, 'focus'),
  };
  const tint = gl.getUniformLocation(program, 'tintColor');
  const colors = (['core', 'accent', 'halo', 'dark', 'highlight'] as const)
    .map((key) => ({ key, location: gl.getUniformLocation(program, `${key}Color`) }));
  return {
    paint(target, input) {
      if (gl.isContextLost()) return false;
      gl.uniform1f(scalar.time, input.time);
      gl.uniform1f(scalar.age, input.age);
      gl.uniform1f(scalar.seed, input.seed);
      gl.uniform1f(scalar.mode, input.mode);
      gl.uniform1f(scalar.focus, input.focus);
      gl.uniform3f(tint, ...input.tint);
      for (const { key, location } of colors) gl.uniform3f(location, ...input.palette[key]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      const { width, height } = target.canvas;
      target.clearRect(0, 0, width, height);
      target.drawImage(source, 0, 0, width, height);
      return true;
    },
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

let shared: Painter | undefined;
let users = 0;

export function acquireWormholePainter() {
  users += 1;
  let released = false;
  return {
    paint(target: CanvasRenderingContext2D, input: WormholePaint): boolean {
      if (released) return false;
      if (shared === undefined) {
        const created = createPainter();
        if (created === null) return false;
        shared = created;
      }
      const ready = shared.paint(target, input);
      if (!ready) {
        shared.dispose();
        shared = undefined;
      }
      return ready;
    },
    release() {
      if (released) return;
      released = true;
      users -= 1;
      if (users === 0) {
        shared?.dispose();
        shared = undefined;
      }
    },
  };
}
