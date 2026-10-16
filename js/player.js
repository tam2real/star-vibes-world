// The player: on foot (3rd/1st person), driving, boating, flying, drone cam, cinematic tour, fast travel.
import { THREE, V3, scene, camera, canvas, updaters, interactables, picks, clamp, angDiff, rand, sites } from './core.js';
import { groundAt, collide, pointBlocked, navigable, ceilingAbove } from './physics.js';
import { WATER_Y, terrainHeight, DISTRICTS, BRAND_LOTS } from './layout.js';
import { nearestRoad, EDGES, NODES } from './roads.js';
import { PlayerCar, PlayerBoat, PlayerFlyer, docked, showroom, buildBoat, BOATS, CARS, playerPos } from './vehicles.js';
import { buildAvatar, walkPose, modePose } from './people.js';
import { BRANDS } from './brands.js';
import { MARINA } from './town.js';
import { env } from './env.js';
import { operatorAt, operatorById } from './operators.js';

export const P = {
  mode: 'walk',              // walk | car | boat | fly | drone | tour
  pos: new V3(-80, 0.15, 0), vel: new V3(), vy: 0, onGround: true, yaw: Math.PI, pitch: -0.12, view: 'third',
  car: null, boat: null, fly: null,
  camYaw: 0, camPitch: 0.2, camDist: 7, camMode: 0, // vehicle camera
  prompt: null, lastSafe: new V3(-80, 0.15, 0), here: null, inside: null,
  autopilot: null, transition: null,
};
export const keys = new Set();
const avatar = buildAvatar();
export const events = { onEnterVehicle: null, onExitVehicle: null, toast: null, liftMenu: null, plotMenu: null, bizMenu: null, inspect: null, operatorInspect: null, milestone: null };

/* =====================================================================
   INPUT
   ===================================================================== */
const look = { dragging: false, lx: 0, ly: 0, moved: 0 };
export const touch = { mx: 0, my: 0, active: false };
addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'KeyE') interact();
  if (e.code === 'KeyC') cycleCamera();
  if (e.code === 'KeyF') toggleDrone();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const locked = () => document.pointerLockElement === canvas;
canvas.addEventListener('mousedown', e => { if (e.button === 0 || e.button === 2) { look.dragging = true; look.lx = e.clientX; look.ly = e.clientY; look.moved = 0; } });
addEventListener('mouseup', e => {
  if (look.dragging && look.moved < 5 && e.button === 0 && e.target === canvas) clickPick(e.clientX, e.clientY);
  look.dragging = false;
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('dblclick', () => { if (!locked() && P.mode !== 'tour') { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (_) {} } });
addEventListener('mousemove', e => {
  let dx = 0, dy = 0;
  if (locked()) { dx = e.movementX; dy = e.movementY; }
  else if (look.dragging) { dx = e.clientX - look.lx; dy = e.clientY - look.ly; look.lx = e.clientX; look.ly = e.clientY; look.moved += Math.abs(dx) + Math.abs(dy); }
  else return;
  turnView(dx, dy);
});
canvas.addEventListener('wheel', e => { e.preventDefault(); if (P.mode === 'walk' && P.view === 'third') P.walkDist = clamp((P.walkDist || 4.2) + Math.sign(e.deltaY) * 0.6, 1.8, 14); else if (['car', 'boat', 'fly'].includes(P.mode)) P.camDist = clamp(P.camDist + Math.sign(e.deltaY) * 1.2, 3, 40); else if (P.mode === 'drone') P.droneSpeed = clamp((P.droneSpeed || 40) * (e.deltaY > 0 ? 0.85 : 1.18), 6, 400); }, { passive: false });
export function turnView(dx, dy) {
  const k = 0.0028;
  if (P.mode === 'walk' || P.mode === 'drone') { P.yaw -= dx * k; P.pitch = clamp(P.pitch - dy * k, -1.45, 1.45); }
  else if (['car', 'boat', 'fly'].includes(P.mode)) { P.camYaw -= dx * k; P.camPitch = clamp(P.camPitch + dy * k * 0.8, -0.35, 1.2); P.camTouched = 2.5; }
}
/* touch: left half = move stick, right half = look */
{
  const ids = {};
  canvas.addEventListener('touchstart', e => { for (const t of e.changedTouches) { if (t.clientX < innerWidth * 0.42) ids[t.identifier] = { kind: 'move', x0: t.clientX, y0: t.clientY }; else ids[t.identifier] = { kind: 'look', x: t.clientX, y: t.clientY, t0: performance.now(), moved: 0 }; } e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchmove', e => { for (const t of e.changedTouches) { const s = ids[t.identifier]; if (!s) continue; if (s.kind === 'move') { touch.mx = clamp((t.clientX - s.x0) / 60, -1, 1); touch.my = clamp((t.clientY - s.y0) / 60, -1, 1); touch.active = true; } else { const dx = t.clientX - s.x, dy = t.clientY - s.y; s.x = t.clientX; s.y = t.clientY; s.moved += Math.abs(dx) + Math.abs(dy); turnView(dx * 1.4, dy * 1.4); } } e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchend', e => { for (const t of e.changedTouches) { const s = ids[t.identifier]; if (s && s.kind === 'move') { touch.mx = touch.my = 0; touch.active = false; } if (s && s.kind === 'look' && s.moved < 8 && performance.now() - s.t0 < 300) clickPick(t.clientX, t.clientY); delete ids[t.identifier]; } }, { passive: false });
}
export const vbtn = { up: false, down: false, boost: false, brake: false };
function input() {
  const K = c => keys.has(c);
  const fwd = (K('KeyW') || K('ArrowUp') ? 1 : 0) - (K('KeyS') || K('ArrowDown') ? 1 : 0) - (touch.active ? touch.my : 0);
  const side = (K('KeyA') || K('ArrowLeft') ? 1 : 0) - (K('KeyD') || K('ArrowRight') ? 1 : 0) - (touch.active ? touch.mx : 0);
  return {
    throttle: clamp(fwd, -1, 1), steer: clamp(side, -1, 1),
    boost: K('ShiftLeft') || K('ShiftRight') || vbtn.boost,
    brake: (K('Space') && P.mode === 'car') || vbtn.brake,
    up: K('Space') || vbtn.up ? 1 : 0, down: K('ControlLeft') || K('ControlRight') || K('KeyQ') || vbtn.down ? 1 : 0,
  };
}

/* =====================================================================
   CLICK TO INSPECT (buildings)
   ===================================================================== */
const ray = new THREE.Raycaster();
export function clickPick(cx, cy) {
  const ndc = locked() ? new THREE.Vector2(0, 0) : new THREE.Vector2(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera); ray.far = 2500;
  const hits = ray.intersectObjects(picks.filter(p => p.userData.site), false);
  const hit = hits.find(h => h.object.userData.site !== P.inside);
  if (hit && events.inspect) events.inspect(hit.object.userData.site);
}

/* =====================================================================
   VEHICLE SPAWN / ENTER / EXIT
   ===================================================================== */
function setMode(m) { P.mode = m; P.camTouched = 0; playerPos.active = m === 'walk'; avatar.visible = m === 'walk' && P.view === 'third'; }
export function spawnCar(type, custom = {}, at = null) {
  if (P.car) P.car.dispose();
  let x, z, h;
  if (at) ({ x, z, h } = at);
  else {
    const base = P.mode === 'walk' ? P.pos : camera.position; const nr = nearestRoad(base.x, base.z); const e = nr.e, A = NODES[e.a], B = NODES[e.b];
    const dx = B.x - A.x, dz = B.z - A.z, L2 = dx * dx + dz * dz; let t = clamp(((base.x - A.x) * dx + (base.z - A.z) * dz) / L2, 0.05, 0.95);
    const L = Math.sqrt(L2), ux = dx / L, uz = dz / L, off = e.w / 4; x = A.x + dx * t - uz * off; z = A.z + dz * t + ux * off; h = Math.atan2(ux, uz);
  }
  P.car = new PlayerCar(type, x, z, h, custom); P.car.y = Math.max(0, groundAt(x, z, 2).y); P.car.write();
  return P.car;
}
export function enterCar() { if (!P.car) return; if (P.mode === 'boat') leaveBoat(true); setMode('car'); P.camYaw = 0; P.camPitch = 0.22; P.camDist = 7.5; events.onEnterVehicle && events.onEnterVehicle('car', P.car); }
export function spawnBoat(type, at = null) {
  if (P.boat) P.boat.dispose();
  const d = docked.find(q => q.type === type);
  const x = at ? at.x : d ? d.x : -480, z = at ? at.z : d ? d.z : 236, h = at ? at.h : d ? d.h : -Math.PI / 2;
  if (d && d.model.g.parent) scene.remove(d.model.g);
  for (const q of docked) if (q !== d && !q.model.g.parent) scene.add(q.model.g);
  P.boat = new PlayerBoat(type, x, z, h); P.boat.dockRef = d; return P.boat;
}
export function enterBoat() { if (!P.boat) return; setMode('boat'); P.camYaw = 0; P.camPitch = 0.28; P.camDist = Math.max(9, P.boat.T.L * 1.2); events.onEnterVehicle && events.onEnterVehicle('boat', P.boat); }
export function spawnFlyer(at) { if (P.fly) P.fly.dispose(); const pad = showroom.find(s => s.pad); if (pad && pad.m.g.parent) scene.remove(pad.m.g); P.fly = new PlayerFlyer(at[0], at[1], at[2], at[3] ?? Math.PI / 2); return P.fly; }
export function enterFly() { if (!P.fly) return; setMode('fly'); P.camYaw = 0; P.camPitch = 0.25; P.camDist = 11; events.onEnterVehicle && events.onEnterVehicle('fly', P.fly); }
function placeOnFoot(x, z, yaw, yHint = 2) { const g = groundAt(x, z, yHint + 1); P.pos.set(x, g.y > -1e8 ? g.y : 0.2, z); P.vel.set(0, 0, 0); P.vy = 0; P.yaw = yaw; P.pitch = -0.1; setMode('walk'); }
function exitVehicle() {
  if (P.mode === 'car') { const c = P.car, lx = Math.cos(c.h), lz = -Math.sin(c.h); placeOnFoot(c.x + lx * 2.3, c.z + lz * 2.3, c.h + Math.PI, c.y + 1); c.speed = 0; events.onExitVehicle && events.onExitVehicle('car'); return true; }
  if (P.mode === 'boat') {
    const b = P.boat; let best = null, bd = 1e9;
    for (let r = 2; r <= 9; r += 1) for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, x = b.x + Math.sin(a) * r, z = b.z + Math.cos(a) * r; const g = groundAt(x, z, 2); if (g.water || g.y < WATER_Y || g.y > 2.5) continue; if (r < bd) { bd = r; best = [x, z]; } }
    if (!best) { events.toast && events.toast('Bring her alongside a dock or the shore to step off', '#4dc8ff'); return false; }
    b.speed = 0; placeOnFoot(best[0], best[1], b.h, 1); events.onExitVehicle && events.onExitVehicle('boat'); return true;
  }
  if (P.mode === 'fly') {
    const f = P.fly; const g = groundAt(f.x, f.z, f.y + 0.5);
    if (f.y - Math.max(g.y, WATER_Y) > 2.2 || g.water) { events.toast && events.toast(g.water ? 'Find dry ground — hold Ctrl/Q to descend over land' : 'Land first — hold Ctrl or Q to descend', '#5fe3ff'); return false; }
    f.speed = 0; placeOnFoot(f.x + Math.cos(f.h) * 3, f.z - Math.sin(f.h) * 3, f.h, f.y + 1); events.onExitVehicle && events.onExitVehicle('fly'); return true;
  }
  return false;
}
function leaveBoat() { }
export function nearestInteract() {
  if (P.mode !== 'walk') return null;
  let best = null, bd = 1e9; const p = P.pos;
  for (const [id, q] of Object.entries(operatorAt)) {
    const d = Math.hypot(p.x - q.x, p.z - q.z);
    if (d < 2.8 && Math.abs(p.y - q.y) < 3 && d < bd) { const op = operatorById(id); best = { label: `Talk to ${op.name}`, sub: `${op.role} · ${op.work}`, action: { kind: 'operator', operatorId: id } }; bd = d; }
  }
  for (const it of interactables) { const d = Math.hypot(p.x - it.x, p.z - it.z); if (d < it.r && Math.abs(p.y - it.y) < 3 && d < bd) { bd = d; best = it; } }
  const cand = [];
  if (P.car) cand.push([Math.hypot(p.x - P.car.x, p.z - P.car.z), { label: `Drive your ${CARS[P.car.type].code} ${CARS[P.car.type].name}`, action: { kind: 'enterCar' } }, 4.2]);
  if (P.boat) cand.push([Math.hypot(p.x - P.boat.x, p.z - P.boat.z), { label: `Board your ${BOATS[P.boat.type].code}`, action: { kind: 'enterBoat' } }, Math.max(6, P.boat.T.L * 0.6)]);
  if (P.fly) cand.push([Math.hypot(p.x - P.fly.x, p.z - P.fly.z), { label: 'Fly the SV-SKY Skyline', action: { kind: 'enterFly' } }, 5.5]);
  for (const [d, it, r] of cand) if (d < r && d < bd + 1.5) { bd = d; best = it; }
  return best;
}
export function interact() {
  if (P.mode === 'tour') return;
  if (['car', 'boat', 'fly'].includes(P.mode)) { exitVehicle(); return; }
  if (P.mode === 'drone') { toggleDrone(); return; }
  const it = nearestInteract(); if (!it) return;
  const a = it.action;
  if (a.kind === 'operator') { events.operatorInspect && events.operatorInspect(a.operatorId); return; }
  if (a.kind === 'enterCar') enterCar();
  else if (a.kind === 'enterBoat') enterBoat();
  else if (a.kind === 'enterFly') enterFly();
  else if (a.kind === 'takeCar') { const tt = showroom.find(s => s.t === a.type); const bs = BRANDS.garage.spawn; spawnCar(a.type, {}, { x: bs[0], z: bs[1] + 0, h: Math.PI }); P.car.y = groundAt(P.car.x, P.car.z, 2).y; enterCar(); events.toast && events.toast(`${CARS[a.type].code} ${CARS[a.type].name} — the keys are yours`, '#b46bff'); }
  else if (a.kind === 'takeFly') { spawnFlyer([a.at[0], a.at[1], a.at[2], Math.PI / 2]); enterFly(); }
  else if (a.kind === 'board') { spawnBoat(a.dock.type); enterBoat(); }
  else if (a.kind === 'lift') events.liftMenu && events.liftMenu(a);
  else if (a.kind === 'plot') events.plotMenu && events.plotMenu(a.plot);
  else if (a.kind === 'biz') events.bizMenu && events.bizMenu(a.rec);
}
export function useLift(a, level) { const [x, z] = a.site.w(a.lx, a.lz + 1.6); P.pos.set(x, level.y + 0.02, z); P.vy = 0; P.vel.set(0, 0, 0); P.liftFx = 1; }
export function enterBuilding(s) {
  const b = BRANDS[s.id];
  if (!b) return;
  const [dx, dz] = b.door, cx = b.site.x, cz = b.site.z;
  const ang = Math.atan2(dx - cx, dz - cz);
  // Doors are stored just outside the facade. Find the first usable point
  // along the inward axis rather than assuming every floor plan is identical.
  // This keeps the landing point on a registered interior floor and clear of
  // the facade/interior wall colliders.
  let landing = null;
  for (const distance of [4, 5, 6, 7, 8, 9, 10, 12]) {
    const x = dx - Math.sin(ang) * distance, z = dz - Math.cos(ang) * distance;
    const g = groundAt(x, z, 3);
    if (g.y <= -1e8 || g.water) continue;
    if (pointBlocked(x, g.y + 1.0, z, 0.28)) continue;
    landing = { x, y: g.y, z };
    break;
  }
  if (!landing) {
    events.toast && events.toast('The entrance is unavailable right now', '#ff5c8a');
    return;
  }
  const { x: inX, y, z: inZ } = landing;
  const from = camera.position.clone(), fq = camera.quaternion.clone();
  const endPos = new V3(inX, y, inZ);
  P.transition = { t: 0, dur: 1.8, from, fq, to: endPos, face: ang + Math.PI, ctrl: from.clone().lerp(endPos, 0.5).setY(Math.max(from.y, 40) + from.distanceTo(endPos) * 0.15), look: new V3(inX, y + 1.8, inZ) };
}
function cycleCamera() {
  if (P.mode === 'walk') { P.view = P.view === 'third' ? 'first' : 'third'; avatar.visible = P.view === 'third'; events.toast && events.toast(P.view === 'third' ? 'Third-person view' : 'First-person view'); }
  else if (['car', 'boat', 'fly'].includes(P.mode)) { P.camMode = (P.camMode + 1) % 4; events.toast && events.toast(['Chase cam', 'Far chase', P.mode === 'car' ? 'Cockpit' : 'Bow cam', 'Cinematic'][P.camMode]); }
}
export function toggleDrone() {
  if (P.mode === 'drone') { const g = groundAt(camera.position.x, camera.position.z, camera.position.y); if (!g.water && camera.position.y - g.y < 40) { placeOnFoot(camera.position.x, camera.position.z, P.yaw, camera.position.y); } else { setMode('walk'); } return; }
  if (P.mode !== 'walk') return; setMode('drone'); P.drone = camera.position.clone(); P.droneSpeed = P.droneSpeed || 40; events.toast && events.toast('Drone camera · WASD + Space/Ctrl · wheel = speed · F to land', '#7cffb2');
}

/* =====================================================================
   FAST TRAVEL + TOUR
   ===================================================================== */
export const PLACE_XY = { x: 0, z: 0 };
export function placeFor(id) {
  if (id === '__xy') return { x: PLACE_XY.x, z: PLACE_XY.z, face: Math.PI, look: [PLACE_XY.x, 4, PLACE_XY.z - 20] };
  const b = BRANDS[id];
  if (b) { const [dx, dz] = b.door, cx = b.site.x, cz = b.site.z, ang = Math.atan2(dx - cx, dz - cz); return { x: dx + Math.sin(ang) * 6, z: dz + Math.cos(ang) * 6, face: ang + Math.PI, look: [cx, 8, cz], brand: b }; }
  if (id === 'marina') return { x: MARINA.dock.x0 - 6, z: MARINA.dock.z - 1.2, face: -Math.PI / 2, look: [-560, 0, 170] };
  if (id === 'park') return { x: -20, z: 105, face: Math.PI, look: [-20, 18, 75] };
  if (id === 'north') return { x: 40 + 14, z: -300, face: Math.PI, look: [40, 0, -360] };
  return null;
}
export function travelTo(id) {
  const t = placeFor(id); if (!t) return;
  if (P.mode === 'tour') setMode('walk');
  if (P.mode === 'fly') { P.autopilot = { x: t.x, z: t.z, face: t.face, id }; events.toast && events.toast(`Autopilot engaged → ${t.brand ? t.brand.name : id}`, '#5fe3ff'); return; }
  if (P.mode === 'car' || P.mode === 'boat') exitVehicle();
  if (P.mode === 'drone' || P.mode === 'tour') setMode('walk');
  const g = groundAt(t.x, t.z, 3), y = g.y > -1e8 ? g.y : 0.2;
  const from = camera.position.clone(), fq = camera.quaternion.clone();
  const endPos = new V3(t.x, y, t.z);
  P.transition = { t: 0, dur: clamp(from.distanceTo(endPos) / 260, 1.6, 3.2), from, fq, to: endPos, face: t.face, ctrl: from.clone().lerp(endPos, 0.5).setY(Math.max(from.y, 60) + from.distanceTo(endPos) * 0.18), look: new V3(...t.look) };
}
const SHOTS = [
  { a: [-80, 60, 120], b: [-60, 46, 60], look: [-80, 14, -82], dur: 9 },
  { a: [-470, 22, -40], b: [-450, 16, 120], look: [-300, 8, 60], dur: 9 },
  { a: [140, 3.2, 30], b: [60, 3.0, 30], look: [100, 6, -58], dur: 8 },
  { a: [330, 14, -150], b: [340, 10, -30], look: [284, 4, -75], dur: 8 },
  { a: [-640, 26, 300], b: [-600, 18, 120], look: [-420, 4, 170], dur: 9 },
  { a: [-60, 330, 700], b: [260, 260, 520], look: [-60, 0, -40], dur: 12 },
  { a: [60, 40, 160], b: [150, 36, 160], look: [100, 12, 72], dur: 8 },
  { a: [-160, 40, -10], b: [-200, 34, -150], look: [-282, 12, -70], dur: 9 },
];
let shotI = 0, shotT = 0;
export function startTour() { setMode('tour'); shotI = 0; shotT = 0; }
export function stopTour(placeAt = 'hotspot') { if (P.mode !== 'tour') return; setMode('walk'); travelTo(placeAt); }

/* =====================================================================
   UPDATE
   ===================================================================== */
const _f = new V3(), _r = new V3(), _mv = new V3(), _cam = new V3(), _look = new V3(), _tmp = new V3();
let avatarPh = 0;
function camCollide(head, desired) {
  // march from head toward desired, stop before solids
  const steps = 14; let last = head.clone();
  for (let i = 1; i <= steps; i++) {
    _tmp.lerpVectors(head, desired, i / steps);
    const g = groundAt(_tmp.x, _tmp.z, _tmp.y);
    if (pointBlocked(_tmp.x, _tmp.y, _tmp.z, 0.25) || _tmp.y < g.y + 0.25) return last;
    const ceil = ceilingAbove(_tmp.x, _tmp.z, head.y - 0.5, 50); if (ceil != null && _tmp.y > ceil - 0.35 && ceil > head.y) return last;
    last.copy(_tmp);
  }
  return last;
}
function vehicleCamera(v, dt, opts) {
  const ang = v.h + P.camYaw + Math.PI, mode = P.camMode;
  if (P.camTouched > 0) P.camTouched -= dt; else P.camYaw *= Math.exp(-dt * 1.5);
  if (mode === 2) { // cockpit / bow
    const e = opts.eye; const g = v.m.g; _cam.set(e[0], e[1], e[2]).applyMatrix4(g.matrixWorld);
    camera.position.copy(_cam); _look.set(e[0], e[1] - 0.15, e[2] + 10).applyMatrix4(g.matrixWorld); _look.x += Math.sin(v.h + P.camYaw) * 0; camera.up.set(0, 1, 0); camera.lookAt(_look);
    if (P.camYaw) { camera.rotateY(P.camYaw); }
    return;
  }
  if (mode === 3) { // cinematic: low orbit
    const t = performance.now() / 1000; const a = v.h + Math.PI * 0.75 + Math.sin(t * 0.15) * 0.9; const dist = opts.dist * 1.3;
    _cam.set(v.x + Math.sin(a) * dist, v.y + opts.up * 0.55 + 0.6, v.z + Math.cos(a) * dist);
    camera.position.lerp(_cam, 1 - Math.exp(-dt * 2)); camera.lookAt(v.x, v.y + opts.up * 0.3, v.z); return;
  }
  const dist = (mode === 1 ? 1.8 : 1) * P.camDist, pitch = P.camPitch + (mode === 1 ? 0.12 : 0);
  _cam.set(v.x + Math.sin(ang) * Math.cos(pitch) * dist, v.y + opts.up + Math.sin(pitch) * dist, v.z + Math.cos(ang) * Math.cos(pitch) * dist);
  const head = _tmp.set(v.x, v.y + opts.up, v.z).clone();
  if (P.mode !== 'fly' && P.mode !== 'boat') _cam.copy(camCollide(head, _cam));
  if (P.mode === 'boat') _cam.y = Math.max(_cam.y, WATER_Y + 1.2);
  const k = 1 - Math.exp(-dt * opts.stiff);
  camera.position.lerp(_cam, k);
  const gy = groundAt(camera.position.x, camera.position.z, camera.position.y).y; if (camera.position.y < gy + 0.4) camera.position.y = gy + 0.4;
  _look.set(v.x + Math.sin(v.h) * opts.lead, v.y + opts.up * 0.55, v.z + Math.cos(v.h) * opts.lead); camera.lookAt(_look);
}
export function updatePlayer(dt, time) {
  const I = input();
  playerPos.x = P.pos.x; playerPos.z = P.pos.z;
  // transitions (fast travel)
  if (P.transition) {
    const tr = P.transition; tr.t += dt / tr.dur; const t = Math.min(1, tr.t), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, u = 1 - e;
    const eye = tr.to.clone().add(new V3(0, 1.7, 0)).add(new V3(Math.sin(tr.face + Math.PI) * 4.2, 1.2, Math.cos(tr.face + Math.PI) * 4.2));
    camera.position.set(u * u * tr.from.x + 2 * u * e * tr.ctrl.x + e * e * eye.x, u * u * tr.from.y + 2 * u * e * tr.ctrl.y + e * e * eye.y, u * u * tr.from.z + 2 * u * e * tr.ctrl.z + e * e * eye.z);
    const q1 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(camera.position, e > 0.6 ? tr.to.clone().add(new V3(Math.sin(tr.face) * 10, 3, Math.cos(tr.face) * 10)) : tr.look, new V3(0, 1, 0)));
    camera.quaternion.slerpQuaternions(tr.fq, q1, Math.min(1, e * 1.2));
    if (t >= 1) {
      P.transition = null;
      P.pos.copy(tr.to);
      P.lastSafe.copy(tr.to);
      P.vel.set(0, 0, 0);
      P.vy = 0;
      P.onGround = true;
      P.yaw = tr.face;
      P.pitch = -0.08;
      setMode('walk');
    }
    return;
  }
  if (P.mode === 'tour') {
    const S = SHOTS[shotI]; shotT += dt / S.dur; if (shotT >= 1) { shotT = 0; shotI = (shotI + 1) % SHOTS.length; }
    const e = shotT * shotT * (3 - 2 * shotT) * 0.6 + shotT * 0.4;
    camera.position.set(S.a[0] + (S.b[0] - S.a[0]) * e, S.a[1] + (S.b[1] - S.a[1]) * e, S.a[2] + (S.b[2] - S.a[2]) * e); camera.lookAt(S.look[0], S.look[1], S.look[2]);
    avatar.visible = false; return;
  }
  if (P.mode === 'drone') {
    camera.rotation.set(P.pitch, P.yaw, 0, 'YXZ');
    camera.getWorldDirection(_f); _r.crossVectors(_f, camera.up).normalize();
    _mv.set(0, 0, 0).addScaledVector(_f, I.throttle).addScaledVector(_r, -I.steer); _mv.y += I.up - I.down;
    const sp = (P.droneSpeed || 40) * (I.boost ? 3 : 1); if (_mv.lengthSq() > 0) _mv.normalize().multiplyScalar(sp);
    P.vel.lerp(_mv, 1 - Math.exp(-dt * 5)); camera.position.addScaledVector(P.vel, dt);
    const g = groundAt(camera.position.x, camera.position.z, camera.position.y); camera.position.y = clamp(camera.position.y, Math.max(g.y, WATER_Y) + 0.6, 1600);
    return;
  }
  if (P.mode === 'car') { P.car.update(dt, I, time); playerPos.x = P.car.x; playerPos.z = P.car.z; vehicleCamera(P.car, dt, { up: 1.6, lead: 4, stiff: 7, eye: P.car.T.eye, dist: 7 }); return; }
  if (P.mode === 'boat') { P.boat.update(dt, I, time); vehicleCamera(P.boat, dt, { up: P.boat.type === 'yacht' ? 4 : 2, lead: 6, stiff: 4, eye: P.boat.m.seat, dist: P.camDist }); return; }
  if (P.mode === 'fly') {
    if (P.autopilot) {
      const ap = P.autopilot, dx = ap.x - P.fly.x, dz = ap.z - P.fly.z, d = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz), dh = angDiff(want, P.fly.h);
      const alt = groundAt(P.fly.x, P.fly.z, 900).y; const cruise = Math.max(alt + 70, 90);
      const AI = { throttle: d > 30 ? 1 : 0, steer: clamp(dh * 2, -1, 1), boost: d > 200, brake: d < 40, up: P.fly.y < cruise - 4 && d > 60 ? 1 : 0, down: d < 60 ? 1 : 0 };
      if (I.throttle || I.steer) { P.autopilot = null; events.toast && events.toast('Autopilot off'); }
      else { P.fly.update(dt, AI, time); if (d < 20 && P.fly.landed) { P.autopilot = null; events.toast && events.toast('Landed. Press E to step out', '#5fe3ff'); } }
    } else P.fly.update(dt, I, time);
    vehicleCamera(P.fly, dt, { up: 2.2, lead: 6, stiff: 3.5, eye: P.fly.m.eye, dist: 11 }); return;
  }
  // ---------- WALK ----------
  const sprint = I.boost, speed = sprint ? 9.5 : 4.4;
  _f.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)); _r.set(-_f.z, 0, _f.x);
  _mv.set(0, 0, 0).addScaledVector(_f, I.throttle).addScaledVector(_r, -I.steer); if (_mv.lengthSq() > 1) _mv.normalize(); _mv.multiplyScalar(speed);
  P.vel.lerp(_mv, 1 - Math.exp(-dt * (P.onGround ? 10 : 2)));
  const nx = P.pos.x + P.vel.x * dt, nz = P.pos.z + P.vel.z * dt;
  const p2 = { x: nx, z: nz }; collide(p2, 0.32, P.pos.y + 0.35, P.pos.y + 1.8, 'walk');
  const gNext = groundAt(p2.x, p2.z, P.pos.y + 0.65);
  if (gNext.water && P.pos.y < 1 || gNext.y < P.pos.y - 6) { /* edge of the world / water: stop */ P.vel.set(0, 0, 0); }
  else { P.pos.x = p2.x; P.pos.z = p2.z; }
  if ((keys.has('Space') || vbtn.up) && P.onGround) { P.vy = 5.4; P.onGround = false; }
  P.vy -= 18 * dt; P.pos.y += P.vy * dt;
  const g = groundAt(P.pos.x, P.pos.z, P.pos.y + 0.65);
  const ceil = ceilingAbove(P.pos.x, P.pos.z, P.pos.y, 1.9); if (ceil != null && P.vy > 0) P.vy = 0;
  if (g.y > -1e8 && P.pos.y <= g.y) { P.pos.y = g.y; P.vy = 0; P.onGround = true; }
  else if (g.y > -1e8 && P.pos.y - g.y < 0.25 && P.vy <= 0) { P.pos.y = g.y; P.vy = 0; P.onGround = true; }
  else P.onGround = false;
  if (P.pos.y < WATER_Y - 1.5 || g.y < -1e8) { P.pos.copy(P.lastSafe); P.vy = 0; events.toast && events.toast('Whoa — back on dry land', '#4dc8ff'); }
  if (P.onGround && !g.water) P.lastSafe.copy(P.pos);
  // avatar + camera
  const sp = Math.hypot(P.vel.x, P.vel.z); avatarPh += dt * sp * 1.25;
  const moving = sp > 0.3;
  const heading = moving ? Math.atan2(P.vel.x, P.vel.z) : (avatar.userData.h ?? P.yaw + Math.PI);
  avatar.userData.h = (avatar.userData.h ?? heading) + angDiff(heading, avatar.userData.h ?? heading) * Math.min(1, dt * 10);
  avatar.position.copy(P.pos); avatar.rotation.y = avatar.userData.h;
  avatar.userData.pose(moving ? walkPose(avatarPh, Math.min(1, sp / 4.4) * (sprint ? 1.25 : 1)) : modePose('stand', time, 0));
  const head = _tmp.set(P.pos.x, P.pos.y + 1.62, P.pos.z).clone();
  if (P.view === 'first') { camera.position.copy(head); camera.rotation.set(P.pitch, P.yaw, 0, 'YXZ'); avatar.visible = false; }
  else {
    avatar.visible = true;
    const dist = P.walkDist || 4.2;
    const back = _cam.set(head.x + Math.sin(P.yaw) * Math.cos(P.pitch) * dist, head.y - Math.sin(P.pitch) * dist + 0.35, head.z + Math.cos(P.yaw) * Math.cos(P.pitch) * dist);
    // shoulder offset
    back.x += Math.cos(P.yaw) * 0.55; back.z -= Math.sin(P.yaw) * 0.55;
    const c = camCollide(head, back);
    camera.position.copy(c); camera.rotation.set(P.pitch, P.yaw, 0, 'YXZ');
    if (camera.position.distanceTo(head) < 1.0) avatar.visible = false;
  }
  if (P.liftFx > 0) P.liftFx -= dt;
}
updaters.push(updatePlayer);

/* =====================================================================
   WHERE AM I — district & building
   ===================================================================== */
export function whereIs(x, z) {
  for (const s of sites) { if (!s.foot || !s.site) continue; const lx = (x - s.site.x) * s.site.c - (z - s.site.z) * s.site.s, lz = (x - s.site.x) * s.site.s + (z - s.site.z) * s.site.c;
    if (Math.abs(lx) < s.foot.w / 2 && Math.abs(lz) < s.foot.d / 2) return { site: s }; }
  for (const [k, D] of Object.entries(DISTRICTS)) { const [x0, z0, x1, z1] = D.box; if (x > x0 && x < x1 && z > z0 && z < z1) return { district: k }; }
  if (x > 340 && x < 620) return { district: 'east' };
  return { district: null };
}
export { setMode, exitVehicle, avatar };
