// Streets: graph (for traffic + routing), asphalt, sidewalks, blocks, bridges, street lights, signals.
import { THREE, V3, scene, M, makeCanvas, merge, stripGeo, rand, rr, glowMat, onNight, floors, colliders, updaters, FONT, QUALITY, lin } from './core.js';
import { ROAD_LINES, BRIDGES, riverHalfW, riverDist, WATER_Y, shoreX } from './layout.js';
import { env } from './env.js';

/* =====================================================================
   GRAPH
   ===================================================================== */
export const NODES = [], EDGES = [];
const byKey = new Map();
const nk = (x, z) => `${Math.round(x)},${Math.round(z)}`;
function gNode(x, z) { const k = nk(x, z); let n = byKey.get(k); if (!n) { n = { id: NODES.length, x, z, edges: [], w: 0 }; NODES.push(n); byKey.set(k, n); } return n; }
function gEdge(a, b, w, kind, name) {
  if (a === b || a.edges.some(ei => EDGES[ei].a === b.id || EDGES[ei].b === b.id)) return;
  const e = { id: EDGES.length, a: a.id, b: b.id, w, kind, name, len: Math.hypot(b.x - a.x, b.z - a.z) };
  EDGES.push(e); a.edges.push(e.id); b.edges.push(e.id); a.w = Math.max(a.w, w); b.w = Math.max(b.w, w);
}
{
  const lines = ROAD_LINES.map(([x0, z0, x1, z1, w, kind, name]) => ({ x0, z0, x1, z1, w, kind, name, v: x0 === x1, ts: [0, 1] }));
  for (const L of lines) for (const K of lines) {
    if (L === K || L.v === K.v) continue;
    const V = L.v ? L : K, H = L.v ? K : L, x = V.x0, z = H.z0;
    if (x < Math.min(H.x0, H.x1) - 0.01 || x > Math.max(H.x0, H.x1) + 0.01 || z < Math.min(V.z0, V.z1) - 0.01 || z > Math.max(V.z0, V.z1) + 0.01) continue;
    L.ts.push(L.v ? (z - L.z0) / (L.z1 - L.z0) : (x - L.x0) / (L.x1 - L.x0));
  }
  for (const L of lines) {
    const ts = [...new Set(L.ts.map(t => Math.round(t * 1e5) / 1e5))].sort((a, b) => a - b); let prev = null;
    for (const t of ts) { const n = gNode(L.x0 + (L.x1 - L.x0) * t, L.z0 + (L.z1 - L.z0) * t); if (prev) gEdge(prev, n, L.w, L.kind, L.name); prev = n; }
  }
  for (const n of NODES) { n.deg = n.edges.length; n.exit = n.deg === 1 && (Math.abs(n.z) > 1000 || Math.abs(n.x) > 1000); n.dead = n.deg === 1 && !n.exit; }
}
export const EXITS = NODES.filter(n => n.exit);
export const otherEnd = (e, id) => e.a === id ? e.b : e.a;
export function edgeBetween(a, b) { for (const ei of NODES[a].edges) { const e = EDGES[ei]; if (otherEnd(e, a) === b) return e; } return null; }
export function nearestNode(x, z, filter) { let best = null, bd = Infinity; for (const n of NODES) { if (filter && !filter(n)) continue; const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n; } } return best; }
export function route(from, to) {
  const n = NODES.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n); dist[from] = 0;
  for (;;) {
    let u = -1, b = Infinity; for (let i = 0; i < n; i++) if (!done[i] && dist[i] < b) { b = dist[i]; u = i; }
    if (u < 0 || u === to) break; done[u] = 1;
    for (const ei of NODES[u].edges) { const e = EDGES[ei], v = otherEnd(e, u), w = e.len * (e.kind === 'highway' ? 0.7 : e.kind === 'drive' ? 3 : 1); if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; } }
  }
  if (!isFinite(dist[to])) return null; const p = []; for (let v = to; v !== -1; v = prev[v]) p.unshift(v); return p;
}
/** distance from a point to the nearest road centreline, and that road */
export function nearestRoad(x, z) {
  let best = Infinity, be = null;
  for (const e of EDGES) { const A = NODES[e.a], B = NODES[e.b]; const d = segDist(x, z, A.x, A.z, B.x, B.z) - e.w / 2; if (d < best) { best = d; be = e; } }
  return { d: best, e: be };
}
export function segDist(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; let t = ((px - ax) * dx + (pz - az) * dz) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - ax - dx * t, pz - az - dz * t); }
export const trimAt = n => n.deg >= 2 ? n.w / 2 : 0;

/* =====================================================================
   ASPHALT
   ===================================================================== */
function roadTex(kind) {
  const W = 512, H = 128, b = makeCanvas(W, H), g = b.ctx;
  g.fillStyle = '#2b2d33'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) { const v = 30 + rand() * 40; g.fillStyle = `rgba(${v},${v},${v + 4},0.5)`; g.fillRect(rand() * W, rand() * H, 2, 2); }
  for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(rand() * W, 30 + rand() * 60, 40 + rand() * 120, 6 + rand() * 12); }
  g.fillStyle = '#d8d8d0'; g.fillRect(0, 6, W, 3); g.fillRect(0, H - 9, W, 3);
  if (kind === 'highway') { g.fillStyle = '#e8c04a'; g.fillRect(0, 60, W, 3); g.fillRect(0, 66, W, 3); g.fillStyle = '#d8d8d0'; for (let x = 0; x < W; x += 128) { g.fillRect(x, 34, 64, 3); g.fillRect(x, 92, 64, 3); } }
  else if (kind === 'main') { g.fillStyle = '#e8c04a'; g.fillRect(0, 60, W, 3); g.fillRect(0, 66, W, 3); }
  else if (kind !== 'drive') { g.fillStyle = '#e8c04a'; for (let x = 0; x < W; x += 128) g.fillRect(x, 62, 70, 4); }
  b.tex.wrapS = THREE.RepeatWrapping; b.tex.wrapT = THREE.ClampToEdgeWrapping;
  return new THREE.MeshStandardMaterial({ map: b.tex, roughness: 0.88, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}
export const roadMats = { main: roadTex('main'), street: roadTex('street'), highway: roadTex('highway'), drive: roadTex('drive') };
updaters.push(() => { for (const m of Object.values(roadMats)) { m.roughness = 0.88 - env.rain * 0.6; m.metalness = 0.05 + env.rain * 0.3; } });
const junctionMat = new THREE.MeshStandardMaterial({ color: 0x2a2c32, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
updaters.push(() => { junctionMat.roughness = 0.9 - env.rain * 0.6; });
const crossTex = (() => { const c = makeCanvas(128, 128), g = c.ctx; g.clearRect(0, 0, 128, 128); g.fillStyle = 'rgba(235,235,225,0.92)'; for (let x = 6; x < 128; x += 21) g.fillRect(x, 0, 11, 128); c.tex.colorSpace = THREE.SRGBColorSpace; return c.tex; })();
const crossMat = new THREE.MeshStandardMaterial({ map: crossTex, transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5, depthWrite: false });
{
  const by = { main: [], street: [], highway: [], drive: [] }, junc = [], cross = [];
  for (const e of EDGES) {
    const A = NODES[e.a], B = NODES[e.b], ux = (B.x - A.x) / e.len, uz = (B.z - A.z) / e.len;
    const ta = trimAt(A), tb = trimAt(B), L = e.len - ta - tb; if (L < 0.5) continue;
    const a = new V3(A.x + ux * ta, 0, A.z + uz * ta), b = new V3(B.x - ux * tb, 0, B.z - uz * tb);
    by[e.kind].push(stripGeo((t, v) => v.set(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t), Math.max(2, Math.ceil(L / 30)), e.w, 1 / 16, 0.04));
    // crosswalks at junction ends (town only)
    if (e.kind !== 'highway') for (const [n, s] of [[A, 1], [B, -1]]) {
      if (n.deg < 3) continue; const cx = n.x + ux * s * (n.w / 2 + 2), cz = n.z + uz * s * (n.w / 2 + 2);
      const pl = new THREE.PlaneGeometry(e.w - 1, 3.4).rotateX(-Math.PI / 2); if (Math.abs(ux) > 0.5) pl.rotateY(Math.PI / 2); pl.translate(cx, 0.07, cz); cross.push(pl);
    }
  }
  for (const n of NODES) if (n.deg >= 2) { const p = new THREE.PlaneGeometry(n.w, n.w).rotateX(-Math.PI / 2); p.translate(n.x, 0.045, n.z); junc.push(p); }
  for (const [k, list] of Object.entries(by)) if (list.length) { const m = new THREE.Mesh(merge(list, true), roadMats[k]); m.receiveShadow = true; scene.add(m); }
  const jm = new THREE.Mesh(merge(junc), junctionMat); jm.receiveShadow = true; scene.add(jm);
  if (cross.length) { const cm = new THREE.Mesh(merge(cross, true), crossMat); cm.renderOrder = 1; scene.add(cm); }
}

/* =====================================================================
   BLOCKS — raised paved sidewalks / lots between streets
   ===================================================================== */
export const XL = [-200, -80, 40, 160, 250], ZL = [-420, -285, -150, 0, 150, 300, 420];
const roadW = { x: { '-200': 14, '-80': 12, '40': 16, '160': 12, '250': 12 }, z: { '-420': 12, '-285': 12, '-150': 16, '0': 16, '150': 14, '300': 12, '420': 12 } };
export const BLOCKS = [];
const paveTex = (() => { const c = makeCanvas(256, 256), g = c.ctx; g.fillStyle = '#9b958a'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) for (let x = 0; x < 256; x += 32) { const v = 140 + rand() * 30; g.fillStyle = `rgb(${v},${v - 4},${v - 12})`; g.fillRect(x + 1, y + 1, 30, 30); }
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${rand() * 0.12})`; g.fillRect(rand() * 256, rand() * 256, 2, 2); }
  c.tex.wrapS = c.tex.wrapT = THREE.RepeatWrapping; return c.tex; })();
export const sidewalkMat = new THREE.MeshStandardMaterial({ map: paveTex, roughness: 0.9, metalness: 0.02 });
updaters.push(() => { sidewalkMat.roughness = 0.9 - env.rain * 0.55; });
const curbMat = new THREE.MeshStandardMaterial({ color: 0xb8b2a6, roughness: 0.8 });
export const CURB = 0.14;
{
  const geos = [], curbs = [];
  for (let i = 0; i < XL.length - 1; i++) for (let j = 0; j < ZL.length - 1; j++) {
    const x0 = XL[i] + roadW.x[XL[i]] / 2, x1 = XL[i + 1] - roadW.x[XL[i + 1]] / 2, z0 = ZL[j] + roadW.z[ZL[j]] / 2, z1 = ZL[j + 1] - roadW.z[ZL[j + 1]] / 2;
    const blk = { i, j, x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 }; BLOCKS.push(blk);
    if (j === 0) { blk.open = true; continue; }   // North Expansion: open land
    const g = new THREE.BoxGeometry(blk.w, CURB, blk.d); g.translate(blk.cx, CURB / 2, blk.cz);
    const uv = g.attributes.uv, p = g.attributes.position; for (let k = 0; k < uv.count; k++) uv.setXY(k, p.getX(k) / 4, p.getZ(k) / 4);
    geos.push(g); floors.push({ x0, x1, z0, z1, y: CURB });
  }
  // Court Street gap under the Hotspot superblock
  { const g = new THREE.BoxGeometry(14, CURB, 134); g.translate(-80, CURB / 2, -75); const uv = g.attributes.uv, p = g.attributes.position; for (let k = 0; k < uv.count; k++) uv.setXY(k, p.getX(k) / 4, p.getZ(k) / 4); geos.push(g); floors.push({ x0: -87, x1: -73, z0: -142, z1: -8, y: CURB }); }
  // waterfront promenade (west of Lakeshore Drive) & riverside lots east of Riverside Drive
  const extra = [];
  for (let j = 0; j < ZL.length - 1; j++) {
    const z0 = ZL[j] + roadW.z[ZL[j]] / 2, z1 = ZL[j + 1] - roadW.z[ZL[j + 1]] / 2;
    extra.push({ x0: -322, x1: -207, z0: j === 0 ? -440 : z0, z1, west: true });
  }
  for (const e of extra) {
    // west promenade lots: the sea wall & boardwalk are built in waterfront.js; here only the lot pavement between road & lawn
    const g = new THREE.BoxGeometry(e.x1 - e.x0, CURB, e.z1 - e.z0); g.translate((e.x0 + e.x1) / 2, CURB / 2, (e.z0 + e.z1) / 2);
    const uv = g.attributes.uv, p = g.attributes.position; for (let k = 0; k < uv.count; k++) uv.setXY(k, p.getX(k) / 4, p.getZ(k) / 4);
    geos.push(g); floors.push({ x0: e.x0, x1: e.x1, z0: e.z0, z1: e.z1, y: CURB });
  }
  for (let j = 0; j < 5; j++) { // river lots east of Riverside Drive, clipped by the river later via lawns
    const z0 = ZL[j] + roadW.z[ZL[j]] / 2, z1 = ZL[j + 1] - roadW.z[ZL[j + 1]] / 2;
    const x0 = 256, x1 = j >= 4 ? 300 : 316;
    const g = new THREE.BoxGeometry(x1 - x0, CURB, z1 - z0); g.translate((x0 + x1) / 2, CURB / 2, (z0 + z1) / 2);
    const uv = g.attributes.uv, p = g.attributes.position; for (let k = 0; k < uv.count; k++) uv.setXY(k, p.getX(k) / 4, p.getZ(k) / 4);
    geos.push(g); floors.push({ x0, x1, z0, z1, y: CURB });
  }
  const m = new THREE.Mesh(merge(geos, true), sidewalkMat); m.receiveShadow = true; scene.add(m);
}

/* =====================================================================
   BRIDGES over the Saranac
   ===================================================================== */
const bridgeStone = new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 0.85 });
const bridgeRail = new THREE.MeshStandardMaterial({ color: 0x2f3a46, roughness: 0.4, metalness: 0.8 });
export const bridgeLamps = [];
for (const br of BRIDGES) {
  const L = br.x1 - br.x0, cx = (br.x0 + br.x1) / 2, W = br.w + 7;
  const g = []; const rails = [];
  g.push(new THREE.BoxGeometry(L, 1.3, W).translate(cx, -0.62, br.z));                 // deck
  for (const s of [-1, 1]) {
    g.push(new THREE.BoxGeometry(L, 0.25, 3).translate(cx, 0.12, br.z + s * (br.w / 2 + 1.6))); // walkway
    rails.push(new THREE.BoxGeometry(L, 0.1, 0.12).translate(cx, 1.15, br.z + s * (W / 2 - 0.15)));
    rails.push(new THREE.BoxGeometry(L, 0.08, 0.08).translate(cx, 0.6, br.z + s * (W / 2 - 0.15)));
    for (let x = br.x0; x <= br.x1; x += 2.2) rails.push(new THREE.BoxGeometry(0.08, 1.1, 0.08).translate(x, 0.6, br.z + s * (W / 2 - 0.15)));
  }
  // piers + arches below the deck
  const nP = Math.max(2, Math.round(L / 22));
  for (let k = 1; k < nP; k++) { const x = br.x0 + L * k / nP; g.push(new THREE.BoxGeometry(3, 8, W - 1).translate(x, -4.6, br.z)); }
  for (let k = 0; k < nP; k++) {
    const xa = br.x0 + L * k / nP, xb = br.x0 + L * (k + 1) / nP, span = xb - xa;
    const tor = new THREE.TorusGeometry(span / 2, 0.55, 6, 24, Math.PI); tor.scale(1, 0.35, 1);
    for (const s of [-1, 1]) g.push(tor.clone().translate((xa + xb) / 2, -1.25 - span * 0.175, br.z + s * (W / 2 - 0.4)));
  }
  const bm = new THREE.Mesh(merge(g), bridgeStone); bm.castShadow = bm.receiveShadow = true; scene.add(bm);
  scene.add(new THREE.Mesh(merge(rails), bridgeRail));
  for (let x = br.x0 + 4; x < br.x1; x += 14) for (const s of [-1, 1]) bridgeLamps.push(new V3(x, 0, br.z + s * (W / 2 - 0.4)));
  floors.push({ x0: br.x0, x1: br.x1, z0: br.z - W / 2, z1: br.z + W / 2, y: 0.05, bridge: true });
  for (const s of [-1, 1]) colliders.push({ x: cx, z: br.z + s * (W / 2), hw: L / 2, hd: 0.25, y0: -2, y1: 1.3 });
  colliders.push({ x: cx, z: br.z, hw: L / 2, hd: W / 2, y0: -4, y1: -0.3, boat: true });
  // asphalt across the gap is part of the road strip; add a deck-underside shadow strip on the water
}

/* =====================================================================
   STREET LIGHTS (instanced, glow at night) + light pools
   ===================================================================== */
export const lampPts = [];
for (const e of EDGES) {
  if (e.kind === 'drive') continue;
  const A = NODES[e.a], B = NODES[e.b], ux = (B.x - A.x) / e.len, uz = (B.z - A.z) / e.len, rx = -uz, rz = ux;
  const sp = e.kind === 'highway' ? 60 : 30;
  for (let s = trimAt(A) + 6; s < e.len - trimAt(B) - 4; s += sp) {
    const x = A.x + ux * s, z = A.z + uz * s; if (Math.abs(x) > 1400 || Math.abs(z) > 1500) continue;
    if (BRIDGES.some(b => Math.abs(z - b.z) < 12 && x > b.x0 - 2 && x < b.x1 + 2)) continue;
    const o = e.w / 2 + 1.0;
    for (const sd of [-1, 1]) { const px = x + rx * o * sd, pz = z + rz * o * sd; if (riverDist(px, pz) < riverHalfW(pz) + 3 || px < shoreX(pz) + 3) continue; lampPts.push({ p: new V3(px, 0, pz), face: Math.atan2(-rx * sd, -rz * sd) }); }
  }
}
for (const p of bridgeLamps) lampPts.push({ p, face: 0, bridge: true });
export const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
onNight(lampHeadMat, lin(4.2, 3.0, 1.7), 0.12, 1, 'color');
{
  const n = lampPts.length;
  const poleG = merge([new THREE.CylinderGeometry(0.09, 0.14, 7, 6).translate(0, 3.5, 0), new THREE.BoxGeometry(0.08, 0.08, 1.6).translate(0, 6.9, 0.75), new THREE.CylinderGeometry(0.3, 0.3, 0.25, 8).translate(0, 0.12, 0)]);
  const headG = new THREE.BoxGeometry(0.42, 0.14, 0.75).translate(0, 6.82, 1.45);
  const poolG = new THREE.CircleGeometry(5.2, 24).rotateX(-Math.PI / 2).translate(0, 0.2, 1.6);
  const pc = makeCanvas(128, 128), g = pc.ctx, gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.4, '#5a5a5a'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); pc.tex.colorSpace = THREE.NoColorSpace;
  const poolMat = new THREE.MeshBasicMaterial({ color: 0x000000, map: pc.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 });
  onNight(poolMat, lin(0.34, 0.24, 0.12), 0, 1, 'color');
  const poles = new THREE.InstancedMesh(poleG, new THREE.MeshStandardMaterial({ color: 0x1d2128, roughness: 0.5, metalness: 0.7 }), n);
  const heads = new THREE.InstancedMesh(headG, lampHeadMat, n), pools = new THREE.InstancedMesh(poolG, poolMat, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new V3(1, 1, 1);
  lampPts.forEach((L, i) => { q.setFromAxisAngle(new V3(0, 1, 0), L.face); m.compose(new V3(L.p.x, L.bridge ? 0.1 : 0, L.p.z), q, one); poles.setMatrixAt(i, m); heads.setMatrixAt(i, m); pools.setMatrixAt(i, m); });
  poles.castShadow = true; scene.add(poles, heads, pools);
  for (const L of lampPts) colliders.push({ x: L.p.x, z: L.p.z, r: 0.25, y0: 0, y1: 7, small: true });
}

/* =====================================================================
   TRAFFIC SIGNALS at main crossings (cycle N/S ↔ E/W)
   ===================================================================== */
export const signals = [];
{
  const red = new THREE.MeshBasicMaterial({ color: lin(4, 0.2, 0.15) }), green = new THREE.MeshBasicMaterial({ color: lin(0.2, 3.5, 1.2) }), amber = new THREE.MeshBasicMaterial({ color: lin(4, 2.2, 0.2) }), off = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const poleM = new THREE.MeshStandardMaterial({ color: 0x26292e, metalness: 0.6, roughness: 0.4 });
  for (const n of NODES) {
    if (n.deg < 4 || Math.abs(n.x) > 600) continue;
    const sig = { n, phase: rand() * 30, lights: [] };
    for (const [dx, dz, ry, axis] of [[1, 1, 0, 'ns'], [-1, -1, Math.PI, 'ns'], [1, -1, Math.PI / 2, 'ew'], [-1, 1, -Math.PI / 2, 'ew']]) {
      const o = n.w / 2 + 1.4, x = n.x + dx * o, z = n.z + dz * o, g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 4.6, 6).translate(0, 2.3, 0), poleM));
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.2, 0.3).translate(0, 4.2, 0), poleM));
      const bulbs = [-0.36, 0, 0.36].map((y, i) => { const b = new THREE.Mesh(new THREE.CircleGeometry(0.13, 12), off); b.position.set(0, 4.2 + y * -1, 0.16); g.add(b); return b; });
      sig.lights.push({ axis, bulbs });
    }
    signals.push(sig);
  }
  const CYCLE = 26;
  updaters.push((dt, time) => {
    for (const s of signals) {
      const t = (time + s.phase) % CYCLE;
      s.ns = t < 11 ? 'g' : t < 13 ? 'a' : 'r'; s.ew = t < 13 ? 'r' : t < 24 ? 'g' : t < 26 ? 'a' : 'r';
      for (const L of s.lights) { const st = s[L.axis]; L.bulbs[0].material = st === 'r' ? red : off; L.bulbs[1].material = st === 'a' ? amber : off; L.bulbs[2].material = st === 'g' ? green : off; }
    }
  });
}
export function signalAt(nodeId) { return signals.find(s => s.n.id === nodeId); }

/* =====================================================================
   STREET NAME SIGNS at junctions
   ===================================================================== */
{
  const done = new Set();
  for (const n of NODES) {
    if (n.deg < 3 || Math.abs(n.x) > 700 || Math.abs(n.z) > 700) continue;
    const names = [...new Set(n.edges.map(ei => EDGES[ei].name))].slice(0, 2); if (names.length < 2) continue;
    const key = names.join('|') + n.id; if (done.has(key)) continue; done.add(key);
    const g = new THREE.Group(); g.position.set(n.x - n.w / 2 - 1.6, 0, n.z - n.w / 2 - 1.6); scene.add(g);
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.6, 6).translate(0, 1.8, 0), M.dark));
    names.forEach((nm, i) => {
      const c = makeCanvas(512, 96), x = c.ctx; x.fillStyle = '#145a32'; x.beginPath(); x.roundRect(2, 2, 508, 92, 10); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 4; x.stroke();
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; let s = 54; x.font = FONT(700, s); while (x.measureText(nm).width > 470) { s -= 2; x.font = FONT(700, s); } x.fillText(nm, 256, 50);
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.36), new THREE.MeshStandardMaterial({ map: c.tex, side: THREE.DoubleSide, roughness: 0.6 }));
      pl.position.y = 3.35 + i * 0.4; pl.rotation.y = i ? 0 : Math.PI / 2; g.add(pl);
    });
  }
}
