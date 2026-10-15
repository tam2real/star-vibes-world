// Interior kit: furniture & props built as vertex-coloured parts merged per building (1 draw call),
// plus helpers for animated screens and glowing fixtures.
import { THREE, V3, merge, colorize, makeCanvas, FONT, glowMat, onNight, updaters, npcSpots, rand, rr, pick, M, fitText, nightMats } from './core.js';
import { env } from './env.js';

/** A bucket collects coloured parts in a Site's local space and flushes to one mesh. */
export class Kit {
  constructor(site, gate = null) { this.site = site; this.parts = []; this.glow = new Map(); this.gate = gate; }
  _gm(hex, k, dayK) { const m = glowMat(hex, k, dayK); if (this.gate) nightMats[nightMats.length - 1].gate = this.gate; return m; }
  part(geo, color) { this.parts.push(colorize(geo.index ? geo.toNonIndexed() : geo, color)); return this; }
  box(w, h, d, x, y, z, color, ry = 0) { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y + h / 2, z); return this.part(g, color); }
  cyl(rt, rb, h, x, y, z, color, seg = 12) { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(x, y + h / 2, z); return this.part(g, color); }
  sphere(r, x, y, z, color, sx = 1, sy = 1, sz = 1) { const g = new THREE.SphereGeometry(r, 12, 8); g.scale(sx, sy, sz); g.translate(x, y, z); return this.part(g, color); }
  glowBox(hex, k, dayK, w, h, d, x, y, z, ry = 0) { const key = `${hex}|${k}|${dayK}`; if (!this.glow.has(key)) this.glow.set(key, { mat: this._gm(hex, k, dayK), geos: [] }); const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y + h / 2, z); this.glow.get(key).geos.push(g); return this; }
  glowGeo(hex, k, dayK, geo) { const key = `${hex}|${k}|${dayK}`; if (!this.glow.has(key)) this.glow.set(key, { mat: this._gm(hex, k, dayK), geos: [] }); this.glow.get(key).geos.push(geo); return this; }
  flush() {
    if (this.parts.length) { const m = new THREE.Mesh(merge(this.parts), this.outdoor ? M.vc : M.vcIn); m.castShadow = true; m.receiveShadow = true; this.site.add(m); }
    for (const { mat, geos } of this.glow.values()) this.site.add(new THREE.Mesh(merge(geos), mat));
    this.parts = []; this.glow.clear();
  }
  /* ---------- furniture ---------- */
  sofa(x, y, z, ry, color = '#3a2a4a', w = 2.4) {
    const g = [new THREE.BoxGeometry(w, 0.45, 0.95).translate(0, 0.22, 0), new THREE.BoxGeometry(w, 0.75, 0.25).translate(0, 0.6, -0.38), new THREE.BoxGeometry(0.22, 0.6, 0.95).translate(-w / 2 + 0.11, 0.42, 0), new THREE.BoxGeometry(0.22, 0.6, 0.95).translate(w / 2 - 0.11, 0.42, 0)];
    for (const p of g) { p.rotateY(ry); p.translate(x, y, z); this.part(p, color); } return this;
  }
  chair(x, y, z, ry, color = '#222') {
    const g = [new THREE.BoxGeometry(0.5, 0.08, 0.5).translate(0, 0.46, 0), new THREE.BoxGeometry(0.5, 0.55, 0.07).translate(0, 0.76, -0.22), new THREE.CylinderGeometry(0.04, 0.04, 0.44, 5).translate(0, 0.22, 0)];
    for (const p of g) { p.rotateY(ry); p.translate(x, y, z); this.part(p, color); } return this;
  }
  table(x, y, z, w, d, color = '#6a4a32', h = 0.76) { this.box(w, 0.06, d, x, y + h - 0.06, z, color); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.box(0.06, h - 0.06, 0.06, x + sx * (w / 2 - 0.08), y, z + sz * (d / 2 - 0.08), '#2a2a2a'); return this; }
  roundTable(x, y, z, r, color = '#efe9df', h = 0.76) { this.cyl(r, r, 0.05, x, y + h - 0.05, z, color, 20); this.cyl(0.05, 0.05, h - 0.05, x, y, z, '#2a2a2a', 6); this.cyl(0.32, 0.32, 0.03, x, y, z, '#2a2a2a', 10); return this; }
  desk(x, y, z, ry, screenHex = '#5fe3ff') {
    const P = (dx, dz) => [x + dx * Math.cos(ry) + dz * Math.sin(ry), z - dx * Math.sin(ry) + dz * Math.cos(ry)];
    const g = new THREE.BoxGeometry(1.6, 0.05, 0.8); g.rotateY(ry); g.translate(x, y + 0.74, z); this.part(g, '#e8e4dc');
    for (const [dx, dz] of [[-0.75, -0.35], [0.75, -0.35], [-0.75, 0.35], [0.75, 0.35]]) { const [px, pz] = P(dx, dz); this.box(0.05, 0.72, 0.05, px, y, pz, '#3a3a3a'); }
    const [mx, mz] = P(0, -0.25); const mon = new THREE.BoxGeometry(0.7, 0.42, 0.04); mon.rotateY(ry); mon.translate(mx, y + 1.08, mz); this.part(mon, '#111');
    const scr = new THREE.PlaneGeometry(0.64, 0.36); scr.rotateY(ry); const [sx, sz] = P(0, -0.226); scr.translate(sx, y + 1.08, sz); this.glowGeo(screenHex, 1.6, 0.9, scr);
    const [cx, cz] = P(0, 0.7); this.chair(cx, y, cz, ry + Math.PI, '#1e1e24');
    return this;
  }
  plant(x, y, z, s = 1) { this.cyl(0.28 * s, 0.22 * s, 0.5 * s, x, y, z, '#c8c0b0', 10); this.sphere(0.55 * s, x, y + 0.95 * s, z, '#3f7a3a', 1, 1.3, 1); return this; }
  stage(x, y, z, w, d, h = 0.9, color = '#1a1418') { this.box(w, h, d, x, y, z, color); this.glowBox('#ff4fa3', 2.4, 0.8, w, 0.05, 0.05, x, y + h - 0.05, z + d / 2 + 0.02); return this; }
  speaker(x, y, z, ry, s = 1) { const g = new THREE.BoxGeometry(0.9 * s, 1.6 * s, 0.8 * s); g.rotateY(ry); g.translate(x, y + 0.8 * s, z); this.part(g, '#0e0e10'); for (const k of [0.45, 1.15]) { const c = new THREE.CylinderGeometry(0.26 * s, 0.26 * s, 0.05, 14).rotateX(Math.PI / 2); c.translate(0, 0, 0.41 * s); c.rotateY(ry); c.translate(x, y + k * s, z); this.part(c, '#2a2a30'); } return this; }
  micStand(x, y, z) { this.cyl(0.18, 0.18, 0.03, x, y, z, '#111', 10); this.cyl(0.015, 0.015, 1.5, x, y, z, '#222', 6); this.sphere(0.05, x, y + 1.55, z, '#888', 1, 1.4, 1); return this; }
  guitar(x, y, z, ry, color = '#b0402a') { const g = new THREE.SphereGeometry(0.22, 10, 8); g.scale(1, 1.25, 0.35); g.translate(0, 0.5, 0); const n = new THREE.BoxGeometry(0.06, 0.6, 0.04).translate(0, 1.0, 0); for (const p of [g, n]) { p.rotateZ(0.12); p.rotateY(ry); p.translate(x, y, z); this.part(p, p === g ? color : '#2a1a10'); } return this; }
  keyboard(x, y, z, ry) { const s = new THREE.BoxGeometry(1.3, 0.1, 0.35); s.rotateY(ry); s.translate(x, y + 0.9, z); this.part(s, '#111'); const k = new THREE.BoxGeometry(1.2, 0.02, 0.15); k.translate(0, 0, 0.08); k.rotateY(ry); k.translate(x, y + 0.96, z); this.part(k, '#f2f2f2'); this.box(0.04, 0.85, 0.04, x - 0.4, y, z, '#333'); this.box(0.04, 0.85, 0.04, x + 0.4, y, z, '#333'); return this; }
  drums(x, y, z) { this.cyl(0.32, 0.32, 0.45, x, y, z, '#c03030', 14); this.cyl(0.18, 0.18, 0.2, x - 0.45, y + 0.55, z + 0.2, '#c03030'); this.cyl(0.18, 0.18, 0.2, x + 0.45, y + 0.55, z + 0.2, '#c03030'); this.cyl(0.25, 0.25, 0.3, x + 0.6, y, z - 0.3, '#c03030'); for (const dx of [-0.75, 0.8]) { this.cyl(0.01, 0.01, 1.1, x + dx, y, z - 0.2, '#888', 4); this.cyl(0.32, 0.32, 0.01, x + dx, y + 1.1, z - 0.2, '#d8b040', 16); } return this; }
  camera(x, y, z, ry) {
    for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; const l = new THREE.CylinderGeometry(0.02, 0.02, 1.5, 4); l.rotateZ(0.25); l.rotateY(a); l.translate(x + Math.cos(a) * 0.18, y + 0.72, z + Math.sin(a) * 0.18); this.part(l, '#222'); }
    const b = new THREE.BoxGeometry(0.3, 0.3, 0.55); b.rotateY(ry); b.translate(x, y + 1.6, z); this.part(b, '#151515');
    const lens = new THREE.CylinderGeometry(0.11, 0.13, 0.3, 12).rotateX(Math.PI / 2); lens.translate(0, 0, 0.4); lens.rotateY(ry); lens.translate(x, y + 1.6, z); this.part(lens, '#0a0a0a');
    this.glowBox('#ff2a2a', 4, 2, 0.04, 0.04, 0.04, x, y + 1.78, z); return this;
  }
  softbox(x, y, z, ry) { this.cyl(0.02, 0.02, 2.2, x, y, z, '#222', 4); const b = new THREE.BoxGeometry(0.9, 0.9, 0.3); b.rotateY(ry); b.translate(x, y + 2.4, z); this.part(b, '#111'); const f = new THREE.PlaneGeometry(0.8, 0.8); f.translate(0, 0, 0.16); f.rotateY(ry); f.translate(x, y + 2.4, z); this.glowGeo('#fff6e6', 2.2, 1.6, f); return this; }
  ringLight(x, y, z, ry) { this.cyl(0.02, 0.02, 1.6, x, y, z, '#222', 4); const t = new THREE.TorusGeometry(0.35, 0.04, 6, 24); t.rotateY(ry); t.translate(x, y + 1.8, z); this.glowGeo('#fffaf0', 2.5, 1.8, t); return this; }
  directorChair(x, y, z, ry, back = '#111') { this.chair(x, y, z, ry, '#8a5a36'); const b = new THREE.BoxGeometry(0.5, 0.25, 0.03); b.translate(0, 0.95, -0.24); b.rotateY(ry); b.translate(x, y, z); this.part(b, back); return this; }
  filmReel(x, y, z, ry, r = 0.6) { const t = new THREE.CylinderGeometry(r, r, 0.06, 24).rotateX(Math.PI / 2); t.rotateY(ry); t.translate(x, y, z); this.part(t, '#2a2a2e'); for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; const h = new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.07, 10).rotateX(Math.PI / 2); h.translate(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, 0.01); h.rotateY(ry); h.translate(x, y, z); this.part(h, '#9a9aa0'); } return this; }
  console(x, y, z, ry, w = 2.6) { const b = new THREE.BoxGeometry(w, 0.9, 1.0); b.rotateY(ry); b.translate(x, y + 0.45, z); this.part(b, '#1a1a20'); const top = new THREE.BoxGeometry(w - 0.1, 0.06, 0.9); top.rotateX(-0.25); top.rotateY(ry); top.translate(x, y + 0.95, z); this.part(top, '#2a2a34');
    for (let k = 0; k < 18; k++) { const f = new THREE.BoxGeometry(0.04, 0.03, 0.18); f.translate(-w / 2 + 0.2 + k * (w - 0.4) / 17, 1.0, 0.1 - (k % 3) * 0.12); f.rotateY(ry); f.translate(x, y, z); this.glowGeo(k % 4 ? '#5fe3ff' : '#ff4fa3', 3, 1.5, f); } return this; }
  bar(x, y, z, w, ry, top = '#2a1a12', front = '#3a2a1e', glowHex = '#ffb45c') {
    const b = new THREE.BoxGeometry(w, 1.05, 0.7); b.rotateY(ry); b.translate(x, y + 0.52, z); this.part(b, front);
    const t = new THREE.BoxGeometry(w + 0.1, 0.06, 0.8); t.rotateY(ry); t.translate(x, y + 1.08, z); this.part(t, top);
    const l = new THREE.BoxGeometry(w, 0.04, 0.04); l.translate(0, 0.1, 0.37); l.rotateY(ry); l.translate(x, y, z); this.glowGeo(glowHex, 3, 1, l);
    // back shelf with bottles
    const sx = Math.sin(ry), cz = Math.cos(ry);
    for (let k = 0; k < Math.floor(w / 0.25); k++) { const dx = -w / 2 + 0.15 + k * 0.25; const bx = x + dx * Math.cos(ry) - 1.4 * sx, bz = z - dx * Math.sin(ry) - 1.4 * cz; this.cyl(0.04, 0.05, 0.3, bx, y + 1.5, bz, pick(['#3a7a3a', '#7a3a1a', '#d8c8a0', '#2a3a7a', '#8a1a3a']), 6); }
    const sh = new THREE.BoxGeometry(w, 0.04, 0.3); sh.translate(0, 1.48, -1.4); sh.rotateY(ry); sh.translate(x, y, z); this.part(sh, '#5a3a22');
    return this;
  }
  stool(x, y, z) { this.cyl(0.2, 0.2, 0.06, x, y + 0.72, z, '#222', 10); this.cyl(0.03, 0.03, 0.72, x, y, z, '#888', 5); return this; }
  seatsRow(x, y, z, n, ry, color = '#8a1a2a', step = 0.65) {
    for (let k = 0; k < n; k++) { const dx = (k - (n - 1) / 2) * step; const P = [x + dx * Math.cos(ry), z - dx * Math.sin(ry)];
      const s = new THREE.BoxGeometry(0.55, 0.45, 0.55); s.translate(0, 0.22, 0); s.rotateY(ry); s.translate(P[0], y, P[1]); this.part(s, color);
      const b = new THREE.BoxGeometry(0.55, 0.65, 0.12); b.translate(0, 0.6, -0.27); b.rotateY(ry); b.translate(P[0], y, P[1]); this.part(b, color); }
    return this;
  }
  stove(x, y, z, ry, w = 2.4) {
    const b = new THREE.BoxGeometry(w, 0.9, 0.8); b.rotateY(ry); b.translate(x, y + 0.45, z); this.part(b, '#b8bcc4');
    const hood = new THREE.BoxGeometry(w, 0.5, 0.9); hood.translate(0, 2.2, -0.05); hood.rotateY(ry); hood.translate(x, y, z); this.part(hood, '#9aa0a8');
    for (let k = 0; k < Math.floor(w / 0.6); k++) { const dx = -w / 2 + 0.3 + k * 0.6; const P = [x + dx * Math.cos(ry), z - dx * Math.sin(ry)]; this.cyl(0.14, 0.14, 0.12, P[0], y + 0.9, P[1], '#222', 8); flames.push({ site: this.site, x: P[0], y: y + 1.02, z: P[1] }); }
    return this;
  }
  counter(x, y, z, w, d, ry, color = '#d8d4cc') { const b = new THREE.BoxGeometry(w, 0.9, d); b.rotateY(ry); b.translate(x, y + 0.45, z); return this.part(b, color); }
  shelf(x, y, z, w, ry, items = 6, colors = ['#ff4fa3', '#ffc65c', '#5fe3ff', '#fff']) {
    const b = new THREE.BoxGeometry(w, 2.0, 0.4); b.rotateY(ry); b.translate(x, y + 1, z); this.part(b, '#2a2228');
    for (let r = 0; r < 3; r++) for (let k = 0; k < items; k++) { const dx = -w / 2 + (k + 0.5) * w / items; const it = new THREE.BoxGeometry(w / items * 0.6, 0.35, 0.3); it.translate(dx, 0.35 + r * 0.6, 0.06); it.rotateY(ry); it.translate(x, y, z); this.part(it, pick(colors)); }
    return this;
  }
  tee(x, y, z, ry, color) { // T-shirt on a wall
    const s = new THREE.Shape(); s.moveTo(-0.25, 0); s.lineTo(0.25, 0); s.lineTo(0.25, 0.42); s.lineTo(0.42, 0.34); s.lineTo(0.5, 0.48); s.lineTo(0.22, 0.62); s.lineTo(-0.22, 0.62); s.lineTo(-0.5, 0.48); s.lineTo(-0.42, 0.34); s.lineTo(-0.25, 0.42); s.lineTo(-0.25, 0);
    const g = new THREE.ShapeGeometry(s); g.rotateY(ry); g.translate(x, y, z); return this.part(g, color);
  }
  rail(x, y, z, w, ry, hangers = 8) { const r = new THREE.CylinderGeometry(0.02, 0.02, w, 5).rotateZ(Math.PI / 2); r.rotateY(ry); r.translate(x, y + 1.6, z); this.part(r, '#c8c8cc');
    for (const s of [-1, 1]) { const p = new THREE.BoxGeometry(0.04, 1.6, 0.04); p.translate(s * w / 2, 0.8, 0); p.rotateY(ry); p.translate(x, y, z); this.part(p, '#c8c8cc'); }
    for (let k = 0; k < hangers; k++) { const dx = -w / 2 + 0.2 + k * (w - 0.4) / Math.max(1, hangers - 1); const h = new THREE.BoxGeometry(0.05, 0.75, 0.5); h.translate(dx, 1.18, 0); h.rotateY(ry); h.translate(x, y, z); this.part(h, pick(['#111', '#ff4fa3', '#f2f2f2', '#c8a060', '#3a2a5a'])); }
    return this;
  }
  stringLights(ax, ay, az, bx, by, bz, n = 14, sag = 0.8, hex = '#ffd27a') {
    const pts = []; for (let i = 0; i <= n; i++) { const t = i / n; pts.push(new V3(ax + (bx - ax) * t, ay + (by - ay) * t - Math.sin(t * Math.PI) * sag, az + (bz - az) * t)); }
    const curve = new THREE.CatmullRomCurve3(pts); this.part(new THREE.TubeGeometry(curve, n * 2, 0.012, 3), '#222');
    for (let i = 1; i < n; i++) { const p = pts[i]; const s = new THREE.SphereGeometry(0.085, 6, 4); s.translate(p.x, p.y - 0.06, p.z); this.glowGeo(hex, 5, 0.7, s); }
    return this;
  }
  umbrellaTable(x, y, z, col) { this.roundTable(x, y, z, 0.5, '#efe9df'); this.chair(x + 0.75, y, z, -Math.PI / 2, '#3a3a3a'); this.chair(x - 0.75, y, z, Math.PI / 2, '#3a3a3a'); const c = new THREE.ConeGeometry(1.3, 0.5, 8); c.translate(x, y + 2.3, z); this.part(c, col); this.cyl(0.025, 0.025, 2.1, x, y, z, '#ddd', 4); return this; }
  truss(x, y, z, w, ry) { for (const dy of [0, 0.4]) for (const dz of [-0.2, 0.2]) { const t = new THREE.BoxGeometry(w, 0.05, 0.05); t.translate(0, dy, dz); t.rotateY(ry); t.translate(x, y, z); this.part(t, '#9a9aa2'); } return this; }
}

/* =====================================================================
   ANIMATED SCREENS (canvas textures redrawn at a modest rate)
   ===================================================================== */
export const screens = [];
export function screenMesh(w, h, draw, opts = {}) {
  const px = opts.px || 512, cv = makeCanvas(px, Math.round(px * h / w));
  const mat = new THREE.MeshBasicMaterial({ map: cv.tex, toneMapped: true, side: opts.double ? THREE.DoubleSide : THREE.FrontSide });
  mat.color.setScalar(opts.k ?? 1.25); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const sc = { cv, draw, every: opts.every ?? 1 / 15, t: rand(), mesh: m, site: opts.site, on: true }; screens.push(sc); draw(cv.ctx, cv.c.width, cv.c.height, 0); cv.tex.needsUpdate = true;
  return m;
}
const _camPos = new V3();
export function updateScreens(dt, time, cam) {
  for (const s of screens) {
    s.t -= dt; if (s.t > 0) continue; s.t = s.every;
    s.mesh.getWorldPosition(_camPos); const d = _camPos.distanceTo(cam.position);
    if (d > 260 && s.every < 1) { s.t = 0.8; continue; }
    if (d > 120) s.t = Math.max(s.every, 0.25);
    s.draw(s.cv.ctx, s.cv.c.width, s.cv.c.height, time); s.cv.tex.needsUpdate = true;
  }
}

/* =====================================================================
   FLAMES (kitchen) — flickering additive cones
   ===================================================================== */
export const flames = [];
export function buildFlames() {
  if (!flames.length) return;
  const geo = new THREE.ConeGeometry(0.12, 0.32, 8, 1, true); geo.translate(0, 0.16, 0);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.2, 0.3), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const im = new THREE.InstancedMesh(geo, mat, flames.length); im.frustumCulled = false;
  const m = new THREE.Matrix4(), w = new V3(), q = new THREE.Quaternion(), s = new V3();
  const world = flames.map(f => { f.site.g.updateMatrixWorld(true); return new V3(f.x, f.y, f.z).applyMatrix4(f.site.g.matrixWorld); });
  updaters.push((dt, t) => { world.forEach((p, i) => { const k = 0.7 + 0.5 * Math.abs(Math.sin(t * 13 + i * 2.1)) + 0.2 * Math.sin(t * 31 + i); s.set(1 + 0.2 * Math.sin(t * 17 + i), k, 1); m.compose(p, q, s); im.setMatrixAt(i, m); }); im.instanceMatrix.needsUpdate = true; });
  return im;
}

/* =====================================================================
   Procedural album art (K Lovee) & posters
   ===================================================================== */
export function albumArt(seed, title, sub, palette) {
  const cv = makeCanvas(512, 512), g = cv.ctx, R = (() => { let a = seed * 9301 + 49297; return () => (a = (a * 9301 + 49297) % 233280) / 233280; })();
  const [c1, c2, c3, c4] = palette;
  const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, c1); gr.addColorStop(0.6, c2); gr.addColorStop(1, c3); g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  const style = seed % 4;
  if (style === 0) { // sunset over water + pier silhouette + singer
    const sg = g.createRadialGradient(256, 300, 10, 256, 300, 180); sg.addColorStop(0, '#fff6d0'); sg.addColorStop(0.3, c4); sg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sg; g.fillRect(0, 0, 512, 512);
    g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(256, 300, 70, Math.PI, 0); g.fill();
    g.fillStyle = 'rgba(20,10,30,0.85)'; g.fillRect(0, 300, 512, 212);
    for (let y = 305; y < 512; y += 7) { g.fillStyle = `rgba(255,200,140,${0.5 - (y - 300) / 500})`; const w = 160 - (y - 300) * 0.4; g.fillRect(256 - w / 2 + Math.sin(y) * 10, y, w, 2); }
    g.fillStyle = '#120818'; g.fillRect(150, 330, 220, 10); for (let x = 160; x < 370; x += 30) g.fillRect(x, 340, 6, 60);
    g.beginPath(); g.ellipse(300, 262, 13, 15, 0, 0, 7); g.fill(); g.fillRect(288, 276, 24, 56); g.fillRect(310, 280, 22, 6); g.fillRect(330, 268, 4, 18);
  } else if (style === 1) { // neon chrome star
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,${100 + R() * 120 | 0},${200 + R() * 55 | 0},${R() * 0.5})`; g.beginPath(); g.arc(R() * 512, R() * 512, 4 + R() * 30, 0, 7); g.fill(); }
    g.save(); g.translate(256, 240); g.shadowColor = c4; g.shadowBlur = 40; g.strokeStyle = c4; g.lineWidth = 10; g.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 60 : 150; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.stroke();
    const cg = g.createLinearGradient(-150, -150, 150, 150); cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.5, '#9aa0b8'); cg.addColorStop(1, '#ffffff'); g.fillStyle = cg; g.fill(); g.restore();
  } else if (style === 2) { // vinyl in golden waves
    for (let y = 260; y < 512; y += 10) { g.strokeStyle = `rgba(255,${190 + (y % 40)},90,${0.35 + (y - 260) / 600})`; g.lineWidth = 4; g.beginPath(); for (let x = 0; x <= 512; x += 16) g.lineTo(x, y + Math.sin(x / 40 + y) * 6); g.stroke(); }
    g.fillStyle = '#0b0b0e'; g.beginPath(); g.arc(256, 250, 130, 0, 7); g.fill();
    for (let r = 40; r < 128; r += 6) { g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1; g.beginPath(); g.arc(256, 250, r, 0, 7); g.stroke(); }
    g.fillStyle = c4; g.beginPath(); g.arc(256, 250, 38, 0, 7); g.fill(); g.fillStyle = '#000'; g.beginPath(); g.arc(256, 250, 5, 0, 7); g.fill();
  } else { // portrait silhouette with halo
    const hg = g.createRadialGradient(256, 220, 20, 256, 220, 220); hg.addColorStop(0, c4); hg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = hg; g.fillRect(0, 0, 512, 512);
    g.fillStyle = '#1a0a18'; g.beginPath(); g.ellipse(256, 210, 62, 76, 0, 0, 7); g.fill(); g.beginPath(); g.moveTo(130, 512); g.quadraticCurveTo(140, 330, 256, 300); g.quadraticCurveTo(372, 330, 382, 512); g.fill();
    g.beginPath(); g.ellipse(250, 170, 92, 70, -0.2, Math.PI, 0); g.fill();
  }
  // grain
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(255,255,255,${R() * 0.05})`; g.fillRect(R() * 512, R() * 512, 1, 1); }
  // type
  g.textAlign = 'left'; g.fillStyle = '#fff'; g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 8;
  g.font = FONT(400, 54, '"Brush Script MT","Segoe Script","Snell Roundhand",cursive'); g.fillText('K Lovee', 30, 66);
  fitText(g, title.toUpperCase(), 800, 40, 450); g.fillText(title.toUpperCase(), 30, 470); g.font = FONT(600, 18); g.globalAlpha = 0.8; g.fillText(sub, 32, 494); g.globalAlpha = 1; g.shadowBlur = 0;
  return cv;
}
export const ALBUMS = [
  { title: 'Lakefront Heat', sub: 'NEW SINGLE · OUT NOW', pal: ['#2a0f3a', '#c2306a', '#1a0814', '#ff9a4a'] },
  { title: 'Neon Star', sub: 'THE ALBUM', pal: ['#120420', '#3a0a4a', '#0a0410', '#ff4fd0'] },
  { title: 'Gold Water', sub: 'EP · STAR VIBES MEDIA', pal: ['#f0a0b8', '#b06aa8', '#3a1a4a', '#ffd27a'] },
  { title: 'Real People', sub: 'DELUXE EDITION', pal: ['#0a1a3a', '#2a3a8a', '#060a1a', '#ff7ab8'] },
  { title: 'Champlain Nights', sub: 'LIVE AT THE HOTSPOT', pal: ['#0a0a1a', '#2a1a5a', '#000', '#5fe3ff'] },
  { title: 'Bigger Dreams', sub: 'MIXTAPE VOL. 2', pal: ['#ffb88a', '#ff6a8a', '#5a1a4a', '#fff2c0'] },
];
