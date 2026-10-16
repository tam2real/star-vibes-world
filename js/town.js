// Downtown fabric: filler buildings, landmarks, parks, waterfront, marina, trees, neighbourhoods, highway.
import { THREE, V3, scene, M, rand, rr, pick, merge, colorize, makeCanvas, colliders, floors, glowMat, onNight, updaters, lin, FONT, QUALITY, neonSign, signMesh, boxAt, smooth } from './core.js';
import { shoreX, riverDist, riverHalfW, terrainHeight, isWater, BRAND_LOTS, PLOTS, WATER_Y, BRIDGES, riverPts } from './layout.js';
import { BLOCKS, CURB, EDGES, NODES, nearestRoad, sidewalkMat } from './roads.js';
import { brickMat, officeMat, houseMat } from './facade.js';
import { env } from './env.js';

/* =====================================================================
   RESERVED AREAS (brands, plots, landmarks) — filler never builds here
   ===================================================================== */
export const RESERVED = [
  [-196, 36, -146, -4],     // Hotspot superblock
  [44, 158, -98, -4],       // K Lovee + plaza
  [44, 158, 4, 112],        // GloStar + plaza
  [252, 320, -146, -4],     // Hotspot Kitchen + patio
  [-330, -204, -146, -4],   // Star Vibes HQ
  [-196, -84, 4, 104],      // Garage & showroom
  [-76, 36, 4, 146],        // Trinity Park
  [-330, -204, 4, 146],     // Bandshell + Ferris wheel
  [-330, -204, 154, 296],   // Marina lot
  [-330, -204, 296, 440],   // SW waterfront
  [-330, -204, -440, -150], // NW waterfront
  [252, 320, 154, 300],     // river SE lots
];
for (const p of PLOTS) RESERVED.push([p.x - p.w / 2 - 2, p.x + p.w / 2 + 2, p.z - p.d / 2 - 2, p.z + p.d / 2 + 2]);
const hitsReserved = (x0, x1, z0, z1) => RESERVED.some(r => x1 > r[0] && x0 < r[1] && z1 > r[2] && z0 < r[3]);

/* =====================================================================
   FILLER BUILDINGS
   ===================================================================== */
const PALETTE = ['#8e4a36', '#9c5a3c', '#7a3e2e', '#b07a54', '#c9b48e', '#d8ccb4', '#8b8478', '#a7684a', '#6e4a3a', '#b9a38a', '#e2dccd', '#5d6670'];
const AWN = ['#1f5f4a', '#7a1f2a', '#1f3f7a', '#c0662a', '#2a2a2a', '#6b2a7a', '#d8b03a'];
export const fillers = [];
const wallGeos = [], officeGeos = [], roofGeos = [], trimGeos = [], awnGeos = [], acGeos = [];
function addFiller(x, z, w, d, floorsN, face, opts = {}) {
  const gH = 4.6, fH = 3.6, H = gH + (floorsN - 1) * fH;
  const col = opts.color || pick(PALETTE), office = opts.office;
  const body = colorize(new THREE.BoxGeometry(w, H, d).translate(x, CURB + H / 2, z), col);
  (office ? officeGeos : wallGeos).push(body);
  roofGeos.push(colorize(new THREE.BoxGeometry(w - 0.3, 0.2, d - 0.3).translate(x, CURB + H + 0.05, z), '#3a3a3e'));
  // parapet + cornice
  const cc = new THREE.Color(col).multiplyScalar(0.72).getStyle();
  trimGeos.push(colorize(new THREE.BoxGeometry(w + 0.5, 0.7, d + 0.5).translate(x, CURB + H + 0.15, z), office ? '#2b3038' : cc));
  if (!office) trimGeos.push(colorize(new THREE.BoxGeometry(w + 0.25, 0.35, d + 0.25).translate(x, CURB + gH, z), '#d8d0c0'));
  // awning on the street face
  if (!office && face) {
    const [fx, fz] = face, aw = colorize(new THREE.BoxGeometry(fx ? 1.6 : w * 0.86, 0.12, fx ? d * 0.86 : 1.6), pick(AWN));
    aw.rotateX(fz ? fz * 0.22 : 0); aw.rotateZ(fx ? -fx * 0.22 : 0);
    aw.translate(x + fx * (w / 2 + 0.8), CURB + gH - 0.9, z + fz * (d / 2 + 0.8)); awnGeos.push(aw);
  }
  // rooftop clutter
  const nAC = Math.floor(rand() * 3);
  for (let k = 0; k < nAC; k++) acGeos.push(colorize(new THREE.BoxGeometry(rr(1.4, 2.6), rr(0.9, 1.6), rr(1.2, 2.2)).translate(x + rr(-w / 3, w / 3), CURB + H + 0.7, z + rr(-d / 3, d / 3)), '#7c8088'));
  if (rand() < 0.12 && !office) { // water tank
    const t = colorize(new THREE.CylinderGeometry(1.4, 1.4, 2.6, 10).translate(x + w * 0.2, CURB + H + 3.4, z), '#6a4a32');
    const legs = colorize(new THREE.CylinderGeometry(0.1, 0.1, 2.2, 4).translate(x + w * 0.2, CURB + H + 1.1, z), '#2a2a2a'); acGeos.push(t, legs);
  }
  colliders.push({ x, z, hw: w / 2, hd: d / 2, y0: 0, y1: CURB + H + 1 });
  fillers.push({ x, z, w, d, h: CURB + H });
}
function fillBlock(b) {
  const core = Math.exp(-((b.cx + 20) ** 2 + (b.cz + 10) ** 2) / (260 * 260));
  const set = 3.2; // sidewalk
  const floorsFor = () => Math.max(2, Math.round(2 + rand() * 2.5 + core * rr(1, 4)));
  // north & south faces
  for (const side of [-1, 1]) {
    let x = b.x0 + set; const zEdge = side < 0 ? b.z0 + set : b.z1 - set;
    while (x < b.x1 - set - 8) {
      const w = Math.min(rr(11, 22), b.x1 - set - x), d = rr(12, Math.min(22, b.d / 2 - 4));
      const cx = x + w / 2, cz = zEdge - side * d / 2;
      if (w > 7 && !hitsReserved(x, x + w, cz - d / 2, cz + d / 2)) addFiller(cx, cz, w - 0.3, d, floorsFor(), [0, side], { office: core > 0.6 && rand() < 0.3 });
      x += w;
    }
  }
  // east & west faces (between the corner buildings)
  for (const side of [-1, 1]) {
    let z = b.z0 + set + 22; const xEdge = side < 0 ? b.x0 + set : b.x1 - set;
    while (z < b.z1 - set - 22 - 6) {
      const d = Math.min(rr(11, 20), b.z1 - set - 22 - z), w = rr(12, Math.min(20, b.w / 2 - 6));
      const cx = xEdge - side * w / 2, cz = z + d / 2;
      if (d > 7 && !hitsReserved(cx - w / 2, cx + w / 2, z, z + d)) addFiller(cx, cz, w, d - 0.3, floorsFor(), [side, 0]);
      z += d;
    }
  }
}
for (const b of BLOCKS) if (!b.open) fillBlock(b);
// riverside lofts (east of Riverside Drive, outside reserved)
for (const [z0, z1] of [[-277, -158], [8, 142]]) for (let z = z0 + 4; z < z1 - 12; z += 22) addFiller(284, z + 9, 24, 18, 3 + Math.floor(rand() * 3), [-1, 0], { color: pick(['#5a3a2e', '#7a4a36', '#3e4248', '#8a5a40']) });
{
  const mk = (list, mat, shadow = true) => { if (!list.length) return null; const m = new THREE.Mesh(merge(list), mat); m.castShadow = shadow; m.receiveShadow = true; scene.add(m); return m; };
  mk(wallGeos, brickMat); mk(officeGeos, officeMat); mk(roofGeos, M.vc, false); mk(trimGeos, M.vc); mk(awnGeos, M.vc); mk(acGeos, M.vc);
}

/* =====================================================================
   LANDMARKS — City Hall dome, church steeples, Macdonough "Eagle" Monument
   ===================================================================== */
const stoneW = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.7 });
const copper = new THREE.MeshStandardMaterial({ color: 0x5fa38a, roughness: 0.5, metalness: 0.5 });
function steeple(x, z, h = 34, rot = 0) {
  const g = new THREE.Group(); g.position.set(x, CURB, z); g.rotation.y = rot; scene.add(g);
  const nave = new THREE.Mesh(new THREE.BoxGeometry(14, 11, 26), stoneW); nave.position.y = 5.5; g.add(nave);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0, 9.6, 6, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 1.9), new THREE.MeshStandardMaterial({ color: 0x3a3e46, roughness: 0.7 })); roof.position.y = 14; g.add(roof);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(6, h * 0.55, 6), stoneW); tower.position.set(0, h * 0.275, 15); g.add(tower);
  const belfry = new THREE.Mesh(new THREE.BoxGeometry(4.6, 5, 4.6), stoneW); belfry.position.set(0, h * 0.55 + 2.5, 15); g.add(belfry);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(2.8, h * 0.45, 8), stoneW); spire.position.set(0, h * 0.55 + 5 + h * 0.225, 15); g.add(spire);
  const clockC = makeCanvas(128, 128), cg = clockC.ctx; cg.fillStyle = '#f4efe4'; cg.beginPath(); cg.arc(64, 64, 60, 0, 7); cg.fill(); cg.strokeStyle = '#222'; cg.lineWidth = 5; cg.stroke();
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; cg.fillStyle = '#222'; cg.fillRect(64 + Math.sin(a) * 48 - 2, 64 - Math.cos(a) * 48 - 2, 4, 4); }
  const clockMat = new THREE.MeshStandardMaterial({ map: clockC.tex, emissiveMap: clockC.tex, emissive: 0x000000 }); onNight(clockMat, new THREE.Color(1, 0.9, 0.7), 0, 0.8);
  const face = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), clockMat); face.position.set(0, h * 0.55 + 2.5, 17.35); g.add(face);
  const hands = new THREE.Group(); hands.position.set(0, h * 0.55 + 2.5, 17.4); g.add(hands);
  const hh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.04).translate(0, 0.45, 0), M.black), mh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 0.04).translate(0, 0.65, 0), M.black); hands.add(hh, mh);
  updaters.push(() => { hh.rotation.z = -(env.hour % 12) / 12 * Math.PI * 2; mh.rotation.z = -(env.hour % 1) * Math.PI * 2; });
  for (const m of [nave, tower, belfry, spire, roof]) { m.castShadow = true; m.receiveShadow = true; }
  colliders.push({ x, z: z + (rot ? 0 : 2), hw: rot ? 15 : 8, hd: rot ? 8 : 16, y0: 0, y1: 40 });
}
steeple(214, -230, 38); steeple(-140, 225, 32);
// City Hall with copper dome
{
  const x = -140, z = -215, g = new THREE.Group(); g.position.set(x, CURB, z); scene.add(g);
  const body = new THREE.Mesh(new THREE.BoxGeometry(46, 14, 28), stoneW); body.position.y = 7; g.add(body);
  const portico = new THREE.Mesh(new THREE.BoxGeometry(20, 1.4, 8), stoneW); portico.position.set(0, 12.8, 17); g.add(portico);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0, 11.5, 4, 3, 1).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).scale(1, 1, 0.75), stoneW); ped.position.set(0, 15.2, 17); g.add(ped);
  for (let k = 0; k < 6; k++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 12, 12), stoneW); c.position.set(-8 + k * 3.2, 6, 20); g.add(c); }
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.5, 6, 24), stoneW); drum.position.y = 17; g.add(drum);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(6.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), copper); dome.position.y = 20; g.add(dome);
  const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 3, 8), stoneW); lan.position.y = 27; g.add(lan);
  const flagP = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6, 6), M.steel); flagP.position.y = 31; g.add(flagP);
  for (const m of [body, portico, drum, dome, ped]) { m.castShadow = true; m.receiveShadow = true; }
  const sc = makeCanvas(1024, 128), sx = sc.ctx; sx.fillStyle = '#e8e2d4'; sx.fillRect(0, 0, 1024, 128); sx.fillStyle = '#4a4436'; sx.font = FONT(700, 64, 'Georgia, serif'); sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillText('CITY HALL', 512, 68);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.6), new THREE.MeshStandardMaterial({ map: sc.tex })); plate.position.set(0, 10.6, 14.02); g.add(plate);
  colliders.push({ x, z, hw: 23, hd: 14, y0: 0, y1: 30 }); colliders.push({ x, z: z + 19, hw: 10, hd: 3, y0: 0, y1: 13 });
}

/* =====================================================================
   TRINITY PARK & the Eagle Monument
   ===================================================================== */
export const parkCenter = new V3(-20, 0, 75);
const lawnMat = new THREE.MeshStandardMaterial({ color: 0x4f7a36, roughness: 1 });
const pathMat = new THREE.MeshStandardMaterial({ color: 0xc4b89c, roughness: 0.95 });
function lawn(x0, x1, z0, z1, y = CURB + 0.02) { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), lawnMat); m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; scene.add(m); return m; }
{
  const { x, z } = BRAND_LOTS.park;
  lawn(-72, 32, 12, 138);
  const paths = [boxAt(4, 0.06, 126, x, CURB + 0.05, z), boxAt(104, 0.06, 4, x, CURB + 0.05, z)];
  const ring = new THREE.RingGeometry(14, 18, 48).rotateX(-Math.PI / 2); ring.translate(x, CURB + 0.06, z); paths.push(ring);
  const pm = new THREE.Mesh(merge(paths), pathMat); pm.receiveShadow = true; scene.add(pm);
  // obelisk monument
  const g = new THREE.Group(); g.position.set(x, CURB, z); scene.add(g);
  const base = new THREE.Mesh(merge([boxAt(9, 1.2, 9, 0, 0.6, 0), boxAt(7, 1.4, 7, 0, 1.9, 0), boxAt(5, 3, 5, 0, 4.1, 0)]), stoneW); g.add(base);
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.9, 26, 4, 1).rotateY(Math.PI / 4), stoneW); sh.position.y = 18.6; g.add(sh);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.42, 2.4, 4).rotateY(Math.PI / 4), stoneW); cap.position.y = 32.8; g.add(cap);
  // eagle (stylised): body + spread wings
  const bronze = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, metalness: 0.8, roughness: 0.35 });
  const eagle = new THREE.Group(); eagle.position.y = 34.6; g.add(eagle);
  eagle.add(new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8).scale(0.8, 0.9, 1.4), bronze));
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.9).translate(s * 1.3, 0, 0), bronze); w.rotation.z = s * 0.45; eagle.add(w); }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), bronze); head.position.set(0, 0.4, 0.55); eagle.add(head);
  for (const m of [base, sh, cap]) { m.castShadow = m.receiveShadow = true; }
  colliders.push({ x, z, hw: 4.5, hd: 4.5, y0: 0, y1: 40 });
  // up-lights on the monument
  const upMat = glowMat('#fff2d0', 2.2, 0.0);
  for (const [dx, dz] of [[4.8, 0], [-4.8, 0], [0, 4.8], [0, -4.8]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.2, 10), upMat); l.position.set(x + dx, CURB + 0.2, z + dz); scene.add(l); }
  // fountains in two quadrants
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x3a7ea8, metalness: 0.6, roughness: 0.1, emissive: 0x000000 }); onNight(waterMat, new THREE.Color(0.1, 0.35, 0.6), 0, 1);
  for (const [fx, fz] of [[-46, 40], [6, 110]]) {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.4, 0.8, 32, 1, true), stoneW); bowl.position.set(fx, CURB + 0.4, fz); scene.add(bowl);
    const wat = new THREE.Mesh(new THREE.CircleGeometry(4.9, 32).rotateX(-Math.PI / 2), waterMat); wat.position.set(fx, CURB + 0.6, fz); scene.add(wat);
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.35, 3.5, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.55, depthWrite: false })); jet.position.set(fx, CURB + 2.3, fz); scene.add(jet);
    updaters.push((dt, t) => { jet.scale.y = 0.85 + Math.sin(t * 2.4 + fx) * 0.15; });
    colliders.push({ x: fx, z: fz, r: 5.4, y0: 0, y1: 1 });
  }
}

/* =====================================================================
   WATERFRONT — boardwalk, sea rail, beach, bandshell, ferris wheel, eateries
   ===================================================================== */
export const BOARDWALK = { z0: -440, z1: 440 };
const deckMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.85 });
{
  const deck = [], rails = [], posts = [];
  const S = 4;
  for (let z = BOARDWALK.z0; z < BOARDWALK.z1; z += S) {
    if (z > 92 && z < 236) continue; // marina section has its own quay
    const xa = shoreX(z), xb = shoreX(z + S), xs = Math.min(xa, xb) + 0.5;
    const x0 = xs, x1 = -322;
    deck.push(boxAt(x1 - x0, 0.3, S + 0.05, (x0 + x1) / 2, CURB - 0.1, z + S / 2));
    floors.push({ x0, x1, z0: z, z1: z + S, y: CURB + 0.05 });
    rails.push(boxAt(0.12, 0.1, S, xs + 0.2, 1.15, z + S / 2), boxAt(0.08, 0.08, S, xs + 0.2, 0.65, z + S / 2), boxAt(0.1, 1.1, 0.1, xs + 0.2, 0.6, z));
    posts.push(boxAt(0.35, 3, 0.35, xs + 0.4, -1.4, z));
    colliders.push({ x: xs + 0.2, z: z + S / 2, hw: 0.3, hd: S / 2, y0: -2, y1: 1.3 });
  }
  const dm = new THREE.Mesh(merge(deck), deckMat); dm.receiveShadow = true; scene.add(dm);
  scene.add(new THREE.Mesh(merge(rails), M.dark)); scene.add(new THREE.Mesh(merge(posts), M.darkWood));
  // promenade lawns
  lawn(-318, -212, -142, -4); lawn(-318, -212, 4, 146); lawn(-318, -212, -146 - 130, -158); lawn(-318, -212, 296, 436); lawn(-318, -212, -440, -293);
  // lamps along the boardwalk
  const lampMat = glowMat('#ffd9a0', 3.2, 0.15), poleG = [], headG = [];
  for (let z = -430; z < 430; z += 22) { if (z > 92 && z < 236) continue; const x = -326; poleG.push(new THREE.CylinderGeometry(0.07, 0.1, 4.2, 6).translate(x, CURB + 2.1, z)); headG.push(new THREE.SphereGeometry(0.32, 10, 8).translate(x, CURB + 4.35, z)); }
  scene.add(new THREE.Mesh(merge(poleG), M.dark)); scene.add(new THREE.Mesh(merge(headG), lampMat));
}
// Bandshell (outdoor venue)
{
  const x = -296, z = 38, g = new THREE.Group(); g.position.set(x, CURB, z); g.rotation.y = Math.PI / 2; scene.add(g);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(11, 32, 16, -Math.PI / 2, Math.PI, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.6, side: THREE.DoubleSide })); shell.rotation.y = Math.PI; shell.scale.set(1, 0.85, 0.8); g.add(shell);
  const stage = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 1.2, 32, 1, false, -Math.PI / 2, Math.PI), M.darkWood); stage.position.y = 0.6; stage.rotation.y = Math.PI; g.add(stage);
  const ribs = []; for (let k = 1; k < 6; k++) { const t = new THREE.TorusGeometry(11 * (1 - k * 0.12), 0.08, 4, 32, Math.PI); t.rotateY(Math.PI / 2); t.rotateX(-Math.PI / 2).rotateX(Math.PI / 2); ribs.push(t); }
  const ribMat = glowMat('#ff7ad8', 3, 0.4);
  for (let k = 0; k < 5; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(10.6 - k * 1.6, 0.09, 4, 40, Math.PI), ribMat); r.scale.set(1, 0.85, 1); r.position.z = -k * 1.3; g.add(r); }
  floors.push({ x0: x - 9, x1: x + 1, z0: z - 10, z1: z + 10, y: CURB + 1.2 });
  colliders.push({ x: x - 8, z, hw: 3, hd: 11, y0: 0, y1: 10 });
  const s = signMesh(neonSign([{ text: 'CHAMPLAIN BANDSHELL', color: '#ff9be6', size: 70 }], { w: 1024, h: 140 }), 14, 1.9, 2.4, 1); s.position.set(0, 10.6, 1.5); g.add(s);
  // lawn seating rows
  const benches = []; for (let r = 0; r < 5; r++) for (let k = -2; k <= 2; k++) benches.push(boxAt(5, 0.5, 0.6, x + 18 + r * 5, CURB + 0.25, z + k * 7));
  scene.add(new THREE.Mesh(merge(benches), M.wood));
}
// Ferris wheel
export const ferris = (() => {
  const x = -282, z = 112, R = 17, g = new THREE.Group(); g.position.set(x, CURB, z); scene.add(g);
  const legs = []; for (const s of [-1, 1]) for (const t of [-1, 1]) { const l = new THREE.CylinderGeometry(0.35, 0.45, R + 4, 8); l.rotateX(t * 0.32); l.translate(0, (R + 4) / 2 - 0.4, t * 3.4); l.translate(s * 1.8, 0, 0); legs.push(l); }
  g.add(new THREE.Mesh(merge(legs), M.steel));
  const wheel = new THREE.Group(); wheel.position.y = R + 3; wheel.rotation.y = Math.PI / 2; g.add(wheel);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.25, 6, 64), M.steel); wheel.add(rim);
  const rim2 = rim.clone(); rim2.scale.setScalar(0.96); wheel.add(rim2);
  const spokes = []; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; const sp = new THREE.BoxGeometry(0.14, R, 0.14).translate(0, R / 2, 0).rotateZ(a); spokes.push(sp); }
  wheel.add(new THREE.Mesh(merge(spokes), M.steel));
  const bulbs = new THREE.Mesh(new THREE.TorusGeometry(R + 0.2, 0.14, 4, 128), glowMat('#ffd27a', 4, 0.5)); wheel.add(bulbs);
  const hub = new THREE.Mesh(new THREE.TorusGeometry(R * 0.3, 0.16, 4, 48), glowMat('#ff4fa3', 4, 0.6)); wheel.add(hub);
  const cabs = []; const cabCols = ['#ff4fa3', '#5fe3ff', '#ffc65c', '#7cffb2', '#b46bff', '#ff7a3d'];
  for (let k = 0; k < 16; k++) {
    const c = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 1.6), new THREE.MeshStandardMaterial({ color: cabCols[k % 6], roughness: 0.4 }));
    m.position.y = -1.0; c.add(m); const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 1.3, 0.5, 4).rotateY(Math.PI / 4), M.white); roof.position.y = 0; c.add(roof);
    wheel.add(c); cabs.push({ c, a: k / 16 * Math.PI * 2 });
  }
  updaters.push((dt, t) => { wheel.rotation.z = -t * 0.06; for (const cb of cabs) { const a = cb.a + wheel.rotation.z; cb.c.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); cb.c.rotation.z = -wheel.rotation.z; } });
  colliders.push({ x, z, hw: 3, hd: 6, y0: 0, y1: 2 * R + 6 });
  return { x, z, R };
})();
// waterfront eateries along the boardwalk (small pavilions with patios)
function pavilion(x, z, name, col, w = 16, d = 11) {
  const g = new THREE.Group(); g.position.set(x, CURB, z); scene.add(g);
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, 4.4, d), new THREE.MeshStandardMaterial({ color: 0xeee6d6, roughness: 0.7 })); body.position.y = 2.2; body.castShadow = body.receiveShadow = true; g.add(body);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0, Math.hypot(w, d) * 0.62, 2.6, 4, 1).rotateY(Math.PI / 4).scale(w / Math.hypot(w, d) * 1.42, 1, d / Math.hypot(w, d) * 1.42), new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 })); roof.position.y = 5.7; roof.castShadow = true; g.add(roof);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, 2.4), glowMat('#ffcf8a', 1.8, 0.35)); win.position.set(0, 2.1, -d / 2 - 0.02); win.rotation.y = Math.PI; g.add(win);
  const win2 = win.clone(); win2.position.set(-w / 2 - 0.02, 2.1, 0); win2.rotation.y = -Math.PI / 2; win2.scale.x = d / w; g.add(win2);
  const s = signMesh(neonSign([{ text: name, color: col, size: 96, font: '"Brush Script MT","Segoe Script",cursive' }], { w: 1024, h: 180 }), w * 0.8, w * 0.14, 2.2, 1); s.position.set(-w / 2 - 0.1, 5.2, 0); s.rotation.y = -Math.PI / 2; g.add(s);
  colliders.push({ x, z, hw: w / 2, hd: d / 2, y0: 0, y1: 8 });
  // patio tables with umbrellas toward the water
  const tab = [], umb = [];
  for (let k = 0; k < 6; k++) { const tx = x - w / 2 - 4 - (k % 2) * 4, tz = z - d / 2 + 2 + Math.floor(k / 2) * 3.6; tab.push(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 12).translate(tx, CURB + 0.75, tz), new THREE.CylinderGeometry(0.05, 0.05, 0.75, 6).translate(tx, CURB + 0.38, tz)); umb.push(new THREE.ConeGeometry(1.4, 0.6, 8).translate(tx, CURB + 2.4, tz), new THREE.CylinderGeometry(0.03, 0.03, 2.2, 4).translate(tx, CURB + 1.2, tz)); }
  scene.add(new THREE.Mesh(merge(tab), M.white)); const um = new THREE.Mesh(merge(umb), new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 })); um.castShadow = true; scene.add(um);
}
pavilion(-292, -196, 'Dock Street Grill', '#4dc8ff');
pavilion(-292, -172, 'Lakeside Scoops', '#ff8fc8', 12, 9);
pavilion(-300, 270, 'Captain\'s Raw Bar', '#ffb45c', 15, 10);

/* =====================================================================
   MARINA — Plattsburgh Boat Basin: quay, piers, slips, breakwater, lighthouses
   ===================================================================== */
export const MARINA = { z0: 92, z1: 236, quayX: null, piers: [], slips: [], dock: null };
{
  const deck = [], piles = [], rail = [];
  // quay deck following the shore
  for (let z = MARINA.z0; z < MARINA.z1; z += 4) {
    const xs = Math.min(shoreX(z), shoreX(z + 4)) - 2;
    deck.push(boxAt(-322 - xs, 0.4, 4.05, (xs - 322) / 2, CURB - 0.05, z + 2)); floors.push({ x0: xs, x1: -322, z0: z, z1: z + 4, y: CURB + 0.1 });
  }
  const quayX = Math.min(...Array.from({ length: 40 }, (_, i) => shoreX(MARINA.z0 + i * 3.6))) - 2; MARINA.quayX = quayX;
  const pierZ = [104, 136, 168, 200, 228];
  pierZ.forEach((pz, pi) => {
    const x0 = shoreX(pz) - 1, len = pi === 4 ? 70 : 110 - pi * 6, x1 = x0 - len;
    deck.push(boxAt(len, 0.35, 3.2, (x0 + x1) / 2, CURB - 0.1, pz)); floors.push({ x0: x1, x1: x0, z0: pz - 1.6, z1: pz + 1.6, y: CURB + 0.08 });
    for (let x = x0; x > x1; x -= 6) { piles.push(boxAt(0.3, 3.2, 0.3, x, -1.4, pz - 1.5), boxAt(0.3, 3.2, 0.3, x, -1.4, pz + 1.5)); }
    MARINA.piers.push({ z: pz, x0, x1 });
    colliders.push({ x: (x0 + x1) / 2, z: pz, hw: len / 2, hd: 1.8, y0: -4, y1: 0.4, boat: true });
    // finger slips
    for (let x = x0 - 10; x > x1 + 6; x -= 11) for (const s of [-1, 1]) {
      if (pi === 4 && s > 0) continue;
      const fz = pz + s * 6.1;
      deck.push(boxAt(1.4, 0.3, 9, x, CURB - 0.12, fz)); floors.push({ x0: x - 0.7, x1: x + 0.7, z0: Math.min(fz - 4.5, fz + 4.5), z1: Math.max(fz - 4.5, fz + 4.5), y: CURB + 0.05 });
      colliders.push({ x, z: fz, hw: 0.9, hd: 4.6, y0: -4, y1: 0.4, boat: true });
      MARINA.slips.push({ x: x + 5.6 * (s > 0 ? 1 : 1) - 0.0, z: fz, pier: pi, side: s, bx: x - 5.4, bz: fz });
    }
  });
  const dm = new THREE.Mesh(merge(deck), deckMat); dm.receiveShadow = true; dm.castShadow = true; scene.add(dm);
  scene.add(new THREE.Mesh(merge(piles), M.darkWood));
  // breakwater with lighthouses
  const rock = new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 1, flatShading: true });
  const bw = []; const bwPts = [];
  for (let k = 0; k <= 40; k++) { const t = k / 40, z = 50 + t * 230, x = -560 + Math.sin(t * Math.PI) * -30; if (t > 0.42 && t < 0.56) continue; bwPts.push([x, z]); }
  for (const [x, z] of bwPts) { const g = new THREE.DodecahedronGeometry(rr(3.2, 4.6), 0); g.scale(1, 0.55, 1.3); g.translate(x + rr(-1, 1), -0.2, z); bw.push(g); }
  const bm = new THREE.Mesh(merge(bw), rock); bm.castShadow = bm.receiveShadow = true; scene.add(bm);
  for (const [x, z] of bwPts) colliders.push({ x, z, r: 4.5, y0: -10, y1: 2, boat: true });
  MARINA.breakwater = bwPts;
  const lhs = [bwPts[0], bwPts[bwPts.length - 1], [-604, 158]];
  for (const [x, z] of lhs.slice(0, 2)) {
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.9, 11, 16), new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.6 })); t.position.y = 5.5; g.add(t);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.6, 2.2, 16), new THREE.MeshStandardMaterial({ color: 0xb02a2a, roughness: 0.6 })); band.position.y = 6.2; g.add(band);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.4, 12), glowMat('#fff2c0', 6, 0.6)); lamp.position.y = 11.8; g.add(lamp);
    const capm = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.4, 12), M.dark); capm.position.y = 13.2; g.add(capm);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(4, 60, 16, 1, true).rotateZ(Math.PI / 2).translate(30, 0, 0), new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 11.8; g.add(beam); onNight(beam.material, new THREE.Color(1, 1, 1), 0, 0.12, 'opacity');
    updaters.push((dt, tm) => { beam.rotation.y = tm * 0.8 + x; });
    t.castShadow = true; colliders.push({ x, z, r: 2.4, y0: -10, y1: 14, boat: true });
  }
  // marina office + fuel dock
  pavilion(-292, 186, 'Boat Basin Marina', '#4dc8ff', 18, 12);
  const fuel = signMesh(neonSign([{ text: 'FUEL · PUMP-OUT · SLIPS', color: '#7cffb2', size: 70 }], { w: 1024, h: 120, bg: 'rgba(5,20,30,0.85)', border: '#7cffb2' }), 8, 0.95, 1.8, 1);
  fuel.position.set(shoreX(228) - 4, 2.4, 230.6); scene.add(fuel);
  // the Star Vibes private dock: last pier
  MARINA.dock = MARINA.piers[4];
  // marina parking lot surface at the end of Marina Way
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(30, 34).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2c2e33, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 })); lot.position.set(-300, CURB + 0.02, 216); scene.add(lot);
}
// moored boats (static, gently bobbing) in most slips
export const mooredBoats = (() => {
  const hullG = (() => { const s = new THREE.Shape(); s.moveTo(0, 4.2); s.quadraticCurveTo(1.4, 2.4, 1.4, 0); s.lineTo(1.3, -3.8); s.lineTo(-1.3, -3.8); s.lineTo(-1.4, 0); s.quadraticCurveTo(-1.4, 2.4, 0, 4.2);
    const g = new THREE.ExtrudeGeometry(s, { depth: 1.1, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.15, bevelSegments: 2 }); g.rotateX(Math.PI / 2); g.translate(0, 0.9, 0); return g; })();
  const cabG = merge([boxAt(2.0, 0.9, 2.6, 0, 1.35, -0.6), boxAt(1.8, 0.08, 2.4, 0, 1.85, -0.4)]);
  const list = MARINA.slips.filter((s, i) => s.pier !== 4 && rand() < 0.78);
  const hull = new THREE.InstancedMesh(hullG, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.1 }), list.length);
  const cab = new THREE.InstancedMesh(cabG, new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.15, metalness: 0.6 }), list.length);
  const cols = ['#f4f4f0', '#f4f4f0', '#e8e4da', '#1b2a44', '#f4f4f0', '#7a1a22'];
  list.forEach((s, i) => { hull.setColorAt(i, new THREE.Color(pick(cols))); });
  scene.add(hull, cab); hull.castShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new V3(), one = new V3(1, 1, 1);
  updaters.push((dt, t) => {
    list.forEach((s, i) => { e.set(Math.sin(t * 1.1 + i) * 0.03, Math.PI / 2 + Math.sin(t * 0.3 + i) * 0.03, Math.sin(t * 0.9 + i * 2) * 0.04); q.setFromEuler(e); p.set(s.bx, WATER_Y - 0.25 + Math.sin(t * 1.3 + i) * 0.08, s.bz); m.compose(p, q, one); hull.setMatrixAt(i, m); cab.setMatrixAt(i, m); });
    hull.instanceMatrix.needsUpdate = cab.instanceMatrix.needsUpdate = true;
  });
  for (const s of list) colliders.push({ x: s.bx, z: s.bz, hw: 4.2, hd: 1.6, y0: -5, y1: 1, boat: true });
  return list;
})();

/* =====================================================================
   RIVERWALK — path & railings along the Saranac's west bank
   ===================================================================== */
{
  const path = [], railG = [];
  for (let i = 0; i < riverPts.length - 1; i += 1) {
    const a = riverPts[i]; if (a.z < -440 || a.z > 340) continue;
    const b = riverPts[i + 1], dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), nx = -dz / L, nz = dx / L;
    const off = riverHalfW(a.z) + 5; // west bank (nx negative side)
    const sgn = nx < 0 ? 1 : -1;
    const px = a.x + nx * off * sgn, pz = a.z + nz * off * sgn;
    if (BRIDGES.some(br => Math.abs(pz - br.z) < 11)) continue;
    const g = new THREE.BoxGeometry(4, 0.1, L + 0.4); g.rotateY(Math.atan2(dx, dz)); g.translate(px, 0.06, pz); path.push(g);
    const rx = a.x + nx * (riverHalfW(a.z) + 2.4) * sgn, rz = a.z + nz * (riverHalfW(a.z) + 2.4) * sgn;
    const r = new THREE.BoxGeometry(0.08, 0.08, L + 0.4); r.rotateY(Math.atan2(dx, dz)); r.translate(rx, 1.05, rz); railG.push(r);
    if (i % 3 === 0) railG.push(boxAt(0.08, 1.05, 0.08, rx, 0.52, rz));
  }
  scene.add(new THREE.Mesh(merge(path), pathMat)); scene.add(new THREE.Mesh(merge(railG), M.dark));
}

/* =====================================================================
   RESIDENTIAL NEIGHBOURHOODS (east bank + north)  — instanced houses
   ===================================================================== */
{
  const spots = [];
  const okSpot = (x, z, r) => !isWater(x, z) && riverDist(x, z) > riverHalfW(z) + 18 && nearestRoad(x, z).d > r + 4 && terrainHeight(x, z) < 6 && terrainHeight(x, z) > -0.2;
  for (let z = -900; z < 560; z += 26) for (let x = 395; x < 900; x += 24) {
    const jx = x + rr(-5, 5), jz = z + rr(-5, 5); if (rand() < 0.18) continue;
    if (Math.abs(jx - 640) < 26) continue;
    if (okSpot(jx, jz, 7)) spots.push([jx, jz, rand() < 0.5 ? 0 : Math.PI / 2]);
  }
  for (let z = -1400; z < -460; z += 30) for (let x = -320; x < 330; x += 28) {
    const jx = x + rr(-6, 6), jz = z + rr(-6, 6); if (rand() < 0.45) continue;
    if (okSpot(jx, jz, 7) && jx > shoreX(jz) + 30) spots.push([jx, jz, rand() < 0.5 ? 0 : Math.PI / 2]);
  }
  const n = spots.length;
  const body = new THREE.InstancedMesh(colorize(new THREE.BoxGeometry(9, 5.5, 8).translate(0, 2.75, 0), '#ffffff'), houseMat, n);
  const roofShape = new THREE.Shape(); roofShape.moveTo(-5.2, 0); roofShape.lineTo(0, 3.6); roofShape.lineTo(5.2, 0); roofShape.lineTo(-5.2, 0);
  const roofG = new THREE.ExtrudeGeometry(roofShape, { depth: 9, bevelEnabled: false }); roofG.translate(0, 5.5, -4.5);
  const roof = new THREE.InstancedMesh(roofG, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), n);
  const HC = ['#e9e4d8', '#c9d3d8', '#d8c8a8', '#b0bcc4', '#f0e8d0', '#a8b8a0', '#d0a890', '#8ea4b8'], RC = ['#3a3e46', '#5a3a2e', '#2e3a4a', '#4a4a44'];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3(), p = new V3();
  spots.forEach(([x, z, r], i) => { const k = rr(0.85, 1.25); q.setFromAxisAngle(new V3(0, 1, 0), r + rr(-0.05, 0.05)); p.set(x, terrainHeight(x, z), z); s.set(k, rr(0.85, 1.2), k); m.compose(p, q, s); body.setMatrixAt(i, m); roof.setMatrixAt(i, m);
    body.setColorAt(i, new THREE.Color(pick(HC))); roof.setColorAt(i, new THREE.Color(pick(RC))); });
  body.castShadow = roof.castShadow = true; body.receiveShadow = true; scene.add(body, roof);
  for (const [x, z] of spots) colliders.push({ x, z, hw: 5.5, hd: 5.5, y0: 0, y1: 9 });
}

/* =====================================================================
   I-87 NORTHWAY — jersey barriers + shield signs
   ===================================================================== */
{
  const bar = []; for (const s of [-1, 1]) bar.push(boxAt(0.6, 0.9, 7200, 640 + s * 11.6, 0.45, 0));
  bar.push(boxAt(0.5, 0.9, 7200, 640, 0.45, 0));
  const bm = new THREE.Mesh(merge(bar), M.concrete); bm.receiveShadow = true; scene.add(bm);
  for (const s of [-1, 1]) colliders.push({ x: 640 + s * 11.6, z: 0, hw: 0.4, hd: 3600, y0: 0, y1: 1 });
  colliders.push({ x: 640, z: 0, hw: 0.3, hd: 3600, y0: 0, y1: 1 });
  const sc = makeCanvas(512, 256), g = sc.ctx; g.fillStyle = '#1d5a2e'; g.beginPath(); g.roundRect(4, 4, 504, 248, 22); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 6; g.stroke();
  g.fillStyle = '#fff'; g.font = FONT(800, 58); g.textAlign = 'center'; g.fillText('Plattsburgh', 256, 92); g.font = FONT(700, 40); g.fillText('EXITS 36 – 37', 256, 150); g.fillText('Downtown · Lake ⟶', 256, 210);
  const sm = new THREE.MeshStandardMaterial({ map: sc.tex, emissiveMap: sc.tex, emissive: 0x000000, side: THREE.DoubleSide }); onNight(sm, new THREE.Color(0.6, 0.6, 0.6), 0, 1);
  for (const z of [-420, 420]) {
    const gtry = new THREE.Group(); gtry.position.set(640, 0, z); scene.add(gtry);
    gtry.add(Object.assign(new THREE.Mesh(boxAt(0.4, 9, 0.4, -13, 4.5, 0), M.steel)), Object.assign(new THREE.Mesh(boxAt(0.4, 9, 0.4, 13, 4.5, 0), M.steel)), new THREE.Mesh(boxAt(26.4, 0.5, 0.5, 0, 8.6, 0), M.steel));
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), sm); pl.position.set(-5, 6.6, z < 0 ? 0.3 : -0.3); if (z > 0) pl.rotation.y = Math.PI; gtry.add(pl);
  }
}

/* =====================================================================
   TREES — street trees, parks, banks, and the forests on the hills
   ===================================================================== */
export const treeSpots = [];
{
  const blocked = (x, z, pad) => {
    if (isWater(x, z) || x < shoreX(z) + 2) return true;
    if (nearestRoad(x, z).d < pad + 1) return true;
    for (const f of fillers) if (Math.abs(x - f.x) < f.w / 2 + pad && Math.abs(z - f.z) < f.d / 2 + pad) return true;
    for (const r of RESERVED.slice(0, 6)) if (x > r[0] && x < r[1] && z > r[2] && z < r[3]) return true;
    return false;
  };
  // street trees along sidewalks
  for (const b of BLOCKS) {
    if (b.open) continue;
    for (const [x0, z0, x1, z1] of [[b.x0 + 1.4, b.z0 + 1.4, b.x1 - 1.4, b.z0 + 1.4], [b.x0 + 1.4, b.z1 - 1.4, b.x1 - 1.4, b.z1 - 1.4], [b.x0 + 1.4, b.z0 + 8, b.x0 + 1.4, b.z1 - 8], [b.x1 - 1.4, b.z0 + 8, b.x1 - 1.4, b.z1 - 8]]) {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / 14);
      for (let k = 1; k < n; k++) { const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n; if (!RESERVED.slice(0, 7).some(r => x > r[0] + 3 && x < r[1] - 3 && z > r[2] + 3 && z < r[3] - 3)) treeSpots.push([x, z, rr(0.75, 1.0), 0]); }
    }
  }
  // park + promenade
  for (let i = 0; i < 70; i++) { const x = rr(-70, 30), z = rr(14, 136); if (Math.hypot(x + 20, z - 75) < 22 || Math.abs(x + 20) < 4 || Math.abs(z - 75) < 4 || Math.hypot(x + 46, z - 40) < 8 || Math.hypot(x - 6, z - 110) < 8) continue; treeSpots.push([x, z, rr(0.9, 1.4), 0]); }
  for (let i = 0; i < 160; i++) { const z = rr(-440, 440), x = rr(-318, -214); if (z > 4 && z < 146 && x < -240) continue; if (z > 150 && z < 296) continue; if (blocked(x, z, 3) || RESERVED.slice(4).some(r => x > r[0] + 8 && x < r[1] && z > r[2] && z < r[3]) && rand() < 0.7) continue; treeSpots.push([x, z, rr(0.8, 1.3), 0]); }
  // riverbanks
  for (let i = 0; i < 420; i++) { const k = Math.floor(rand() * riverPts.length), p = riverPts[k]; if (p.z < -1600 || p.z > 640) continue; const s = rand() < 0.5 ? -1 : 1, off = riverHalfW(p.z) + rr(4, 26); const x = p.x + s * off * (p.z > 400 ? 0.2 : 1), z = p.z + (p.z > 400 ? s * off : rr(-4, 4)); if (blocked(x, z, 2)) continue; if (x > 250 && x < 322 && z > -420 && z < 300) continue; treeSpots.push([x, z, rr(0.9, 1.5), 1]); }
  // forests & hills
  const N = QUALITY.high ? 7000 : 3200; let placed = 0, guard = 0;
  while (placed < N && guard++ < N * 6) {
    const x = rr(-1250, 1250), z = rr(-1440, 1140);
    if (x > -340 && x < 340 && z > -460 && z < 460) continue;
    if (x > 380 && x < 920 && z > -900 && z < 560 && rand() < 0.75) continue;
    const h = terrainHeight(x, z); if (h < -0.3 || blocked(x, z, 4)) continue;
    treeSpots.push([x, z, rr(0.9, 1.7), 2]); placed++;
  }
  // build instanced deciduous + conifers
  const decid = treeSpots.filter(t => t[3] < 2 || rand() < 0.45), conif = treeSpots.filter(t => !decid.includes(t));
  const fol = new THREE.IcosahedronGeometry(1, 1); fol.scale(2.4, 2.8, 2.4); fol.translate(0, 5.0, 0);
  const fol2 = new THREE.IcosahedronGeometry(1, 0); fol2.scale(1.7, 1.8, 1.7); fol2.translate(0.9, 6.6, 0.4);
  const folG = merge([fol, fol2]);
  const trunk = new THREE.CylinderGeometry(0.2, 0.32, 3.2, 6).translate(0, 1.6, 0);
  const cone = merge([new THREE.ConeGeometry(2.4, 5, 7).translate(0, 4.5, 0), new THREE.ConeGeometry(1.8, 4, 7).translate(0, 7.2, 0), new THREE.ConeGeometry(1.1, 3, 7).translate(0, 9.4, 0)]);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
  const mk = (geo, list, mat, colors) => {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3(), p = new V3(), c = new THREE.Color();
    list.forEach(([x, z, k], i) => { p.set(x, Math.max(0, terrainHeight(x, z)) + (Math.abs(x) < 330 && Math.abs(z) < 450 ? CURB : 0), z); q.setFromAxisAngle(new V3(0, 1, 0), rand() * 6.28); s.set(k, k * rr(0.85, 1.2), k); m.compose(p, q, s); im.setMatrixAt(i, m); if (colors) im.setColorAt(i, c.set(pick(colors)).offsetHSL(rr(-0.02, 0.02), 0, rr(-0.05, 0.05))); });
    im.count = list.length; im.castShadow = true; im.receiveShadow = true; scene.add(im); return im;
  };
  const LEAF = ['#3f6b2e', '#4f7a34', '#5a8a3a', '#36602a', '#6b8e3a', '#7a9440', '#a06a2a', '#c0782a'], NEEDLE = ['#2a4a2a', '#22402a', '#335a34', '#1f3a26'];
  const near = t => t[3] < 2, far = t => t[3] === 2;
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 });
  mk(folG, decid.filter(near), leafMat, LEAF); mk(trunk, treeSpots.filter(near), trunkMat); mk(cone, conif.filter(near), leafMat, NEEDLE);
  const folFar = new THREE.IcosahedronGeometry(1, 0); folFar.scale(2.6, 3.2, 2.6); folFar.translate(0, 5.2, 0);
  const coneFar = new THREE.ConeGeometry(2.4, 9, 6).translate(0, 6, 0);
  const fd = mk(folFar, decid.filter(far), leafMat, LEAF), ft = mk(new THREE.CylinderGeometry(0.2, 0.3, 3.2, 4).translate(0, 1.6, 0), treeSpots.filter(far), trunkMat), fc = mk(coneFar, conif.filter(far), leafMat, NEEDLE);
  for (const im of [fd, ft, fc]) im.castShadow = false;
  for (const [x, z, k, t] of treeSpots) if (t < 2) colliders.push({ x, z, r: 0.4 * k, y0: 0, y1: 4, small: true });
}

/* =====================================================================
   PARKING + PARKED CARS along curbs (static, adds density)
   ===================================================================== */
export const curbParking = [];
for (const e of EDGES) {
  if (e.kind !== 'street') continue;
  const A = NODES[e.a], B = NODES[e.b], ux = (B.x - A.x) / e.len, uz = (B.z - A.z) / e.len, rx = -uz, rz = ux;
  for (let s = 22; s < e.len - 22; s += 7.5) {
    if (rand() < 0.55) continue; const sd = rand() < 0.5 ? -1 : 1, o = e.w / 2 - 1.0;
    const x = A.x + ux * s + rx * o * sd, z = A.z + uz * s + rz * o * sd; if (isWater(x, z) || BRIDGES.some(b => Math.abs(z - b.z) < 12 && x > b.x0 - 8 && x < b.x1 + 8)) continue;
    curbParking.push({ x, z, h: Math.atan2(ux, uz) + (sd > 0 ? 0 : Math.PI) });
  }
}
