/* Tiny dependency-free WebGL "drafting space" renderer for the ToolAtlas hero.
   A slow-orbiting cabinet of four drawers with pull handles, orbit rings,
   floating satellites, a fogged blueprint floor and a vertical blueprint wall.
   Colours are read from the live CSS variables so the scene follows the
   light/dark theme exactly. Drawers are interactive: hovering one slides it
   out and brightens it, clicking it reports its index through onDrawer. */

export interface SceneTheme {
  bg: [number, number, number];
  surface: [number, number, number];
  raised: [number, number, number];
  accent: [number, number, number];
  accent2: [number, number, number];
  line: [number, number, number];
  fg: [number, number, number];
}

export interface SceneOptions {
  /* Called with the drawer index (0-3) when a drawer is clicked. */
  onDrawer?: (drawer: number) => void;
}

type Vec3 = [number, number, number];
type Mat4 = Float32Array;

function readVar(name: string, fallback: Vec3): Vec3 {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parts = raw.split(/\s+/).map(Number);
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
    return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
  }
  return fallback;
}

export function readSceneTheme(): SceneTheme {
  return {
    bg: readVar('--bg', [0.96, 0.95, 0.92]),
    surface: readVar('--surface', [0.99, 0.98, 0.96]),
    raised: readVar('--raised', [0.93, 0.91, 0.87]),
    accent: readVar('--accent', [0.91, 0.36, 0.16]),
    accent2: readVar('--accent-2', [0.08, 0.48, 0.42]),
    line: readVar('--line', [0.08, 0.09, 0.1]),
    fg: readVar('--fg', [0.08, 0.09, 0.1]),
  };
}

/* ------------------------------------------------------------- vec helpers */
function v3sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function v3cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function v3norm(a: Vec3): Vec3 {
  const len = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / len, a[1] / len, a[2] / len];
}

/* ------------------------------------------------------------- mat4 helpers */
function mat4Identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}
function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}
function mat4Translate(x: number, y: number, z: number): Mat4 {
  const m = mat4Identity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}
function mat4Scale(x: number, y: number, z: number): Mat4 {
  const m = mat4Identity();
  m[0] = x;
  m[5] = y;
  m[10] = z;
  return m;
}
function mat4RotateX(a: number): Mat4 {
  const m = mat4Identity();
  const c = Math.cos(a);
  const s = Math.sin(a);
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  return m;
}
function mat4RotateY(a: number): Mat4 {
  const m = mat4Identity();
  const c = Math.cos(a);
  const s = Math.sin(a);
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}
function mat4Perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}
function mat4LookAt(eye: Vec3, center: Vec3, up: Vec3): Mat4 {
  const zx = eye[0] - center[0];
  const zy = eye[1] - center[1];
  const zz = eye[2] - center[2];
  let len = Math.hypot(zx, zy, zz);
  const z: Vec3 = [zx / len, zy / len, zz / len];
  const xx = up[1] * z[2] - up[2] * z[1];
  const xy = up[2] * z[0] - up[0] * z[2];
  const xz = up[0] * z[1] - up[1] * z[0];
  len = Math.hypot(xx, xy, xz) || 1;
  const x: Vec3 = [xx / len, xy / len, xz / len];
  const y: Vec3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  const m = new Float32Array(16);
  m[0] = x[0];
  m[1] = y[0];
  m[2] = z[0];
  m[4] = x[1];
  m[5] = y[1];
  m[6] = y[2];
  m[8] = x[2];
  m[9] = y[2];
  m[10] = z[2];
  m[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
  m[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
  m[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
  m[15] = 1;
  return m;
}

/* ------------------------------------------------------------------ shaders */
const SOLID_VS = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform mat4 uProj, uView, uModel;
varying vec3 vNormal;
varying float vDepth;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vec4 view = uView * world;
  vDepth = -view.z;
  vNormal = mat3(uModel) * aNormal;
  gl_Position = uProj * view;
}`;
const SOLID_FS = `
precision mediump float;
uniform vec3 uColor, uLightDir, uFogColor;
uniform float uAmbient, uGlow;
varying vec3 vNormal;
varying float vDepth;
void main() {
  vec3 n = normalize(vNormal);
  float diff = max(dot(n, normalize(uLightDir)), 0.0);
  float rim = pow(1.0 - abs(n.z), 3.0) * 0.3;
  vec3 col = uColor * (uAmbient + diff * 0.72) + vec3(rim);
  col = mix(col, min(col + vec3(0.55), vec3(1.0)), uGlow);
  float fog = clamp((vDepth - 5.5) / 7.5, 0.0, 1.0);
  gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
}`;
const LINE_VS = `
attribute vec3 aPos;
attribute float aAlpha;
uniform mat4 uMVP;
varying float vAlpha;
void main() {
  vAlpha = aAlpha;
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;
const LINE_FS = `
precision mediump float;
uniform vec3 uColor;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(uColor, vAlpha);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('shader alloc failed');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || 'shader compile failed');
  }
  return sh;
}
function program(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error('program alloc failed');
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p) || 'program link failed');
  }
  return p;
}

/* ----------------------------------------------------------------- geometry */
interface Mesh {
  vbo: WebGLBuffer;
  nbo: WebGLBuffer | null;
  abo: WebGLBuffer | null;
  ibo: WebGLBuffer;
  count: number;
  mode: number;
}

function makeBox(gl: WebGLRenderingContext, w: number, h: number, d: number): Mesh {
  const x = w / 2;
  const y = h / 2;
  const z = d / 2;
  const faces: Array<[Vec3, Vec3, Vec3, Vec3, Vec3]> = [
    [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z], [0, 0, 1]],
    [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z], [0, 0, -1]],
    [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z], [0, 1, 0]],
    [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], [0, -1, 0]],
    [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z], [1, 0, 0]],
    [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z], [-1, 0, 0]],
  ];
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (const f of faces) {
    const base = pos.length / 3;
    for (let i = 0; i < 4; i++) {
      pos.push(...f[i]);
      nor.push(...f[4]);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
  const nbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(nor), gl.STATIC_DRAW);
  const ibo = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  return { vbo, nbo, abo: null, ibo, count: idx.length, mode: gl.TRIANGLES };
}

function makeOctahedron(gl: WebGLRenderingContext, r: number): Mesh {
  const corners: Vec3[] = [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]];
  const tris: Array<[number, number, number]> = [
    [0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0],
    [0, 4, 3], [1, 4, 3], [1, 3, 5], [0, 3, 5],
  ];
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (const t of tris) {
    const base = pos.length / 3;
    const a = corners[t[0]];
    const b = corners[t[1]];
    const c = corners[t[2]];
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    for (const p of [a, b, c]) {
      pos.push(...p);
      nor.push(nx / len, ny / len, nz / len);
    }
    idx.push(base, base + 1, base + 2);
  }
  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
  const nbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(nor), gl.STATIC_DRAW);
  const ibo = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  return { vbo, nbo, abo: null, ibo, count: idx.length, mode: gl.TRIANGLES };
}

function makeGrid(gl: WebGLRenderingContext, half: number, step: number, y: number): Mesh {
  const pos: number[] = [];
  const alpha: number[] = [];
  const idx: number[] = [];
  let vi = 0;
  const push = (p: Vec3, a: number) => {
    pos.push(...p);
    alpha.push(a);
    return vi++;
  };
  for (let i = -half; i <= half; i += step) {
    const edge = 1 - Math.min(Math.abs(i) / half, 1);
    const a = 0.05 + edge * 0.3;
    for (const [p1, p2] of [
      [[i, y, -half], [i, y, half]],
      [[-half, y, i], [half, y, i]],
    ] as Array<[Vec3, Vec3]>) {
      const a1 = a * (1 - Math.min((Math.abs(p1[0]) + Math.abs(p1[2])) / (2 * half), 1) * 0.6);
      const a2 = a * (1 - Math.min((Math.abs(p2[0]) + Math.abs(p2[2])) / (2 * half), 1) * 0.6);
      idx.push(push(p1 as Vec3, a1), push(p2 as Vec3, a2));
    }
  }
  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
  const abo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, abo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(alpha), gl.STATIC_DRAW);
  const ibo = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
  return { vbo, nbo: null, abo, ibo, count: idx.length, mode: gl.LINES };
}

function makeRing(gl: WebGLRenderingContext, radius: number, alpha: number): Mesh {
  const segments = 96;
  const pos: number[] = [];
  const alphas: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pos.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    /* Alpha undulates around the loop so the ring reads as drawn, not perfect. */
    alphas.push(alpha * (0.65 + 0.35 * Math.sin(a * 3 + radius)));
    idx.push(i, (i + 1) % segments);
  }
  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
  const abo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, abo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(alphas), gl.STATIC_DRAW);
  const ibo = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  return { vbo, nbo: null, abo, ibo, count: idx.length, mode: gl.LINES };
}

/* ------------------------------------------------------------------ scene */
interface FrameState {
  spin: number;
  slides: number[];
  baseT: Vec3;
  baseScale: number;
  eye: Vec3;
  center: Vec3;
  aspect: number;
}

export function startScene(canvas: HTMLCanvasElement, opts: SceneOptions = {}): (() => void) | null {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false }) ||
    (canvas.getContext('experimental-webgl', { antialias: true, alpha: false }) as WebGLRenderingContext | null);
  if (!gl) return null;
  gl.getExtension('OES_element_index_uint');

  let theme = readSceneTheme();
  const solidProg = program(gl, SOLID_VS, SOLID_FS);
  const lineProg = program(gl, LINE_VS, LINE_FS);
  const loc = {
    solid: {
      aPos: gl.getAttribLocation(solidProg, 'aPos'),
      aNormal: gl.getAttribLocation(solidProg, 'aNormal'),
      uProj: gl.getUniformLocation(solidProg, 'uProj'),
      uView: gl.getUniformLocation(solidProg, 'uView'),
      uModel: gl.getUniformLocation(solidProg, 'uModel'),
      uColor: gl.getUniformLocation(solidProg, 'uColor'),
      uLightDir: gl.getUniformLocation(solidProg, 'uLightDir'),
      uFogColor: gl.getUniformLocation(solidProg, 'uFogColor'),
      uAmbient: gl.getUniformLocation(solidProg, 'uAmbient'),
      uGlow: gl.getUniformLocation(solidProg, 'uGlow'),
    },
    line: {
      aPos: gl.getAttribLocation(lineProg, 'aPos'),
      aAlpha: gl.getAttribLocation(lineProg, 'aAlpha'),
      uMVP: gl.getUniformLocation(lineProg, 'uMVP'),
      uColor: gl.getUniformLocation(lineProg, 'uColor'),
    },
  };

  const drawerMesh = makeBox(gl, 2.5, 0.44, 1.6);
  const handleMesh = makeBox(gl, 0.72, 0.07, 0.07);
  const octMesh = makeOctahedron(gl, 0.16);
  const gridMesh = makeGrid(gl, 9, 1, -1.2);
  const wallMesh = makeGrid(gl, 9, 1, 0);
  const ringA = makeRing(gl, 2.95, 0.34);
  const ringB = makeRing(gl, 3.55, 0.22);

  /* Four drawers: paper, accent, paper, teal. Each slides out slowly, offset
     in phase, like a cabinet being searched one drawer at a time. */
  const drawerY = [-0.81, -0.23, 0.35, 0.93];
  const drawerColors: Array<(t: SceneTheme) => Vec3> = [
    (t) => t.raised,
    (t) => t.accent,
    (t) => t.surface,
    (t) => t.accent2,
  ];
  const slide = (i: number, time: number) => 0.42 * (0.5 + 0.5 * Math.sin(time * 0.5 + i * 1.7));

  const satellites: Array<{ r: number; speed: number; phase: number; yAmp: number; yBase: number; scale: number }> = [];
  for (let i = 0; i < 14; i++) {
    satellites.push({
      r: 2.3 + (i % 4) * 0.5 + (i * 0.13) % 0.4,
      speed: (0.16 + (i % 4) * 0.05) * (i % 2 === 0 ? 1 : -1),
      phase: i * 0.53,
      yAmp: 0.28 + (i % 3) * 0.14,
      yBase: -0.5 + (i % 6) * 0.38,
      scale: 0.7 + (i % 3) * 0.3,
    });
  }

  let raf = 0;
  let running = false;
  let inView = true;
  let pointerX = 0;
  let pointerY = 0;
  let camX = 0;
  let camY = 0;
  let scrollP = 0;
  let hovered = -1;
  const boost = [0, 0, 0, 0];
  const state: FrameState = {
    spin: 0,
    slides: [0, 0, 0, 0],
    baseT: [1.25, 0.3, 0],
    baseScale: 1.18,
    eye: [0, 0, 6],
    center: [0, 0, 0],
    aspect: 1,
  };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  /* Cast a ray from the pointer through the camera and test it against each
     drawer's box in the drawer's local space. Returns the nearest hit index. */
  const pick = (clientX: number, clientY: number): number => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return -1;
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
    const tanF = Math.tan(0.72 / 2);
    const fwd = v3norm(v3sub(state.center, state.eye));
    const right = v3norm(v3cross(fwd, [0, 1, 0]));
    const up = v3cross(right, fwd);
    const dir = v3norm([
      fwd[0] + right[0] * ndcX * tanF * state.aspect + up[0] * ndcY * tanF,
      fwd[1] + right[1] * ndcX * tanF * state.aspect + up[1] * ndcY * tanF,
      fwd[2] + right[2] * ndcX * tanF * state.aspect + up[2] * ndcY * tanF,
    ]);
    const s = state.baseScale;
    const c = Math.cos(state.spin);
    const sn = Math.sin(state.spin);
    /* Ray origin/direction into group space (undo base translate + scale). */
    const o: Vec3 = [
      (state.eye[0] - state.baseT[0]) / s,
      (state.eye[1] - state.baseT[1]) / s,
      (state.eye[2] - state.baseT[2]) / s,
    ];
    const d: Vec3 = [dir[0] / s, dir[1] / s, dir[2] / s];
    /* Undo the group rotation around Y. */
    const or: Vec3 = [c * o[0] + sn * o[2], o[1], -sn * o[0] + c * o[2]];
    const dr: Vec3 = [c * d[0] + sn * d[2], d[1], -sn * d[0] + c * d[2]];

    let best = -1;
    let bestT = Infinity;
    for (let i = 0; i < 4; i++) {
      const lo: Vec3 = [-1.25, drawerY[i] - 0.28, state.slides[i] - 0.95];
      const hi: Vec3 = [1.25, drawerY[i] + 0.28, state.slides[i] + 0.95];
      let t0 = 0;
      let t1 = Infinity;
      let miss = false;
      for (let axis = 0; axis < 3; axis++) {
        const inv = 1 / (dr[axis] || 1e-9);
        let a = (lo[axis] - or[axis]) * inv;
        let b = (hi[axis] - or[axis]) * inv;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, b);
        if (t0 > t1) {
          miss = true;
          break;
        }
      }
      if (!miss && t0 < bestT) {
        bestT = t0;
        best = i;
      }
    }
    return best;
  };

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (!running || !inView || document.hidden) return;
    resize();
    const time = now / 1000;
    camX += (pointerX * 1.5 - camX) * 0.045;
    camY += (pointerY * 0.7 - camY) * 0.045;

    const aspect = canvas.width / canvas.height;
    const wide = aspect > 1.05;
    const proj = mat4Perspective(0.72, aspect, 0.1, 60);
    const eye: Vec3 = wide
      ? [camX - 1.1, 1.8 + camY + scrollP * 1.4, 5.6 - scrollP * 0.6]
      : [camX * 0.5, 2.0 + camY * 0.5 + scrollP * 1.2, 7.6 - scrollP * 0.6];
    const center: Vec3 = wide ? [0.7, 0.25 + scrollP * 0.5, 0] : [0.3, 0.8 + scrollP * 0.5, 0];
    const view = mat4LookAt(eye, center, [0, 1, 0]);
    const spin = time * 0.2 + scrollP * 1.1;
    const base = wide
      ? mat4Multiply(mat4Translate(1.25, 0.3, 0), mat4Scale(1.18, 1.18, 1.18))
      : mat4Multiply(mat4Translate(1.0, 1.3, 0), mat4Scale(0.7, 0.7, 0.7));
    const group = mat4Multiply(base, mat4RotateY(spin));

    /* Publish the frame state for pointer picking. */
    state.spin = spin;
    state.eye = eye;
    state.center = center;
    state.aspect = aspect;
    state.baseT = wide ? [1.25, 0.3, 0] : [1.0, 1.3, 0];
    state.baseScale = wide ? 1.18 : 0.7;
    for (let i = 0; i < 4; i++) {
      boost[i] += ((hovered === i ? 0.5 : 0) - boost[i]) * 0.09;
      state.slides[i] = slide(i, time) + boost[i];
    }

    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(theme.bg[0], theme.bg[1], theme.bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const pv = mat4Multiply(proj, view);

    /* lines: floor grid, vertical blueprint wall, orbit rings */
    gl.useProgram(lineProg);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const drawLines = (mesh: Mesh, model: Mat4, color: Vec3) => {
      const mvp = mat4Multiply(pv, model);
      gl.uniformMatrix4fv(loc.line.uMVP, false, mvp);
      gl.uniform3fv(loc.line.uColor, color);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
      gl.enableVertexAttribArray(loc.line.aPos);
      gl.vertexAttribPointer(loc.line.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.abo!);
      gl.enableVertexAttribArray(loc.line.aAlpha);
      gl.vertexAttribPointer(loc.line.aAlpha, 1, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
      gl.drawElements(mesh.mode, mesh.count, mesh === gridMesh || mesh === wallMesh ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    };

    drawLines(gridMesh, mat4RotateY(spin * 0.35), theme.line);
    /* Blueprint wall behind the cabinet, slowly breathing. */
    const wallDrift = Math.sin(time * 0.07) * 0.6;
    drawLines(
      wallMesh,
      mat4Multiply(mat4Translate(wallDrift, 1.6, -5.2), mat4RotateX(Math.PI / 2)),
      theme.accent2,
    );
    /* Orbit rings circling the cabinet. */
    drawLines(
      ringA,
      mat4Multiply(base, mat4Multiply(mat4RotateY(time * 0.11), mat4RotateX(1.12))),
      theme.accent2,
    );
    drawLines(
      ringB,
      mat4Multiply(base, mat4Multiply(mat4RotateY(-time * 0.07), mat4RotateX(1.38))),
      theme.accent,
    );
    gl.disable(gl.BLEND);

    /* solids */
    gl.useProgram(solidProg);
    gl.uniformMatrix4fv(loc.solid.uProj, false, proj);
    gl.uniformMatrix4fv(loc.solid.uView, false, view);
    gl.uniform3fv(loc.solid.uLightDir, [0.55, 0.9, 0.45]);
    gl.uniform3fv(loc.solid.uFogColor, theme.bg);

    const drawSolid = (mesh: Mesh, model: Mat4, color: Vec3, ambient: number, glow: number) => {
      gl.uniformMatrix4fv(loc.solid.uModel, false, model);
      gl.uniform3fv(loc.solid.uColor, color);
      gl.uniform1f(loc.solid.uAmbient, ambient);
      gl.uniform1f(loc.solid.uGlow, glow);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
      gl.enableVertexAttribArray(loc.solid.aPos);
      gl.vertexAttribPointer(loc.solid.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nbo);
      gl.enableVertexAttribArray(loc.solid.aNormal);
      gl.vertexAttribPointer(loc.solid.aNormal, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
      gl.drawElements(mesh.mode, mesh.count, gl.UNSIGNED_SHORT, 0);
    };

    for (let i = 0; i < 4; i++) {
      const z = state.slides[i];
      const glow = Math.min(1, boost[i] * 1.6);
      const local = mat4Translate(0, drawerY[i], z);
      const model = mat4Multiply(group, local);
      drawSolid(drawerMesh, model, drawerColors[i](theme), (i === 1 || i === 3 ? 0.42 : 0.55) + glow * 0.15, glow);
      const handleLocal = mat4Translate(0, drawerY[i] + 0.02, z + 0.82);
      const handleModel = mat4Multiply(group, handleLocal);
      drawSolid(handleMesh, handleModel, i === 1 || i === 3 ? theme.surface : theme.accent2, 0.5 + glow * 0.2, glow);
    }
    for (const s of satellites) {
      const a = s.phase + time * s.speed;
      const local = mat4Multiply(
        mat4Translate(Math.cos(a) * s.r, s.yBase + Math.sin(time * 0.6 + s.phase) * s.yAmp, Math.sin(a) * s.r),
        mat4Multiply(mat4RotateY(a * 2), mat4RotateX(a), ),
      );
      const model = mat4Multiply(group, mat4Multiply(local, mat4Scale(s.scale, s.scale, s.scale)));
      drawSolid(octMesh, model, s.phase % 2 > 1 ? theme.accent : theme.fg, 0.45, 0);
    }
  };

  const finePointer = window.matchMedia('(pointer: fine)').matches;

  const onPointer = (e: PointerEvent) => {
    pointerX = (e.clientX / window.innerWidth) * 2 - 1;
    pointerY = (e.clientY / window.innerHeight) * 2 - 1;
  };
  const onHover = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    hovered = pick(e.clientX, e.clientY);
    canvas.style.cursor = hovered >= 0 ? 'pointer' : '';
  };
  const onLeave = () => {
    hovered = -1;
    canvas.style.cursor = '';
  };
  const onClick = (e: MouseEvent) => {
    const hit = pick(e.clientX, e.clientY);
    if (hit >= 0) opts.onDrawer?.(hit);
  };
  const onScroll = () => {
    const rect = canvas.getBoundingClientRect();
    const total = rect.height || 1;
    scrollP = Math.min(1, Math.max(0, -rect.top / total));
  };
  const io = new IntersectionObserver((entries) => {
    inView = entries[0]?.isIntersecting ?? true;
  });
  io.observe(canvas);
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  if (finePointer) {
    canvas.addEventListener('pointermove', onHover);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('click', onClick);
  }
  const mo = new MutationObserver(() => {
    theme = readSceneTheme();
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  running = true;
  resize();
  onScroll();
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    io.disconnect();
    mo.disconnect();
    window.removeEventListener('pointermove', onPointer);
    window.removeEventListener('scroll', onScroll);
    if (finePointer) {
      canvas.removeEventListener('pointermove', onHover);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('click', onClick);
    }
    const ext = gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
  };
     }
