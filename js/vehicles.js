// Vehicles: the Star Vibes fleet (cars, boats, flyer), AI traffic, boats on the lake, sky traffic & the blimp.
import { THREE, V3, scene, M, rand, rr, pick, lin, merge, colorize, makeCanvas, FONT, DISPLAY, SCRIPT, updaters, interactables, glowMat, onNight, angDiff, clamp, QUALITY } from './core.js';
import { NODES, EDGES, EXITS, otherEnd, edgeBetween, nearestNode, route, signalAt, nearestRoad } from './roads.js';
import { WATER_Y, terrainHeight, shoreX, isWater } from './layout.js';
import { MARINA, curbParking } from './town.js';
import { BRANDS, GARAGE } from './brands.js';
import { groundAt, collide, navigable, solidTop } from './physics.js';
import { env } from './env.js';

/* =====================================================================
   CATALOG (from the concept board)
   ===================================================================== */
export const CARS = {
  sport:   { code: 'SV-720', name: 'Sports Car', paint: '#1846e0', L: 4.5, W: 2.0, wr: 0.36, wz: 1.42, vmax: 78, acc: 22, grip: 0.62, spec: '0–60 3.2s · 200+ mph · V8 Twin Turbo',
    body: [[-2.25, .3], [2.25, .28], [2.32, .5], [1.2, .78], [-1.4, .92], [-2.25, .86]], cab: [[0.75, .78], [-0.1, 1.16], [-1.0, 1.16], [-1.55, .92]], seatY: 0.62, eye: [0.38, 1.02, -0.25], wing: true },
  suv:     { code: 'SV-X7', name: 'Luxury SUV', paint: '#0b0c10', L: 5.0, W: 2.1, wr: 0.46, wz: 1.6, vmax: 60, acc: 15, grip: 0.55, spec: '0–60 5.5s · 150 mph · V6 Hybrid',
    body: [[-2.5, .45], [2.5, .45], [2.55, 1.08], [1.6, 1.26], [-2.5, 1.32]], cab: [[1.5, 1.26], [0.8, 1.92], [-2.36, 1.96], [-2.46, 1.32]], seatY: 0.95, eye: [0.42, 1.62, 0.1] },
  truck:   { code: 'SV-TR8', name: 'Truck', paint: '#121316', L: 5.7, W: 2.2, wr: 0.52, wz: 1.85, vmax: 54, acc: 13, grip: 0.5, spec: '0–60 6.8s · 120 mph · V8',
    body: [[-2.85, .52], [2.85, .52], [2.9, 1.3], [2.05, 1.48], [0.3, 1.48], [0.3, 1.32], [-2.85, 1.32]], cab: [[2.0, 1.48], [1.3, 2.2], [0.3, 2.2], [0.3, 1.48]], seatY: 1.05, eye: [0.45, 1.85, 0.9], bed: true },
  classic: { code: 'SV-67', name: 'Classic', paint: '#b01822', L: 4.9, W: 2.0, wr: 0.38, wz: 1.55, vmax: 52, acc: 14, grip: 0.5, spec: '0–60 7.1s · 110 mph · V8',
    body: [[-2.45, .34], [2.45, .34], [2.5, .78], [1.0, .86], [0.7, .9], [-2.45, .9]], cab: [[0.6, .9], [0.0, 1.34], [-1.3, 1.34], [-1.85, .9]], seatY: 0.62, eye: [0.4, 1.18, -0.4], chrome: true },
  custom:  { code: 'SV-C1', name: 'Custom Build', paint: '#5a14c8', L: 4.7, W: 2.05, wr: 0.38, wz: 1.5, vmax: 70, acc: 20, grip: 0.6, spec: '0–60 3.8s · 180 mph · Electric',
    body: [[-2.35, .3], [2.35, .26], [2.42, .5], [2.2, .62], [1.15, .82], [-1.5, .98], [-2.3, .92], [-2.38, .6]], cab: [[0.95, .82], [0.0, 1.2], [-0.95, 1.2], [-1.5, .98]], seatY: 0.6, eye: [0.38, 1.06, -0.3], wing: true, glow: '#b46bff' },
};
export const BOATS = {
  sport:   { code: 'SV-300', name: 'Sport Boat', L: 9.2, W: 2.6, vmax: 32, acc: 9, turn: 0.9, spec: '30 ft · 8 people · 600 HP · 70+ mph', color: '#1846e0' },
  yacht:   { code: 'SV-60', name: 'Luxury Yacht', L: 18, W: 5, vmax: 16, acc: 2.6, turn: 0.35, spec: '60 ft · 12 people · Twin 1,200 HP · 30+ mph', color: '#f4f4f2' },
  pontoon: { code: 'SV-P25', name: 'Pontoon', L: 7.6, W: 2.8, vmax: 12, acc: 3.5, turn: 0.6, spec: '25 ft · 12 people · 150 HP · 45 mph', color: '#e8e8e8' },
  jet:     { code: 'SV-JET', name: 'Personal Watercraft', L: 3.4, W: 1.2, vmax: 27, acc: 12, turn: 1.6, spec: '12 ft · 2 people · 300 HP · 60+ mph', color: '#1aa0ff' },
};
export const FLYERS = { skyline: { code: 'SV-SKY', name: 'Skyline VTOL', vmax: 95, spec: 'Ducted-fan hover car · 4 seats · 210 mph' } };
export const PAINTS = [
  ['Midnight', '#0a0b0f', 0.85, 0.22], ['Pearl', '#eef1f4', 0.35, 0.22], ['Star Red', '#b0101c', 0.7, 0.25], ['Vibe Blue', '#1846e0', 0.75, 0.2], ['Royal Purple', '#5a14c8', 0.8, 0.22],
  ['Gold Rush', '#d8a018', 0.8, 0.2], ['Matte Stealth', '#222428', 0.3, 0.8], ['Chrome', '#d4dae2', 1.0, 0.04], ['Hot Pink', '#ff3a8a', 0.6, 0.25], ['Lake Teal', '#118a8a', 0.7, 0.25],
];
export const GLOWS = ['#b46bff', '#5fe3ff', '#ff3fd0', '#ffc65c', '#7cffb2', '#ff4040', 'off'];
export const RIMS = ['#c8ccd4', '#111216', '#d8a018', '#5fe3ff', '#ff3fd0'];

/* =====================================================================
   MODEL BUILDERS
   ===================================================================== */
function extrude(points, width, bevel = true) {
  const s = new THREE.Shape(); points.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y)); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, bevel ? { depth: width - 0.16, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2, curveSegments: 6 } : { depth: width, bevelEnabled: false });
  g.translate(0, 0, bevel ? -(width - 0.16) / 2 : -width / 2); g.rotateY(-Math.PI / 2); return g;
}
const tireMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.85 });
const glassDark = new THREE.MeshPhysicalMaterial({ color: 0x06080e, metalness: 0.9, roughness: 0.06, envMapIntensity: 1.6, transparent: true, opacity: 0.82 });
const interiorMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.7 });
const headMat = new THREE.MeshBasicMaterial({ color: lin(3.4, 3.5, 4) }), tailMat = new THREE.MeshBasicMaterial({ color: lin(4, 0.15, 0.15) });
const GLOW_TEX = (() => { const c = makeCanvas(64, 128), g = c.ctx, gr = g.createRadialGradient(32, 64, 0, 32, 64, 64); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, 64, 128); c.tex.colorSpace = THREE.NoColorSpace; return c.tex; })();
export function buildCar(type, custom = {}) {
  const T = CARS[type], g = new THREE.Group();
  const P = PAINTS.find(p => p[1] === custom.paint) || [null, custom.paint || T.paint, 0.75, 0.22];
  const paint = new THREE.MeshPhysicalMaterial({ color: P[1], metalness: P[2], roughness: P[3], clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.5 });
  const body = new THREE.Mesh(extrude(T.body, T.W), paint); body.castShadow = true; g.add(body);
  g.add(new THREE.Mesh(extrude(T.cab, T.W * 0.84), glassDark));
  const carbon = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.4, metalness: 0.6 });
  if (T.wing) { const w = new THREE.Mesh(new THREE.BoxGeometry(T.W * 1.02, 0.06, 0.5), carbon); w.position.set(0, 1.2, -T.L / 2 + 0.3); g.add(w); for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.18), carbon); p.position.set(s * 0.6, 1.02, -T.L / 2 + 0.35); g.add(p); } }
  if (T.bed) { const bed = new THREE.Mesh(new THREE.BoxGeometry(T.W - 0.3, 0.12, 2.6), interiorMat); bed.position.set(0, 1.25, -1.45); g.add(bed); const rl = new THREE.Mesh(new THREE.BoxGeometry(T.W * 0.9, 0.08, 0.08), M.steel); rl.position.set(0, 2.25, 0.3); g.add(rl); }
  if (T.chrome) { for (const z of [T.L / 2 + 0.02, -T.L / 2 - 0.02]) { const b = new THREE.Mesh(new THREE.BoxGeometry(T.W, 0.14, 0.12), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.05 })); b.position.set(0, 0.45, z); g.add(b); } const st = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, T.L * 0.9), new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.3 })); st.position.set(0.3, T.body[3][1] + 0.01, 0); g.add(st); const st2 = st.clone(); st2.position.x = -0.3; g.add(st2); }
  // lights
  const hb = T.body.reduce((a, p) => p[0] > 2 ? Math.max(a, p[1]) : a, 0.6);
  const head = new THREE.Mesh(new THREE.BoxGeometry(T.W * 0.8, 0.07, 0.05), headMat); head.position.set(0, Math.min(hb - 0.12, 0.9), T.L / 2 + 0.03); g.add(head);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(T.W * 0.9, 0.08, 0.05), tailMat); tail.position.set(0, Math.min(T.body[T.body.length - 1][1] - 0.12, 1.15), -T.L / 2 - 0.04); g.add(tail);
  // underglow + neon accent
  const gc = custom.glow ?? T.glow ?? 'off';
  const glowM = new THREE.MeshBasicMaterial({ color: gc === 'off' ? 0x000000 : new THREE.Color(gc).multiplyScalar(0.9), map: GLOW_TEX, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(T.W * 2, T.L * 1.2).rotateX(-Math.PI / 2), glowM); glow.position.y = 0.06; g.add(glow);
  const neonM = new THREE.MeshBasicMaterial({ color: gc === 'off' ? 0x111111 : new THREE.Color(gc).multiplyScalar(3) });
  for (const s of [-1, 1]) { const n = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, T.L * 0.66), neonM); n.position.set(s * (T.W / 2 + 0.01), T.wr + 0.15, 0.1); g.add(n); }
  // plate
  const pl = makeCanvas(256, 72); { const p = pl.ctx; p.fillStyle = '#f4f4f0'; p.fillRect(0, 0, 256, 72); p.fillStyle = '#1a2a6a'; p.font = FONT(800, 18); p.textAlign = 'center'; p.fillText('NEW YORK', 128, 18); p.font = FONT(900, 40); p.fillText(T.code, 128, 58); }
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.16), new THREE.MeshBasicMaterial({ map: pl.tex })); plate.position.set(0, 0.48, -T.L / 2 - 0.06); plate.rotation.y = Math.PI; g.add(plate);
  // interior (cockpit view)
  for (const sx of [-1, 1]) { const seat = new THREE.Mesh(merge([new THREE.BoxGeometry(0.55, 0.15, 0.55).translate(0, 0, 0), new THREE.BoxGeometry(0.55, 0.7, 0.12).translate(0, 0.38, -0.3)]), interiorMat); seat.position.set(sx * 0.42, T.seatY, T.eye[2] - 0.15); g.add(seat); }
  const dash = new THREE.Mesh(new THREE.BoxGeometry(T.W * 0.8, 0.25, 0.4), interiorMat); dash.position.set(0, T.eye[1] - 0.42, T.eye[2] + 0.85); g.add(dash);
  const dashGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.14), new THREE.MeshBasicMaterial({ color: new THREE.Color(gc === 'off' ? '#5fe3ff' : gc).multiplyScalar(2.2) })); dashGlow.position.set(T.eye[0], T.eye[1] - 0.29, T.eye[2] + 0.64); dashGlow.rotation.x = -0.6; g.add(dashGlow);
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 20), interiorMat); sw.position.set(T.eye[0], T.eye[1] - 0.38, T.eye[2] + 0.5); sw.rotation.x = -0.4; g.add(sw);
  // wheels
  const rimMat = new THREE.MeshStandardMaterial({ color: custom.rim || '#c8ccd4', metalness: 0.95, roughness: 0.18 });
  const wheels = [];
  for (const sz of [1, -1]) for (const sx of [1, -1]) {
    const wg = new THREE.Group(); wg.position.set(sx * (T.W / 2 - 0.12), T.wr, sz * T.wz); g.add(wg);
    const spin = new THREE.Group(); wg.add(spin);
    spin.add(new THREE.Mesh(new THREE.CylinderGeometry(T.wr, T.wr, 0.3, 20).rotateZ(Math.PI / 2), tireMat));
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(T.wr * 0.68, T.wr * 0.68, 0.31, 10).rotateZ(Math.PI / 2), rimMat); spin.add(rim);
    for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.33, T.wr * 1.2, 0.07), new THREE.MeshStandardMaterial({ color: 0x15161a, metalness: 0.5 })); sp.rotation.x = k / 5 * Math.PI; spin.add(sp); }
    wheels.push({ wg, spin, front: sz > 0 });
  }
  return { g, T, paint, glowM, neonM, rimMat, wheels, kind: 'car', type };
}
const hullWhite = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.3, metalness: 0.1 });
function hullGeo(L, W, H, bowK = 0.42) {
  const s = new THREE.Shape(); s.moveTo(0, L / 2); s.quadraticCurveTo(W / 2, L / 2 - L * bowK * 0.4, W / 2, L / 2 - L * bowK); s.lineTo(W / 2 * 0.95, -L / 2); s.lineTo(-W / 2 * 0.95, -L / 2); s.lineTo(-W / 2, L / 2 - L * bowK); s.quadraticCurveTo(-W / 2, L / 2 - L * bowK * 0.4, 0, L / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: H, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.12, bevelSegments: 2, curveSegments: 10 }); g.rotateX(Math.PI / 2); g.translate(0, H, 0);
  // taper the keel
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < H * 0.5) { const k = 0.55 + 0.45 * (y / (H * 0.5)); p.setX(i, p.getX(i) * k); } } g.computeVertexNormals(); return g;
}
export function buildBoat(type, color) {
  const T = BOATS[type], g = new THREE.Group(), col = new THREE.MeshStandardMaterial({ color: color || T.color, roughness: 0.25, metalness: 0.35 });
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  let seat = [0, 1.6, 0];
  if (type === 'sport') {
    add(hullGeo(T.L, T.W, 1.1), col, 0, -0.4, 0);
    add(new THREE.BoxGeometry(T.W * 0.86, 0.1, T.L * 0.55), M.wood, 0, 0.78, -1.2);
    add(new THREE.BoxGeometry(T.W * 0.9, 0.5, 0.08).rotateX(-0.6), glassDark, 0, 1.15, 1.0);
    add(new THREE.BoxGeometry(T.W * 0.8, 0.5, 1.6), new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.7 }), 0, 1.05, -3.2);
    add(new THREE.BoxGeometry(0.7, 0.9, 0.6), M.black, 0, -0.1, -T.L / 2 - 0.1);
    const st = add(new THREE.BoxGeometry(T.W + 0.05, 0.12, T.L * 0.8), new THREE.MeshBasicMaterial({ color: lin(0.3, 1.8, 3.4) }), 0, 0.35, 0); st.scale.x = 1.0;
    seat = [0.5, 1.95, 0.0];
  } else if (type === 'yacht') {
    add(hullGeo(T.L, T.W, 2.0, 0.36), hullWhite, 0, -1.0, 0);
    add(new THREE.BoxGeometry(T.W * 0.95, 0.12, T.L * 0.92), M.wood, 0, 1.05, -0.5);
    add(new THREE.BoxGeometry(T.W * 0.8, 2.2, T.L * 0.5), hullWhite, 0, 2.2, -1.5);
    add(new THREE.BoxGeometry(T.W * 0.82, 0.9, T.L * 0.48), glassDark, 0, 2.3, -1.5);
    add(new THREE.BoxGeometry(T.W * 0.7, 1.6, T.L * 0.3), hullWhite, 0, 4.1, -1.0);
    add(new THREE.BoxGeometry(T.W * 0.72, 0.7, T.L * 0.29), glassDark, 0, 4.2, -1.0);
    add(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 6), M.steel, 0, 6.1, -2);
    add(new THREE.BoxGeometry(T.W * 0.8, 0.08, T.L * 0.36), M.white, 0, 5.0, -1.2);
    const strip = add(new THREE.BoxGeometry(T.W * 0.83, 0.06, T.L * 0.5), glowMat('#5fe3ff', 3, 0.3), 0, 1.15, -1.5);
    seat = [0.8, 5.9, 0.2];
  } else if (type === 'pontoon') {
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.42, 0.42, T.L, 14).rotateX(Math.PI / 2), M.steel, s * 1.0, -0.2, 0);
    add(new THREE.BoxGeometry(T.W, 0.14, T.L), M.wood, 0, 0.38, 0);
    add(new THREE.BoxGeometry(T.W, 0.7, T.L * 0.94).translate(0, 0.35, 0), new THREE.MeshStandardMaterial({ color: 0xd8dce4, roughness: 0.6, transparent: true, opacity: 0.0 }), 0, 0.45, 0);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.08, 0.7, T.L * 0.94), col, s * T.W / 2, 0.8, 0);
    add(new THREE.BoxGeometry(T.W - 0.4, 0.45, 0.6), new THREE.MeshStandardMaterial({ color: 0xe8e0d0 }), 0, 0.7, -3.0); add(new THREE.BoxGeometry(0.6, 0.45, 2.4), new THREE.MeshStandardMaterial({ color: 0xe8e0d0 }), -0.9, 0.7, -1.2);
    add(new THREE.BoxGeometry(T.W * 0.95, 0.06, T.L * 0.5), new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.8 }), 0, 2.6, -0.8);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.03, 0.03, 2.1, 4), M.steel, sx * 1.3, 1.6, -0.8 + sz * 1.8);
    add(new THREE.BoxGeometry(0.7, 1.0, 0.6), M.dark, 0.7, 0.9, 1.6);
    seat = [0.7, 1.85, 1.0];
  } else {
    add(hullGeo(T.L, T.W, 0.7, 0.5), col, 0, -0.35, 0);
    add(new THREE.BoxGeometry(0.5, 0.35, 1.3), M.black, 0, 0.5, -0.2);
    add(new THREE.BoxGeometry(0.9, 0.1, 0.14), M.dark, 0, 0.85, 0.6);
    add(new THREE.BoxGeometry(T.W + 0.04, 0.08, T.L * 0.7), new THREE.MeshBasicMaterial({ color: lin(0.3, 1.8, 3.4) }), 0, 0.25, 0);
    seat = [0, 1.55, -0.6];
  }
  const nav = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshBasicMaterial({ color: lin(0.2, 4, 0.5) })); nav.position.set(T.W / 2, 1.1, T.L * 0.3); g.add(nav);
  const nav2 = nav.clone(); nav2.material = new THREE.MeshBasicMaterial({ color: lin(4, 0.2, 0.2) }); nav2.position.x = -T.W / 2; g.add(nav2);
  return { g, T, kind: 'boat', type, seat, col };
}
export function buildFlyer() {
  const g = new THREE.Group(), paint = new THREE.MeshPhysicalMaterial({ color: 0x10121a, metalness: 0.9, roughness: 0.2, clearcoat: 1 });
  const body = new THREE.Mesh(extrude([[-2.4, .3], [2.5, .4], [2.6, .7], [1.0, 1.2], [-1.6, 1.3], [-2.4, 1.0]], 2.1), paint); body.castShadow = true; g.add(body);
  g.add(new THREE.Mesh(extrude([[1.0, 1.2], [0.2, 1.75], [-1.2, 1.75], [-1.7, 1.3]], 1.7), glassDark));
  const fans = [], fanGlow = glowMat('#5fe3ff', 3.5, 2.5);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const duct = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.16, 8, 24).rotateX(Math.PI / 2), paint); duct.position.set(sx * 1.85, 0.75, sz * 1.6); g.add(duct);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 24).rotateX(Math.PI / 2), fanGlow); ring.position.copy(duct.position); g.add(ring);
    const blade = new THREE.Mesh(merge([new THREE.BoxGeometry(1.2, 0.03, 0.14), new THREE.BoxGeometry(0.14, 0.03, 1.2)]), M.dark); blade.position.copy(duct.position); g.add(blade); fans.push(blade);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.2), paint); arm.position.set(sx * 1.25, 0.72, sz * 1.6); g.add(arm);
  }
  const strip = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.05, 4.2), new THREE.MeshBasicMaterial({ color: lin(0.4, 2.2, 3.6) })); strip.position.y = 0.55; g.add(strip);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.05), headMat); head.position.set(0, 0.62, 2.62); g.add(head);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(5, 6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: lin(0.1, 0.6, 1.2), map: GLOW_TEX, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); glow.position.y = -0.2; g.add(glow);
  return { g, fans, glow, kind: 'fly', type: 'skyline', T: { L: 5, W: 2.2 }, eye: [0, 1.5, -0.2] };
}

/* =====================================================================
   PLAYER VEHICLES (controlled by player.js)
   ===================================================================== */
export const fleet = { car: null, boat: null, fly: null, custom: { paint: null, glow: null, rim: null } };
export class PlayerCar {
  constructor(type, x, z, h, custom = {}) {
    this.type = type; this.custom = { ...custom }; this.m = buildCar(type, this.custom); scene.add(this.m.g);
    this.x = x; this.z = z; this.y = 0; this.h = h; this.speed = 0; this.steer = 0; this.pitch = 0; this.roll = 0; this.vy = 0; this.kind = 'car';
    this.write();
  }
  get T() { return this.m.T; }
  dispose() { scene.remove(this.m.g); }
  rebuild() { const g = this.m.g; scene.remove(g); this.m = buildCar(this.type, this.custom); scene.add(this.m.g); this.write(); }
  update(dt, I, time) {
    const T = this.m.T, K = I;
    const vmax = T.vmax * (K.boost ? 1.0 : 0.62);
    if (K.throttle > 0) this.speed += (this.speed < 0 ? 30 : T.acc * (K.boost ? 1.5 : 1)) * dt * K.throttle;
    else if (K.throttle < 0) this.speed -= (this.speed > 0 ? 28 : 9) * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 4 * dt);
    if (K.brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 40 * dt);
    this.speed = clamp(this.speed, -12, Math.max(vmax, this.speed - 25 * dt));
    const maxSteer = T.grip / (1 + Math.abs(this.speed) / 22);
    this.steer += (K.steer * maxSteer - this.steer) * Math.min(1, dt * 7);
    this.h += this.speed / 2.7 * Math.tan(this.steer) * dt;
    const ox = this.x, oz = this.z;
    let nx = this.x + Math.sin(this.h) * this.speed * dt, nz = this.z + Math.cos(this.h) * this.speed * dt;
    const g = groundAt(nx, nz, this.y + 0.6);
    if (g.water || g.y < this.y - 2.5) { this.speed *= -0.3; nx = ox; nz = oz; }
    this.x = nx; this.z = nz;
    const p = { x: this.x, z: this.z }; const hit = collide(p, T.W * 0.55, this.y + 0.3, this.y + 1.6, 'car');
    if (hit) { this.x = p.x; this.z = p.z; this.speed *= 0.6; if (Math.abs(this.speed) > 8) this.bump = 1; }
    const gy = groundAt(this.x, this.z, this.y + 0.6).y; const ty = gy > -1e8 ? gy : this.y;
    this.y += (ty - this.y) * Math.min(1, dt * 14);
    const acc = (this.speed - (this.ls ?? this.speed)) / Math.max(dt, 1e-3); this.ls = this.speed;
    this.pitch += (clamp(-acc * 0.003, -0.05, 0.05) - this.pitch) * Math.min(1, dt * 5);
    this.roll += (-this.steer * this.speed * 0.006 - this.roll) * Math.min(1, dt * 5);
    for (const w of this.m.wheels) { w.spin.rotation.x += this.speed * dt / T.wr; w.wg.rotation.y = w.front ? this.steer : 0; }
    this.write();
  }
  write() { this.m.g.position.set(this.x, this.y, this.z); this.m.g.rotation.set(this.pitch, this.h, clamp(this.roll, -0.25, 0.25), 'YXZ'); }
}
export class PlayerBoat {
  constructor(type, x, z, h) { this.type = type; this.m = buildBoat(type); scene.add(this.m.g); this.x = x; this.z = z; this.h = h; this.speed = 0; this.turn = 0; this.y = WATER_Y; this.kind = 'boat'; this.roll = 0; this.pitch = 0; this.write(0); }
  get T() { return this.m.T; }
  dispose() { scene.remove(this.m.g); }
  update(dt, I, time) {
    const T = this.m.T;
    if (I.throttle > 0) this.speed += T.acc * (I.boost ? 1.4 : 1) * dt; else if (I.throttle < 0) this.speed -= T.acc * 0.8 * dt; else this.speed *= Math.exp(-dt * 0.35);
    if (I.brake) this.speed *= Math.exp(-dt * 2.5);
    this.speed = clamp(this.speed, -T.vmax * 0.25, T.vmax * (I.boost ? 1.15 : 1));
    this.turn += (I.steer * T.turn - this.turn) * Math.min(1, dt * 3);
    this.h += this.turn * dt * clamp(Math.abs(this.speed) / 6, 0.15, 1) * Math.sign(this.speed || 1);
    let nx = this.x + Math.sin(this.h) * this.speed * dt, nz = this.z + Math.cos(this.h) * this.speed * dt;
    const r = T.L * 0.35;
    if (!navigable(nx + Math.sin(this.h) * r, nz + Math.cos(this.h) * r) || !navigable(nx, nz)) { this.speed *= -0.25; nx = this.x; nz = this.z; this.bump = 1; }
    this.x = nx; this.z = nz;
    const p = { x: this.x, z: this.z }; if (collide(p, T.W * 0.6, WATER_Y - 1, WATER_Y + 0.6, 'boat')) { this.x = p.x; this.z = p.z; this.speed *= 0.5; }
    this.write(time);
  }
  write(time) {
    const T = this.m.T, sp = Math.abs(this.speed) / T.vmax;
    this.pitch += ((-sp * 0.09 * (this.type === 'yacht' ? 0.4 : 1)) - this.pitch) * 0.05;
    this.roll += ((-this.turn * sp * 0.35) - this.roll) * 0.08;
    const bob = Math.sin(time * 1.4 + this.x * 0.1) * 0.08 + Math.sin(time * 2.3 + this.z * 0.13) * 0.05;
    this.y = WATER_Y - 0.1 + bob + sp * 0.25;
    this.m.g.position.set(this.x, this.y, this.z); this.m.g.rotation.set(this.pitch + Math.sin(time * 1.1) * 0.015, this.h, this.roll + Math.sin(time * 0.9 + 1) * 0.02, 'YXZ');
    if (Math.abs(this.speed) > 2) wake(this.x - Math.sin(this.h) * T.L * 0.45, this.z - Math.cos(this.h) * T.L * 0.45, this.h, Math.min(1, Math.abs(this.speed) / 15) * (T.W / 2.6));
  }
}
export class PlayerFlyer {
  constructor(x, y, z, h) { this.m = buildFlyer(); scene.add(this.m.g); this.x = x; this.y = y; this.z = z; this.h = h; this.speed = 0; this.vy = 0; this.yawV = 0; this.kind = 'fly'; this.roll = 0; this.pitch = 0; this.landed = y < 1; }
  get T() { return this.m.T; }
  dispose() { scene.remove(this.m.g); }
  update(dt, I, time) {
    const vmax = FLYERS.skyline.vmax * (I.boost ? 1 : 0.55);
    this.speed += ((I.throttle > 0 ? vmax : I.throttle < 0 ? -vmax * 0.3 : this.speed * 0.98) - this.speed) * Math.min(1, dt * (I.throttle ? 0.9 : 0.4));
    if (I.brake) this.speed *= Math.exp(-dt * 2);
    this.yawV += (I.steer * 1.1 - this.yawV) * Math.min(1, dt * 3);
    this.h += this.yawV * dt;
    this.vy += ((I.up - I.down) * 18 - this.vy) * Math.min(1, dt * 2.5);
    let nx = this.x + Math.sin(this.h) * this.speed * dt, nz = this.z + Math.cos(this.h) * this.speed * dt, ny = this.y + this.vy * dt;
    const gy = Math.max(groundAt(nx, nz, ny + 0.5).y, WATER_Y + 0.6);
    const top = solidTop(nx, nz, ny);
    if (top != null && ny < top + 0.6) { if (this.y >= top + 0.4) ny = Math.max(ny, top + 0.6); else { nx = this.x; nz = this.z; this.speed *= -0.3; } }
    if (ny < gy + 0.25) { ny = gy + 0.25; this.vy = Math.max(0, this.vy); }
    this.x = nx; this.z = nz; this.y = Math.min(ny, 900);
    this.landed = this.y < gy + 0.4 && Math.abs(this.speed) < 1;
    this.roll += ((-this.yawV * Math.min(1, Math.abs(this.speed) / 30) * 0.5) - this.roll) * Math.min(1, dt * 4);
    this.pitch += ((-this.speed / FLYERS.skyline.vmax * 0.18 - this.vy * 0.006) - this.pitch) * Math.min(1, dt * 3);
    this.write(time, dt);
  }
  write(time, dt = 0.016) {
    const hover = this.landed ? 0 : Math.sin(time * 2) * 0.08;
    this.m.g.position.set(this.x, this.y + hover, this.z); this.m.g.rotation.set(this.pitch, this.h, this.roll, 'YXZ');
    for (const f of this.m.fans) f.rotation.y += dt * (this.landed ? 2 : 40);
  }
}

/* =====================================================================
   WAKES — foam that trails behind every moving boat
   ===================================================================== */
const WAKE_N = 900; let wakeI = 0;
const wakeGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const foamTex = (() => { const c = makeCanvas(128, 128), g = c.ctx, gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.65)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return c.tex; })();
const wakeMat = new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, depthWrite: false, color: 0xdde8f0, opacity: 0.6 });
const wakeIM = new THREE.InstancedMesh(wakeGeo, wakeMat, WAKE_N); wakeIM.frustumCulled = false; scene.add(wakeIM);
const wakes = Array.from({ length: WAKE_N }, () => ({ x: 0, z: 0, t: 99, s: 1, h: 0 }));
let wakeAcc = 0;
export function wake(x, z, h, k) { const w = wakes[wakeI]; wakeI = (wakeI + 1) % WAKE_N; w.x = x + rr(-0.3, 0.3); w.z = z + rr(-0.3, 0.3); w.t = 0; w.s = 0.8 + k * 1.5; w.h = h; }
{
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new V3(), s = new V3(), c = new THREE.Color();
  updaters.push((dt) => {
    for (let i = 0; i < WAKE_N; i++) {
      const w = wakes[i]; w.t += dt; const life = 6;
      if (w.t > life) { s.set(0, 0, 0); m.compose(p.set(0, -50, 0), q, s); wakeIM.setMatrixAt(i, m); continue; }
      const k = w.t / life, sz = w.s * (1 + w.t * 1.6);
      q.setFromAxisAngle(new V3(0, 1, 0), w.h); m.compose(p.set(w.x, WATER_Y + 0.04, w.z), q, s.set(sz * 1.3, 1, sz * 0.8)); wakeIM.setMatrixAt(i, m);
      wakeIM.setColorAt(i, c.setScalar((1 - k) * (0.6 + env.dayK * 0.4) * (1 - env.night * 0.6)));
    }
    wakeIM.instanceMatrix.needsUpdate = true; if (wakeIM.instanceColor) wakeIM.instanceColor.needsUpdate = true;
  });
}

/* =====================================================================
   AI TRAFFIC on the street graph — signals, following, brand drop-offs
   ===================================================================== */
const AI_TYPES = {
  sedan: { L: 4.6, W: 1.9, wr: 0.36, wz: 1.45, vmax: 13, n: 30, body: [[-2.3, .32], [2.3, .32], [2.36, .66], [2.15, .9], [1.0, 1.0], [-1.9, 1.05], [-2.34, .9]], cab: [[0.95, .98], [0.15, 1.45], [-1.25, 1.45], [-1.85, 1.04]], paints: ['#0d0f14', '#1d2433', '#c9cdd6', '#3a4150', '#6a1a1a', '#e8e8e4', '#2a3a2a'] },
  suv: { L: 4.9, W: 2.1, wr: 0.46, wz: 1.55, vmax: 12, n: 18, body: [[-2.45, .45], [2.45, .45], [2.5, 1.08], [1.55, 1.26], [-2.45, 1.32]], cab: [[1.45, 1.26], [0.8, 1.9], [-2.32, 1.95], [-2.42, 1.32]], paints: ['#16181d', '#2b3038', '#e8e8e4', '#4a2a1a', '#1a2a4a'] },
  taxi: { L: 4.6, W: 1.9, wr: 0.36, wz: 1.45, vmax: 13, n: 8, body: [[-2.3, .32], [2.3, .32], [2.36, .66], [2.15, .9], [1.0, 1.0], [-1.9, 1.05], [-2.34, .9]], cab: [[0.95, .98], [0.15, 1.45], [-1.25, 1.45], [-1.85, 1.04]], paints: ['#f2b80c'], roofSign: true },
  pickup: { L: 5.6, W: 2.2, wr: 0.5, wz: 1.85, vmax: 11, n: 10, body: [[-2.8, .5], [2.8, .5], [2.86, 1.28], [2.0, 1.45], [0.35, 1.45], [0.35, 1.3], [-2.8, 1.3]], cab: [[1.95, 1.45], [1.3, 2.15], [0.35, 2.15], [0.35, 1.45]], paints: ['#121418', '#7a1a1a', '#e8e8e4', '#2a3a5a'] },
  sport: { L: 4.5, W: 2.0, wr: 0.36, wz: 1.42, vmax: 16, n: 8, body: [[-2.25, .3], [2.25, .28], [2.3, .5], [1.2, .78], [-1.55, .92], [-2.25, .84]], cab: [[0.75, .78], [-0.1, 1.14], [-1.0, 1.14], [-1.55, .92]], paints: ['#b3121f', '#e8b923', '#1846e0', '#151515', '#5a2bd6'] },
  van: { L: 5.8, W: 2.2, wr: 0.45, wz: 1.95, vmax: 10, n: 6, body: [[-2.9, .45], [2.9, .45], [2.96, 1.4], [2.45, 2.62], [-2.9, 2.7]], cab: [[2.88, 1.6], [2.42, 2.48], [1.95, 2.48], [2.15, 1.6]], paints: ['#f4f4f0', '#2a2e36', '#5fe3ff'] },
  bus: { L: 11.5, W: 2.6, wr: 0.55, wz: 4.0, vmax: 9, n: 4, body: [[-5.75, .5], [5.75, .5], [5.8, 3.2], [-5.75, 3.2]], cab: [[5.8, 1.4], [5.8, 2.9], [-5.6, 2.9], [-5.6, 1.4]], paints: ['#1a5ad8'], busStripe: true },
};
function aiGeometry(T) {
  const body = colorize(extrude(T.body, T.W, false), '#ffffff'), cab = colorize(extrude(T.cab, T.W * (T.busStripe ? 1.01 : 0.84), false), '#0a0d14');
  const parts = [body, cab];
  if (T.roofSign) parts.push(colorize(new THREE.BoxGeometry(0.8, 0.25, 0.3).translate(0, 1.6, -0.3), '#f8f2c0'));
  if (T.busStripe) parts.push(colorize(new THREE.BoxGeometry(T.W + 0.02, 0.3, T.L - 0.3).translate(0, 1.05, 0), '#ffc65c'));
  for (const p of parts) { if (p.attributes.uv) p.deleteAttribute('uv'); }
  return merge(parts.map(p => p.index ? p.toNonIndexed() : p));
}
const aiPaint = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.65, roughness: 0.32, envMapIntensity: 1.2 });
const aiPools = {}; let aiTotal = 0;
for (const [k, T] of Object.entries(AI_TYPES)) { const im = new THREE.InstancedMesh(aiGeometry(T), aiPaint, T.n); im.frustumCulled = false; im.castShadow = true; scene.add(im); aiPools[k] = { T, im }; aiTotal += T.n; }
const wheelIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 0.3, 12).rotateZ(Math.PI / 2), tireMat, aiTotal * 4); wheelIM.frustumCulled = false; scene.add(wheelIM);
const aiHeadMat = new THREE.MeshBasicMaterial({ color: 0x222222 }); onNight(aiHeadMat, lin(4, 4, 4.5), 0.25, 1, 'color');
const aiHead = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), aiHeadMat, aiTotal), aiTail = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: lin(3.2, 0.15, 0.12) }), aiTotal);
const beamMat = new THREE.MeshBasicMaterial({ color: 0x000000, map: GLOW_TEX, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); onNight(beamMat, lin(0.55, 0.5, 0.4), 0, 1, 'color');
const aiBeam = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), beamMat, aiTotal);
for (const im of [aiHead, aiTail, aiBeam]) { im.frustumCulled = false; scene.add(im); }
export const traffic = [];
let gi = 0;
for (const [k, P] of Object.entries(aiPools)) for (let i = 0; i < P.T.n; i++) {
  const m = { type: k, T: P.T, slot: i, gi: gi++, x: 0, z: 0, h: 0, s: 0, speed: 0, vmax: P.T.vmax * rr(0.85, 1.15) };
  P.im.setColorAt(i, new THREE.Color(pick(P.T.paints))); placeRandom(m); traffic.push(m);
}
for (const P of Object.values(aiPools)) P.im.instanceColor.needsUpdate = true;

function enterEdge(m, ei, fromId) {
  const e = EDGES[ei], A = NODES[fromId], B = NODES[otherEnd(e, fromId)];
  const ux = (B.x - A.x) / e.len, uz = (B.z - A.z) / e.len, rx = -uz, rz = ux;
  const off = e.w >= 14 ? e.w / 4 + 0.4 : e.w / 4 - 0.1;
  const ia = A.deg >= 3 ? A.w / 2 + 2.2 : A.deg === 2 ? A.w / 2 : 3, ib = B.deg >= 3 ? B.w / 2 + 2.2 : B.deg === 2 ? B.w / 2 : 3;
  m.edge = ei; m.from = fromId; m.to = B.id; m.ux = ux; m.uz = uz;
  m.seg = { k: 'L', ax: A.x + ux * ia + rx * off, az: A.z + uz * ia + rz * off, bx: B.x - ux * ib + rx * off, bz: B.z - uz * ib + rz * off, len: Math.max(0.05, e.len - ia - ib) };
  m.s = 0;
}
function quadSeg(ax, az, cx, cz, bx, bz) { return { k: 'Q', ax, az, cx, cz, bx, bz, len: Math.max(0.05, (Math.hypot(cx - ax, cz - az) + Math.hypot(bx - cx, bz - cz) + Math.hypot(bx - ax, bz - az)) / 2) }; }
function turnInto(m, ei) {
  const p1x = m.seg.bx, p1z = m.seg.bz, dx = m.ux, dz = m.uz; enterEdge(m, ei, m.to);
  const q = m.seg, den = dx * m.uz - dz * m.ux, gap = Math.hypot(q.ax - p1x, q.az - p1z); let cx, cz;
  if (Math.abs(den) > 0.15) { const t = ((q.ax - p1x) * m.uz - (q.az - p1z) * m.ux) / den; cx = p1x + dx * t; cz = p1z + dz * t; }
  else if (dx * m.ux + dz * m.uz > 0) { cx = (p1x + q.ax) / 2; cz = (p1z + q.az) / 2; }
  else { cx = (p1x + q.ax) / 2 + dx * (gap * 0.9 + 3); cz = (p1z + q.az) / 2 + dz * (gap * 0.9 + 3); }
  m.next = q; m.seg = quadSeg(p1x, p1z, cx, cz, q.ax, q.az); m.s = 0; m.turning = true;
}
function pickNext(m) {
  const n = NODES[m.to];
  if (m.route) { const nx = m.route[m.ri + 1]; if (nx == null) return 'arrive'; m.ri++; const e = edgeBetween(n.id, nx); return e ? e.id : 'arrive'; }
  if (n.exit) return 'exit';
  const opts = [], ws = [];
  for (const ei of n.edges) { if (ei === m.edge && n.edges.length > 1) continue; const e = EDGES[ei]; if (m.type === 'bus' && e.kind === 'highway') continue; const w = e.kind === 'drive' ? 0.05 : e.kind === 'highway' ? 0.35 : e.kind === 'main' ? 1.4 : 1; opts.push(ei); ws.push(w); }
  if (!opts.length) return m.edge;
  let r = rand() * ws.reduce((a, b) => a + b, 0); for (let i = 0; i < opts.length; i++) { r -= ws[i]; if (r <= 0) return opts[i]; } return opts[opts.length - 1];
}
function segPoint(sg, t, out) {
  if (sg.k === 'L') { out.x = sg.ax + (sg.bx - sg.ax) * t; out.z = sg.az + (sg.bz - sg.az) * t; out.h = Math.atan2(sg.bx - sg.ax, sg.bz - sg.az); return; }
  const u = 1 - t; out.x = u * u * sg.ax + 2 * u * t * sg.cx + t * t * sg.bx; out.z = u * u * sg.az + 2 * u * t * sg.cz + t * t * sg.bz;
  out.h = Math.atan2(2 * u * (sg.cx - sg.ax) + 2 * t * (sg.bx - sg.cx), 2 * u * (sg.cz - sg.az) + 2 * t * (sg.bz - sg.cz));
}
function placeRandom(m) {
  for (let k = 0; k < 60; k++) { const e = EDGES[Math.floor(rand() * EDGES.length)]; if (e.kind === 'drive') continue; if (e.kind === 'highway' && rand() < 0.5) continue; enterEdge(m, e.id, rand() < 0.5 ? e.a : e.b); m.s = rand() * m.seg.len; return; }
  enterEdge(m, 0, EDGES[0].a);
}
function respawn(m) { const n = EXITS[Math.floor(rand() * EXITS.length)]; enterEdge(m, n.edges[0], n.id); m.route = null; m.trip = null; }
const _pt = { x: 0, z: 0, h: 0 };
function stepAI(m, dt, lead) {
  let target = (m.seg.k === 'Q' ? m.vmax * 0.5 : m.vmax);
  if (m.waitT > 0) { m.waitT -= dt; target = 0; if (m.waitT <= 0 && m.onWaitEnd) { const f = m.onWaitEnd; m.onWaitEnd = null; f(m); } }
  // traffic signal at the end of a straight lane
  if (m.seg.k === 'L' && !m.next) {
    const rem = m.seg.len - m.s, sig = signalAt(m.to);
    if (sig && rem < 14) { const st = Math.abs(m.ux) > 0.5 ? sig.ew : sig.ns; if (st !== 'g' && rem > 0.4) target = Math.min(target, Math.max(0, (rem - 1.2) * 1.2)); }
  }
  if (lead != null) target = Math.min(target, Math.max(0, (lead - (m.T.L + 3)) * 0.9));
  if (m.stopForPlayer) target = 0;
  m.speed += (target - m.speed) * Math.min(1, dt * (target < m.speed ? 4 : 1.6));
  if (m.speed < 0.02 && target === 0) m.speed = 0;
  m.s += m.speed * dt; let guard = 0;
  while (m.s >= m.seg.len && guard++ < 4) {
    m.s -= m.seg.len;
    if (m.next) { m.seg = m.next; m.next = null; m.turning = false; continue; }
    const nx = pickNext(m);
    if (nx === 'exit') { respawn(m); continue; }
    if (nx === 'arrive') { m.route = null; const f = m.onArrive; m.onArrive = null; m.s = m.seg.len; if (f) f(m); break; }
    turnInto(m, nx);
  }
  segPoint(m.seg, Math.min(1, m.s / m.seg.len), m);
}
const _vm = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new V3(), _one = new V3(1, 1, 1), _om = new THREE.Matrix4(), _wm = new THREE.Matrix4(), _e = new THREE.Euler(), _s = new V3();
function writeAI(m) {
  const T = m.T, P = aiPools[m.type];
  _e.set(0, m.h, 0); _q.setFromEuler(_e); _p.set(m.x, m.y || 0.04, m.z); _vm.compose(_p, _q, _one); P.im.setMatrixAt(m.slot, _vm);
  m.spin = (m.spin || 0) + m.speed * 0.016 / T.wr; let w = 0;
  for (const sz of [1, -1]) for (const sx of [1, -1]) { _om.makeRotationX(m.spin).premultiply(_wm.makeScale(1, T.wr, T.wr)); _om.setPosition(sx * (T.W / 2 - 0.12), T.wr, sz * T.wz); wheelIM.setMatrixAt(m.gi * 4 + w++, _wm.multiplyMatrices(_vm, _om)); }
  _om.makeScale(T.W * 0.8, 0.07, 0.06).setPosition(0, Math.min(0.85, T.body[2][1] - 0.15), T.L / 2 + 0.02); aiHead.setMatrixAt(m.gi, _wm.multiplyMatrices(_vm, _om));
  _om.makeScale(T.W * 0.9, 0.08, 0.06).setPosition(0, Math.min(1.1, T.body[T.body.length - 1][1] - 0.15), -T.L / 2 - 0.02); aiTail.setMatrixAt(m.gi, _wm.multiplyMatrices(_vm, _om));
  _om.makeScale(T.W * 1.6, 1, 9).setPosition(0, 0.06 - (m.y || 0), T.L / 2 + 4.5); aiBeam.setMatrixAt(m.gi, _wm.multiplyMatrices(_vm, _om));
}
export const activity = { push: null };   // hud injects a logger
export const visitorHooks = { spawn: null }; // people.js injects
function sendToBrand(m, b) {
  const [dx, dz] = b.dropoff; const dest = nearestNode(dx, dz, n => !n.exit && n.deg >= 2); const r = route(m.to, dest.id); if (!r || r.length < 2) return false;
  m.route = r; m.ri = 0; m.trip = b.id;
  m.onArrive = (mm) => { mm.waitT = rr(5, 9); mm.trip = null; activity.push && activity.push(`${b.name} · ${pick(['rideshare', 'taxi', 'car', 'party of four'])} dropping off`, b.color);
    if (visitorHooks.spawn) visitorHooks.spawn(mm.x, mm.z, b, 1 + Math.floor(rand() * 3)); };
  return true;
}
let tripClock = 3, honkCd = 0;
export const playerPos = { x: 0, z: 0, active: false, kind: '' };
updaters.push((dt, time) => {
  // following: bucket by (edge, from) and sort by s
  const buckets = new Map();
  for (const m of traffic) { const k = m.edge * 2 + (m.from === EDGES[m.edge].a ? 0 : 1); (buckets.get(k) || buckets.set(k, []).get(k)).push(m); }
  const lead = new Map();
  for (const arr of buckets.values()) { arr.sort((a, b) => a.s - b.s - (a.next ? 1e4 : 0) + (b.next ? 1e4 : 0)); for (let i = 0; i < arr.length - 1; i++) if (!arr[i].next && !arr[i + 1].next) lead.set(arr[i], arr[i + 1].s - arr[i].s); }
  for (const m of traffic) {
    m.stopForPlayer = false;
    if (playerPos.active) { const dx = playerPos.x - m.x, dz = playerPos.z - m.z, d = Math.hypot(dx, dz); if (d < 10 && (dx * Math.sin(m.h) + dz * Math.cos(m.h)) > 0 && Math.abs(-dx * Math.cos(m.h) + dz * Math.sin(m.h)) < 2.2) m.stopForPlayer = true; }
    stepAI(m, dt, lead.get(m));
    const gy = groundAt(m.x, m.z, 1).y; m.y = gy > -1e8 ? gy : 0.04;
    writeAI(m);
  }
  for (const P of Object.values(aiPools)) P.im.instanceMatrix.needsUpdate = true;
  for (const im of [wheelIM, aiHead, aiTail, aiBeam]) im.instanceMatrix.needsUpdate = true;
  // brand drop-offs
  tripClock -= dt;
  if (tripClock <= 0) {
    tripClock = rr(4, 9);
    const open = Object.values(BRANDS).filter(b => b.isOpen() && b.id !== 'garage');
    if (open.length) { const b = pick(open.filter(x => x.id === 'hotspot' && env.lights > 0.3).concat(open)); const cand = traffic.filter(m => !m.route && !m.waitT && m.type !== 'bus' && EDGES[m.edge].kind !== 'highway'); if (cand.length) sendToBrand(pick(cand), b); }
  }
});

/* parked cars: curbside + the Hotspot lot fills up through the evening */
{
  const T = AI_TYPES.sedan, list = curbParking, hot = BRANDS.hotspot.parking || [];
  const n = list.length + hot.length;
  const im = new THREE.InstancedMesh(aiGeometry(T), aiPaint, n); im.castShadow = true; scene.add(im);
  const all = [...list.map(p => ({ ...p, fixed: true })), ...hot.map(p => ({ x: p.w[0], z: p.w[1], h: p.h, fixed: false, r: rand() }))];
  all.forEach((p, i) => { im.setColorAt(i, new THREE.Color(pick(AI_TYPES[pick(['sedan', 'suv', 'sport', 'sedan'])].paints))); });
  let lastShown = -1;
  const write = () => {
    const open = BRANDS.hotspot.isOpen(); const fill = open ? clamp(0.15 + env.lights * 0.85, 0, 0.95) : 0.08; let shown = 0;
    all.forEach((p, i) => { const vis = p.fixed || p.r < fill; if (!p.fixed && vis) shown++; _e.set(0, p.h, 0); _q.setFromEuler(_e); _s.setScalar(vis ? 1 : 0); _vm.compose(_p.set(p.x, vis ? 0.15 : -20, p.z), _q, _s); im.setMatrixAt(i, _vm); });
    im.instanceMatrix.needsUpdate = true;
    if (lastShown >= 0 && shown > lastShown + 2 && activity.push) activity.push(`The Hotspot lot · ${shown} cars parked — doors are busy`, '#ff3fd0');
    lastShown = shown;
  };
  write(); let c = 0; updaters.push(dt => { c -= dt; if (c < 0) { c = 4; write(); } });
}

/* =====================================================================
   SKY TRAFFIC — hover cars on loops + the Star Vibes blimp
   ===================================================================== */
{
  const loops = [
    { y: 62, pts: [[-300, 160], [-220, -80], [-40, -200], [180, -160], [260, 60], [120, 220], [-120, 260]] },
    { y: 88, pts: [[-120, 0], [-60, -150], [100, -160], [220, 0], [100, 140], [-60, 150]] },
    { y: 120, pts: [[-500, -100], [-200, -460], [300, -400], [520, 0], [260, 380], [-280, 420]] },
  ].map(L => ({ y: L.y, curve: new THREE.CatmullRomCurve3(L.pts.map(([x, z]) => new V3(x, L.y, z)), true, 'centripetal') }));
  loops.forEach(L => L.len = L.curve.getLength());
  const N = 16, geo = buildFlyer(), parts = [];
  geo.g.updateMatrixWorld(true); geo.g.traverse(o => { if (o.isMesh && o.geometry && !(o.material.blending === THREE.AdditiveBlending)) { const gg = o.geometry.clone().applyMatrix4(o.matrixWorld); parts.push(colorize(gg.index ? gg.toNonIndexed() : gg, o.material.color ? '#' + o.material.color.getHexString() : '#222')); } });
  parts.forEach(p => { for (const a of Object.keys(p.attributes)) if (!['position', 'normal', 'color'].includes(a)) p.deleteAttribute(a); });
  const im = new THREE.InstancedMesh(merge(parts), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.8, roughness: 0.25 }), N); im.frustumCulled = false; scene.add(im);
  const glowIM = new THREE.InstancedMesh(new THREE.PlaneGeometry(4, 5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: lin(0.3, 1.2, 2.4), map: GLOW_TEX, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), N); glowIM.frustumCulled = false; scene.add(glowIM);
  const hv = Array.from({ length: N }, (_, i) => ({ L: loops[i % 3], t: rand(), dir: i % 2 ? 1 : -1, v: rr(18, 30) }));
  const P = new V3(), Tn = new V3();
  updaters.push((dt, time) => { hv.forEach((h, i) => { h.t = (h.t + h.dir * h.v * dt / h.L.len + 1) % 1; h.L.curve.getPointAt(h.t, P); h.L.curve.getTangentAt(h.t, Tn); _e.set(0, Math.atan2(Tn.x * h.dir, Tn.z * h.dir), Math.sin(time * 0.6 + i) * 0.08); _q.setFromEuler(_e); _vm.compose(_p.set(P.x, P.y + Math.sin(time + i) * 1.4, P.z), _q, _one); im.setMatrixAt(i, _vm); glowIM.setMatrixAt(i, _vm); }); im.instanceMatrix.needsUpdate = glowIM.instanceMatrix.needsUpdate = true; });
}
export const blimp = (() => {
  const g = new THREE.Group(); scene.add(g);
  const env_ = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16).scale(7, 7, 24), new THREE.MeshStandardMaterial({ color: 0xe8e8ec, roughness: 0.5, metalness: 0.2 })); env_.castShadow = true; g.add(env_);
  const gond = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2, 7), M.dark); gond.position.y = -7.2; g.add(gond);
  for (const [rx, rz] of [[0, 1], [Math.PI / 2, 0]]) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 9, 5), new THREE.MeshStandardMaterial({ color: 0x5a14c8 })); fin.position.z = -21; fin.rotation.z = rx; g.add(fin); }
  const cv = makeCanvas(1024, 256), sm = new THREE.MeshBasicMaterial({ map: cv.tex, toneMapped: true });
  for (const s of [-1, 1]) { const scr = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5), sm); scr.position.set(s * 6.9, 0, 0); scr.rotation.y = s * Math.PI / 2; scr.scale.x = s; g.add(scr); }
  let ct = 0;
  const msgs = [['★ STAR VIBES WORLD', '#ffc65c'], ['K LOVEE · LAKEFRONT HEAT · OUT NOW', '#ff5c8a'], ['TONIGHT AT THE HOTSPOT', '#ff3fd0'], ['LEARN · CREATE · GLOW — GLOSTAR', '#5fe3ff'], ['HOTSPOT KITCHEN · RIVERWALK', '#ff9d3d']];
  updaters.push((dt, time) => {
    const a = time * 0.012; g.position.set(Math.sin(a) * 380 - 40, 150 + Math.sin(time * 0.1) * 6, Math.cos(a) * 300 - 60); g.rotation.y = a + Math.PI / 2; g.rotation.z = Math.sin(time * 0.2) * 0.03;
    ct -= dt; if (ct < 0) { ct = 0.1; const x = cv.ctx, i = Math.floor(time / 6) % msgs.length; x.fillStyle = '#05040c'; x.fillRect(0, 0, 1024, 256); x.fillStyle = msgs[i][1]; x.font = FONT(900, 92, DISPLAY); x.textAlign = 'center'; x.textBaseline = 'middle';
      const off = ((time % 6) / 6) * 0; x.shadowColor = msgs[i][1]; x.shadowBlur = 24; let fs = 92; while (x.measureText(msgs[i][0]).width > 980 && fs > 30) { fs -= 4; x.font = FONT(900, fs, DISPLAY); } x.fillText(msgs[i][0], 512 + off, 128); x.shadowBlur = 0; cv.tex.needsUpdate = true; sm.color.setScalar(1 + env.lights * 1.5); }
  });
  return g;
})();

/* =====================================================================
   LAKE LIFE — sailboats, cruisers & jet skis out on Lake Champlain
   ===================================================================== */
export const aiBoats = [];
{
  const loops = [];
  const mk = (cx, cz, rx, rz, n = 10) => { const pts = []; for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; let x = cx + Math.sin(a) * rx * rr(0.85, 1.15), z = cz + Math.cos(a) * rz * rr(0.85, 1.15); pts.push(new V3(x, 0, z)); } const c = new THREE.CatmullRomCurve3(pts, true); return { c, len: c.getLength() }; };
  loops.push(mk(-900, 0, 300, 700), mk(-1400, -500, 450, 500), mk(-760, 600, 220, 260), mk(-1200, 900, 500, 380), mk(-650, -700, 200, 380), mk(-1800, 100, 500, 900));
  const marinaRun = (() => { const pts = [[-480, 236], [-560, 300], [-700, 330], [-820, 200], [-780, 60], [-640, 20], [-560, 30], [-520, 160]].map(([x, z]) => new V3(x, 0, z)); const c = new THREE.CatmullRomCurve3(pts, true); return { c, len: c.getLength() }; })();
  loops.push(marinaRun);
  const types = ['sail', 'sail', 'sail', 'sail', 'sport', 'yacht', 'jet', 'pontoon', 'sail', 'jet', 'yacht', 'sail', 'sport', 'ferry'];
  types.forEach((t, i) => {
    let m; if (t === 'sail') {
      const g = new THREE.Group(); const hull = new THREE.Mesh(hullGeo(8, 2.4, 1.0, 0.45), hullWhite); hull.position.y = -0.5; g.add(hull);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 11, 6), M.steel); mast.position.set(0, 6, 0.6); g.add(mast);
      const sailS = new THREE.Shape(); sailS.moveTo(0, 0); sailS.lineTo(0, 10); sailS.lineTo(-3.8, 0.4); const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailS), new THREE.MeshStandardMaterial({ color: i % 3 ? 0xf4f2ec : 0xff9be6, side: THREE.DoubleSide, roughness: 0.8 })); sail.position.set(0, 1.2, 0.5); sail.rotation.y = Math.PI / 2; g.add(sail);
      const jib = new THREE.Mesh(new THREE.ShapeGeometry((() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0, 8.5); s.lineTo(3.2, 0.2); return s; })()), sail.material); jib.position.set(0, 1.2, 0.7); jib.rotation.y = Math.PI / 2; g.add(jib);
      m = { g, T: { L: 8, W: 2.4, vmax: 6 }, sail: true };
    } else if (t === 'ferry') {
      const g = new THREE.Group(); const hull = new THREE.Mesh(hullGeo(30, 9, 2.2, 0.25), new THREE.MeshStandardMaterial({ color: 0xf2f2ee })); hull.position.y = -1; g.add(hull);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 22), new THREE.MeshStandardMaterial({ color: 0xffffff })); deck.position.y = 2.6; g.add(deck);
      const win = new THREE.Mesh(new THREE.BoxGeometry(8.05, 1, 21), glowMat('#ffd9a0', 1.8, 0.3)); win.position.y = 2.8; g.add(win);
      const top = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 8), new THREE.MeshStandardMaterial({ color: 0x1a3a6a })); top.position.set(0, 4.8, 4); g.add(top);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 3, 10), new THREE.MeshStandardMaterial({ color: 0xc02a2a })); st.position.set(0, 6.5, -2); g.add(st);
      m = { g, T: { L: 30, W: 9, vmax: 7 } };
    } else { const b = buildBoat(t === 'sport' ? 'sport' : t, t === 'jet' ? pick(['#ff3a8a', '#1aa0ff', '#ffc65c']) : undefined); m = { g: b.g, T: b.T }; }
    scene.add(m.g); m.loop = i === types.length - 2 || i === 4 ? marinaRun : loops[i % (loops.length - 1)]; m.t = rand(); m.dir = rand() < 0.5 ? 1 : -1; m.v = (m.T.vmax || 8) * rr(0.35, 0.6) * (t === 'jet' ? 1.6 : 1); m.kind = t; m.wake = 0;
    aiBoats.push(m);
  });
  const P = new V3(), Tn = new V3();
  updaters.push((dt, time) => {
    for (const b of aiBoats) {
      b.t = (b.t + b.dir * b.v * dt / b.loop.len + 1) % 1; b.loop.c.getPointAt(b.t, P); b.loop.c.getTangentAt(b.t, Tn);
      const h = Math.atan2(Tn.x * b.dir, Tn.z * b.dir); const bob = Math.sin(time * 1.3 + b.t * 50) * 0.08;
      b.g.position.set(P.x, WATER_Y - 0.1 + bob, P.z); b.g.rotation.set(Math.sin(time * 0.8 + b.t * 9) * 0.02, h, (b.sail ? -0.12 : 0) + Math.sin(time * 1.1 + b.t * 7) * 0.03, 'YXZ');
      b.wake -= dt; if (b.wake < 0) { b.wake = b.kind === 'jet' ? 0.05 : 0.12; wake(P.x - Math.sin(h) * b.T.L * 0.45, P.z - Math.cos(h) * b.T.L * 0.45, h, Math.min(1, b.v / 10) * (b.T.W / 2.6)); }
    }
  });
}

/* =====================================================================
   DOCKED PLAYER BOATS at the Star Vibes Dock + GARAGE showroom cars
   ===================================================================== */
export const docked = [];
{
  const pier = MARINA.dock, slips = MARINA.slips.filter(s => s.pier === 4).slice(0, 4);
  const kinds = ['sport', 'yacht', 'pontoon', 'jet'];
  slips.forEach((sl, i) => {
    const k = kinds[i], b = buildBoat(k);
    let x = sl.bx, z = sl.bz - 0.8, h = Math.PI, board = [x, pier.z - 1.4];
    if (k === 'yacht') { x = pier.x1 - 14; z = pier.z; h = -Math.PI / 2; board = [pier.x1 + 1.5, pier.z]; }
    b.g.position.set(x, WATER_Y - 0.1, z); b.g.rotation.y = h; scene.add(b.g);
    const d = { type: k, model: b, x, z, h, boardAt: board };
    docked.push(d);
    interactables.push({ x: d.boardAt[0], y: 0.3, z: d.boardAt[1], r: 3.2, label: `Board the ${BOATS[k].code} ${BOATS[k].name}`, action: { kind: 'board', dock: d } });
  });
  updaters.push((dt, time) => { for (const d of docked) if (d.model.g.parent) { d.model.g.position.y = WATER_Y - 0.1 + Math.sin(time * 1.3 + d.x) * 0.07; d.model.g.rotation.z = Math.sin(time * 0.9 + d.z) * 0.02; } });
}
export const showroom = [];
{
  const order = ['sport', 'suv', 'truck', 'classic', 'custom'];
  GARAGE.turntables.forEach((tt, i) => {
    const t = order[i], m = buildCar(t); m.g.position.set(tt.x, tt.y, tt.z); scene.add(m.g); showroom.push({ t, m, tt });
    interactables.push({ x: tt.x, y: tt.y, z: tt.z, r: 4.2, label: `Take the ${CARS[t].code} ${CARS[t].name}`, sub: CARS[t].spec, action: { kind: 'takeCar', type: t } });
  });
  updaters.push((dt, time) => { showroom.forEach((s, i) => { s.m.g.rotation.y = time * 0.35 + i; }); });
  // a hover pad in front of Star Vibes HQ with the Skyline
  const hp = BRANDS.starvibes.helipad; if (hp) { const f = buildFlyer(); f.g.position.set(hp[0], BRANDS.starvibes.helipadY + 0.05, hp[1]); f.g.rotation.y = Math.PI / 2; scene.add(f.g); showroom.push({ t: 'fly', m: f, pad: true });
    interactables.push({ x: hp[0], y: BRANDS.starvibes.helipadY, z: hp[1], r: 5, label: 'Fly the SV-SKY Skyline VTOL', sub: FLYERS.skyline.spec, action: { kind: 'takeFly', at: [hp[0], BRANDS.starvibes.helipadY + 0.3, hp[1]], pad: f } }); }
}
