// People: sidewalk pedestrians, boardwalk strollers, venue crowds (dance/cheer/sit/cook/work), visitors, and the player avatar.
import { THREE, V3, scene, rand, rr, pick, merge, colorize, updaters, npcSpots, camera, QUALITY, clamp } from './core.js';
import { NODES, EDGES, otherEnd } from './roads.js';
import { shoreX } from './layout.js';
import { groundAt } from './physics.js';
import { visitorHooks, activity } from './vehicles.js';
import { env } from './env.js';

/* =====================================================================
   SHARED HUMANOID (8 instanced parts)
   ===================================================================== */
const SKIN = ['#f1c9a5', '#e0ac85', '#c68863', '#9a6440', '#6e4428', '#4a2e1c', '#f6d7bd'];
const SHIRTS = ['#e8e4dc', '#2a3a5a', '#3a3f48', '#6a7fa8', '#1e2433', '#8c6b52', '#b7c3d6', '#7a1a2a', '#2a5a3a', '#d8a018', '#ff5c8a', '#5fe3ff'];
const PANTS = ['#1a1c22', '#2a3040', '#3a3228', '#202a3a', '#4a4a50', '#6a5a48'];
const partGeo = {
  torso: (() => { const g = new THREE.CylinderGeometry(0.17, 0.2, 0.58, 8); g.translate(0, 0.29, 0); g.scale(1, 1, 0.7); return g; })(),
  head: (() => { const h = colorize(new THREE.SphereGeometry(0.115, 10, 8).toNonIndexed(), '#ffffff'); const hair = colorize(new THREE.SphereGeometry(0.122, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).toNonIndexed(), '#2a1a12'); hair.translate(0, 0.012, -0.01); for (const g of [h, hair]) { g.deleteAttribute('uv'); } return merge([h, hair]); })(),
  thigh: (() => { const g = new THREE.BoxGeometry(0.13, 0.46, 0.14); g.translate(0, -0.23, 0); return g; })(),
  shin: (() => { const g = new THREE.BoxGeometry(0.11, 0.46, 0.12); g.translate(0, -0.23, 0); const f = new THREE.BoxGeometry(0.11, 0.06, 0.22); f.translate(0, -0.46, 0.05); return merge([g, f]); })(),
  arm: (() => { const g = new THREE.BoxGeometry(0.09, 0.6, 0.1); g.translate(0, -0.3, 0); return g; })(),
};
const pMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
const pMatV = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, vertexColors: true });
function makeCrowd(n) {
  const mk = (geo, mat) => { const im = new THREE.InstancedMesh(geo, mat, n); im.frustumCulled = false; im.castShadow = QUALITY.high; scene.add(im); return im; };
  const C = { n, torso: mk(partGeo.torso, pMat), head: mk(partGeo.head, pMatV), tl: mk(partGeo.thigh, pMat), tr: mk(partGeo.thigh, pMat), sl: mk(partGeo.shin, pMat), sr: mk(partGeo.shin, pMat), al: mk(partGeo.arm, pMat), ar: mk(partGeo.arm, pMat) };
  return C;
}
function paint(C, i, shirt, skin, pants) {
  const c = new THREE.Color(shirt); C.torso.setColorAt(i, c); C.al.setColorAt(i, c); C.ar.setColorAt(i, c);
  C.head.setColorAt(i, new THREE.Color(skin)); const p = new THREE.Color(pants); C.tl.setColorAt(i, p); C.tr.setColorAt(i, p); C.sl.setColorAt(i, p); C.sr.setColorAt(i, p);
}
const _root = new THREE.Matrix4(), _m = new THREE.Matrix4(), _o = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new V3(), _one = new V3(1, 1, 1), _zero = new V3(0, 0, 0);
/** pose: {hip, lean, tl, tr, sl, sr, al, ar, alz, arz, bob} angles in radians */
function writePose(C, i, x, y, z, h, P, visible = true) {
  if (!visible) { _m.compose(_p.set(0, -100, 0), _q.identity(), _zero); for (const k of ['torso', 'head', 'tl', 'tr', 'sl', 'sr', 'al', 'ar']) C[k].setMatrixAt(i, _m); return; }
  _e.set(0, h, 0); _q.setFromEuler(_e); _root.compose(_p.set(x, y + (P.bob || 0), z), _q, _one);
  const hip = P.hip ?? 0.92;
  _e.set(P.lean || 0, 0, 0); _q.setFromEuler(_e); _o.compose(_p.set(0, hip, 0), _q, _one); C.torso.setMatrixAt(i, _m.multiplyMatrices(_root, _o));
  const torsoM = _m.clone();
  _o.makeTranslation(0, 0.72, 0); C.head.setMatrixAt(i, _m.multiplyMatrices(torsoM, _o));
  for (const [k, sk, sx, a, b] of [['tl', 'sl', 0.09, P.tl || 0, P.sl || 0], ['tr', 'sr', -0.09, P.tr || 0, P.sr || 0]]) {
    _e.set(-a, 0, 0); _q.setFromEuler(_e); _o.compose(_p.set(sx, hip, 0), _q, _one); const th = _m.multiplyMatrices(_root, _o).clone(); C[k].setMatrixAt(i, th);
    _e.set(b, 0, 0); _q.setFromEuler(_e); _o.compose(_p.set(0, -0.46, 0), _q, _one); C[sk].setMatrixAt(i, _m.multiplyMatrices(th, _o));
  }
  for (const [k, sx, a, zz] of [['al', 0.24, P.al || 0, P.alz || 0], ['ar', -0.24, P.ar || 0, P.arz || 0]]) {
    _e.set(-a, 0, zz * (sx > 0 ? 1 : -1)); _q.setFromEuler(_e); _o.compose(_p.set(sx, 0.55, 0), _q, _one); C[k].setMatrixAt(i, _m.multiplyMatrices(torsoM, _o));
  }
}
function flushCrowd(C) { for (const k of ['torso', 'head', 'tl', 'tr', 'sl', 'sr', 'al', 'ar']) { C[k].instanceMatrix.needsUpdate = true; if (C[k].instanceColor) C[k].instanceColor.needsUpdate = true; } }
export function walkPose(ph, speed = 1) { const s = Math.sin(ph), k = Math.min(1, speed); return { tl: s * 0.55 * k, tr: -s * 0.55 * k, sl: Math.max(0, -s) * 0.7 * k, sr: Math.max(0, s) * 0.7 * k, al: -s * 0.45 * k, ar: s * 0.45 * k, alz: 0.06, arz: 0.06, bob: Math.abs(Math.cos(ph)) * 0.04 * k }; }
function modePose(mode, t, ph) {
  switch (mode) {
    case 'dance': { const b = Math.sin(t * 7 + ph); return { bob: Math.abs(b) * 0.12, tl: 0.15 + b * 0.15, tr: 0.15 - b * 0.15, sl: 0.3, sr: 0.3, hip: 0.88, al: 2.4 + Math.sin(t * 3.5 + ph) * 0.5, ar: 2.4 - Math.sin(t * 3.5 + ph) * 0.5, alz: 0.3, arz: 0.3, lean: Math.sin(t * 3.5 + ph) * 0.08 }; }
    case 'cheer': { const b = Math.max(0, Math.sin(t * 4 + ph)); return { bob: b * 0.06, al: 2.6 + b * 0.3, ar: 2.2 + Math.sin(t * 5 + ph) * 0.4, alz: 0.25, arz: 0.2 }; }
    case 'sit': return { hip: 0.47, tl: 1.5, tr: 1.5, sl: 1.5, sr: 1.5, al: 0.5 + Math.sin(t * 0.7 + ph) * 0.1, ar: 0.4, alz: 0.1, arz: 0.1, lean: -0.05 };
    case 'work': return { hip: 0.47, tl: 1.5, tr: 1.5, sl: 1.5, sr: 1.5, al: 1.0 + Math.sin(t * 9 + ph) * 0.06, ar: 1.0 + Math.cos(t * 9 + ph) * 0.06, alz: -0.15, arz: -0.15, lean: 0.12 };
    case 'cook': return { al: 1.1 + Math.sin(t * 5 + ph) * 0.3, ar: 0.9 + Math.cos(t * 3 + ph) * 0.25, alz: -0.1, arz: -0.1, lean: 0.12, bob: Math.abs(Math.sin(t * 2 + ph)) * 0.02 };
    default: return { al: 0.05 + Math.sin(t * 0.8 + ph) * 0.04, ar: 0.05, alz: 0.08, arz: 0.08, lean: Math.sin(t * 0.5 + ph) * 0.02 };
  }
}

/* =====================================================================
   VENUE CROWDS (from npcSpots)
   ===================================================================== */
let spots = null, SC = null;
function initSpots() {
  spots = npcSpots.slice(); SC = makeCrowd(Math.max(1, spots.length));
  spots.forEach((s, i) => { paint(SC, i, s.color || pick(SHIRTS), pick(SKIN), s.mode === 'cook' ? '#e8e8e8' : pick(PANTS)); if (s.mode === 'cook') { SC.torso.setColorAt(i, new THREE.Color('#f4f4f4')); } s.vis = false; s.k = 0; });
}
let spotFrame = 0;
function updateSpots(t) {
  if (!spots) initSpots();
  spotFrame++;
  const cx = camera.position.x, cz = camera.position.z;
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i];
    const d2 = (s.x - cx) ** 2 + (s.z - cz) ** 2;
    if (spotFrame % 30 === (i % 30)) s.on = s.gate ? !!s.gate() : true;
    const want = s.on && d2 < 340 * 340;
    if (!want) { if (s.vis) { writePose(SC, i, 0, 0, 0, 0, null, false); s.vis = false; } continue; }
    if (d2 > 120 * 120 && s.vis && (spotFrame + i) % 8) continue;
    writePose(SC, i, s.x, s.y, s.z, s.ry, modePose(s.mode, t, s.ph)); s.vis = true;
  }
  flushCrowd(SC);
}

/* =====================================================================
   SIDEWALK PEDESTRIANS + BOARDWALK STROLLERS + VISITORS
   ===================================================================== */
const PED_N = QUALITY.high ? 260 : 140, STROLL_N = 40, VIS_N = 60;
const WC = makeCrowd(PED_N + STROLL_N + VIS_N);
for (let i = 0; i < WC.n; i++) paint(WC, i, pick(SHIRTS), pick(SKIN), pick(PANTS));
const peds = [];
function pedEnter(m, ei, fromId) {
  const e = EDGES[ei], A = NODES[fromId], B = NODES[otherEnd(e, fromId)];
  const ux = (B.x - A.x) / e.len, uz = (B.z - A.z) / e.len, rx = -uz, rz = ux, off = (e.w / 2 + 1.7) * m.side;
  m.edge = ei; m.from = fromId; m.to = B.id; m.ax = A.x + rx * off; m.az = A.z + rz * off; m.bx = B.x + rx * off; m.bz = B.z + rz * off; m.len = e.len; m.s = 0;
}
const walkable = e => e.kind !== 'highway' && e.kind !== 'drive' && Math.abs(NODES[e.a].x) < 700 && Math.abs(NODES[e.a].z) < 900;
const pedEdges = EDGES.filter(walkable);
for (let i = 0; i < PED_N; i++) {
  const e = pick(pedEdges); const m = { i, side: rand() < 0.5 ? 1 : -1, v: rr(1.1, 1.7), ph: rand() * 6, x: 0, z: 0, h: 0 };
  pedEnter(m, e.id, rand() < 0.5 ? e.a : e.b); m.s = rand() * m.len; peds.push(m);
}
const strollers = Array.from({ length: STROLL_N }, (_, k) => ({ i: PED_N + k, z: rr(-420, 420), dir: rand() < 0.5 ? 1 : -1, off: rr(2.5, 9), v: rr(0.9, 1.4), ph: rand() * 6 }));
const visitors = Array.from({ length: VIS_N }, (_, k) => ({ i: PED_N + STROLL_N + k, on: false }));
let visI = 0;
visitorHooks.spawn = (x, z, brand, n) => {
  for (let k = 0; k < n; k++) { const v = visitors[visI]; visI = (visI + 1) % VIS_N; Object.assign(v, { on: true, x: x + rr(-1, 1), z: z + rr(-1, 1), tx: brand.door[0] + rr(-1.5, 1.5), tz: brand.door[1] + rr(-1, 1), v: rr(1.2, 1.6), ph: rand() * 6, brand }); }
};
function updateWalkers(dt, t) {
  for (const m of peds) {
    m.s += m.v * dt * (env.rain > 0.5 ? 1.3 : 1);
    if (m.s >= m.len) {
      const n = NODES[m.to]; const opts = n.edges.filter(ei => walkable(EDGES[ei]) && (ei !== m.edge || n.edges.length === 1));
      const ei = opts.length ? pick(opts) : m.edge; if (rand() < 0.25) m.side = -m.side; pedEnter(m, ei, n.id);
    }
    const k = m.s / m.len; m.x = m.ax + (m.bx - m.ax) * k; m.z = m.az + (m.bz - m.az) * k; m.h = Math.atan2(m.bx - m.ax, m.bz - m.az);
    const d2 = (m.x - camera.position.x) ** 2 + (m.z - camera.position.z) ** 2;
    if (d2 > 400 * 400) { writePose(WC, m.i, 0, 0, 0, 0, null, false); continue; }
    const y = groundAt(m.x, m.z, 2).y; writePose(WC, m.i, m.x, Math.max(0, y), m.z, m.h, walkPose(t * m.v * 5.2 + m.ph, 1));
  }
  for (const s of strollers) {
    s.z += s.dir * s.v * dt; if (s.z > 430 || s.z < -430 || (s.z > 92 && s.z < 236 && rand() < 0.02)) s.dir = -s.dir;
    const x = shoreX(s.z) + 0.5 + s.off; const d2 = (x - camera.position.x) ** 2 + (s.z - camera.position.z) ** 2;
    if (d2 > 380 * 380) { writePose(WC, s.i, 0, 0, 0, 0, null, false); continue; }
    writePose(WC, s.i, x, 0.2, s.z, s.dir > 0 ? 0 : Math.PI, walkPose(t * s.v * 5.2 + s.ph, 1));
  }
  for (const v of visitors) {
    if (!v.on) { writePose(WC, v.i, 0, 0, 0, 0, null, false); continue; }
    const dx = v.tx - v.x, dz = v.tz - v.z, d = Math.hypot(dx, dz);
    if (d < 0.6) { v.on = false; v.brand.visits = (v.brand.visits || 0) + 1; continue; }
    v.x += dx / d * v.v * dt; v.z += dz / d * v.v * dt;
    writePose(WC, v.i, v.x, Math.max(0, groundAt(v.x, v.z, 2).y), v.z, Math.atan2(dx, dz), walkPose(t * v.v * 5.2 + v.ph, 1));
  }
  flushCrowd(WC);
}
updaters.push((dt, t) => { updateWalkers(dt, t); updateSpots(t); });

/* =====================================================================
   PLAYER AVATAR (third-person)
   ===================================================================== */
export function buildAvatar(opts = {}) {
  const g = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: opts.color || 0x14121c, roughness: 0.4, metalness: 0.3 });
  const neon = new THREE.MeshBasicMaterial({ color: new THREE.Color(opts.accent || '#ffc65c').multiplyScalar(2.4) });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc68863, roughness: 0.7 }), pants = new THREE.MeshStandardMaterial({ color: 0x1e2028, roughness: 0.8 }), shoes = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.5 });
  const parts = {};
  const torso = new THREE.Group(); torso.position.y = 0.92; g.add(torso); parts.torso = torso;
  torso.add(Object.assign(new THREE.Mesh(partGeo.torso, jacket), { castShadow: true }));
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.012, 4, 24).rotateX(Math.PI / 2).scale(1, 1, 0.72), neon); stripe.position.y = 0.42; torso.add(stripe);
  const star = new THREE.Mesh(new THREE.CircleGeometry(0.06, 5), neon); star.position.set(0, 0.36, -0.145); star.rotation.y = Math.PI; torso.add(star);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 10), skin); head.position.y = 0.72; head.castShadow = true; torso.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.124, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: 0x120a08, roughness: 0.6 })); hair.position.set(0, 0.735, -0.01); torso.add(hair);
  const shades = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.03), new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 1, roughness: 0.05 })); shades.position.set(0, 0.73, 0.11); torso.add(shades);
  const limbs = (geo, mat, x, y, par) => { const p = new THREE.Group(); p.position.set(x, y, 0); par.add(p); const m = new THREE.Mesh(geo, mat); m.castShadow = true; p.add(m); return p; };
  parts.tl = limbs(partGeo.thigh, pants, 0.09, 0.92, g); parts.tr = limbs(partGeo.thigh, pants, -0.09, 0.92, g);
  parts.sl = limbs(partGeo.shin, pants, 0, -0.46, parts.tl); parts.sr = limbs(partGeo.shin, pants, 0, -0.46, parts.tr);
  for (const sp of [parts.sl, parts.sr]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.26).translate(0, -0.47, 0.05), shoes); sp.add(f); }
  parts.al = limbs(partGeo.arm, jacket, 0.24, 0.55, torso); parts.ar = limbs(partGeo.arm, jacket, -0.24, 0.55, torso);
  g.userData.pose = (P) => {
    torso.position.y = (P.hip ?? 0.92) + (P.bob || 0); torso.rotation.x = P.lean || 0;
    parts.tl.position.y = parts.tr.position.y = (P.hip ?? 0.92) + (P.bob || 0);
    parts.tl.rotation.x = -(P.tl || 0); parts.tr.rotation.x = -(P.tr || 0); parts.sl.rotation.x = P.sl || 0; parts.sr.rotation.x = P.sr || 0;
    parts.al.rotation.set(-(P.al || 0), 0, P.alz || 0); parts.ar.rotation.set(-(P.ar || 0), 0, -(P.arz || 0));
  };
  scene.add(g); return g;
}
export { modePose };
