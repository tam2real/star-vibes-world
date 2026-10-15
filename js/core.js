// Core engine: renderer, scene, camera, post-processing, shared helpers & registries.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export { THREE, mergeGeometries };
export const V3 = THREE.Vector3;

const Q = new URLSearchParams(location.search);
const lowGPU = Q.get('quality') === 'low' || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
let savedQ = null; try { savedQ = localStorage.getItem('svw.quality'); } catch (_) {}
export const QUALITY = { high: savedQ ? savedQ === 'high' : !lowGPU };

export const canvas = document.getElementById('c');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: Q.has('shot') });
export const PR = Math.min(window.devicePixelRatio || 1, QUALITY.high ? 1.5 : 1);
renderer.setPixelRatio(PR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = QUALITY.high;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x9aa6c0, 0.00055);
export const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.2, 14000);
camera.rotation.order = 'YXZ';

const rt = new THREE.WebGLRenderTarget(innerWidth * PR, innerHeight * PR, { type: THREE.HalfFloatType, samples: QUALITY.high ? 4 : 0 });
export const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(PR); composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
export const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.32, 0.95);
composer.addPass(bloom);
composer.addPass(new OutputPass());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); bloom.setSize(innerWidth, innerHeight);
});

/* ---------- deterministic random ---------- */
export function mulberry(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const rand = mulberry(518);
export const rr = (a, b) => a + (b - a) * rand();
export const pick = arr => arr[Math.floor(rand() * arr.length)];
export const lin = (r, g, b) => new THREE.Color(r, g, b);
export const clamp = THREE.MathUtils.clamp;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

/* ---------- registries shared by every module ---------- */
export const updaters = [];          // fn(dt, time, env) per frame
export const colliders = [];         // {x,z,hw,hd,y0,y1} | {seg:[ax,az,bx,bz],r,y0,y1} | {x,z,r,y0,y1}
export const floors = [];            // {x0,x1,z0,z1,y} | {ell:[cx,cz,rx,rz,irx,irz,a0,a1],y}
export const nightMats = [];         // {mat, prop, base, day, night, open?:fn}
export const interactables = [];     // {x,y,z,r,label,action}
export const picks = [];             // invisible meshes for click-to-inspect (userData.site)
export const sites = [];             // brand + custom buildings with info panels

export function onNight(mat, base, day = 0, night = 1, prop = 'emissive', gate = null) {
  const e = { mat, prop, base: base.clone ? base.clone() : new THREE.Color(base), day, night, gate }; nightMats.push(e); return e;
}

/* ---------- canvas textures ---------- */
export function makeCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { c, ctx: c.getContext('2d'), tex };
}
export const FONT = (w, s, fam) => `${w} ${s}px ${fam || 'system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif'}`;
export const SCRIPT = '"Brush Script MT", "Segoe Script", "Snell Roundhand", "Lucida Handwriting", cursive';
export const DISPLAY = '"Avenir Next Condensed", "Arial Narrow", "Helvetica Neue", Arial, sans-serif';

export function fitText(ctx, text, weight, size, maxW, fam, min = 10) {
  let s = size; ctx.font = FONT(weight, s, fam);
  while (ctx.measureText(text).width > maxW && s > min) { s -= 2; ctx.font = FONT(weight, s, fam); }
  return s;
}
/** Neon sign texture: glowing text on transparent bg. */
export function neonSign(lines, opts = {}) {
  const W = opts.w || 1024, H = opts.h || 256; const cv = makeCanvas(W, H), g = cv.ctx;
  if (opts.bg) { g.fillStyle = opts.bg; g.beginPath(); g.roundRect(6, 6, W - 12, H - 12, opts.radius ?? 28); g.fill(); if (opts.border) { g.lineWidth = 6; g.strokeStyle = opts.border; g.stroke(); } }
  const n = lines.length;
  lines.forEach((L, i) => {
    const y = L.y != null ? L.y * H : H * (i + 0.5) / n + (L.dy || 0);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, L.text, L.weight || 800, L.size || H * 0.6 / n, W * 0.92, L.font);
    g.shadowColor = L.glow || L.color; g.shadowBlur = L.blur ?? 24;
    g.fillStyle = L.color; g.fillText(L.text, W / 2, y);
    g.shadowBlur = (L.blur ?? 24) * 0.4; g.fillStyle = L.core || '#ffffff'; g.globalAlpha = L.coreAlpha ?? 0.55; g.fillText(L.text, W / 2, y); g.globalAlpha = 1;
  });
  g.shadowBlur = 0;
  return cv;
}
/** A plane carrying a sign texture; its brightness rides the night cycle. */
export function signMesh(cv, w, h, k = 2.2, dayK = 1.0) {
  const mat = new THREE.MeshBasicMaterial({ map: cv.tex, transparent: true, depthWrite: false, side: THREE.FrontSide, toneMapped: true, fog: false });
  mat.color.setScalar(dayK); onNight(mat, new THREE.Color(1, 1, 1), dayK, k, 'color');
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.renderOrder = 4; return m;
}

/* ---------- loaders ---------- */
const texLoader = new THREE.TextureLoader();
export function loadTex(url, cb) {
  const t = texLoader.load(url, tt => { cb && cb(tt); }, undefined, () => {});
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

/* ---------- geometry helpers ---------- */
export function rrShape(w, d, r) {
  r = Math.min(r, w / 2 - 0.01, d / 2 - 0.01);
  const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + d - r); s.absarc(x + w - r, y + d - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + d); s.absarc(x + r, y + d - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, 1.5 * Math.PI, false);
  return s;
}
export function flatGeo(shape, segs = 12) { const g = new THREE.ShapeGeometry(shape, segs); g.rotateX(-Math.PI / 2); return g; }
export function slabGeo(shape, thick) { const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 16 }); g.rotateX(-Math.PI / 2); return g; }
export function boxAt(w, h, d, x, y, z, ry = 0) { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); return g; }
export function colorize(g, c) {
  const col = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
/** merge a list of geometries, normalising attributes (drops uv when inconsistent). */
export function merge(list, keepUV = false) {
  const gs = list.map(g => { let h = g.index ? g.toNonIndexed() : g; if (!keepUV && h.attributes.uv) h.deleteAttribute('uv'); if (h.attributes.uv1) h.deleteAttribute('uv1'); return h; });
  return mergeGeometries(gs);
}
/** Strip along a parametric path (for roads, trails, boardwalks) */
export function stripGeo(fn, segs, width, uPerUnit, y = 0) {
  const pos = [], uv = [], nrm = [], idx = [], p = new V3(), q = new V3(), prev = new V3(); let dist = 0;
  for (let i = 0; i <= segs; i++) {
    fn(i / segs, p); fn(i < segs ? (i + 1) / segs : (i - 1) / segs, q);
    let tx = q.x - p.x, tz = q.z - p.z; if (i === segs) { tx = -tx; tz = -tz; }
    const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L; const sx = -tz, sz = tx;
    if (i) dist += Math.hypot(p.x - prev.x, p.z - prev.z); prev.copy(p);
    pos.push(p.x + sx * width / 2, p.y + y, p.z + sz * width / 2, p.x - sx * width / 2, p.y + y, p.z - sz * width / 2);
    nrm.push(0, 1, 0, 0, 1, 0); uv.push(dist * uPerUnit, 1, dist * uPerUnit, 0);
    if (i < segs) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.userData.length = dist; return g;
}

/* ---------- self-lit interiors: adds a share of the albedo as emission (rides the night cycle) ---------- */
export const selfLitU = { value: 0.1 };
export function selfLit(mat, k = 1) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); sh.uniforms.uSelfLit = selfLitU; sh.uniforms.uSelfK = { value: k };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uSelfLit; uniform float uSelfK;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uSelfLit * uSelfK;'); };
  mat.customProgramCacheKey = () => 'selflit' + k; return mat;
}
/* ---------- shared materials ---------- */
export const M = {
  dark: new THREE.MeshStandardMaterial({ color: 0x15181f, roughness: 0.5, metalness: 0.7 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x5a616d, roughness: 0.35, metalness: 0.85 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x9a978f, roughness: 0.9 }),
  paving: new THREE.MeshStandardMaterial({ color: 0x7d7a74, roughness: 0.95 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.75 }),
  darkWood: new THREE.MeshStandardMaterial({ color: 0x3d2618, roughness: 0.6 }),
  white: new THREE.MeshStandardMaterial({ color: 0xeeeae2, roughness: 0.7 }),
  black: new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.6 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x8fc4e8, metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.2 }),
  tint: new THREE.MeshStandardMaterial({ color: 0x1a2a3a, metalness: 0.95, roughness: 0.08, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
  vc: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 }),
  vcIn: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05 }),
  vcLit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05, emissive: 0x2a2018, emissiveIntensity: 1 }),
};
selfLit(M.vcIn, 1);
export const basic = (c, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: true });

/** emissive material whose glow follows the night cycle (k at night, dayK by day) */
export function glowMat(hex, k = 3, dayK = 0.6) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(dayK) });
  onNight(m, new THREE.Color(hex), dayK, k, 'color'); return m;
}

/* ---------- Site: a building lot with local coords & colliders (rotations in 90° steps) ---------- */
export class Site {
  constructor(x, z, rot = 0) {
    this.x = x; this.z = z; this.rot = rot; this.c = Math.round(Math.cos(rot)); this.s = Math.round(Math.sin(rot));
    this.g = new THREE.Group(); this.g.position.set(x, 0, z); this.g.rotation.y = rot; scene.add(this.g);
  }
  /** local -> world (x,z) */
  w(lx, lz) { return [this.x + lx * this.c + lz * this.s, this.z - lx * this.s + lz * this.c]; }
  wAABB(lx, lz, w, d) { const [x, z] = this.w(lx, lz); const sw = this.s !== 0; return { x, z, hw: (sw ? d : w) / 2, hd: (sw ? w : d) / 2 }; }
  add(o) { this.g.add(o); return o; }
  mesh(geo, mat, x = 0, y = 0, z = 0, shadow = true) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (shadow) { m.castShadow = true; m.receiveShadow = true; } this.g.add(m); return m; }
  /** solid box with collider */
  box(w, h, d, x, y, z, mat, collide = true, shadow = true) {
    const m = this.mesh(new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z, shadow);
    if (collide) colliders.push({ ...this.wAABB(x, z, w, d), y0: y, y1: y + h });
    return m;
  }
  collideBox(x, z, w, d, y0, y1) { colliders.push({ ...this.wAABB(x, z, w, d), y0, y1 }); }
  collideCircle(x, z, r, y0, y1) { const [wx, wz] = this.w(x, z); colliders.push({ x: wx, z: wz, r, y0, y1 }); }
  /** wall from (ax,az)->(bx,bz) (axis aligned), with door openings [{at, w, h}] measured along the wall from a */
  wall(ax, az, bx, bz, h, y0, t, mat, openings = [], geoOut = null) {
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
    const ops = openings.slice().sort((a, b) => a.at - b.at); let cur = 0; const pieces = [];
    for (const o of ops) { const s = o.at - o.w / 2, e = o.at + o.w / 2; if (s > cur) pieces.push([cur, s, 0, h, true]); if (o.h < h) pieces.push([s, e, o.h, h, false]); cur = e; }
    if (cur < L) pieces.push([cur, L, 0, h, true]);
    for (const [s, e, h0, h1, col] of pieces) {
      const len = e - s, mid = (s + e) / 2, cx = ax + ux * mid, cz = az + uz * mid;
      const geo = new THREE.BoxGeometry(Math.abs(ux) > 0.5 ? len : t, h1 - h0, Math.abs(ux) > 0.5 ? t : len); geo.translate(cx, y0 + (h0 + h1) / 2, cz);
      if (geoOut) geoOut.push(geo); else this.mesh(geo, mat);
      if (col) colliders.push({ ...this.wAABB(cx, cz, Math.abs(ux) > 0.5 ? len : t, Math.abs(ux) > 0.5 ? t : len), y0: y0 + h0, y1: y0 + h1 });
    }
  }
  floor(x, z, w, d, y) { const [wx, wz] = this.w(x, z); const sw = this.s !== 0; const hw = (sw ? d : w) / 2, hd = (sw ? w : d) / 2; floors.push({ x0: wx - hw, x1: wx + hw, z0: wz - hd, z1: wz + hd, y }); }
  interact(x, y, z, r, label, action) { const [wx, wz] = this.w(x, z); const it = { x: wx, y, z: wz, r, label, action }; interactables.push(it); return it; }
  pick(w, h, d, info) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial()); m.visible = false; m.position.y = h / 2; this.g.add(m); m.userData.site = info; picks.push(m); return m; }
}

/* ---------- NPC placements requested by buildings (consumed by people.js) ---------- */
export const npcSpots = [];   // {x,y,z,ry,mode:'stand'|'sit'|'dance'|'cook'|'work'|'cheer', color, gate?:fn}
