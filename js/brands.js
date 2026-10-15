// The five Star Vibes brand buildings (+ the Garage), each with a real, walkable interior.
import { THREE, V3, scene, M, Site, selfLit, sites, colliders, floors, npcSpots, interactables, picks, updaters, makeCanvas, FONT, SCRIPT, DISPLAY, neonSign, signMesh, glowMat, onNight, merge, boxAt, rand, rr, pick, lin, loadTex, fitText, clamp } from './core.js';
import { BRAND_LOTS } from './layout.js';
import { CURB } from './roads.js';
import { Kit, screenMesh, albumArt, ALBUMS, buildFlames, flames } from './kit.js';
import { env } from './env.js';
import { officeMat } from './facade.js';

const Y0 = CURB;

/* =====================================================================
   BRAND REGISTRY — each entry drives the HUD panel, minimap pin, markers, activity & save state
   ===================================================================== */
export const BRANDS = {};
function registerBrand(def) {
  const b = { lights: 'auto', doors: 'auto', embed: '', show: true, visits: 0, ...def };
  b.isOpen = () => {
    if (b.doors === 'open') return true; if (b.doors === 'closed') return false;
    const [o, c] = b.hours; const h = env.hour; return o < c ? h >= o && h < c : h >= o || h < c;
  };
  b.lightK = () => b.lights === 'on' ? 1 : b.lights === 'off' ? 0.04 : (b.isOpen() ? 1 : 0.18);
  b.crowdK = () => b.isOpen() ? 1 : 0;
  BRANDS[b.id] = b; sites.push(b);
  return b;
}
const gateOf = id => () => BRANDS[id] ? BRANDS[id].lightK() : 1;
const crowdGate = (id, minLights = 0) => () => BRANDS[id] && BRANDS[id].isOpen() && env.lights >= minLights;

/* shared materials */
const charcoal = new THREE.MeshStandardMaterial({ color: 0x22222a, roughness: 0.6, metalness: 0.3 });
const brickRed = new THREE.MeshStandardMaterial({ color: 0x7e3b2c, roughness: 0.9 });
const blackSteel = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.35, metalness: 0.85 });
const floorWood = selfLit(new THREE.MeshStandardMaterial({ color: 0x6a4a34, roughness: 0.55 }), 0.9);
const floorConcrete = selfLit(new THREE.MeshStandardMaterial({ color: 0x6e6c68, roughness: 0.65, metalness: 0.05 }), 0.8);
const floorDark = selfLit(new THREE.MeshStandardMaterial({ color: 0x18161c, roughness: 0.4, metalness: 0.2 }), 1.5);
const whiteWall = selfLit(new THREE.MeshStandardMaterial({ color: 0xf0eeea, roughness: 0.8 }), 0.55);
const glassWall = M.glass;

/** glass curtain panel (no collision) */
function glassPanel(site, w, h, x, y, z, ry = 0, mat = glassWall) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y + h / 2, z); m.rotation.y = ry; m.renderOrder = 3; site.add(m); return m; }
/** a slab you can stand on */
function slab(site, w, d, x, y, z, mat = floorConcrete, thick = 0.3) { const m = site.mesh(new THREE.BoxGeometry(w, thick, d), mat, x, y - thick / 2, z); site.floor(x, z, w, d, y); return m; }
function liftPad(site, x, z, levels, label, color = '#5fe3ff') {
  for (const L of levels) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.0, 32).rotateX(-Math.PI / 2), glowMat(color, 3, 1.6)); ring.position.set(x, L.y + 0.03, z); site.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.75, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.25), transparent: true, opacity: 0.8 })); disc.position.set(x, L.y + 0.025, z); site.add(disc);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.6, 24, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.3), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(x, L.y + 1.3, z); site.add(beam);
  }
  site.interact(x, levels[0].y, z, 1.4, label, { kind: 'lift', levels: levels.map(l => ({ ...l })) , site, lx: x, lz: z });
}
function ellipseWall(cx, cz, rx, rz, y0, y1, gap = null, n = 72) {
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
    const ax = cx + Math.sin(a0) * rx, az = cz + Math.cos(a0) * rz, bx = cx + Math.sin(a1) * rx, bz = cz + Math.cos(a1) * rz;
    if (gap && gap((ax + bx) / 2 - cx, (az + bz) / 2 - cz)) continue;
    colliders.push({ seg: [ax, az, bx, bz], r: 0.35, y0, y1 });
  }
}
function sign3D(site, cv, w, h, x, y, z, ry = 0, k = 2.6, dayK = 1) { const s = signMesh(cv, w, h, k, dayK); s.position.set(x, y, z); s.rotation.y = ry; site.add(s); return s; }
function pickBox(site, w, h, d, brand, x = 0, z = 0) { brand.foot = { w: w + 1, d: d + 1, h }; const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial()); m.visible = false; m.position.set(x, h / 2, z); site.add(m); m.userData.site = brand; picks.push(m); }
function crowd(site, n, fn, mode, gate, colors) {
  for (let i = 0; i < n; i++) { const p = fn(i); if (!p) continue; const [wx, wz] = site.w(p[0], p[2]); npcSpots.push({ x: wx, y: p[1], z: wz, ry: (p[3] ?? 0) + site.rot, mode, gate, color: colors ? pick(colors) : null, ph: rand() * 10 }); }
}
const FANS = ['#ff4fa3', '#ffffff', '#1a1a1a', '#ffc65c', '#5fe3ff', '#b46bff', '#ff7a3d', '#2a3a6a', '#e8d8c0'];

/* =====================================================================
   1 · THE HOTSPOT — the centrepiece arena
   ===================================================================== */
{
  const L = BRAND_LOTS.hotspot, s = new Site(L.x, L.z, L.rot), RX = 46, RZ = 34, H = 25;
  const brand = registerBrand({ id: 'hotspot', name: 'The Hotspot', tagline: 'Music · Culture · Discovery · Entertainment', color: '#ff3fd0', district: 'downtown', hours: [16, 2], site: s,
    about: ['The main venue and centrepiece of Star Vibes World.', 'Concert hall · balcony ring · rooftop terrace.', 'Tonight: K Lovee — Champlain Nights Tour.'], door: s.w(0, RZ + 10), dropoff: s.w(-30, RZ + 22), floorsInfo: 'Concert floor · Balcony (L2) · Rooftop (L3)' });
  const kit = new Kit(s, gateOf('hotspot'));
  // floor
  const fl = new THREE.Mesh(new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2).scale(RX, 1, RZ), floorDark); fl.position.y = Y0 + 0.02; fl.receiveShadow = true; s.add(fl);
  // ground glass lobby ring + steel posts
  const lob = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 7, 96, 1, true).scale(RX, 1, RZ), M.tint); lob.position.y = Y0 + 3.5; lob.renderOrder = 3; s.add(lob);
  const posts = []; for (let k = 0; k < 40; k++) { const a = k / 40 * Math.PI * 2; posts.push(boxAt(0.5, 7, 0.5, Math.sin(a) * RX, Y0 + 3.5, Math.cos(a) * RZ, a)); }
  s.mesh(merge(posts), blackSteel);
  ellipseWall(L.x, L.z, RX, RZ, 0, 7.2, (x, z) => z > 0 && Math.abs(x) < 7);
  ellipseWall(L.x, L.z, RX, RZ, 7.2, 27);
  // LED facade band
  const txt = makeCanvas(2048, 256); { const g = txt.ctx; g.clearRect(0, 0, 2048, 256); g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.font = FONT(900, 150, DISPLAY);
    const msg = 'THE HOTSPOT  ✦  MUSIC · CULTURE · DISCOVERY  ✦  '; let fs = 150; g.font = FONT(900, fs, DISPLAY); const w0 = g.measureText(msg).width; const sx = 1024 / w0;
    g.save(); g.scale(sx, 1); g.fillText(msg, 0, 132); g.fillText(msg, w0, 132); g.restore(); txt.tex.wrapS = THREE.RepeatWrapping; }
  const ledU = { uTime: { value: 0 }, uK: { value: 1 }, uText: { value: txt.tex } };
  const ledMat = new THREE.ShaderMaterial({ uniforms: ledU, side: THREE.FrontSide,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; uniform float uK; uniform sampler2D uText; varying vec2 vUv;
      vec3 hue(float h){ return clamp(abs(mod(h*6.0+vec3(0,4,2),6.0)-3.0)-1.0, 0.0, 1.0); }
      void main(){
        vec2 px = fract(vUv * vec2(900.0, 90.0)); float dot_ = smoothstep(0.5, 0.2, length(px - 0.5));
        float band = vUv.y;
        vec3 base = mix(vec3(0.95,0.15,0.75), vec3(0.25,0.35,1.0), 0.5 + 0.5 * sin(vUv.x * 12.566 + uTime * 0.6));
        base = mix(base, hue(fract(vUv.x * 2.0 - uTime * 0.05)), 0.35);
        float wave = 0.5 + 0.5 * sin(vUv.x * 60.0 - uTime * 3.0 + band * 6.0);
        float eq = step(band, 0.2 + 0.18 * abs(sin(floor(vUv.x * 160.0) * 1.7 + uTime * 4.0)));
        vec3 col = base * (0.18 + 0.35 * wave) + base * eq * 0.9;
        float t = texture2D(uText, vec2(vUv.x * 4.0 + uTime * 0.025, (band - 0.38) / 0.44)).a;
        t *= step(0.38, band) * step(band, 0.82);
        col = mix(col, vec3(1.0, 0.95, 1.0), t);
        col *= dot_ * 1.4 + 0.25;
        gl_FragColor = vec4(col * uK, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
  const led = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, H - 7, 160, 1, true).scale(RX + 0.6, 1, RZ + 0.6), ledMat); led.position.y = Y0 + 7 + (H - 7) / 2; s.add(led);
  const innerWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, H - 7 + 0.4, 96, 1, true).scale(RX, 1, RZ), selfLit(new THREE.MeshStandardMaterial({ color: 0x1a1222, roughness: 0.6, side: THREE.BackSide }), 1.2)); innerWall.position.y = Y0 + 7 + (H - 7) / 2 - 0.2; s.add(innerWall);
  const ceil = new THREE.Mesh(new THREE.CircleGeometry(1, 96).rotateX(Math.PI / 2).scale(RX, 1, RZ), new THREE.MeshStandardMaterial({ color: 0x0c0a12, roughness: 0.8 })); ceil.position.y = Y0 + H - 0.05; s.add(ceil);
  { const cg = []; for (let k = 0; k < 9; k++) cg.push(new THREE.BoxGeometry(RX * 1.7, 0.5, 0.4).translate(0, Y0 + H - 0.4, -RZ * 0.8 + k * RZ * 0.2)); s.mesh(merge(cg), blackSteel, 0, 0, 0, false); }
  updaters.push((dt, t) => { ledU.uTime.value = t; ledU.uK.value = 0.75 + env.lights * 1.0; });
  // roof slab + crown
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.4, 96).scale(RX + 1.2, 1, RZ + 1.2), charcoal); roof.position.y = Y0 + H + 0.7; roof.castShadow = true; s.add(roof);
  const crown = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 6, 160).rotateX(Math.PI / 2).scale(RX + 1.3, 1, RZ + 1.3), glowMat('#ff7ae6', 4, 1.2)); crown.position.y = Y0 + H + 1.45; s.add(crown);
  const crown2 = crown.clone(); crown2.material = glowMat('#5fe3ff', 3.5, 1); crown2.position.y = Y0 + 7.05; s.add(crown2);
  // main floor + mid levels
  s.floor(0, 0, RX * 2, RZ * 2, Y0 + 0.02);
  const BALC_Y = Y0 + 9, ROOF_Y = Y0 + H + 1.4;
  const balc = new THREE.Shape(); balc.absellipse(0, 0, RX - 0.6, RZ - 0.6, 0, Math.PI * 2); const hole = new THREE.Path(); hole.absellipse(0, 0, RX - 9, RZ - 9, 0, Math.PI * 2, true); balc.holes.push(hole);
  const bg = new THREE.ExtrudeGeometry(balc, { depth: 0.6, bevelEnabled: false, curveSegments: 64 }); bg.rotateX(-Math.PI / 2);
  // cut away the stage end of the ring: keep z > -16
  { const p = bg.attributes.position; for (let i = 0; i < p.count; i++) if (p.getZ(i) < -16) p.setZ(i, -16); bg.computeVertexNormals(); }
  const bm = new THREE.Mesh(bg, floorDark); bm.position.y = BALC_Y - 0.6; bm.castShadow = true; bm.receiveShadow = true; s.add(bm);
  floors.push({ ell: [L.x, L.z, RX - 0.6, RZ - 0.6, RX - 9, RZ - 9], zMin: L.z - 16, y: BALC_Y });
  ellipseWall(L.x, L.z, RX - 9, RZ - 9, BALC_Y, BALC_Y + 1.1, (x, z) => z < -16, 64);
  { const pts = []; const a0 = Math.asin(-16 / (RZ - 9)); // param where z = -16 on the inner ellipse
    for (let k = 0; k <= 96; k++) { const t = a0 + (Math.PI - 2 * a0) * k / 96; pts.push(new V3(Math.cos(t) * (RX - 9) * (k < 48 ? 1 : 1), BALC_Y + 1.05, -Math.sin(t) * (RZ - 9))); }
    // walk the arc through +z (front) side
    const arc = []; for (let k = 0; k <= 120; k++) { const ang = -Math.asin(16 / (RZ - 9)); const t = ang + (Math.PI - 2 * ang) * (k / 120); arc.push(new V3(Math.cos(t) * (RX - 9), BALC_Y + 1.05, Math.sin(t) * (RZ - 9))); }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc), 160, 0.04, 4, false); s.mesh(tube, M.steel, 0, 0, 0, false);
    for (let k = 0; k <= 120; k += 6) { const p = arc[k]; s.mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.05, 4), M.steel, p.x, BALC_Y + 0.52, p.z, false); } }
  const balcEdge = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 4, 128).rotateX(Math.PI / 2).scale(RX - 9, 1, RZ - 9), glowMat('#ff4fd0', 1.5, 0.6)); balcEdge.position.y = BALC_Y - 0.3; s.add(balcEdge);
  // roof deck
  floors.push({ ell: [L.x, L.z, RX + 1.2, RZ + 1.2, 0, 0], y: ROOF_Y });
  ellipseWall(L.x, L.z, RX + 0.8, RZ + 0.8, ROOF_Y, ROOF_Y + 1.2);
  const rail2 = new THREE.Mesh(new THREE.TorusGeometry(1, 0.04, 4, 160).rotateX(Math.PI / 2).scale(RX + 0.8, 1, RZ + 0.8), M.steel); rail2.position.y = ROOF_Y + 1.1; s.add(rail2);
  const glassRail = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.1, 96, 1, true).scale(RX + 0.8, 1, RZ + 0.8), glassWall); glassRail.position.y = ROOF_Y + 0.55; s.add(glassRail);
  // stage + LED wall + truss
  kit.stage(0, Y0, -24, 34, 12, 1.6, '#141018');
  s.floor(0, -24, 34, 12, Y0 + 1.6);
  const ledWall = screenMesh(30, 12, (g, w, h, t) => {
    const k = (t * 0.5) % 1; const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, `hsl(${(t * 30) % 360},90%,40%)`); gr.addColorStop(1, `hsl(${(t * 30 + 120) % 360},90%,30%)`); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 48; i++) { const bh = (0.2 + 0.8 * Math.abs(Math.sin(i * 0.7 + t * 5) * Math.cos(i * 0.3 + t * 2.1))) * h * 0.6; g.fillStyle = `rgba(255,255,255,${0.15 + 0.25 * Math.sin(i + t)})`; g.fillRect(i * w / 48 + 1, h - bh, w / 48 - 3, bh); }
    g.save(); g.translate(w / 2, h * 0.36); g.rotate(Math.sin(t * 0.4) * 0.05); g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#fff'; g.shadowBlur = 20;
    g.fillStyle = '#fff'; g.font = FONT(400, h * 0.22, SCRIPT); g.fillText('K Lovee', 0, -h * 0.02); g.font = FONT(800, h * 0.07, DISPLAY); g.fillText('CHAMPLAIN NIGHTS TOUR · LIVE', 0, h * 0.15); g.restore();
    g.strokeStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(t * 8)})`; g.lineWidth = 4; g.beginPath(); for (let x = 0; x <= w; x += 6) g.lineTo(x, h * 0.75 + Math.sin(x * 0.05 + t * 9) * h * 0.06 * Math.sin(t * 2)); g.stroke();
  }, { px: 640, every: 1 / 20, k: 1.1 });
  ledWall.position.set(0, Y0 + 8, -31.5); s.add(ledWall);
  kit.box(31, 13, 0.4, 0, Y0 + 1.6, -31.9, '#0a0a0c');
  kit.truss(0, Y0 + 15, -20, 34, 0); kit.truss(-16, Y0 + 15, -10, 22, Math.PI / 2); kit.truss(16, Y0 + 15, -10, 22, Math.PI / 2);
  for (const x of [-15, 15]) { kit.speaker(x, Y0 + 1.6, -20, 0, 1.6); kit.speaker(x, Y0 + 4.2, -20, 0, 1.6); }
  kit.micStand(0, Y0 + 1.6, -20); kit.keyboard(-6, Y0 + 1.6, -26, 0); kit.drums(6, Y0 + 1.6, -27); kit.guitar(-9, Y0 + 1.6, -24, 0.3);
  // moving-head beams
  const beamMats = []; const beams = [];
  for (let k = 0; k < 10; k++) {
    const col = ['#ff3fd0', '#5fe3ff', '#ffc65c', '#b46bff', '#ffffff'][k % 5];
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(0.5), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const g = new THREE.Group(); g.position.set(-16 + k * 3.6, Y0 + 15, -20); s.add(g);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 16, 20, 1, true).translate(0, -8, 0), mat); g.add(cone);
    kit.box(0.5, 0.5, 0.5, -16 + k * 3.6, Y0 + 14.6, -20, '#111');
    beams.push({ g, k, mat }); beamMats.push(mat);
  }
  updaters.push((dt, t) => { const on = BRANDS.hotspot.show && BRANDS.hotspot.isOpen(); const kk = on ? 0.08 + env.lights * 0.12 : 0; for (const b of beams) { b.g.rotation.x = 0.5 + Math.sin(t * 0.9 + b.k) * 0.45; b.g.rotation.z = Math.sin(t * 0.7 + b.k * 1.3) * 0.6; b.mat.opacity = kk * (0.6 + 0.4 * Math.sin(t * 4 + b.k)); b.g.visible = kk > 0.01; } });
  // bars along the concourse
  kit.bar(-36, Y0, 6, 10, Math.PI / 2 + 0.25, '#1a1018', '#24182a', '#ff4fd0'); kit.bar(36, Y0, 2, 10, -Math.PI / 2 - 0.25, '#1a1018', '#24182a', '#5fe3ff');
  for (const [x, z] of [[-30, 8], [-31, 4], [-30.5, 0], [30, 6], [31, 2], [30.5, -2]]) kit.stool(x, Y0, z);
  // balcony seating
  for (let k = 0; k < 26; k++) { const a = -1.9 + k / 25 * 3.8 + Math.PI; const x = Math.sin(a) * (RX - 4), z = Math.cos(a) * (RZ - 4); if (z < -15) continue; kit.chair(x, BALC_Y, z, a, '#5a1a4a'); }
  // rooftop terrace: lounge, DJ booth, bar, string lights, planters
  { const deck = new THREE.Mesh(new THREE.RingGeometry(0.5, 1, 96).rotateX(-Math.PI / 2).scale(RX - 1, 1, RZ - 1), selfLit(new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.8 }), 0.9)); deck.position.y = ROOF_Y + 0.02; s.add(deck);
    const pc = makeCanvas(128, 128), pg = pc.ctx, gr = pg.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, '#fff'); gr.addColorStop(0.5, '#444'); gr.addColorStop(1, '#000'); pg.fillStyle = gr; pg.fillRect(0, 0, 128, 128); pc.tex.colorSpace = THREE.NoColorSpace;
    const poolM = new THREE.MeshBasicMaterial({ map: pc.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0x000000 }); onNight(poolM, new THREE.Color(0.55, 0.36, 0.22), 0, 1, 'color', () => BRANDS.hotspot.isOpen() ? 1 : 0.2);
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; const p = new THREE.Mesh(new THREE.CircleGeometry(9, 24).rotateX(-Math.PI / 2), poolM); p.position.set(Math.sin(a) * (RX - 14), ROOF_Y + 0.06, Math.cos(a) * (RZ - 11)); s.add(p); }
    const cp = new THREE.Mesh(new THREE.CircleGeometry(14, 32).rotateX(-Math.PI / 2), poolM); cp.position.set(0, ROOF_Y + 0.06, 0); s.add(cp); }
  kit.bar(0, ROOF_Y, 18, 12, Math.PI, '#1a1a1e', '#2a2030', '#ffc65c');
  kit.console(0, ROOF_Y, -12, 0, 3.2); kit.speaker(-3, ROOF_Y, -13, 0, 1.2); kit.speaker(3, ROOF_Y, -13, 0, 1.2);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; kit.sofa(Math.sin(a) * 26, ROOF_Y, Math.cos(a) * 18, a + Math.PI, '#3a1a4a', 3); kit.roundTable(Math.sin(a) * 23, ROOF_Y, Math.cos(a) * 16, 0.6, '#222', 0.45); }
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, b = a + Math.PI * 0.85; kit.stringLights(Math.sin(a) * (RX - 2), ROOF_Y + 3.5, Math.cos(a) * (RZ - 2), Math.sin(b) * (RX - 2), ROOF_Y + 3.5, Math.cos(b) * (RZ - 2), 18, 1.2, k % 2 ? '#ffd27a' : '#ff9be6'); }
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; kit.cyl(0.05, 0.05, 3.5, Math.sin(a) * (RX - 2), ROOF_Y, Math.cos(a) * (RZ - 2), '#222', 4); kit.plant(Math.sin(a + 0.26) * (RX - 3), ROOF_Y, Math.cos(a + 0.26) * (RZ - 3), 1.2); }
  // searchlights on the roof
  const sl = [];
  for (const [x, z] of [[-30, -12], [30, -12], [-30, 14], [30, 14]]) {
    kit.cyl(0.9, 1.1, 1.2, x, ROOF_Y, z, '#222');
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.9, 1), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    onNight(mat, new THREE.Color(1, 1, 1), 0, 0.09, 'opacity', () => BRANDS.hotspot.isOpen() ? 1 : 0);
    const g = new THREE.Group(); g.position.set(x, ROOF_Y + 1.2, z); s.add(g); const c = new THREE.Mesh(new THREE.CylinderGeometry(9, 0.7, 520, 20, 1, true).translate(0, 260, 0), mat); g.add(c); sl.push({ g, x });
  }
  updaters.push((dt, t) => { sl.forEach((o, i) => { o.g.rotation.z = Math.sin(t * 0.35 + i * 1.7) * 0.42; o.g.rotation.x = Math.cos(t * 0.27 + i) * 0.32; }); });
  // entrance canopy + marquee
  kit.box(18, 0.6, 7, 0, Y0 + 6.2, RZ + 2.5, '#141418');
  kit.glowBox('#ff4fd0', 3, 1, 18.2, 0.12, 0.12, 0, Y0 + 6.15, RZ + 6.05);
  for (const x of [-8.5, 8.5]) kit.box(0.4, 6.2, 0.4, x, Y0, RZ + 5.6, '#141418');
  sign3D(s, neonSign([{ text: 'TONIGHT ✦ K LOVEE LIVE', color: '#ffe0ff', glow: '#ff3fd0', size: 90, font: DISPLAY }], { w: 1400, h: 150, bg: 'rgba(20,4,24,0.92)', border: '#ff3fd0' }), 17, 1.8, 0, Y0 + 7.8, RZ + 6.1, 0, 2.6, 1.3);
  // big floating logo over the entrance
  sign3D(s, neonSign([{ text: 'THE HOTSPOT', color: '#ffffff', glow: '#ff2ad4', size: 190, font: DISPLAY, blur: 40 }], { w: 1600, h: 260 }), 34, 5.5, 0, Y0 + H + 6, RZ - 4, 0, 3.0, 1.4);
  sign3D(s, neonSign([{ text: 'THE HOTSPOT', color: '#ffffff', glow: '#2ad4ff', size: 190, font: DISPLAY, blur: 40 }], { w: 1600, h: 260 }), 34, 5.5, 0, Y0 + H + 6, -RZ + 4, Math.PI, 3.0, 1.4);
  // lift
  liftPad(s, 36, 12, [{ y: Y0 + 0.02, name: 'Concert floor' }, { y: BALC_Y, name: 'Balcony' }, { y: ROOF_Y, name: 'Rooftop terrace' }], 'The Hotspot lift', '#ff4fd0');
  // crowds
  crowd(s, 150, i => { const a = rand() * Math.PI * 2, r = Math.sqrt(rand()); const x = Math.sin(a) * r * 22, z = -4 + Math.cos(a) * r * 12; return [x, Y0, z, Math.PI + rr(-0.4, 0.4)]; }, 'dance', crowdGate('hotspot'), FANS);
  crowd(s, 30, i => { const a = Math.PI + rr(-1.7, 1.7); const x = Math.sin(a) * (RX - 5.5), z = Math.cos(a) * (RZ - 5.5); if (z < -14) return null; return [x, BALC_Y, z, Math.atan2(-x, -z) + Math.PI]; }, 'cheer', crowdGate('hotspot'), FANS);
  crowd(s, 26, i => { const a = rand() * Math.PI * 2; return [Math.sin(a) * rr(10, 30), ROOF_Y, Math.cos(a) * rr(6, 20), rand() * 6]; }, 'stand', crowdGate('hotspot', 0.3), FANS);
  crowd(s, 3, i => [-6 + i * 6, Y0 + 1.6, -21.5, 0], 'dance', crowdGate('hotspot'), ['#ff4fa3', '#ffffff', '#ffc65c']);
  crowd(s, 6, i => [i < 3 ? -33 : 33, Y0, (i % 3) * 3 - 1, i < 3 ? Math.PI / 2 : -Math.PI / 2], 'stand', crowdGate('hotspot'), FANS);
  kit.flush();
  pickBox(s, RX * 2, H + 6, RZ * 2, brand);
  // plaza: LED totems + parking lot (west) + seating (east)
  const plaza = new Kit(s); plaza.outdoor = true;
  for (const x of [-26, 26]) { plaza.box(1.6, 9, 1.6, x, Y0, RZ + 16, '#111'); }
  for (const x of [-26, 26]) { const t = screenMesh(1.5, 8, (g, w, h, t) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, `hsl(${(t * 40 + x) % 360},90%,55%)`); gr.addColorStop(1, '#100018'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.save(); g.translate(w / 2, h / 2); g.rotate(-Math.PI / 2); g.fillStyle = '#fff'; g.font = FONT(900, w * 0.42, DISPLAY); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('THE HOTSPOT', 0, 0); g.restore(); }, { px: 96, every: 1 / 8, k: 1.8 });
    for (const sd of [1, -1]) { const tt = t.clone(); tt.position.set(x, Y0 + 4.5, RZ + 16 + sd * 0.82); tt.rotation.y = sd > 0 ? 0 : Math.PI; s.add(tt); } s.collideBox(x, RZ + 16, 1.6, 1.6, 0, 9); }
  // west parking lot
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(52, 110).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x26282e, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 })); lot.position.set(-84, Y0 + 0.02, -2); s.add(lot);
  for (let k = 0; k < 14; k++) for (const sx of [-1, 1]) plaza.box(0.12, 0.02, 5.2, -84 + sx * 14 + 0, Y0 + 0.02, -50 + k * 7.4, '#e8e8e8');
  brand.parking = []; for (let k = 0; k < 13; k++) for (const sx of [-1, 1]) brand.parking.push({ w: s.w(-84 + sx * 17.5, -46 + k * 7.4), h: sx > 0 ? -Math.PI / 2 : Math.PI / 2 });
  // tree ring around the arena + light poles
  for (let k = 0; k < 30; k++) { const a = k / 30 * Math.PI * 2, x = Math.sin(a) * (RX + 9), z = Math.cos(a) * (RZ + 9); if (z > 10 && Math.abs(x) < 16) continue; if (x < -54) continue;
    plaza.cyl(0.18, 0.26, 2.6, x, Y0, z, '#4a3626', 6); plaza.sphere(2.2, x, Y0 + 4.2, z, ['#3f6b2e', '#5a8a3a', '#7a9440', '#c0782a'][k % 4], 1, 1.15, 1); plaza.cyl(1.4, 1.5, 0.45, x, Y0, z, '#6a6a70', 12); s.collideCircle(x, z, 1.5, 0, 3);
    if (k % 3 === 0) { const a2 = a + Math.PI / 30, px = Math.sin(a2) * (RX + 9), pz = Math.cos(a2) * (RZ + 9); if (!(pz > 10 && Math.abs(px) < 16)) { plaza.cyl(0.06, 0.09, 5, px, Y0, pz, '#1a1a20', 6); plaza.glowBox(k % 2 ? '#ff3fd0' : '#5fe3ff', 3, 0.5, 0.5, 0.5, 0.5, px, Y0 + 5, pz); } } }
  // front fountain with coloured jets
  plaza.cyl(7, 7.4, 0.7, 0, Y0, RZ + 26, '#cfcac0', 40); s.collideCircle(0, RZ + 26, 7.4, 0, 1);
  const fw = new THREE.Mesh(new THREE.CircleGeometry(6.6, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a4a7a, metalness: 0.7, roughness: 0.08 })); fw.position.set(0, Y0 + 0.6, RZ + 26); s.add(fw);
  const jets = []; for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.22, 1, 8, 1, true).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(['#ff3fd0', '#5fe3ff', '#ffc65c'][k % 3]).multiplyScalar(1.4), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })); m.position.set(Math.sin(a) * 4.4, Y0 + 0.6, RZ + 26 + Math.cos(a) * 4.4); s.add(m); jets.push(m); }
  const cj = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.35, 1, 10, 1, true).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0xcfefff, transparent: true, opacity: 0.6, depthWrite: false })); cj.position.set(0, Y0 + 0.6, RZ + 26); s.add(cj);
  updaters.push((dt, t) => { jets.forEach((j, i) => { j.scale.y = 1.5 + 1.2 * Math.abs(Math.sin(t * 1.6 + i * 0.7)); }); cj.scale.y = 4.5 + Math.sin(t * 2.2) * 0.8; });
  // east lawn: food trucks under string lights
  const lawnM = new THREE.Mesh(new THREE.PlaneGeometry(56, 120).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4f7a36, roughness: 1 })); lawnM.position.set(83, Y0 + 0.02, 6); lawnM.receiveShadow = true; s.add(lawnM);
  const TRUCKS = [['#ff9d3d', 'TACOS'], ['#5fe3ff', 'BOBA'], ['#ff5c8a', 'CREPES'], ['#7cffb2', 'BBQ']];
  TRUCKS.forEach(([c, label], i) => { const z = -40 + i * 22, x = 98; plaza.box(3.0, 2.8, 7, x, Y0 + 0.5, z, '#f2efe8'); plaza.box(3.05, 0.6, 7.05, x, Y0 + 2.7, z, c); plaza.box(0.1, 1.2, 4, x - 1.55, Y0 + 1.6, z, '#1a1a1a'); plaza.glowBox('#ffd9a0', 2, 0.6, 0.06, 1.0, 3.8, x - 1.58, Y0 + 1.7, z); plaza.box(1.6, 0.08, 4.5, x - 2.3, Y0 + 2.85, z, c);
    for (const dz of [-2.6, 2.6]) for (const dx of [-1, 1]) plaza.cyl(0.42, 0.42, 0.3, x + dx * 1.3, Y0 + 0.1, z + dz, '#111', 12);
    sign3D(s, neonSign([{ text: label, color: '#fff', glow: c, size: 120, font: DISPLAY }], { w: 512, h: 150 }), 3.4, 1.0, x - 1.62, Y0 + 3.6, z, -Math.PI / 2, 2.6, 1.2); s.collideBox(x, z, 3.2, 7.2, 0, 3.4);
    crowd(s, 4, k => [x - 4.5 - (k % 2) * 1.0, Y0, z - 1.5 + k, -Math.PI / 2 + Math.PI], 'stand', crowdGate('hotspot'), FANS); });
  for (let k = 0; k < 8; k++) plaza.umbrellaTable(70 + (k % 2) * 8, Y0, -44 + Math.floor(k / 2) * 22 + 8, ['#ff3fd0', '#5fe3ff', '#ffc65c'][k % 3]);
  for (let k = 0; k < 5; k++) { plaza.cyl(0.06, 0.08, 4.5, 62, Y0, -50 + k * 24, '#222', 6); plaza.cyl(0.06, 0.08, 4.5, 106, Y0, -50 + k * 24, '#222', 6); if (k < 4) { plaza.stringLights(62, Y0 + 4.5, -50 + k * 24, 62, Y0 + 4.5, -26 + k * 24, 12, 0.6); plaza.stringLights(106, Y0 + 4.5, -50 + k * 24, 106, Y0 + 4.5, -26 + k * 24, 12, 0.6, '#ff9be6'); } plaza.stringLights(62, Y0 + 4.5, -50 + k * 24, 106, Y0 + 4.5, -50 + k * 24, 18, 1.0, k % 2 ? '#ffd27a' : '#9be8ff'); }
  crowd(s, 18, i => [70 + (i % 4) * 4 + rr(-1, 1), Y0, -40 + Math.floor(i / 4) * 20 + rr(-2, 2), rand() * 6], 'stand', crowdGate('hotspot', 0.15), FANS);
  plaza.flush();
}

/* =====================================================================
   2 · K LOVEE — artist venue, release space, fan meet & merch
   ===================================================================== */
{
  const L = BRAND_LOTS.klovee, s = new Site(L.x, L.z, L.rot), W = 40, D = 30, H1 = 6.5, H2 = 5.2;
  const brand = registerBrand({ id: 'klovee', name: 'K Lovee', tagline: 'Artist · Music releases · Fan meets · Merch', color: '#ff5c8a', district: 'downtown', hours: [11, 1], site: s,
    about: ['K Lovee\'s home base: intimate stage, release listening room and merch.', 'New single “Lakefront Heat” — out now.', 'Fan meet & signing every evening.'], door: s.w(0, D / 2 + 3), dropoff: s.w(0, D / 2 + 30), floorsInfo: 'Stage & merch · VIP listening lounge (L2) · Rooftop' });
  const kit = new Kit(s, gateOf('klovee'));
  const F2 = Y0 + H1, ROOF = F2 + H2;
  slab(s, W, D, 0, Y0 + 0.04, 0, floorWood, 0.1);
  slab(s, W, D, 0, F2, 0, floorWood, 0.4);
  const roofM = s.mesh(new THREE.BoxGeometry(W + 0.6, 0.6, D + 0.6), charcoal, 0, ROOF + 0.3, 0); s.floor(0, 0, W, D, ROOF + 0.6);
  // walls: back & sides solid, front glass with door
  const wg = [];
  s.wall(-W / 2, -D / 2, W / 2, -D / 2, H1 + H2, Y0, 0.5, null, [], wg);
  s.wall(-W / 2, -D / 2, -W / 2, D / 2, H1 + H2, Y0, 0.5, null, [], wg);
  s.wall(W / 2, -D / 2, W / 2, D / 2, H1 + H2, Y0, 0.5, null, [], wg);
  s.mesh(merge(wg), charcoal);
  // front: glass storefront (ground), solid sign band (L2) with ribbon window
  glassPanel(s, W, H1 - 0.2, 0, Y0, D / 2, 0, M.glass);
  s.wall(-W / 2, D / 2, W / 2, D / 2, H1, Y0, 0.2, null, [{ at: W / 2, w: 4.5, h: H1 }], []); // colliders only
  s.mesh(new THREE.BoxGeometry(W + 0.6, H2 + 0.2, 0.5), charcoal, 0, F2 + H2 / 2, D / 2);
  glassPanel(s, W - 6, 1.6, 0, F2 + 2.6, D / 2 + 0.27, 0, M.tint);
  s.collideBox(0, D / 2, W, 0.5, F2, F2 + H2);
  // rose-gold trims
  kit.glowBox('#ffb0a0', 2.6, 1.1, W + 0.8, 0.12, 0.12, 0, F2 - 0.1, D / 2 + 0.3);
  kit.glowBox('#ff5c8a', 3, 0.9, W + 0.8, 0.12, 0.12, 0, ROOF + 0.6, D / 2 + 0.3);
  for (const x of [-W / 2 - 0.3, W / 2 + 0.3]) kit.glowBox('#ffb0a0', 2.6, 1.1, 0.12, H1 + H2, 0.12, x, Y0, D / 2 + 0.3);
  // facade sign + blade
  sign3D(s, neonSign([{ text: 'K Lovee', color: '#ff7ab0', glow: '#ff2a7a', size: 230, font: SCRIPT, blur: 36 }], { w: 1400, h: 320 }), 18, 4.1, 0, F2 + 2.7, D / 2 + 0.6, 0, 3.2, 1.4);
  sign3D(s, neonSign([{ text: 'NEW RELEASE ✦ LAKEFRONT HEAT ✦ OUT NOW', color: '#fff0f6', glow: '#ff5c8a', size: 70, font: DISPLAY }], { w: 1600, h: 120, bg: 'rgba(30,6,16,0.9)', border: '#ff5c8a' }), 14, 1.05, 0, Y0 + 5.0, D / 2 + 3.3, 0, 2.2, 1.2);
  kit.box(16, 0.4, 3.4, 0, Y0 + 4.3, D / 2 + 1.7, '#18121a'); kit.glowBox('#ff5c8a', 3, 1, 16.1, 0.08, 0.08, 0, Y0 + 4.28, D / 2 + 3.4);
  const blade = neonSign([{ text: 'K', color: '#ffd0e0', glow: '#ff3a8a', size: 300, font: SCRIPT }], { w: 256, h: 512, bg: 'rgba(20,4,12,0.9)', border: '#ff5c8a' });
  for (const sd of [1, -1]) sign3D(s, blade, 1.8, 3.6, W / 2 + 1.4, F2 + 1.6, D / 2 - 0.6 + sd * 0.12, sd > 0 ? Math.PI / 2 : -Math.PI / 2, 3, 1.2);
  kit.box(2.0, 3.8, 0.2, W / 2 + 1.4, F2 - 0.3, D / 2 - 0.6, '#140a10');
  // album billboard on the east wall (faces Clinton St)
  const covers = ALBUMS.map((a, i) => albumArt(i, a.title, a.sub, a.pal));
  const bb = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ map: covers[0].tex })); bb.material.color.setScalar(1); onNight(bb.material, new THREE.Color(1, 1, 1), 1, 1.6, 'color');
  bb.position.set(W / 2 + 0.3, Y0 + 5.8, -3); bb.rotation.y = Math.PI / 2; s.add(bb);
  kit.box(0.3, 10.6, 10.6, W / 2 + 0.15, Y0 + 0.5, -3, '#0a0a0a');
  // stage at the back
  kit.stage(0, Y0, -11.5, 16, 6, 0.8, '#1a1016'); s.floor(0, -11.5, 16, 6, Y0 + 0.8);
  const back = screenMesh(14, 5, (g, w, h, t) => { const i = Math.floor(t / 6) % covers.length; g.fillStyle = '#12040c'; g.fillRect(0, 0, w, h); g.drawImage(covers[i].c, w * 0.04, h * 0.08, h * 0.84, h * 0.84);
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.font = FONT(400, h * 0.2, SCRIPT); g.fillText('K Lovee', h * 1.0, h * 0.34); g.font = FONT(800, h * 0.1, DISPLAY); g.fillText(ALBUMS[i].title.toUpperCase(), h * 1.0, h * 0.52); g.font = FONT(600, h * 0.06); g.fillStyle = '#ffb0d0'; g.fillText(ALBUMS[i].sub, h * 1.0, h * 0.64);
    for (let k = 0; k < 40; k++) { const bh = h * 0.18 * Math.abs(Math.sin(k * 0.6 + t * 6)); g.fillStyle = '#ff5c8a'; g.fillRect(h * 1.0 + k * (w - h * 1.1) / 40, h * 0.92 - bh, (w - h * 1.1) / 40 - 2, bh); } }, { px: 700, every: 1 / 12, k: 1.4 });
  back.position.set(0, Y0 + 3.6, -14.7); s.add(back);
  kit.micStand(0, Y0 + 0.8, -10); kit.keyboard(-4.5, Y0 + 0.8, -12, 0); kit.guitar(4, Y0 + 0.8, -12.5, -0.2, '#d8a040'); kit.speaker(-7.2, Y0 + 0.8, -9.5, 0.2); kit.speaker(7.2, Y0 + 0.8, -9.5, -0.2);
  for (let k = 0; k < 5; k++) kit.glowBox('#ffc8a0', 2.8, 1.6, 0.35, 0.35, 0.35, -6 + k * 3, Y0 + H1 - 0.8, -9);
  // album wall (west), merch (east)
  covers.forEach((cv, i) => { const fr = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: cv.tex })); onNight(fr.material, new THREE.Color(1, 1, 1), 1, 1.25, 'color', gateOf('klovee')); fr.position.set(-W / 2 + 0.3, Y0 + 3.2, -8 + i * 3.4); fr.rotation.y = Math.PI / 2; s.add(fr); kit.box(0.08, 2.9, 2.9, -W / 2 + 0.26, Y0 + 1.75, -8 + i * 3.4, '#d8b07a'); kit.glowBox('#ffd8b0', 2.2, 0.6, 0.3, 0.06, 2.6, -W / 2 + 0.6, Y0 + 4.8, -8 + i * 3.4); });
  const teeCols = ['#111', '#ff5c8a', '#f4f0ec', '#c8a070', '#3a2a5a', '#ffd0e0'];
  for (let r = 0; r < 2; r++) for (let k = 0; k < 6; k++) kit.tee(W / 2 - 0.35, Y0 + 1.6 + r * 1.3, 4 - k * 1.3, -Math.PI / 2, teeCols[(k + r * 3) % 6]);
  kit.rail(W / 2 - 3, Y0, 1, 5, Math.PI / 2, 10); kit.rail(W / 2 - 3, Y0, 8, 4, Math.PI / 2, 8);
  kit.counter(W / 2 - 6.5, Y0, 9.5, 4, 1, 0, '#2a1a22'); kit.glowBox('#ff5c8a', 3, 1, 4, 0.05, 0.05, W / 2 - 6.5, Y0 + 0.2, 10.02);
  kit.table(W / 2 - 7, Y0, 3, 2.4, 1.2, '#3a2228'); for (let k = 0; k < 5; k++) kit.box(0.32, 0.02, 0.32, W / 2 - 7.9 + k * 0.45, Y0 + 0.77, 3, pick(['#ff5c8a', '#111', '#ffd27a', '#5fe3ff']));
  sign3D(s, neonSign([{ text: 'MERCH', color: '#ffffff', glow: '#ff5c8a', size: 150, font: DISPLAY }], { w: 700, h: 200 }), 3.6, 1.0, W / 2 - 0.35, Y0 + 4.6, 1, -Math.PI / 2, 2.6, 1.2);
  // fan meet zone
  const step = makeCanvas(512, 256); { const g = step.ctx; g.fillStyle = '#fff4f8'; g.fillRect(0, 0, 512, 256); g.textAlign = 'center'; g.textBaseline = 'middle'; for (let y = 0; y < 5; y++) for (let x = 0; x < 4; x++) { const ox = x * 136 + (y % 2) * 68, oy = y * 56 + 28; g.fillStyle = (x + y) % 2 ? '#ff5c8a' : '#2a0a1a'; g.font = FONT(400, 34, SCRIPT); g.fillText((x + y) % 2 ? 'K Lovee' : '★ STAR VIBES', ox, oy); } }
  const sr = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.5), new THREE.MeshStandardMaterial({ map: step.tex, roughness: 0.6 })); sr.position.set(-11, Y0 + 2.0, 6.5); s.add(sr);
  kit.box(7, 3.6, 0.15, -11, Y0 + 0.2, 6.4, '#ddd');
  kit.table(-11, Y0, 8.6, 3.2, 0.9, '#f4f0ec'); kit.chair(-12, Y0, 7.9, 0); kit.chair(-10, Y0, 7.9, 0);
  for (let k = 0; k < 5; k++) { kit.cyl(0.05, 0.05, 1, -16 + k * 2.4, Y0, 12.5, '#d8b07a', 6); if (k < 4) { kit.part(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 4).rotateZ(Math.PI / 2).translate(-14.8 + k * 2.4, Y0 + 0.9, 12.5), '#8a1a3a'); } }
  sign3D(s, neonSign([{ text: 'FAN MEET', color: '#ffffff', glow: '#ff5c8a', size: 120, font: DISPLAY }], { w: 700, h: 160 }), 3.2, 0.75, -11, Y0 + 4.4, 6.3, 0, 2.6, 1.1);
  // bar
  kit.bar(10, Y0, -2, 6, 0, '#1a0e12', '#2a1a1e', '#ffb0a0'); for (let k = 0; k < 4; k++) kit.stool(8 + k * 1.3, Y0, -1);
  // level 2 — VIP listening lounge
  for (let k = 0; k < 4; k++) { kit.sofa(-12 + k * 8, F2, -6, 0, '#3a1428', 3); kit.roundTable(-12 + k * 8, F2, -4.4, 0.6, '#d8b07a', 0.42); kit.sofa(-12 + k * 8, F2, 6, Math.PI, '#4a1a30', 3); }
  for (let k = 0; k < 6; k++) { kit.cyl(0.3, 0.35, 1.1, -14 + k * 5.6, F2, 0, '#222', 10); kit.part(new THREE.TorusGeometry(0.16, 0.04, 6, 16, Math.PI).translate(-14 + k * 5.6, F2 + 1.25, 0), '#ff5c8a'); }
  for (let k = 0; k < 6; k++) { const d = new THREE.CylinderGeometry(0.7, 0.7, 0.03, 32).rotateX(Math.PI / 2); d.translate(-15 + k * 6, F2 + 2.9, -D / 2 + 0.3); kit.glowGeo('#ffd27a', 2.4, 1.1, d); kit.box(1.8, 1.8, 0.06, -15 + k * 6, F2 + 2.0, -D / 2 + 0.28, '#111'); }
  sign3D(s, neonSign([{ text: 'Real People. Real Culture. Bigger Dreams.', color: '#ffd0e0', glow: '#ff5c8a', size: 90, font: SCRIPT }], { w: 1600, h: 160 }), 14, 1.4, 0, F2 + 4.0, -D / 2 + 0.35, 0, 2.6, 1);
  for (let k = 0; k < 4; k++) kit.glowBox('#ffb88a', 2.5, 0.6, 3, 0.08, 0.6, -12 + k * 8, F2 + H2 - 0.2, 0);
  // rooftop: neon heart & lounge
  const heart = new THREE.Shape(); heart.moveTo(0, -1.2); heart.bezierCurveTo(-2.6, 0.5, -1.3, 2.3, 0, 1.1); heart.bezierCurveTo(1.3, 2.3, 2.6, 0.5, 0, -1.2);
  const hg = new THREE.ExtrudeGeometry(heart, { depth: 0.3, bevelEnabled: false }); hg.scale(1.6, 1.6, 1); hg.translate(0, ROOF + 4.6, -8);
  kit.glowGeo('#ff3a7a', 3.4, 1.2, hg); kit.box(0.3, 3, 0.3, 0, ROOF + 0.6, -8, '#222');
  for (let k = 0; k < 6; k++) kit.sofa(-14 + k * 5.6, ROOF + 0.6, 6, Math.PI, '#f0e0e8', 2.2);
  kit.stringLights(-19, ROOF + 3.6, -13, 19, ROOF + 3.6, -13, 20, 0.8, '#ffd27a'); kit.stringLights(-19, ROOF + 3.6, 13, 19, ROOF + 3.6, 13, 20, 0.8, '#ff9be6');
  for (const [x, z] of [[-19, -13], [19, -13], [-19, 13], [19, 13]]) kit.cyl(0.05, 0.05, 3.6, x, ROOF + 0.6, z, '#222', 4);
  s.collideBox(0, -D / 2, W, 0.4, ROOF + 0.6, ROOF + 1.7); s.collideBox(0, D / 2, W, 0.4, ROOF + 0.6, ROOF + 1.7); s.collideBox(-W / 2, 0, 0.4, D, ROOF + 0.6, ROOF + 1.7); s.collideBox(W / 2, 0, 0.4, D, ROOF + 0.6, ROOF + 1.7);
  kit.box(W, 1.1, 0.12, 0, ROOF + 0.6, D / 2, '#2a2a30'); kit.box(W, 1.1, 0.12, 0, ROOF + 0.6, -D / 2, '#2a2a30'); kit.box(0.12, 1.1, D, -W / 2, ROOF + 0.6, 0, '#2a2a30'); kit.box(0.12, 1.1, D, W / 2, ROOF + 0.6, 0, '#2a2a30');
  liftPad(s, 16, -11, [{ y: Y0 + 0.04, name: 'Stage & merch' }, { y: F2, name: 'VIP listening lounge' }, { y: ROOF + 0.6, name: 'Rooftop' }], 'K Lovee lift', '#ff5c8a');
  // walk-of-fame stars in the plaza
  const starS = new THREE.Shape(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 0.45 : 1.1; k ? starS.lineTo(Math.cos(a) * r, Math.sin(a) * r) : starS.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  for (let k = 0; k < 8; k++) { const g = new THREE.ShapeGeometry(starS); g.rotateX(-Math.PI / 2); g.translate(-15 + k * 4.3, Y0 + 0.03, D / 2 + 10 + (k % 2) * 4); kit.glowGeo('#ff7ab0', 1.3, 0.7, g); }
  // crowds
  crowd(s, 46, i => [rr(-7, 7), Y0, rr(-7, 1.5), Math.PI + rr(-0.3, 0.3)], 'cheer', crowdGate('klovee', 0.2), FANS);
  crowd(s, 1, i => [0, Y0 + 0.8, -10.6, 0], 'dance', crowdGate('klovee', 0.2), ['#ff5c8a']);
  crowd(s, 10, i => [-14 + (i % 5) * 1.2, Y0, 11 + Math.floor(i / 5) * 0.9, Math.PI], 'stand', crowdGate('klovee'), FANS);
  crowd(s, 1, i => [-11, Y0, 7.9, 0], 'sit', crowdGate('klovee'), ['#ff5c8a']);
  crowd(s, 8, i => [W / 2 - 4 - (i % 2) * 2, Y0, -2 + i * 1.6, rand() * 6], 'stand', crowdGate('klovee'), FANS);
  crowd(s, 14, i => [-12 + (i % 4) * 8 + rr(-0.8, 0.8), F2, (i < 4 ? -5.6 : 5.6), i < 4 ? 0 : Math.PI], 'sit', crowdGate('klovee'), FANS);
  crowd(s, 12, i => [rr(-16, 16), ROOF + 0.6, rr(-10, 10), rand() * 6], 'stand', crowdGate('klovee', 0.4), FANS);
  kit.flush();
  pickBox(s, W, ROOF + 6, D, brand);
}

/* =====================================================================
   3 · GLOSTAR — creator education: courses, workshops, co-working, mentoring
   ===================================================================== */
{
  const L = BRAND_LOTS.glostar, s = new Site(L.x, L.z, L.rot), W = 44, D = 32, FH = 4.8, N = 3;
  const brand = registerBrand({ id: 'glostar', name: 'GloStar', tagline: 'Creator education · Courses · Workshops · Co-working', color: '#5fe3ff', district: 'downtown', hours: [8, 22], site: s,
    about: ['Where creators level up.', 'Co-working lobby · two classrooms · mentoring pods & creator studio.', 'Today: “Build Your Brand 101” and “Video Editing Masterclass”.'], door: s.w(0, D / 2 + 3), dropoff: s.w(-12, D / 2 + 30), floorsInfo: 'Co-working (L1) · Classrooms (L2) · Mentoring & studio (L3) · Roof' });
  const kit = new Kit(s, gateOf('glostar'));
  const lv = i => Y0 + i * FH;
  for (let i = 0; i <= N; i++) { slab(s, W + (i === N ? 1 : 0), D + (i === N ? 1 : 0), 0, lv(i) + (i === 0 ? 0.04 : 0), 0, i === N ? charcoal : whiteWall, i === 0 ? 0.1 : 0.45); if (i > 0) kit.glowBox('#5fe3ff', 2.6, 0.9, W + 0.1, 0.1, 0.1, 0, lv(i) - 0.35, D / 2 + 0.02).glowBox('#5fe3ff', 2.6, 0.9, W + 0.1, 0.1, 0.1, 0, lv(i) - 0.35, -D / 2 - 0.02).glowBox('#5fe3ff', 2.6, 0.9, 0.1, 0.1, D + 0.1, W / 2 + 0.02, lv(i) - 0.35, 0).glowBox('#5fe3ff', 2.6, 0.9, 0.1, 0.1, D + 0.1, -W / 2 - 0.02, lv(i) - 0.35, 0); }
  // curtain wall (glass all round) + mullions
  for (const [w, x, z, ry] of [[W, 0, D / 2, 0], [W, 0, -D / 2, Math.PI], [D, W / 2, 0, Math.PI / 2], [D, -W / 2, 0, -Math.PI / 2]]) glassPanel(s, w, FH * N, x, Y0, z, ry, M.glass);
  const mull = []; for (let x = -W / 2; x <= W / 2 + 0.01; x += 2.75) { mull.push(boxAt(0.12, FH * N, 0.16, x, Y0 + FH * N / 2, D / 2), boxAt(0.12, FH * N, 0.16, x, Y0 + FH * N / 2, -D / 2)); }
  for (let z = -D / 2; z <= D / 2 + 0.01; z += 2.65) { mull.push(boxAt(0.16, FH * N, 0.12, W / 2, Y0 + FH * N / 2, z), boxAt(0.16, FH * N, 0.12, -W / 2, Y0 + FH * N / 2, z)); }
  s.mesh(merge(mull), M.white, 0, 0, 0, true);
  s.wall(-W / 2, D / 2, W / 2, D / 2, FH * N, Y0, 0.3, null, [{ at: W / 2, w: 5, h: FH - 0.6 }], []); s.wall(-W / 2, -D / 2, W / 2, -D / 2, FH * N, Y0, 0.3, null, [], []);
  s.wall(-W / 2, -D / 2, -W / 2, D / 2, FH * N, Y0, 0.3, null, [], []); s.wall(W / 2, -D / 2, W / 2, D / 2, FH * N, Y0, 0.3, null, [], []);
  // entrance canopy
  kit.box(10, 0.3, 4, 0, lv(1) - 0.9, D / 2 + 2, '#f2f2f2'); kit.glowBox('#5fe3ff', 3, 1, 10, 0.06, 0.06, 0, lv(1) - 0.95, D / 2 + 4);
  // L1: reception + co-working
  kit.counter(0, lv(0), 9, 7, 1.2, 0, '#f4f4f4'); kit.glowBox('#5fe3ff', 3, 1.2, 7, 0.06, 0.06, 0, lv(0) + 0.92, 9.62);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) { const x = -15 + c * 10, z = -6 + r * 7; kit.table(x, lv(0), z, 6, 1.6, '#e8e2d6'); for (let k = 0; k < 4; k++) { const lx = x - 2.2 + k * 1.45; kit.box(0.42, 0.02, 0.3, lx, lv(0) + 0.76, z - 0.35, '#2a2a30'); const sc = new THREE.PlaneGeometry(0.4, 0.26).rotateX(-0.3).translate(lx, lv(0) + 0.92, z - 0.48); kit.glowGeo(pick(['#5fe3ff', '#ffc65c', '#b46bff']), 1.8, 1, sc); kit.chair(lx, lv(0), z - 1.2, 0, '#1a2a3a'); kit.chair(lx, lv(0), z + 1.2, Math.PI, '#1a2a3a'); } }
  const lobbyScr = screenMesh(16, 4.5, (g, w, h, t) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#04122a'); gr.addColorStop(1, '#0a2a4a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.save(); g.translate(h * 0.5, h * 0.5); g.rotate(t * 0.5); g.fillStyle = '#ffd27a'; g.shadowColor = '#ffd27a'; g.shadowBlur = 30; g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? h * 0.14 : h * 0.34; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill(); g.restore();
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.font = FONT(900, h * 0.3, DISPLAY); g.fillText('GLOSTAR', h * 1.05, h * 0.46); g.fillStyle = '#5fe3ff'; g.font = FONT(700, h * 0.11); g.fillText('LEARN · CREATE · GLOW', h * 1.08, h * 0.66);
    const items = ['Build Your Brand 101 · Room 2A · 10:00', 'Video Editing Masterclass · Room 2B · 14:00', 'Mentoring Hours · Level 3 · All day', 'Podcast Lab · Creator Studio · 18:00']; g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = FONT(600, h * 0.075);
    const i = Math.floor(t / 3) % items.length; g.fillText('NOW ▸ ' + items[i], h * 1.08, h * 0.84); }, { px: 900, every: 1 / 6, k: 1.3 });
  lobbyScr.position.set(0, lv(0) + 2.6, -D / 2 + 0.3); s.add(lobbyScr);
  for (const x of [-20, 20]) for (const z of [-13, 13]) kit.plant(x, lv(0), z, 1.3);
  // L2: two classrooms
  const COURSES = [['BUILD YOUR BRAND 101', ['Find your voice', 'Know your audience', 'Post with purpose', 'Measure & grow']], ['VIDEO EDITING MASTERCLASS', ['Story first', 'Cut on motion', 'Color & mood', 'Sound is 50%']]];
  for (const side of [-1, 1]) {
    const cx = side * 11, C = COURSES[side < 0 ? 0 : 1];
    const scr = screenMesh(9, 3.6, (g, w, h, t) => { g.fillStyle = '#f8fbff'; g.fillRect(0, 0, w, h); g.fillStyle = '#0a2a4a'; g.fillRect(0, 0, w, h * 0.22); g.fillStyle = '#fff'; g.font = FONT(800, h * 0.11, DISPLAY); g.textAlign = 'left'; g.fillText(C[0], w * 0.04, h * 0.15);
      const k = Math.floor(t / 4) % C[1].length; C[1].forEach((it, j) => { g.fillStyle = j === k ? '#0a7ad8' : '#556'; g.font = FONT(j === k ? 800 : 500, h * 0.1); g.fillText(`${j + 1}. ${it}`, w * 0.06, h * (0.38 + j * 0.15)); });
      g.fillStyle = '#ffd27a'; g.beginPath(); g.arc(w * 0.85, h * 0.6, h * 0.18 + Math.sin(t * 2) * 4, 0, 7); g.fill(); g.fillStyle = '#0a2a4a'; g.font = FONT(900, h * 0.08); g.textAlign = 'center'; g.fillText('GLOSTAR', w * 0.85, h * 0.62); }, { px: 640, every: 0.5, k: 1.15, site: s });
    scr.position.set(cx, lv(1) + 2.3, -D / 2 + 0.35); s.add(scr);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) kit.desk(cx - 6 + c * 4, lv(1), -7 + r * 4.2, Math.PI, '#5fe3ff');
    crowd(s, 16, i => [cx - 6 + (i % 4) * 4, lv(1), -7 + Math.floor(i / 4) * 4.2 + 0.7, Math.PI], 'sit', crowdGate('glostar'), ['#2a3a5a', '#e8e0d0', '#5fe3ff', '#3a2a2a', '#d0d8e8', '#ffc65c']);
    crowd(s, 1, i => [cx + 3.5, lv(1), -12.5, 0], 'stand', crowdGate('glostar'), ['#ffc65c']);
  }
  glassPanel(s, D - 2, FH - 0.5, 0, lv(1), -1, Math.PI / 2, M.glass); s.collideBox(0, -4, 0.2, D - 8, lv(1), lv(2));
  for (const side of [-1, 1]) { sign3D(s, neonSign([{ text: side < 0 ? 'ROOM 2A' : 'ROOM 2B', color: '#5fe3ff', size: 120, font: DISPLAY }], { w: 512, h: 160 }), 2.4, 0.75, side * 4, lv(1) + 3.6, D / 2 - 0.4, Math.PI, 2.2, 1); }
  // L3: mentoring pods + creator studio
  for (let k = 0; k < 4; k++) { const x = -16 + (k % 2) * 9, z = -8 + Math.floor(k / 2) * 10; kit.roundTable(x, lv(2), z, 1.2, '#f4f4f4'); for (let c = 0; c < 4; c++) { const a = c / 4 * Math.PI * 2; kit.chair(x + Math.sin(a) * 1.8, lv(2), z + Math.cos(a) * 1.8, a + Math.PI, '#ffc65c'); } crowd(s, 3, i => { const a = i / 3 * Math.PI * 2 + 0.5; return [x + Math.sin(a) * 1.8, lv(2), z + Math.cos(a) * 1.8, a + Math.PI]; }, 'sit', crowdGate('glostar'), ['#2a3a5a', '#e8e0d0', '#5fe3ff', '#ff7ab8']); }
  kit.box(16, 0.1, 12, 12, lv(2), -6, '#1a1a22');
  kit.table(12, lv(2), -7, 4, 1.4, '#222'); for (const x of [10.6, 13.4]) { kit.micStand(x, lv(2) + 0.0, -6.2); kit.chair(x, lv(2), -5.4, Math.PI, '#111'); }
  kit.ringLight(9, lv(2), -1.5, Math.PI); kit.camera(12, lv(2), -1, Math.PI); kit.softbox(15.5, lv(2), -2, Math.PI + 0.5); kit.softbox(8.5, lv(2), -2.2, Math.PI - 0.5);
  sign3D(s, neonSign([{ text: 'ON AIR', color: '#ff4040', size: 150, font: DISPLAY }], { w: 512, h: 180, bg: 'rgba(20,0,0,0.9)', border: '#ff4040' }), 2.2, 0.75, 12, lv(2) + 3.6, -D / 2 + 0.35, 0, 3, 1);
  crowd(s, 2, i => [10.6 + i * 2.8, lv(2), -5.4, Math.PI], 'sit', crowdGate('glostar'), ['#ffc65c', '#5fe3ff']);
  for (let k = 0; k < 6; k++) kit.sphere(0.7, 6 + k * 2.2, lv(2) + 0.45, 8, pick(['#5fe3ff', '#ffc65c', '#b46bff', '#ff7ab8']), 1, 0.6, 1);
  // roof: rotating star + letters
  const star = new THREE.Shape(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 1.6 : 4; k ? star.lineTo(Math.cos(a) * r, -Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, -Math.sin(a) * r); }
  const sg = new THREE.ExtrudeGeometry(star, { depth: 0.8, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelSegments: 1 }); sg.center();
  const starMesh = new THREE.Mesh(sg, glowMat('#ffd27a', 3.2, 1.3)); starMesh.position.set(0, lv(N) + 7.5, 0); s.add(starMesh);
  updaters.push((dt, t) => { starMesh.rotation.y = t * 0.6; });
  kit.cyl(0.25, 0.4, 3.4, 0, lv(N) + 0.3, 0, '#222');
  for (const [z, ry] of [[D / 2 - 1, 0], [-D / 2 + 1, Math.PI]]) sign3D(s, neonSign([{ text: 'GLOSTAR', color: '#e8fbff', glow: '#2ad4ff', size: 200, font: DISPLAY, blur: 36 }], { w: 1100, h: 260 }), 16, 3.8, 0, lv(N) + 2.6, z, ry, 3, 1.3);
  for (let k = 0; k < 8; k++) kit.sofa(-15 + (k % 4) * 10, lv(N) + 0.3, (k < 4 ? -8 : 8), k < 4 ? 0 : Math.PI, '#e8f4ff', 2.6);
  s.collideBox(0, -D / 2, W, 0.4, lv(N), lv(N) + 1.2); s.collideBox(0, D / 2, W, 0.4, lv(N), lv(N) + 1.2); s.collideBox(-W / 2, 0, 0.4, D, lv(N), lv(N) + 1.2); s.collideBox(W / 2, 0, 0.4, D, lv(N), lv(N) + 1.2);
  glassPanel(s, W, 1.1, 0, lv(N) + 0.3, D / 2); glassPanel(s, W, 1.1, 0, lv(N) + 0.3, -D / 2); glassPanel(s, D, 1.1, W / 2, lv(N) + 0.3, 0, Math.PI / 2); glassPanel(s, D, 1.1, -W / 2, lv(N) + 0.3, 0, Math.PI / 2);
  liftPad(s, 18.5, -12.5, [{ y: lv(0) + 0.04, name: 'Lobby & co-working' }, { y: lv(1), name: 'Classrooms 2A · 2B' }, { y: lv(2), name: 'Mentoring & creator studio' }, { y: lv(N) + 0.3, name: 'Roof terrace' }], 'GloStar lift', '#5fe3ff');
  crowd(s, 16, i => { const c = i % 3, r = Math.floor(i / 3) % 2; return [-15 + (i % 3) * 10 - 2.2 + (Math.floor(i / 6) % 4) * 1.45, lv(0), -6 + r * 7 + (i % 2 ? 1.2 : -1.2), i % 2 ? Math.PI : 0]; }, 'sit', crowdGate('glostar'), ['#2a3a5a', '#e8e0d0', '#5fe3ff', '#3a2a2a', '#ffc65c']);
  crowd(s, 1, i => [0, lv(0), 8.2, Math.PI], 'stand', crowdGate('glostar'), ['#5fe3ff']);
  kit.flush();
  pickBox(s, W, lv(N) + 10, D, brand);
}

/* =====================================================================
   4 · HOTSPOT KITCHEN — restaurant, open kitchen, cooking studio, riverside patio
   ===================================================================== */
{
  const L = BRAND_LOTS.kitchen, s = new Site(L.x, L.z, L.rot), W = 40, D = 24, H = 6.2;
  const brand = registerBrand({ id: 'kitchen', name: 'Hotspot Kitchen', tagline: 'Food · Lifestyle · Cooking studio · Recipes', color: '#ff9d3d', district: 'river', hours: [7, 23], site: s,
    about: ['Warm, open kitchen on the Saranac riverwalk.', 'Dining room · live cooking studio · string-lit patio.', 'Tonight: maple-glazed salmon & wood-fired flatbreads.'], door: s.w(0, -D / 2 - 3), dropoff: s.w(0, -D / 2 - 16), floorsInfo: 'Dining room · Open kitchen · Cooking studio · River patio' });
  const kit = new Kit(s, gateOf('kitchen'));
  slab(s, W, D, 0, Y0 + 0.04, 0, floorWood, 0.1);
  // brick walls with big windows: build as piers between window openings
  const wg = [];
  const win = (len, n) => Array.from({ length: n }, (_, i) => ({ at: (i + 0.5) * len / n, w: len / n - 1.6, h: 0 }));
  // street side (local -z): door in the middle
  s.wall(-W / 2, -D / 2, W / 2, -D / 2, H, Y0, 0.5, null, [{ at: W / 2, w: 3, h: 3.2 }], wg);
  s.wall(-W / 2, -D / 2, -W / 2, D / 2, H, Y0, 0.5, null, [], wg); s.wall(W / 2, -D / 2, W / 2, D / 2, H, Y0, 0.5, null, [], wg);
  s.mesh(merge(wg), brickRed);
  // river side: glass wall with doors to the patio
  glassPanel(s, W, H - 0.2, 0, Y0, D / 2, 0, M.glass);
  s.wall(-W / 2, D / 2, W / 2, D / 2, H, Y0, 0.2, null, [{ at: W / 2 - 6, w: 3.4, h: H }, { at: W / 2 + 6, w: 3.4, h: H }], []);
  const fr = []; for (let x = -W / 2; x <= W / 2 + 0.01; x += 3.33) fr.push(boxAt(0.14, H, 0.18, x, Y0 + H / 2, D / 2)); fr.push(boxAt(W, 0.2, 0.2, 0, Y0 + 3.4, D / 2)); s.mesh(merge(fr), blackSteel);
  // windows in the street wall (decorative glowing panes)
  for (let k = -2; k <= 2; k++) if (k) kit.glowBox('#ffcf8a', 1.4, 0.25, 4.4, 2.6, 0.06, k * 7.4, Y0 + 1.0, -D / 2 - 0.27);
  // gable roof with skylight ridge
  const rs = new THREE.Shape(); rs.moveTo(-D / 2 - 1, 0); rs.lineTo(0, 4.2); rs.lineTo(D / 2 + 1, 0); rs.lineTo(-D / 2 - 1, 0);
  const rg = new THREE.ExtrudeGeometry(rs, { depth: W + 1.4, bevelEnabled: false }); rg.rotateY(Math.PI / 2); rg.translate(-W / 2 - 0.7, Y0 + H, 0);
  const roofM = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0x2c2a2a, roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide })); roofM.castShadow = true; s.add(roofM);
  kit.glowBox('#ffd9a0', 1.6, 0.2, W, 0.2, 1.4, 0, Y0 + H + 4.0, 0);
  // signs
  const ks = neonSign([{ text: 'HOTSPOT KITCHEN', color: '#fff2d8', glow: '#ff8a2a', size: 130, font: DISPLAY, blur: 30 }], { w: 1400, h: 200 });
  sign3D(s, ks, 18, 2.6, 0, Y0 + H + 1.4, D / 2 + 1.0, 0, 3, 1.3); sign3D(s, ks, 18, 2.6, 0, Y0 + H + 1.4, -D / 2 - 1.0, Math.PI, 3, 1.3);
  kit.box(3, 0.3, 1.6, 0, Y0 + 3.4, -D / 2 - 0.9, '#2a1a12'); // door canopy
  const menu = makeCanvas(512, 720); { const g = menu.ctx; g.fillStyle = '#1f2420'; g.fillRect(0, 0, 512, 720); g.strokeStyle = '#a08a5a'; g.lineWidth = 14; g.strokeRect(7, 7, 498, 706); g.fillStyle = '#f4ead2'; g.textAlign = 'center'; g.font = FONT(400, 64, SCRIPT); g.fillText('Tonight', 256, 92);
    const items = [['Maple-Glazed Salmon', '24'], ['Wood-Fired Flatbread', '16'], ['Champlain Fish Tacos', '18'], ['Adirondack Burger', '17'], ['Farm Lake Salad', '13'], ['Michigan Hot Dog', '9'], ['Apple Cider Donuts', '7'], ['Craft Lemonade', '5']];
    g.textAlign = 'left'; items.forEach(([n, p], i) => { g.font = FONT(600, 30); g.fillText(n, 40, 170 + i * 66); g.textAlign = 'right'; g.fillText('$' + p, 472, 170 + i * 66); g.textAlign = 'left'; }); }
  const mb = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.25), new THREE.MeshStandardMaterial({ map: menu.tex, roughness: 0.9 })); mb.position.set(-3.5, Y0 + 1.3, -D / 2 - 0.9); mb.rotation.y = Math.PI; s.add(mb); kit.box(1.8, 2.5, 0.1, -3.5, Y0 + 0.1, -D / 2 - 0.82, '#3a2a1a');
  // open kitchen (back), pass counter, chefs
  kit.box(W - 14, 0.06, 7, -4, Y0 + 0.04, -D / 2 + 3.9, '#c8ccd0');
  kit.stove(-12, Y0, -D / 2 + 1.2, 0, 4.8); kit.stove(-5, Y0, -D / 2 + 1.2, 0, 4.8); kit.counter(3, Y0, -D / 2 + 1.2, 5, 0.8, 0, '#b8bcc4');
  kit.counter(-4, Y0, -D / 2 + 6.6, 22, 1.0, 0, '#3a2a1e'); kit.box(22, 0.08, 1.2, -4, Y0 + 1.15, -D / 2 + 6.6, '#d8d0c0');
  for (let k = 0; k < 6; k++) kit.glowBox('#ffd9a0', 2.2, 0.4, 0.5, 0.3, 0.5, -14 + k * 4, Y0 + H - 1.6, -D / 2 + 6.6);
  for (let k = 0; k < 8; k++) kit.cyl(0.12, 0.12, 0.1, -12 + k * 2.6, Y0 + 1.19, -D / 2 + 6.6, '#f4f4f4', 10);
  crowd(s, 5, i => [-13 + i * 4, Y0, -D / 2 + 2.6, Math.PI], 'cook', () => BRANDS.kitchen.isOpen(), ['#f4f4f4']);
  // dining room
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { const x = -14 + c * 6, z = -1 + r * 4; kit.table(x, Y0, z, 1.8, 1.0, '#7a5034'); for (const sd of [-1, 1]) for (const dx of [-0.45, 0.45]) kit.chair(x + dx, Y0, z + sd * 0.85, sd > 0 ? Math.PI : 0, '#2a1a12'); kit.cyl(0.04, 0.05, 0.12, x, Y0 + 0.76, z, '#fff3c0', 6); }
  for (let k = 0; k < 4; k++) kit.glowBox('#ffcf8a', 2.4, 0.5, 0.4, 0.4, 0.4, -14 + k * 6, Y0 + H - 2.0, 3);
  crowd(s, 30, i => { const c = i % 4, r = Math.floor(i / 4) % 3, sd = Math.floor(i / 12) % 2 ? 1 : -1, dx = i % 3 ? 0.45 : -0.45; return [-14 + c * 6 + dx, Y0, -1 + r * 4 + sd * 0.85, sd > 0 ? Math.PI : 0]; }, 'sit', () => BRANDS.kitchen.isOpen() && (env.hour > 11 && env.hour < 14 || env.hour > 17), FANS);
  // cooking studio (local +x end)
  kit.counter(14, Y0, 2, 6, 2, 0, '#e8e4dc'); kit.box(6, 0.08, 2.1, 14, Y0 + 0.9, 2, '#2a2a2a');
  kit.camera(12, Y0, 7, Math.PI); kit.camera(17, Y0, 6.5, Math.PI + 0.4); kit.softbox(10, Y0, 6.5, Math.PI - 0.6); kit.softbox(18.5, Y0, 4, Math.PI + 1.0);
  const studio = screenMesh(7, 3, (g, w, h, t) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#3a1a0a'); gr.addColorStop(1, '#a04a1a'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#fff2d8'; g.textAlign = 'left'; g.font = FONT(900, h * 0.17, DISPLAY); g.fillText('COOKING LIVE', w * 0.05, h * 0.3); g.font = FONT(400, h * 0.16, SCRIPT); g.fillText('with Hotspot Kitchen', w * 0.05, h * 0.52);
    const steps = ['1 · Whisk maple & garlic', '2 · Sear salmon 4 min', '3 · Glaze & finish', '4 · Plate with greens']; g.font = FONT(700, h * 0.09); g.fillStyle = '#ffd27a'; g.fillText(steps[Math.floor(t / 3) % 4], w * 0.05, h * 0.76);
    g.fillStyle = '#ff3030'; g.beginPath(); g.arc(w * 0.9, h * 0.18, h * 0.05, 0, 7); g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 5); g.fill(); g.globalAlpha = 1; g.fillStyle = '#fff'; g.font = FONT(800, h * 0.07); g.fillText('REC', w * 0.78, h * 0.2); }, { px: 560, every: 0.25, k: 1.3 });
  studio.position.set(14, Y0 + 3.0, -D / 2 + 0.8); s.add(studio);
  crowd(s, 2, i => [13 + i * 2, Y0, 0.6, 0], 'cook', () => BRANDS.kitchen.isOpen(), ['#f4f4f4', '#ff9d3d']);
  // patio by the river (local +z)
  const pk = new Kit(s); pk.outdoor = true;
  pk.box(W, 0.14, 18, 0, Y0 - 0.02, D / 2 + 9, '#8a6a4a'); s.floor(0, D / 2 + 9, W, 18, Y0 + 0.12);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) pk.umbrellaTable(-16 + c * 6.4, Y0 + 0.12, D / 2 + 3.5 + r * 5, ['#ff9d3d', '#f4ead2', '#c0402a'][(r + c) % 3]);
  for (let k = 0; k <= 6; k++) pk.cyl(0.06, 0.08, 4.4, -19 + k * 6.33, Y0 + 0.12, D / 2 + 17.6, '#222', 6);
  for (let k = 0; k < 6; k++) { pk.stringLights(-19 + k * 6.33, Y0 + 4.5, D / 2 + 17.6, -19 + (k + 1) * 6.33, Y0 + 4.5, D / 2 + 17.6, 10, 0.5); pk.stringLights(-19 + k * 6.33, Y0 + 4.5, D / 2 + 17.6, -19 + k * 6.33 + 3, Y0 + 5.6, D / 2, 12, 0.9, '#ffe2a8'); }
  pk.cyl(1.2, 1.3, 0.5, 0, Y0 + 0.12, D / 2 + 14.5, '#3a3a3a', 16); flamesAt(s, 0, Y0 + 0.62, D / 2 + 14.5, 5);
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + 0.4; pk.sofa(Math.sin(a) * 3.2, Y0 + 0.12, D / 2 + 14.5 + Math.cos(a) * 3.2, a + Math.PI, '#5a3a2a', 2.2); }
  pk.box(W, 1.0, 0.1, 0, Y0 + 0.12, D / 2 + 18, '#2a2a2a'); s.collideBox(0, D / 2 + 18, W, 0.3, 0, 1.2);
  crowd(s, 30, i => { const c = i % 6, r = Math.floor(i / 6) % 3; const sd = i % 2 ? 0.75 : -0.75; return [-16 + c * 6.4 + sd, Y0 + 0.12, D / 2 + 3.5 + r * 5, sd > 0 ? -Math.PI / 2 : Math.PI / 2]; }, 'sit', () => BRANDS.kitchen.isOpen() && env.hour > 11 && env.rain < 0.3, FANS);
  pk.flush(); kit.flush();
  pickBox(s, W, H + 6, D, brand);
}
function flamesAt(site, x, y, z, n = 1) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; flames.push({ site, x: x + Math.sin(a) * 0.5, y, z: z + Math.cos(a) * 0.5 }); } }

/* =====================================================================
   5 · STAR VIBES MEDIA PRODUCTION — HQ: sound stage, recording studios, screening room
   ===================================================================== */
export const posterTex = { aerial: loadTex('assets/aerial.jpg'), concept: loadTex('assets/concept.jpg') };
{
  const L = BRAND_LOTS.starvibes, s = new Site(L.x, L.z, L.rot), W = 64, D = 46, FH = 6;
  const brand = registerBrand({ id: 'starvibes', name: 'Star Vibes Media Production', tagline: 'Film · Recording · Production — the creative heart', color: '#ffc65c', district: 'waterfront', hours: [0, 24], site: s,
    about: ['HQ of the whole ecosystem, on the Lake Champlain waterfront.', 'Sound stage · recording studios · screening room · production offices.', 'Rooftop helipad with the Star Vibes neon.'], door: s.w(0, D / 2 + 3), dropoff: s.w(14, D / 2 + 30), floorsInfo: 'Lobby · Sound Stage · Studios A/B · Screening room · Offices (L2) · Roof' });
  const kit = new Kit(s, gateOf('starvibes'));
  const F2 = Y0 + FH, ROOF = Y0 + FH * 2;
  slab(s, W, D, 0, Y0 + 0.04, 0, floorConcrete, 0.1);
  // exterior walls: brick, with glass front on the office wing
  const wg = [];
  s.wall(-W / 2, -D / 2, W / 2, -D / 2, 13, Y0, 0.6, null, [], wg);                       // lake side (local -z)
  s.wall(-W / 2, -D / 2, -W / 2, D / 2, 13, Y0, 0.6, null, [], wg);                       // north
  s.wall(W / 2, -D / 2, W / 2, D / 2, ROOF - Y0, Y0, 0.6, null, [], wg);                  // south
  s.mesh(merge(wg), brickRed);
  glassPanel(s, W, FH * 2 - 0.3, 0, Y0, D / 2, 0, M.tint);
  s.wall(-W / 2, D / 2, W / 2, D / 2, FH * 2, Y0, 0.25, null, [{ at: W / 2, w: 5, h: 4 }], []);
  const fr = []; for (let x = -W / 2; x <= W / 2 + 0.01; x += 4) fr.push(boxAt(0.25, FH * 2, 0.3, x, Y0 + FH, D / 2)); fr.push(boxAt(W, 0.4, 0.4, 0, F2, D / 2), boxAt(W + 0.6, 0.5, 0.5, 0, ROOF, D / 2)); s.mesh(merge(fr), blackSteel);
  // interior walls: front wing / back divide at z=8; stage | studio divide at x=-2
  const iw = [];
  s.wall(-W / 2, 8, W / 2, 8, FH, Y0, 0.3, null, [{ at: W / 2 - 17, w: 4, h: 4.2 }, { at: W / 2 + 6, w: 2.6, h: 3 }], iw);
  s.wall(-2, -D / 2, -2, 8, 13, Y0, 0.3, null, [], iw);
  s.wall(14, -D / 2, 14, 8, 7, Y0, 0.2, null, [{ at: D / 2 - 8 + 0.01 + 9, w: 1.8, h: 2.6 }], iw);  // control | live room
  s.wall(10, 8, 10, D / 2, FH, Y0, 0.3, null, [{ at: 4, w: 2.4, h: 3 }], iw);                       // screening room
  s.wall(-10, 8, -10, D / 2, FH, Y0, 0.3, null, [{ at: 4, w: 2.4, h: 3 }], iw);
  s.mesh(merge(iw), whiteWall);
  // office floor (front wing only)
  slab(s, W, D / 2 - 8, 0, F2, (8 + D / 2) / 2, floorWood, 0.45);
  // roofs: front wing flat (helipad), studios flat, sound stage sawtooth with skylights
  slab(s, W, D / 2 - 8, 0, ROOF, (8 + D / 2) / 2, charcoal, 0.5);
  s.mesh(new THREE.BoxGeometry(W / 2 + 2 - 16 + 16, 0.5, D / 2 + 8), charcoal, (W / 2 - 2) / 2 + -1 + 1, Y0 + 7.25, (-D / 2 + 8) / 2);
  const saw = []; for (let k = 0; k < 5; k++) { const z0 = -D / 2 + k * (D / 2 + 8) / 5, dz = (D / 2 + 8) / 5; const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(dz, 0); sh.lineTo(dz, 3.2); sh.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: W / 2 - 2, bevelEnabled: false }); g.rotateY(-Math.PI / 2); g.translate(-2, 13 + Y0, z0); saw.push(g); kit.glowBox('#ffe8c0', 1.4, 0.15, W / 2 - 2.2, 3.0, 0.08, -W / 4 - 1, 13 + Y0, z0 + dz - 0.06); }
  s.mesh(merge(saw), charcoal);
  // roof neon signs
  const sv = neonSign([{ text: '★ STAR VIBES', color: '#fff4d0', glow: '#ffb02e', size: 210, font: DISPLAY, blur: 40, dy: -20 }, { text: 'MEDIA PRODUCTION', color: '#ffd27a', glow: '#ff9d2e', size: 80, font: DISPLAY, dy: -10 }], { w: 1500, h: 400 });
  sign3D(s, sv, 30, 8, 0, ROOF + 5.4, D / 2 - 3, 0, 3.2, 1.3);
  sign3D(s, sv, 26, 6.9, -W / 4, Y0 + 13 + 7, -D / 2 + 2, Math.PI, 3.2, 1.3);
  kit.box(30, 0.4, 0.4, 0, ROOF + 1.1, D / 2 - 3.3, '#111').box(0.3, 1.8, 0.3, -12, ROOF, D / 2 - 3.3, '#111').box(0.3, 1.8, 0.3, 12, ROOF, D / 2 - 3.3, '#111');
  // helipad on the office roof
  const hp = makeCanvas(512, 512); { const g = hp.ctx; g.fillStyle = '#2a2a30'; g.fillRect(0, 0, 512, 512); g.strokeStyle = '#ffc65c'; g.lineWidth = 18; g.beginPath(); g.arc(256, 256, 220, 0, 7); g.stroke(); g.fillStyle = '#fff'; g.font = FONT(900, 300, DISPLAY); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', 256, 270); }
  const pad = new THREE.Mesh(new THREE.CircleGeometry(7, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: hp.tex, roughness: 0.7 })); pad.position.set(-18, ROOF + 0.02, (8 + D / 2) / 2); s.add(pad);
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; kit.glowBox('#7cffb2', 3, 0.8, 0.3, 0.15, 0.3, -18 + Math.sin(a) * 7.4, ROOF, (8 + D / 2) / 2 + Math.cos(a) * 7.4); }
  brand.helipad = s.w(-18, (8 + D / 2) / 2); brand.helipadY = ROOF;
  s.collideBox(0, D / 2, W, 0.3, ROOF, ROOF + 1.1); s.collideBox(-W / 2, (8 + D / 2) / 2, 0.3, D / 2 - 8, ROOF, ROOF + 1.1); s.collideBox(W / 2, (8 + D / 2) / 2, 0.3, D / 2 - 8, ROOF, ROOF + 1.1); s.collideBox(0, 8, W, 0.3, ROOF, ROOF + 1.1);
  // spinning film reels on the facade
  const reels = [];
  for (const x of [-W / 2 + 5, W / 2 - 5]) { const g = new THREE.Group(); g.position.set(x, Y0 + 8.5, D / 2 + 0.7); s.add(g); const rk = new Kit({ add: o => g.add(o) }); rk.filmReel(0, 0, 0, 0, 3.2); rk.flush(); const ring = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.08, 6, 48), glowMat('#ffc65c', 3, 0.8)); g.add(ring); reels.push(g); }
  updaters.push((dt, t) => { for (const r of reels) r.rotation.z = t * 0.5; });
  // LOBBY
  kit.counter(0, Y0, 17, 8, 1.2, 0, '#141418'); kit.glowBox('#ffc65c', 3, 1.2, 8, 0.06, 0.06, 0, Y0 + 0.92, 17.62);
  sign3D(s, neonSign([{ text: '★', color: '#ffd27a', size: 300 }], { w: 400, h: 400 }), 4.4, 4.4, 0, Y0 + 3.4, 8.2, 0, 3, 1.2);
  sign3D(s, neonSign([{ text: 'STAR VIBES', color: '#fff', glow: '#ffb02e', size: 130, font: DISPLAY }], { w: 900, h: 170 }), 7, 1.3, 0, Y0 + 5.4, 8.2, 0, 2.6, 1.1);
  for (const [x, tex] of [[-6.5, 'aerial'], [6.5, 'concept']]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3), new THREE.MeshBasicMaterial({ map: posterTex[tex] })); p.position.set(x, Y0 + 2.6, 8.2); s.add(p); kit.box(4.9, 3.3, 0.08, x, Y0 + 1.0, 8.12, '#c8a050'); }
  kit.sofa(-5, Y0, 13, 0, '#2a2018', 3); kit.sofa(5, Y0, 13, 0, '#2a2018', 3); kit.roundTable(0, Y0, 13.5, 0.8, '#c8a050', 0.42);
  for (let k = 0; k < 6; k++) kit.filmReel(-W / 2 + 0.4 + 0.01, Y0 + 2.5 + (k % 2) * 1.6, 12 + Math.floor(k / 2) * 3, Math.PI / 2, 0.7);
  // SCREENING ROOM (local x 10..32, z 8..23) — seats face +x
  const film = screenMesh(13, 5.6, (g, w, h, t) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); const im = posterTex.aerial.image; if (im && im.width) { const sc = 1.15 + 0.1 * Math.sin(t * 0.05), iw = w * sc, ih = iw * im.height / im.width, ox = (w - iw) / 2 + Math.sin(t * 0.07) * w * 0.06, oy = (h - ih) / 2 + Math.cos(t * 0.05) * h * 0.04; g.globalAlpha = 0.95; g.drawImage(im, ox, oy, iw, ih); g.globalAlpha = 1; }
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h * 0.1); g.fillRect(0, h * 0.9, w, h * 0.1); const ph = (t % 24) / 24; if (ph < 0.25) { g.fillStyle = `rgba(255,255,255,${Math.sin(ph / 0.25 * Math.PI)})`; g.textAlign = 'center'; g.font = FONT(800, h * 0.08, DISPLAY); g.fillText('STAR VIBES MEDIA PRODUCTION PRESENTS', w / 2, h * 0.5); }
    else if (ph < 0.5) { g.fillStyle = `rgba(255,255,255,${Math.sin((ph - 0.25) / 0.25 * Math.PI)})`; g.textAlign = 'center'; g.font = FONT(400, h * 0.16, SCRIPT); g.fillText('Real People · Real Culture', w / 2, h * 0.52); } }, { px: 760, every: 1 / 15, k: 1.15 });
  film.position.set(31.6, Y0 + 3.4, 15.5); film.rotation.y = -Math.PI / 2; s.add(film);
  for (let r = 0; r < 5; r++) { kit.box(1.2, 0.25 + r * 0.25, 13, 14.5 + r * 2.2 - 1.0, Y0, 15.5, '#1a1218'); kit.seatsRow(14.5 + r * 2.2, Y0 + 0.25 + r * 0.25, 15.5, 9, -Math.PI / 2, '#8a1a2a', 1.3); }
  for (let k = 0; k < 4; k++) kit.glowBox('#ff6a3a', 2, 0.3, 0.2, 0.2, 0.2, 12 + k * 6, Y0 + 0.1, 22.6);
  crowd(s, 18, i => { const r = i % 5, c = Math.floor(i / 5) % 9; return [14.5 + r * 2.2, Y0 + 0.25 + r * 0.25, 15.5 + (c - 4) * 1.3, -Math.PI / 2]; }, 'sit', () => env.lights > 0.4, FANS);
  // EDIT & GEAR (local x -32..-10, front wing): gear cases + edit bays
  for (let k = 0; k < 3; k++) kit.desk(-27 + k * 6, Y0, 14, Math.PI, '#ffc65c');
  for (let k = 0; k < 6; k++) kit.box(1.4, 0.9, 0.8, -30 + k * 1.6, Y0, 21.6, pick(['#2a2a2e', '#3a3020']));
  crowd(s, 3, i => [-27 + i * 6, Y0, 14.7, Math.PI], 'work', () => BRANDS.starvibes.isOpen(), ['#2a2a2e', '#e8e0d0', '#ffc65c']);
  // SOUND STAGE (local x -32..-2, z -23..8)
  kit.box(0.3, 9, 22, -31.4, Y0, -8, '#2ac04a'); kit.box(28, 9, 0.3, -17, Y0, -22.4, '#2ac04a'); kit.box(28, 0.05, 6, -17, Y0 + 0.05, -19, '#2ac04a');
  kit.sofa(-17, Y0, -15, 0, '#d8b07a', 3.2); kit.roundTable(-17, Y0, -13.4, 0.6, '#222', 0.45); kit.chair(-21, Y0, -13.5, 0.6, '#d8b07a'); kit.plant(-23, Y0, -16, 1.5); kit.plant(-11, Y0, -16, 1.5);
  for (let k = 0; k < 3; k++) kit.camera(-23 + k * 6, Y0, -4, Math.PI);
  for (let k = 0; k < 10; k++) kit.box(0.12, 0.06, 1.8, -27 + k * 2, Y0 + 0.02, -2, '#4a4a4a'); kit.box(20, 0.06, 0.12, -17, Y0 + 0.02, -2.9, '#888').box(20, 0.06, 0.12, -17, Y0 + 0.02, -1.1, '#888');
  kit.softbox(-28, Y0, -9, 0.8); kit.softbox(-6, Y0, -9, -0.8); kit.softbox(-17, Y0, -6, Math.PI);
  kit.truss(-17, Y0 + 10, -12, 26, 0); kit.truss(-17, Y0 + 10, -4, 26, 0);
  for (let k = 0; k < 8; k++) { kit.box(0.5, 0.6, 0.5, -28 + k * 3.2, Y0 + 9.2, -12, '#111'); kit.glowBox('#fff2d0', 2.8, 1.4, 0.4, 0.05, 0.4, -28 + k * 3.2, Y0 + 9.15, -12); }
  for (const [x, ry] of [[-25, 0.4], [-20, 0], [-14, -0.2]]) kit.directorChair(x, Y0, 3, ry + Math.PI, '#111');
  sign3D(s, neonSign([{ text: 'STAGE 1 · QUIET ON SET', color: '#ff5050', size: 80, font: DISPLAY }], { w: 1100, h: 120, bg: 'rgba(20,0,0,0.9)', border: '#ff4040' }), 6, 0.65, -17, Y0 + 5, 7.8, Math.PI, 3, 1);
  crowd(s, 2, i => [-18 + i * 2, Y0, -14.6, 0], 'sit', () => BRANDS.starvibes.isOpen() && env.hour > 9 && env.hour < 21, ['#ffc65c', '#ff5c8a']);
  crowd(s, 5, i => [-23 + i * 3, Y0, -3 + (i % 2), Math.PI], 'work', () => BRANDS.starvibes.isOpen() && env.hour > 9 && env.hour < 21, ['#1a1a1a', '#2a2a2e', '#3a3a40']);
  // RECORDING: control room (x -2..14) + live room (x 14..32)
  kit.console(6, Y0, -10, Math.PI, 5); for (const x of [3, 9]) kit.speaker(x, Y0 + 1.2, -14.8, 0, 0.7); kit.box(6, 1.2, 0.6, 6, Y0, -15, '#1a1a20');
  for (let k = 0; k < 3; k++) { const sc = screenMesh(1.4, 0.8, (g, w, h, t) => { g.fillStyle = '#05080e'; g.fillRect(0, 0, w, h); for (let j = 0; j < 4; j++) { g.strokeStyle = ['#5fe3ff', '#ff4fa3', '#ffc65c', '#7cffb2'][j]; g.lineWidth = 2; g.beginPath(); for (let x = 0; x < w; x += 3) g.lineTo(x, h * (0.2 + j * 0.2) + Math.sin(x * 0.07 + t * (3 + j) + k) * h * 0.07 * Math.sin(x * 0.01 + t)); g.stroke(); } }, { px: 200, every: 1 / 12 }); sc.position.set(4.4 + k * 1.6, Y0 + 1.6, -10.6); sc.rotation.x = -0.15; s.add(sc); }
  glassPanel(s, 18, 4.5, 14, Y0 + 1, -8, Math.PI / 2, M.glass);
  kit.chair(6, Y0, -8.6, Math.PI, '#111'); crowd(s, 1, i => [6, Y0, -8.4, Math.PI], 'work', () => BRANDS.starvibes.isOpen(), ['#ffc65c']);
  kit.drums(25, Y0, -16); kit.micStand(20, Y0, -10); kit.micStand(23, Y0, -6); kit.guitar(28, Y0, -8, -0.4, '#2a4a8a'); kit.keyboard(19, Y0, -16, 0.3);
  for (let k = 0; k < 8; k++) kit.box(0.15, 2.4, 1.8, 31.6, Y0 + 1.2, -20 + k * 3.2, ['#5a2a6a', '#2a3a6a', '#6a2a3a'][k % 3]);
  for (let k = 0; k < 4; k++) kit.box(2.4, 0.15, 2.4, 18 + k * 3.5, Y0 + 6.6, -10, '#2a2a3a');
  sign3D(s, neonSign([{ text: 'STUDIO A · RECORDING', color: '#ff4040', size: 80, font: DISPLAY }], { w: 1000, h: 120, bg: 'rgba(20,0,0,0.9)', border: '#ff4040' }), 4.5, 0.55, 6, Y0 + 4.6, 7.8, Math.PI, 3, 1);
  crowd(s, 3, i => [[20, 23, 25][i], Y0, [-9.4, -5.4, -14.8][i], [Math.PI, Math.PI, Math.PI][i]], 'cheer', () => BRANDS.starvibes.isOpen() && env.hour > 12, ['#ff5c8a', '#1a1a1a', '#5fe3ff']);
  // L2 — production offices
  for (let r = 0; r < 2; r++) for (let c = 0; c < 8; c++) kit.desk(-27 + c * 7, F2, 12 + r * 6, r ? 0 : Math.PI, pick(['#ffc65c', '#5fe3ff', '#ff4fa3']));
  crowd(s, 14, i => { const r = i % 2, c = Math.floor(i / 2) % 8; return [-27 + c * 7, F2, 12 + r * 6 + (r ? -0.7 : 0.7), r ? 0 : Math.PI]; }, 'work', () => BRANDS.starvibes.isOpen() && env.hour > 8 && env.hour < 22, ['#2a2a2e', '#e8e0d0', '#ffc65c', '#3a4a6a']);
  for (let k = 0; k < 6; k++) kit.glowBox('#fff2d8', 2.2, 0.4, 6, 0.08, 0.5, -24 + k * 10, F2 + FH - 0.6, 15);
  const wall2 = screenMesh(12, 3.4, (g, w, h, t) => { g.fillStyle = '#0a0a10'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffc65c'; g.font = FONT(800, h * 0.12, DISPLAY); g.textAlign = 'left'; g.fillText('PRODUCTION SLATE', w * 0.03, h * 0.17);
    const rows = [['Champlain Nights — Live Film', 'EDIT', 0.72], ['K Lovee “Lakefront Heat” Video', 'COLOR', 0.9], ['GloStar Course Series S2', 'SHOOT', 0.41], ['Hotspot Kitchen — Season 3', 'PRE', 0.2]];
    rows.forEach(([n, st, p], i) => { const y = h * (0.32 + i * 0.17); g.fillStyle = '#fff'; g.font = FONT(600, h * 0.085); g.fillText(n, w * 0.03, y); g.fillStyle = '#333'; g.fillRect(w * 0.6, y - h * 0.06, w * 0.3, h * 0.06); const pp = Math.min(1, p + Math.sin(t * 0.1 + i) * 0.02); g.fillStyle = ['#ffc65c', '#ff4fa3', '#5fe3ff', '#7cffb2'][i]; g.fillRect(w * 0.6, y - h * 0.06, w * 0.3 * pp, h * 0.06); g.fillStyle = '#aaa'; g.font = FONT(700, h * 0.07); g.fillText(st, w * 0.92, y); }); }, { px: 760, every: 1, k: 1.2 });
  wall2.position.set(0, F2 + 3.2, 8.2); s.add(wall2);
  liftPad(s, -6.5, 19.5, [{ y: Y0 + 0.04, name: 'Lobby' }, { y: F2, name: 'Production offices' }, { y: ROOF, name: 'Roof & helipad' }], 'Star Vibes lift', '#ffc65c');
  kit.flush();
  pickBox(s, W, 22, D, brand);
}

/* =====================================================================
   6 · STAR VIBES GARAGE & SHOWROOM (vehicle picker lives in vehicles.js)
   ===================================================================== */
export const GARAGE = { turntables: [] };
{
  const L = BRAND_LOTS.garage, s = new Site(L.x, L.z, L.rot), W = 52, D = 30, H = 8;
  const brand = registerBrand({ id: 'garage', name: 'Star Vibes Garage', tagline: 'Showroom · Customization bay · Storage', color: '#b46bff', district: 'downtown', hours: [0, 24], site: s,
    about: ['The whole Star Vibes fleet, on turntables.', 'Walk up to any car and press E to take it — or open Garage (V) anywhere.', 'Customization: paint, underglow, wheels.'], door: s.w(0, D / 2 + 3), dropoff: s.w(0, D / 2 + 10), floorsInfo: 'Showroom · Customization bay' });
  const kit = new Kit(s, gateOf('garage'));
  slab(s, W, D, 0, Y0 + 0.04, 0, floorDark, 0.1);
  s.mesh(new THREE.BoxGeometry(W + 1, 0.6, D + 1), charcoal, 0, Y0 + H + 0.3, 0);
  for (const [w, x, z, ry] of [[W, 0, D / 2, 0], [D, W / 2, 0, Math.PI / 2], [D, -W / 2, 0, -Math.PI / 2]]) glassPanel(s, w, H, x, Y0, z, ry, M.glass);
  const wg = []; s.wall(-W / 2, -D / 2, W / 2, -D / 2, H, Y0, 0.4, null, [], wg); s.mesh(merge(wg), charcoal);
  s.wall(-W / 2, D / 2, W / 2, D / 2, H, Y0, 0.2, null, [{ at: W / 2, w: 10, h: H }], []); s.wall(-W / 2, -D / 2, -W / 2, D / 2, H, Y0, 0.2, null, [], []); s.wall(W / 2, -D / 2, W / 2, D / 2, H, Y0, 0.2, null, [], []);
  const fr = []; for (let x = -W / 2; x <= W / 2 + 0.01; x += 5.2) fr.push(boxAt(0.2, H, 0.25, x, Y0 + H / 2, D / 2)); s.mesh(merge(fr), blackSteel);
  kit.glowBox('#b46bff', 3, 1, W + 1, 0.14, 0.14, 0, Y0 + H + 0.62, D / 2 + 0.5).glowBox('#b46bff', 3, 1, 0.14, 0.14, D + 1, W / 2 + 0.5, Y0 + H + 0.62, 0).glowBox('#b46bff', 3, 1, 0.14, 0.14, D + 1, -W / 2 - 0.5, Y0 + H + 0.62, 0);
  sign3D(s, neonSign([{ text: 'STAR VIBES GARAGE', color: '#f2e6ff', glow: '#9a4dff', size: 140, font: DISPLAY, blur: 30 }], { w: 1500, h: 200 }), 24, 3.2, 0, Y0 + H + 2.6, D / 2 - 1, 0, 3, 1.3);
  kit.box(24, 0.3, 0.3, 0, Y0 + H + 0.6, D / 2 - 1, '#111');
  for (let k = 0; k < 5; k++) {
    const x = -20 + k * 10, z = 2;
    kit.cyl(3.3, 3.4, 0.25, x, Y0, z, '#18141f', 40); const ring = new THREE.TorusGeometry(3.35, 0.06, 4, 64).rotateX(Math.PI / 2).translate(x, Y0 + 0.26, z); kit.glowGeo('#b46bff', 3, 1.2, ring);
    kit.glowBox('#fff', 2.5, 1.6, 2.6, 0.06, 1.4, x, Y0 + H - 0.2, z);
    const [wx, wz] = s.w(x, z); GARAGE.turntables.push({ x: wx, z: wz, y: Y0 + 0.25, local: [x, z], site: s });
  }
  // customization bay
  kit.box(W - 4, 0.05, 8, 0, Y0 + 0.05, -D / 2 + 5, '#2a2a30');
  for (const x of [-12, 12]) { kit.box(0.5, 3.2, 0.5, x - 2, Y0, -D / 2 + 5, '#c03030').box(0.5, 3.2, 0.5, x + 2, Y0, -D / 2 + 5, '#c03030').box(4.6, 0.3, 4.2, x, Y0 + 1.6, -D / 2 + 5, '#888'); }
  for (let k = 0; k < 10; k++) { const t = new THREE.TorusGeometry(0.42, 0.16, 8, 20); t.translate(-18 + k * 1.2, Y0 + 2 + (k % 2) * 1.2, -D / 2 + 0.6); kit.part(t, '#111'); const r = new THREE.TorusGeometry(0.3, 0.05, 6, 16); r.translate(-18 + k * 1.2, Y0 + 2 + (k % 2) * 1.2, -D / 2 + 0.72); kit.glowGeo(['#b46bff', '#5fe3ff', '#ffc65c', '#ff4fa3', '#7cffb2'][k % 5], 2.4, 1, r); }
  kit.shelf(14, Y0, -D / 2 + 0.6, 10, 0, 8, ['#c03030', '#888', '#2a2a30', '#ffc65c']);
  const sc = screenMesh(8, 3, (g, w, h, t) => { g.fillStyle = '#0a0612'; g.fillRect(0, 0, w, h); g.fillStyle = '#b46bff'; g.font = FONT(900, h * 0.15, DISPLAY); g.textAlign = 'left'; g.fillText('CUSTOMIZATION BAY', w * 0.04, h * 0.2);
    const items = ['PAINT', 'WHEELS', 'UNDERGLOW', 'INTERIOR', 'PERFORMANCE']; items.forEach((it, i) => { g.fillStyle = i === Math.floor(t / 2) % 5 ? '#fff' : '#7a6a9a'; g.font = FONT(700, h * 0.1); g.fillText(it, w * 0.06, h * (0.38 + i * 0.13)); });
    const hue = (t * 40) % 360; g.fillStyle = `hsl(${hue},80%,55%)`; g.beginPath(); g.ellipse(w * 0.7, h * 0.6, w * 0.18, h * 0.12, 0, 0, 7); g.fill(); }, { px: 512, every: 1 / 8, k: 1.3 });
  sc.position.set(0, Y0 + 4.5, -D / 2 + 0.45); s.add(sc);
  crowd(s, 4, i => [-12 + (i % 2) * 24, Y0, -D / 2 + 7.5, Math.PI], 'work', () => true, ['#3a3a40', '#c03030']);
  crowd(s, 5, i => [-20 + i * 10 + 3.6, Y0, 5.5, Math.PI + 0.6], 'stand', () => env.hour > 9 && env.hour < 21, FANS);
  kit.flush();
  pickBox(s, W, H + 5, D, brand);
  brand.spawn = s.w(0, D / 2 + 9); brand.spawnH = s.rot + 0;
}

{ const im = buildFlames(); if (im) scene.add(im); }
