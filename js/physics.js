// Spatial queries: floors (what you stand on) and colliders (what stops you). Hash-gridded.
import { colliders, floors } from './core.js';
import { terrainHeight, WATER_Y } from './layout.js';

const CELL = 32;
let cGrid = null, cCount = -1, fGrid = null, fCount = -1;
const key = (i, j) => i * 100003 + j;
function bounds(c) {
  if (c.seg) { const [ax, az, bx, bz] = c.seg; return [Math.min(ax, bx) - c.r, Math.max(ax, bx) + c.r, Math.min(az, bz) - c.r, Math.max(az, bz) + c.r]; }
  if (c.r != null) return [c.x - c.r, c.x + c.r, c.z - c.r, c.z + c.r];
  return [c.x - c.hw, c.x + c.hw, c.z - c.hd, c.z + c.hd];
}
function fBounds(f) { if (f.ell) { const [cx, cz, rx, rz] = f.ell; return [cx - rx, cx + rx, cz - rz, cz + rz]; } return [f.x0, f.x1, f.z0, f.z1]; }
function build(list, bfn) {
  const g = new Map();
  for (const c of list) { const [x0, x1, z0, z1] = bfn(c); for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) { const k = key(i, j); let a = g.get(k); if (!a) g.set(k, a = []); a.push(c); } }
  return g;
}
export function dirty() { cCount = -1; fCount = -1; }
function cg() { if (cCount !== colliders.length) { cGrid = build(colliders.filter(c => !c.dead), bounds); cCount = colliders.length; } return cGrid; }
function fg() { if (fCount !== floors.length) { fGrid = build(floors.filter(f => !f.dead), fBounds); fCount = floors.length; } return fGrid; }

function inFloor(f, x, z) {
  if (f.ell) {
    const [cx, cz, rx, rz, irx, irz] = f.ell; const dx = x - cx, dz = z - cz;
    if (f.zMin != null && z < f.zMin) return false;
    if ((dx * dx) / (rx * rx) + (dz * dz) / (rz * rz) > 1) return false;
    if (irx > 0 && (dx * dx) / (irx * irx) + (dz * dz) / (irz * irz) < 1) return false;
    return true;
  }
  return x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1;
}
/** highest walkable surface at (x,z) at or below yMax. returns {y, water} */
export function groundAt(x, z, yMax = 1e9) {
  let best = -1e9;
  const t = terrainHeight(x, z); const wet = t < WATER_Y - 0.15;
  if (!wet) best = t;
  const a = fg().get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (a) for (const f of a) if (f.y <= yMax && f.y > best && inFloor(f, x, z)) best = f.y;
  return { y: best, water: best === -1e9 || (wet && best < WATER_Y) , terrain: t };
}
export const navigable = (x, z) => terrainHeight(x, z) < WATER_Y - 0.55;

/**
 * Push a circle (x,z,r) occupying [y0,y1] out of colliders. mode: 'walk'|'car'|'boat'|'fly'
 * returns number of hits; mutates p.x / p.z
 */
export function collide(p, r, y0, y1, mode = 'walk') {
  const g = cg(); let hits = 0;
  const i0 = Math.floor((p.x - r) / CELL), i1 = Math.floor((p.x + r) / CELL), j0 = Math.floor((p.z - r) / CELL), j1 = Math.floor((p.z + r) / CELL);
  const seen = new Set();
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const a = g.get(key(i, j)); if (!a) continue;
    for (const c of a) {
      if (seen.has(c)) continue; seen.add(c);
      if ((c.boatOnly || c.boat) && mode !== 'boat') continue;
      if (c.small && mode === 'fly') continue;
      if (y1 < c.y0 || y0 > c.y1) continue;
      if (c.seg) {
        const [ax, az, bx, bz] = c.seg, dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
        let t = ((p.x - ax) * dx + (p.z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + dx * t, qz = az + dz * t; let ex = p.x - qx, ez = p.z - qz; const d = Math.hypot(ex, ez), m = r + c.r;
        if (d < m) { if (d < 1e-5) { ex = -dz; ez = dx; const l = Math.hypot(ex, ez); ex /= l; ez /= l; } else { ex /= d; ez /= d; } p.x = qx + ex * m; p.z = qz + ez * m; hits++; }
      } else if (c.r != null) {
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
        if (d < m) { if (d < 1e-5) { p.x += m; } else { p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; } hits++; }
      } else {
        const qx = Math.max(c.x - c.hw, Math.min(p.x, c.x + c.hw)), qz = Math.max(c.z - c.hd, Math.min(p.z, c.z + c.hd));
        const dx = p.x - qx, dz = p.z - qz, d = Math.hypot(dx, dz);
        if (d < r) {
          if (d < 1e-5) { const px = c.hw - Math.abs(p.x - c.x), pz = c.hd - Math.abs(p.z - c.z); if (px < pz) p.x = c.x + Math.sign(p.x - c.x || 1) * (c.hw + r); else p.z = c.z + Math.sign(p.z - c.z || 1) * (c.hd + r); }
          else { p.x = qx + dx / d * r; p.z = qz + dz / d * r; }
          hits++;
        }
      }
    }
  }
  return hits;
}
/** is any collider occupying point (x,y,z)?  (for flying vehicles) returns top y or null */
export function solidTop(x, z, y) {
  const a = cg().get(key(Math.floor(x / CELL), Math.floor(z / CELL))); if (!a) return null; let top = null;
  for (const c of a) {
    if (c.boatOnly || c.boat || c.small) continue;
    let inside = false;
    if (c.seg) continue;
    if (c.r != null) inside = Math.hypot(x - c.x, z - c.z) < c.r; else inside = Math.abs(x - c.x) < c.hw && Math.abs(z - c.z) < c.hd;
    if (inside && y > c.y0 - 1 && y < c.y1 + 1.2) top = Math.max(top ?? -1e9, c.y1);
  }
  return top;
}

/** true if the point (x,y,z) is inside any solid collider (used for camera collision) */
export function pointBlocked(x, y, z, pad = 0.2) {
  const a = cg().get(key(Math.floor(x / CELL), Math.floor(z / CELL))); if (!a) return false;
  for (const c of a) {
    if (c.boat || c.boatOnly || c.small) continue;
    if (y < c.y0 - 0.1 || y > c.y1 + 0.1) continue;
    if (c.seg) { const [ax, az, bx, bz] = c.seg, dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; let t = ((x - ax) * dx + (z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t; if (Math.hypot(x - ax - dx * t, z - az - dz * t) < c.r + pad) return true; }
    else if (c.r != null) { if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return true; }
    else if (Math.abs(x - c.x) < c.hw + pad && Math.abs(z - c.z) < c.hd + pad) return true;
  }
  return false;
}
/** ceiling directly above (x,z) between y and y+h (floors act as ceilings) */
export function ceilingAbove(x, z, y, h) {
  const a = fg().get(key(Math.floor(x / CELL), Math.floor(z / CELL))); if (!a) return null; let best = null;
  for (const f of a) if (f.y > y + 0.3 && f.y < y + h && inFloor(f, x, z)) best = best == null ? f.y : Math.min(best, f.y);
  return best;
}
