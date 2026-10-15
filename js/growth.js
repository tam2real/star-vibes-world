// A world that grows: available plots + modular business buildings, persisted in the save.
import { THREE, V3, scene, M, Site, colliders, floors, picks, sites, makeCanvas, FONT, DISPLAY, SCRIPT, neonSign, signMesh, glowMat, merge, boxAt, updaters, rand, nightMats, interactables } from './core.js';
import { PLOTS, DISTRICTS } from './layout.js';
import { CURB } from './roads.js';
import { Kit, screenMesh } from './kit.js';
import { facadeMaterial } from './facade.js';
import { dirty } from './physics.js';
import { env } from './env.js';

/* =====================================================================
   MODULES — reusable building components for new businesses
   ===================================================================== */
const loftMat = facadeMaterial({});
const towerMat = facadeMaterial({ floorH: 3.8, cell: 2.4, fill: [0.06, 0.94, 0.12, 0.9], glassy: 1, roughness: 0.4 });
export const MODULES = {
  studio:  { name: 'Creative Studio', desc: 'Neon-lit production space with sawtooth roof', floors: 2 },
  cafe:    { name: 'Café & Patio', desc: 'Corner café with awning and string-lit patio', floors: 1 },
  gallery: { name: 'Gallery', desc: 'White-cube gallery with a glowing art window', floors: 2 },
  loft:    { name: 'Brick Lofts', desc: 'Four-storey brick lofts with shopfront', floors: 4 },
  venue:   { name: 'Music Venue', desc: 'Domed live room with LED crown', floors: 1 },
  tower:   { name: 'Glass Office', desc: 'Six-storey glass office for a growing company', floors: 6 },
};
const COLORS = ['#ffc65c', '#ff5c8a', '#5fe3ff', '#7cffb2', '#b46bff', '#ff9d3d', '#ff3fd0'];
export { COLORS as BIZ_COLORS };

function buildModule(site, kind, name, color, W, D) {
  const kit = new Kit(site); const col = new THREE.Color(color);
  const sign = (y, z, w = W * 0.8, h = 2.2, font = DISPLAY) => { const s = signMesh(neonSign([{ text: name.toUpperCase(), color: '#ffffff', glow: color, size: 140, font }], { w: 1200, h: 200 }), w, h, 3, 1.2); s.position.set(0, y, z); site.add(s); return s; };
  const shell = (H, mat, glassFront = true) => {
    site.mesh(new THREE.BoxGeometry(W, H, 0.4), mat, 0, CURB + H / 2, -D / 2); site.mesh(new THREE.BoxGeometry(0.4, H, D), mat, -W / 2, CURB + H / 2, 0); site.mesh(new THREE.BoxGeometry(0.4, H, D), mat, W / 2, CURB + H / 2, 0);
    site.collideBox(0, -D / 2, W, 0.4, 0, CURB + H); site.collideBox(-W / 2, 0, 0.4, D, 0, CURB + H); site.collideBox(W / 2, 0, 0.4, D, 0, CURB + H);
    if (glassFront) { const g = new THREE.Mesh(new THREE.PlaneGeometry(W, H - 0.2), M.glass); g.position.set(0, CURB + H / 2, D / 2); g.renderOrder = 3; site.add(g); site.wall(-W / 2, D / 2, W / 2, D / 2, H, CURB, 0.2, null, [{ at: W / 2, w: 3.2, h: 3 }], []); }
    site.mesh(new THREE.BoxGeometry(W + 0.6, 0.5, D + 0.6), M.dark, 0, CURB + H + 0.25, 0);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.6 })); fl.position.y = CURB + 0.03; site.add(fl);
    kit.glowBox(color, 3, 0.9, W + 0.7, 0.1, 0.1, 0, CURB + H + 0.5, D / 2 + 0.3);
  };
  if (kind === 'studio') {
    shell(9, new THREE.MeshStandardMaterial({ color: 0x2a2228, roughness: 0.7 }));
    for (let k = 0; k < 4; k++) { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(D / 4, 0); sh.lineTo(D / 4, 2.6); sh.lineTo(0, 0); const g = new THREE.ExtrudeGeometry(sh, { depth: W, bevelEnabled: false }); g.rotateY(-Math.PI / 2); g.translate(W / 2, CURB + 9.5, -D / 2 + k * D / 4); site.mesh(g, M.dark); kit.glowBox(color, 1.6, 0.2, W - 0.4, 2.4, 0.06, 0, CURB + 9.5, -D / 2 + (k + 1) * D / 4 - 0.05); }
    sign(CURB + 7.2, D / 2 + 0.3); kit.camera(-3, CURB, 0, Math.PI); kit.softbox(3, CURB, -2, Math.PI); kit.sofa(0, CURB, -D / 2 + 3, 0, '#3a2a4a', 3); kit.desk(-W / 2 + 3, CURB, -D / 2 + 4, Math.PI / 2, color);
  } else if (kind === 'cafe') {
    shell(5.2, new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.8 }));
    kit.box(W * 0.9, 0.12, 2.2, 0, CURB + 3.9, D / 2 + 1.1, color); sign(CURB + 4.6, D / 2 + 2.25, W * 0.7, 1.5, SCRIPT);
    kit.bar(0, CURB, -D / 2 + 3, W * 0.6, 0, '#3a2a1a', '#5a3a2a', color);
    for (let k = 0; k < 4; k++) kit.roundTable(-W / 2 + 3 + k * (W - 6) / 3, CURB, 1, 0.5, '#efe9df');
    for (let k = 0; k < 4; k++) kit.umbrellaTable(-W / 2 + 3 + k * (W - 6) / 3, CURB, D / 2 + 5, color);
    for (let k = 0; k < 3; k++) kit.stringLights(-W / 2, CURB + 3.6, D / 2 + 2, W / 2, CURB + 3.6, D / 2 + 2 + k * 2.5, 12, 0.6);
  } else if (kind === 'gallery') {
    shell(10, M.white, false);
    site.wall(-W / 2, D / 2, W / 2, D / 2, 10, CURB, 0.4, M.white, [{ at: W / 2, w: 3, h: 3.2 }]);
    const art = screenMesh(W * 0.5, 4.6, (g, w, h, t) => { for (let i = 0; i < 6; i++) { g.fillStyle = `hsl(${(t * 12 + i * 60) % 360},70%,${45 + i * 5}%)`; g.beginPath(); g.arc(w * (0.2 + 0.12 * i) + Math.sin(t * 0.3 + i) * 20, h * 0.5 + Math.cos(t * 0.4 + i) * 30, h * (0.5 - i * 0.06), 0, 7); g.fill(); } }, { px: 400, every: 0.2, k: 1.3 });
    art.position.set(0, CURB + 6, D / 2 + 0.25); site.add(art); sign(CURB + 2.8, D / 2 + 0.3, W * 0.6, 1.4);
    for (let k = 0; k < 4; k++) kit.box(1.4, 1.0, 1.4, -W / 3 + k * W / 4.5, CURB, 0, '#f4f4f4');
  } else if (kind === 'loft') {
    const H = 4.6 + 3.6 * 3; const g = new THREE.BoxGeometry(W, H, D); g.translate(0, CURB + H / 2, 0);
    const c = new THREE.Color(['#8e4a36', '#7a3e2e', '#a7684a'][Math.floor(rand() * 3)]); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    site.mesh(g, loftMat); site.collideBox(0, 0, W, D, 0, CURB + H); kit.box(W + 0.6, 0.6, D + 0.6, 0, CURB + H, 0, '#4a2a22');
    sign(CURB + 5.6, D / 2 + 0.25, W * 0.7, 1.6); kit.box(W * 0.6, 0.12, 1.6, 0, CURB + 4.0, D / 2 + 0.8, color);
  } else if (kind === 'venue') {
    shell(7, new THREE.MeshStandardMaterial({ color: 0x1a1620, roughness: 0.5, metalness: 0.4 }));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(Math.min(W, D) * 0.45, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a2232, metalness: 0.6, roughness: 0.3 })); dome.position.y = CURB + 7.5; site.add(dome);
    const crown = new THREE.Mesh(new THREE.TorusGeometry(Math.min(W, D) * 0.45, 0.15, 6, 64).rotateX(Math.PI / 2), glowMat(color, 4, 1.2)); crown.position.y = CURB + 7.6; site.add(crown);
    sign(CURB + 5.6, D / 2 + 0.3); kit.stage(0, CURB, -D / 2 + 3, W * 0.6, 4, 0.8); kit.speaker(-W * 0.3, CURB + 0.8, -D / 2 + 2, 0); kit.speaker(W * 0.3, CURB + 0.8, -D / 2 + 2, 0);
  } else {
    const H = 4.6 + 3.8 * 5; const g = new THREE.BoxGeometry(W, H, D); g.translate(0, CURB + H / 2, 0); const n = g.attributes.position.count, a = new Float32Array(n * 3).fill(0.55); g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    site.mesh(g, towerMat); site.collideBox(0, 0, W, D, 0, CURB + H);
    kit.glowBox(color, 3, 1, W + 0.4, 0.3, D + 0.4, 0, CURB + H, 0);
    const s = sign(CURB + H + 2.2, 0, W * 0.9, 2.4); s.rotation.y = 0; kit.box(W * 0.9, 0.3, 0.3, 0, CURB + H + 0.3, 0, '#111');
  }
  kit.flush();
}

/* =====================================================================
   PLOT MARKERS
   ===================================================================== */
const plotSign = (p) => { const D = DISTRICTS[p.district]; return neonSign([{ text: 'AVAILABLE PLOT', color: '#e8fbff', glow: D.color, size: 90, font: DISPLAY, y: 0.38 }, { text: `${D.name.toUpperCase()} · PRESS E TO BUILD`, color: D.color, size: 44, font: DISPLAY, y: 0.74 }], { w: 1024, h: 220, bg: 'rgba(6,8,22,0.82)', border: D.color }); };
export const plots = PLOTS.map(p => ({ ...p, biz: null }));
const outlineTex = (() => { const c = makeCanvas(256, 256), g = c.ctx; g.clearRect(0, 0, 256, 256); g.strokeStyle = '#fff'; g.lineWidth = 8; g.setLineDash([22, 14]); g.strokeRect(6, 6, 244, 244); c.tex.colorSpace = THREE.NoColorSpace; return c.tex; })();
for (const p of plots) {
  const D = DISTRICTS[p.district], g = new THREE.Group(); g.position.set(p.x, 0, p.z); scene.add(g); p.marker = g;
  const om = new THREE.MeshBasicMaterial({ map: outlineTex, transparent: true, depthWrite: false, color: new THREE.Color(D.color).multiplyScalar(1.6), polygonOffset: true, polygonOffsetFactor: -6 });
  const o = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d).rotateX(-Math.PI / 2), om); o.position.y = CURB + 0.06; g.add(o);
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(p.w - 1, p.d - 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(D.color).multiplyScalar(0.12), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })); fill.position.y = CURB + 0.05; g.add(fill);
  const s = signMesh(plotSign(p), 9, 1.95, 2.2, 1); s.position.set(0, 4.2, 0); g.add(s); p.signMesh = s;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 6), M.dark); post.position.set(sx * p.w / 2, 0.7, sz * p.d / 2); g.add(post); const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), glowMat(D.color, 4, 1.4)); lamp.position.set(sx * p.w / 2, 1.5, sz * p.d / 2); g.add(lamp); }
  p.it = { x: p.x, y: CURB, z: p.z, r: Math.max(p.w, p.d) / 2 + 2, label: `Build on this plot · ${D.name}`, action: { kind: 'plot', plot: p } };
  interactables.push(p.it);
}
updaters.push((dt, t) => { for (const p of plots) if (p.signMesh && p.marker.visible) p.signMesh.rotation.y = Math.sin(t * 0.3 + p.x) * 0.6; });

/* =====================================================================
   BUILD / REMOVE (animated rise)
   ===================================================================== */
export const businesses = [];
const rising = [];
export function buildBusiness({ plotId, module, name, color }, instant = false) {
  const p = plots.find(q => q.id === plotId); if (!p || p.biz || !MODULES[module]) return null;
  const n0 = { c: colliders.length, f: floors.length, p: picks.length, it: interactables.length, nm: nightMats.length };
  const site = new Site(p.x, p.z, 0);
  const W = Math.min(p.w - 6, module === 'tower' ? 24 : 34), D = Math.min(p.d - 10, module === 'tower' ? 22 : 26);
  buildModule(site, module, name, color, W, D);
  const info = { id: 'biz:' + plotId, name, tagline: MODULES[module].name + ' · ' + DISTRICTS[p.district].name, color, district: p.district, hours: [8, 23], site, custom: true, module, plotId,
    about: [`${name} — a new ${MODULES[module].name.toLowerCase()} in Star Vibes World.`, MODULES[module].desc, 'Built from the modular business kit.'], door: [p.x, p.z + D / 2 + 3], dropoff: [p.x, p.z + D / 2 + 10], floorsInfo: MODULES[module].floors + ' floor(s)',
    lights: 'auto', doors: 'auto', embed: '', visits: 0 };
  info.isOpen = () => env.hour >= 8 && env.hour < 23; info.lightK = () => 1; info.crowdK = () => 1;
  const pm = new THREE.Mesh(new THREE.BoxGeometry(W, 16, D), new THREE.MeshBasicMaterial()); pm.visible = false; pm.position.y = 8; site.add(pm); pm.userData.site = info; picks.push(pm); info.foot = { w: W + 1, d: D + 1, h: 16 };
  sites.push(info);
  const rec = { plotId, module, name, color, site, info, ranges: { c: [n0.c, colliders.length], f: [n0.f, floors.length], p: [n0.p, picks.length] } };
  businesses.push(rec); p.biz = rec; p.marker.visible = false; p.it.label = `${name} · ${MODULES[module].name}`; p.it.action = { kind: 'biz', rec };
  dirty();
  if (!instant) { site.g.scale.set(1, 0.001, 1); rising.push({ g: site.g, t: 0 }); }
  return rec;
}
export function removeBusiness(plotId) {
  const p = plots.find(q => q.id === plotId); if (!p || !p.biz) return; const rec = p.biz;
  for (let i = rec.ranges.c[0]; i < rec.ranges.c[1]; i++) if (colliders[i]) colliders[i].dead = true;
  for (let i = rec.ranges.f[0]; i < rec.ranges.f[1]; i++) if (floors[i]) floors[i].dead = true;
  for (let i = rec.ranges.p[0]; i < rec.ranges.p[1]; i++) if (picks[i]) picks[i].userData.site = null;
  scene.remove(rec.site.g); const si = sites.indexOf(rec.info); if (si >= 0) sites.splice(si, 1);
  businesses.splice(businesses.indexOf(rec), 1); p.biz = null; p.marker.visible = true; p.it.label = `Build on this plot · ${DISTRICTS[p.district].name}`; p.it.action = { kind: 'plot', plot: p };
  dirty();
}
updaters.push((dt) => { for (let i = rising.length - 1; i >= 0; i--) { const r = rising[i]; r.t += dt / 3.2; const k = Math.min(1, r.t), e = 1 - Math.pow(1 - k, 3); r.g.scale.y = Math.max(0.001, e); if (k >= 1) rising.splice(i, 1); } });
