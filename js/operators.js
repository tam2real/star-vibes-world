// Embodied operator layer: named, addressable versions of the shared T2R/Sage agents.
// This local roster is a prototype projection; task truth belongs to the shared runtime.
import { THREE, V3, scene, camera, updaters, rand, rr } from './core.js';
import { groundAt, collide, navigable } from './physics.js';
import { BRANDS } from './brands.js';
import { buildAvatar, walkPose } from './people.js';
import { NODES, nearestNode, route } from './roads.js';
import { PlayerCar, PlayerBoat, PlayerFlyer } from './vehicles.js';

export const OPERATORS = [
  { id: 'echo', name: 'Echo', role: 'Media City manager', home: 'starvibes', color: '#ff3333', work: 'Editing studio' },
  { id: 'vector', name: 'Vector', role: 'Crypto City manager', home: 'hotspot', color: '#ffd700', work: 'Market floor' },
  { id: 'forge', name: 'Forge', role: 'Builder', home: 'garage', color: '#7b2fff', work: 'Build workshop' },
  { id: 'guardian', name: 'Guardian', role: 'Safety and recovery', home: 'kitchen', color: '#e056a0', work: 'Safety station' },
  { id: 'omnis', name: 'Omnis', role: 'Strategy and coordination', home: 'glostar', color: '#9b59b6', work: 'Strategy room' },
  { id: 'gideon', name: 'Gideon', role: 'Rules and audit', home: 'glostar', color: '#7ec8e8', work: 'Audit wing' },
  { id: 'pulse', name: 'Pulse', role: 'Sensors and monitoring', home: 'glostar', color: '#2ee88f', work: 'Monitoring floor' },
  { id: 'rift', name: 'Rift', role: 'Sandbox and scouting', home: null, color: '#e040fb', work: 'Roaming scout' },
  { id: 'ultron', name: 'Ultron', role: 'Automation and scale', home: 'starvibes', color: '#8b0000', work: 'Automation wing' },
  { id: 'jarvis', name: 'Jarvis', role: 'Operations desk', home: 'starvibes', color: '#b82a1f', work: 'Operations floor' },
  { id: 'friday', name: 'Friday', role: 'Messages and calendar', home: 'starvibes', color: '#ff66b2', work: 'Communications desk' },
  { id: 'glitch', name: 'Glitch', role: 'Incident recovery', home: null, color: '#ff4040', work: 'Recovery response' },
  { id: 'sage', name: 'Sage', role: 'Company routing and decisions', home: 'starvibes', color: '#5fe3ff', work: 'Command office' },
];

// Capability domains only. Concrete routine/workflow IDs are loaded from Elfie;
// this projection deliberately does not invent automation names.
export const OPERATOR_AUTOMATION_DOMAINS = {
  sage: ['routing', 'synthesis', 'proposals'],
  echo: ['streaming', 'editing', 'publishing'],
  vector: ['markets', 'research', 'board'],
  forge: ['code', 'prototype', 'deploy'],
  guardian: ['safety', 'recovery', 'halt'],
  omnis: ['strategy', 'scheduling', 'coordination'],
  gideon: ['audit', 'compliance', 'veto'],
  pulse: ['monitoring', 'sensors', 'alerts'],
  rift: ['scouting', 'experiments', 'research'],
  ultron: ['automation', 'routines', 'scale'],
  jarvis: ['operations', 'fleet', 'status'],
  friday: ['messages', 'email', 'calendar'],
  glitch: ['incidents', 'recovery', 'repair'],
};

const byId = Object.fromEntries(OPERATORS.map(o => [o.id, o]));
export const operatorState = Object.fromEntries(OPERATORS.map(o => [o.id, { status: 'working', task: o.work, taskId: null, destination: null }]));
export const operatorAt = Object.fromEntries(OPERATORS.map(o => [o.id, { x: 0, y: 0, z: 0 }]));

function labelTexture(op) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
  g.font = '800 30px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(5,10,22,.9)'; g.roundRect(8, 8, 496, 112, 18); g.fill();
  g.strokeStyle = op.color; g.lineWidth = 4; g.stroke();
  g.fillStyle = '#fff'; g.fillText(op.name.toUpperCase(), 256, 42);
  g.font = '600 18px system-ui'; g.fillStyle = op.color; g.fillText(op.role, 256, 78);
  g.font = '500 14px system-ui'; g.fillStyle = '#bfd2e8'; g.fillText(op.work, 256, 101);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function makeNpc(op) {
  const root = new THREE.Group(); root.userData.operatorId = op.id;
  const aura = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 8, 24), new THREE.MeshBasicMaterial({ color: op.color, transparent: true, opacity: 0.8 }));
  aura.rotation.x = -Math.PI / 2; aura.position.y = 0.03; root.add(aura);
  // Reuse the actual Star Vibes player body: same proportions, jacket, face,
  // limbs, and chest star. Operators are characters in this world, not cubes.
  const avatar = buildAvatar({ color: op.color, accent: op.color });
  scene.remove(avatar); avatar.scale.setScalar(1.18); root.add(avatar);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(op), transparent: true, depthTest: false })); glow.scale.set(3.3, 0.83, 1); glow.position.y = 2.55; root.add(glow);
  scene.add(root); return { root, avatar, aura, op, phase: rand() * 10, target: new V3(), path: [], pathIndex: 0, vehicle: null, speed: 1.0 + rand() * 0.35, wait: rr(1, 4), status: operatorState[op.id] };
}

const npcs = OPERATORS.map(makeNpc);
function homePoint(op, phase) {
  const assigned = operatorState[op.id]?.destination;
  if (assigned) return { x: assigned.x, z: assigned.z };
  const b = op.home && BRANDS[op.home];
  if (!b || !b.site) return { x: -40 + Math.sin(phase) * 30, z: 40 + Math.cos(phase) * 35 };
  const [dx, dz] = b.door; return { x: b.site.x + Math.sin(phase * 1.7) * 7, z: b.site.z + Math.cos(phase * 1.3) * 7 };
}

for (const n of npcs) {
  const p = homePoint(n.op, n.phase); const g = groundAt(p.x, p.z, 4); n.root.position.set(p.x, Math.max(0, g.y), p.z); operatorAt[n.op.id].x = p.x; operatorAt[n.op.id].y = n.root.position.y; operatorAt[n.op.id].z = p.z;
}

export function operatorById(id) { return byId[id] || null; }
export function setOperatorTask(id, task, status = 'working') { if (!byId[id]) return false; operatorState[id].task = task; operatorState[id].status = status; const n = npcs.find(x => x.op.id === id); if (n) n.op.work = task; return true; }
export function setOperatorTaskRecord(id, taskId, task, status = 'working') { if (!byId[id]) return false; operatorState[id].taskId = taskId || null; return setOperatorTask(id, task || operatorState[id].task, status); }
function buildPath(n, x, z) {
  const from = nearestNode(n.root.position.x, n.root.position.z);
  const to = nearestNode(x, z);
  const ids = from && to ? route(from.id, to.id) : null;
  n.path = ids ? ids.map(id => ({ x: NODES[id].x, z: NODES[id].z })) : [];
  n.path.push({ x: Number(x), z: Number(z) }); n.pathIndex = 0;
}
export function setOperatorDestination(id, x, z, label = 'dispatched') {
  if (!byId[id]) return false;
  const destination = { x: Number(x), z: Number(z), label };
  operatorState[id].destination = destination; operatorState[id].status = 'en route';
  const n = npcs.find(x => x.op.id === id); if (n) buildPath(n, destination.x, destination.z);
  return true;
}
export function setOperatorVehicle(id, kind = 'car') {
  const n = npcs.find(x => x.op.id === id); if (!n) return false;
  if (n.vehicle) n.vehicle.dispose();
  const x = kind === 'boat' ? -560 : n.root.position.x, z = kind === 'boat' ? 170 : n.root.position.z, h = n.root.rotation.y;
  n.vehicle = kind === 'boat' ? new PlayerBoat('sport', x, z, h) : kind === 'fly' ? new PlayerFlyer(x, n.root.position.y + 0.5, z, h) : new PlayerCar('sport', x, z, h);
  n.root.position.set(x, n.vehicle.y || n.root.position.y, z); operatorState[id].vehicle = { kind, status: 'ready' }; n.avatar.visible = false; return true;
}
export function clearOperatorVehicle(id) {
  const n = npcs.find(x => x.op.id === id); if (!n) return false;
  if (n.vehicle) n.vehicle.dispose(); n.vehicle = null; operatorState[id].vehicle = null; n.avatar.visible = true; return true;
}
export function clearOperatorDestination(id) { if (!byId[id]) return false; operatorState[id].destination = null; operatorState[id].status = 'working'; return true; }
export function getOperatorState(id) { return operatorState[id] || null; }

updaters.push((dt, time) => {
  for (const n of npcs) {
    n.wait -= dt; if (n.wait <= 0) {
      const p = homePoint(n.op, time * 0.12 + n.phase);
      if (operatorState[n.op.id]?.destination && n.path.length) {
        const next = n.path[Math.min(n.pathIndex, n.path.length - 1)]; n.target.set(next.x, 0, next.z);
      } else n.target.set(p.x, 0, p.z);
      n.wait = rr(3, 8);
    }
    // Vehicles must advance through the route themselves. Previously the
    // vehicle branch never incremented pathIndex, so a dispatched operator
    // kept steering around the first waypoint forever.
    if (n.vehicle && operatorState[n.op.id]?.destination && n.path.length) {
      const next = n.path[Math.min(n.pathIndex, n.path.length - 1)];
      n.target.set(next.x, 0, next.z);
      const vd = Math.hypot(n.target.x - n.vehicle.x, n.target.z - n.vehicle.z);
      const arrivalRadius = n.vehicle.kind === 'fly' ? 7 : n.vehicle.kind === 'boat' ? 5 : 3.5;
      if (vd <= arrivalRadius) {
        if (n.pathIndex < n.path.length - 1) {
          n.pathIndex += 1; n.wait = 0;
        } else {
          operatorState[n.op.id].status = 'arrived';
          n.vehicle.speed = 0;
          operatorState[n.op.id].vehicle.status = n.vehicle.kind === 'boat' ? 'docked' : n.vehicle.kind === 'fly' ? 'landed' : 'parked';
          n.target.set(n.vehicle.x, 0, n.vehicle.z);
        }
      }
    }
    const dx = n.target.x - n.root.position.x, dz = n.target.z - n.root.position.z, d = Math.hypot(dx, dz);
    if (n.vehicle && operatorState[n.op.id]?.status !== 'arrived' && d > 0.4) {
      const v = n.vehicle, desired = Math.atan2(dx, dz), delta = Math.atan2(Math.sin(desired - v.h), Math.cos(desired - v.h));
      const input = { throttle: 1, steer: Math.max(-1, Math.min(1, delta * 2.2)), boost: false, brake: false, up: 0, down: 0 };
      if (v.kind === 'car') v.update(dt, input, time);
      else if (v.kind === 'boat') v.update(dt, input, time);
      else { input.boost = true; input.up = 0; input.down = 0; v.update(dt, input, time); }
      n.root.position.set(v.x, v.y, v.z); n.root.rotation.y = v.h; operatorAt[n.op.id].x = v.x; operatorAt[n.op.id].y = v.y; operatorAt[n.op.id].z = v.z; operatorState[n.op.id].vehicle.status = 'en route';
    } else if (d > 0.4) {
      const step = Math.min(d, n.speed * dt), nx = n.root.position.x + dx / d * step, nz = n.root.position.z + dz / d * step;
      if (!navigable(nx, nz)) { operatorState[n.op.id].status = 'blocked'; n.wait = 1.5; }
      else {
        const p = { x: nx, z: nz }, hit = collide(p, 0.34, n.root.position.y + 0.15, n.root.position.y + 1.9, 'walk');
        if (hit) { operatorState[n.op.id].status = 'blocked'; n.wait = 1.5; }
        else { n.root.position.x = p.x; n.root.position.z = p.z; n.root.rotation.y = Math.atan2(dx, dz); n.avatar.userData.pose(walkPose(time * n.speed * 5 + n.phase, 1)); if (operatorState[n.op.id]?.destination) operatorState[n.op.id].status = 'en route'; }
      }
    }
    else if (operatorState[n.op.id]?.destination && n.path.length && n.pathIndex < n.path.length - 1) { n.pathIndex++; n.wait = 0; }
    else if (operatorState[n.op.id]?.destination && n.path.length && n.pathIndex === n.path.length - 1) {
      operatorState[n.op.id].status = 'arrived';
      if (n.vehicle) { n.vehicle.speed = 0; operatorState[n.op.id].vehicle.status = n.vehicle.kind === 'boat' ? 'docked' : n.vehicle.kind === 'fly' ? 'landed' : 'parked'; }
    }
    else n.avatar.userData.pose({ bob: Math.abs(Math.sin(time * 1.5 + n.phase)) * 0.02 });
    const g = groundAt(n.root.position.x, n.root.position.z, n.root.position.y + 2); n.root.position.y = Math.max(0, g.y);
    n.aura.rotation.z = time * 0.8 + n.phase; operatorAt[n.op.id].x = n.root.position.x; operatorAt[n.op.id].y = n.root.position.y; operatorAt[n.op.id].z = n.root.position.z;
  }
});

export function nearestOperator(position, radius = 3.5) {
  let best = null, bd = radius;
  for (const n of npcs) { const d = Math.hypot(position.x - n.root.position.x, position.z - n.root.position.z); if (d < bd) { bd = d; best = n.op; } }
  return best;
}
