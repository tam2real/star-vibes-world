// [LAYOUT] — the shape of Star Vibes World: water, districts, streets, brand lots, plots.
// Coordinates: +x = EAST, -x = WEST (Lake Champlain), -z = NORTH, +z = SOUTH. 1 unit ≈ 1 m.
import { THREE, V3, smooth, mulberry } from './core.js';

export const WATER_Y = -1.0;

/* ---------- Lake Champlain shoreline (west edge of town) ---------- */
export function shoreX(z) { return -360 + 22 * Math.sin(z / 150) + 12 * Math.sin(z / 53 + 1.3) + (z < -900 ? (z + 900) * 0.04 : 0); }
export function lakeWestX(z) { return -2900 + 220 * Math.sin(z / 900) + 120 * Math.sin(z / 310); }

/* ---------- Saranac River (east edge, bends west to the lake at the south) ---------- */
const RIVER_PTS = [[385, -7200], [390, -2400], [372, -1000], [360, -450], [372, -150], [355, 150], [330, 330], [262, 462], [120, 528], [-60, 552], [-250, 566], [-460, 568]];
export const riverCurve = new THREE.CatmullRomCurve3(RIVER_PTS.map(([x, z]) => new V3(x, 0, z)), false, 'centripetal');
export const riverPts = riverCurve.getSpacedPoints(900);
const RIVER_BINS = new Map(), BIN = 60;
for (let i = 0; i < riverPts.length - 1; i++) {
  const a = riverPts[i], b = riverPts[i + 1];
  const z0 = Math.floor((Math.min(a.z, b.z) - 150) / BIN), z1 = Math.floor((Math.max(a.z, b.z) + 150) / BIN);
  for (let k = z0; k <= z1; k++) { if (!RIVER_BINS.has(k)) RIVER_BINS.set(k, []); RIVER_BINS.get(k).push(i); }
}
export function riverHalfW(z) { return 29 + smooth(380, 560, z) * 14; }
/** returns {d, t} distance to river centreline and normalised param */
export function riverInfo(x, z) {
  const segs = RIVER_BINS.get(Math.floor(z / BIN)); if (!segs) return { d: 1e9, i: 0 };
  let best = 1e9, bi = 0;
  for (const i of segs) {
    const a = riverPts[i], b = riverPts[i + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
    let t = ((x - a.x) * dx + (z - a.z) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - a.x - dx * t, ez = z - a.z - dz * t, d = ex * ex + ez * ez;
    if (d < best) { best = d; bi = i + t; }
  }
  return { d: Math.sqrt(best), i: bi };
}
export const riverDist = (x, z) => riverInfo(x, z).d;

/* ---------- value noise ---------- */
const nr = mulberry(77); const PERM = new Float32Array(512 * 512); for (let i = 0; i < PERM.length; i++) PERM[i] = nr();
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const h = (i, j) => PERM[((i & 511) * 512 + (j & 511))];
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return (h(xi, zi) * (1 - u) + h(xi + 1, zi) * u) * (1 - v) + (h(xi, zi + 1) * (1 - u) + h(xi + 1, zi + 1) * u) * v;
}
export function fbm(x, z, oct = 5) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; } return s; }
function ridged(x, z, oct = 5) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * (1 - Math.abs(2 * vnoise(x * f, z * f) - 1)) ** 2; f *= 2.1; a *= 0.5; } return s; }

/* ---------- terrain height ---------- */
export function waterKind(x, z) {
  if (x < shoreX(z) && x > lakeWestX(z)) return 'lake';
  if (riverDist(x, z) < riverHalfW(z)) return 'river';
  return null;
}
export function terrainHeight(x, z) {
  const sx = shoreX(z), lw = lakeWestX(z);
  const dl = x - sx;                              // >0 land (east of shore)
  const dw = lw - x;                              // >0 land west of the lake (Vermont side in our mirror)
  const ri = riverDist(x, z) - riverHalfW(z);      // >0 land
  let h = 0;
  if (dw > 0) {   // far shore: hills then mountains
    const m = smooth(0, 900, dw);
    h = -6 + smooth(0, 60, dw) * 8 + m * (90 * fbm(x / 700, z / 700) + 650 * ridged(x / 1500 + 3, z / 1500) * smooth(200, 2400, dw));
    return h;
  }
  if (dl < 0) { return Math.max(-9, -1.6 + dl * 0.25); }   // lake bed
  if (ri < 0) { return Math.max(-7, -1.6 + ri * 0.22); }   // river bed
  // land: flat town, rolling hills farther out
  const r = Math.hypot(x * 0.9, (z + 150) * 0.7);
  const shoreFade = smooth(0, 260, Math.min(dl, ri));
  const hills = smooth(950, 2600, r) * shoreFade;
  h = hills * (40 * fbm(x / 520, z / 520) + 340 * ridged(x / 1900 + 11, z / 1900 - 4) * smooth(1800, 5200, r));
  const m = Math.min(dl, ri);
  if (m < 3) h = Math.min(h, -1.6 + m * 0.533);   // shore lip (hidden by sea walls in town)
  return h;
}
export function isWater(x, z) { return terrainHeight(x, z) < WATER_Y - 0.25; }

/* ---------- districts ---------- */
export const DISTRICTS = {
  downtown:   { name: 'Downtown Core',    sub: 'Shops · galleries · studios · nightlife', color: '#ffc65c', center: [-20, -20], box: [-200, -150, 250, 150] },
  waterfront: { name: 'Waterfront District', sub: 'Boardwalk · marina · venues',        color: '#4dc8ff', center: [-290, 60], box: [-380, -150, -200, 280] },
  river:      { name: 'River District',   sub: 'Lofts · creative spaces · riverwalk',   color: '#7cffb2', center: [270, 40], box: [160, -150, 340, 300] },
  north:      { name: 'North Expansion',  sub: 'Future development · open plots',       color: '#b46bff', center: [40, -330], box: [-200, -440, 250, -150] },
  sw:         { name: 'SW Waterfront',    sub: 'Lake access · available lots',          color: '#ff7ab8', center: [-270, 360], box: [-380, 280, -200, 470] },
  nw:         { name: 'NW Waterfront',    sub: 'Lakefront · available lots',            color: '#ff9d4d', center: [-280, -320], box: [-400, -440, -200, -150] },
};

/* ---------- streets: [x0,z0,x1,z1,width,kind,name] (axis aligned) ---------- */
export const ROAD_LINES = [
  [-200, -1500, -200, 420, 14, 'main', 'Lakeshore Drive'],
  [-80, -420, -80, -150, 12, 'street', 'Court Street'],
  [-80, 0, -80, 420, 12, 'street', 'Court Street'],
  [40, -1500, 40, 420, 16, 'main', 'Margaret Street'],
  [160, -420, 160, 420, 12, 'street', 'Clinton Street'],
  [250, -420, 250, 300, 12, 'street', 'Riverside Drive'],
  [-200, -420, 250, -420, 12, 'street', 'Cornelia Street'],
  [-200, -285, 250, -285, 12, 'street', 'Brinkerhoff Street'],
  [-200, -150, 480, -150, 16, 'main', 'Bridge Street'],
  [-200, 0, 250, 0, 16, 'main', 'Star Vibes Boulevard'],
  [-200, 150, 480, 150, 14, 'main', 'Broad Street'],
  [-200, 300, 250, 300, 12, 'street', 'Durkee Street'],
  [-200, 420, 160, 420, 12, 'street', 'South Catherine Street'],
  [480, -700, 480, 300, 14, 'street', 'Route 9'],
  [480, -150, 640, -150, 14, 'street', 'Exit 37 Connector'],
  [480, 150, 640, 150, 14, 'street', 'Exit 36 Connector'],
  [640, -3600, 640, 3600, 22, 'highway', 'I-87 Northway'],
  [-200, 210, -290, 210, 10, 'drive', 'Marina Way'],
];

/* ---------- bridges across the Saranac ---------- */
export const BRIDGES = [];
{
  for (const [x0, z0, x1, z1, w, kind, name] of ROAD_LINES) {
    if (z0 !== z1) continue;
    let inW = false, start = 0;
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += 1) {
      const wet = riverDist(x, z0) < riverHalfW(z0) + 4;
      if (wet && !inW) { inW = true; start = x; }
      if (!wet && inW) { inW = false; BRIDGES.push({ z: z0, x0: start - 6, x1: x + 6, w, name: name === 'Bridge Street' ? 'Bridge Street Bridge' : 'Broad Street Bridge' }); }
    }
  }
}
export function onBridge(x, z, pad = 0) { return BRIDGES.some(b => Math.abs(z - b.z) < b.w / 2 + 1.5 + pad && x > b.x0 - pad && x < b.x1 + pad); }

/* ---------- brand lots (rot: 0 = front faces south, PI = north, PI/2 = east, -PI/2 = west) ---------- */
export const BRAND_LOTS = {
  hotspot:  { x: -80, z: -82, rot: 0 },
  klovee:   { x: 100, z: -58, rot: 0 },
  glostar:  { x: 100, z: 72, rot: Math.PI },
  kitchen:  { x: 284, z: -75, rot: Math.PI / 2 },
  starvibes:{ x: -282, z: -70, rot: Math.PI / 2 },
  garage:   { x: -140, z: 62, rot: Math.PI },
  park:     { x: -20, z: 75 },
};

/* ---------- empty plots (persisted builds go here) ---------- */
export const PLOTS = [
  { id: 'nw-1', x: -285, z: -250, w: 44, d: 44, district: 'nw' },
  { id: 'nw-2', x: -285, z: -360, w: 44, d: 44, district: 'nw' },
  { id: 'n-1', x: -20, z: -352, w: 46, d: 46, district: 'north' },
  { id: 'n-2', x: 100, z: -352, w: 46, d: 46, district: 'north' },
  { id: 'n-3', x: 205, z: -352, w: 40, d: 46, district: 'north' },
  { id: 'n-4', x: -140, z: -352, w: 46, d: 46, district: 'north' },
  { id: 'sw-1', x: -268, z: 350, w: 44, d: 44, district: 'sw' },
  { id: 'sw-2', x: -268, z: 415, w: 40, d: 40, district: 'sw' },
  { id: 'se-1', x: 205, z: 225, w: 40, d: 46, district: 'river' },
  { id: 'se-2', x: 287, z: 228, w: 30, d: 40, district: 'river' },
];

/* ---------- named places for fast-travel ---------- */
export const PLACES = [
  { id: 'hotspot', name: 'The Hotspot', color: '#ff3fd0' },
  { id: 'starvibes', name: 'Star Vibes Media', color: '#ffc65c' },
  { id: 'klovee', name: 'K Lovee', color: '#ff5c8a' },
  { id: 'glostar', name: 'GloStar', color: '#5fe3ff' },
  { id: 'kitchen', name: 'Hotspot Kitchen', color: '#ff9d3d' },
  { id: 'garage', name: 'Garage', color: '#b46bff' },
  { id: 'marina', name: 'Boat Basin', color: '#4dc8ff' },
  { id: 'park', name: 'Trinity Park', color: '#7cffb2' },
  { id: 'north', name: 'North Expansion', color: '#c9a4ff' },
];
