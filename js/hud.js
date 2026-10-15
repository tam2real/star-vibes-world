// HUD: title screen, location, clock & weather, travel dock, minimap & full map, panels, garage, builder, toasts, save.
import { THREE, camera, sites, updaters, clamp, QUALITY } from './core.js';
import { env, setWeather, WEATHERS } from './env.js';
import { DISTRICTS, PLACES, isWater, shoreX, WATER_Y, PLOTS } from './layout.js';
import { NODES, EDGES } from './roads.js';
import { BRANDS } from './brands.js';
import { CARS, BOATS, FLYERS, PAINTS, GLOWS, RIMS, traffic, aiBoats, activity, blimp } from './vehicles.js';
import { P, events, travelTo, spawnCar, enterCar, spawnBoat, enterBoat, spawnFlyer, enterFly, useLift, nearestInteract, startTour, stopTour, whereIs, interact, toggleDrone, vbtn, setMode, clickPick, PLACE_XY } from './player.js';
import { plots, MODULES, BIZ_COLORS, buildBusiness, removeBusiness, businesses } from './growth.js';
import { save, milestones } from './save.js';
import { CONFIG } from './config.js';
import { audio, startAudio, vehicleAudio } from './audio.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtH = h => { const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); const ap = hh >= 12 ? 'PM' : 'AM'; return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${ap}`; };

/* =====================================================================
   TOASTS + ACTIVITY
   ===================================================================== */
export function toast(text, color = '#ffc65c') {
  const el = document.createElement('div'); el.className = 'toast'; el.style.setProperty('--c', color); el.textContent = text; $('toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 2600); setTimeout(() => el.remove(), 3200);
}
events.toast = toast;
const feed = [];
export function log(text, color = '#5fe3ff') {
  feed.unshift({ text, color, t: env.hour }); if (feed.length > 6) feed.pop();
  $('feedList').innerHTML = feed.map(f => `<div class="ev"><i style="background:${f.color};box-shadow:0 0 8px ${f.color}"></i><span>${esc(f.text)}</span><em>${fmtH(f.t).replace(' ', '')}</em></div>`).join('');
}
activity.push = log;

/* =====================================================================
   CLOCK / WEATHER
   ===================================================================== */
document.querySelectorAll('[data-time]').forEach(b => b.onclick = () => { env.hour = parseFloat(b.dataset.time); toast(b.title || b.textContent, '#ffd27a'); });
document.querySelectorAll('[data-weather]').forEach(b => b.onclick = () => { setWeather(b.dataset.weather); toast(WEATHERS[b.dataset.weather].label, '#9fd6ff'); refreshWx(); });
document.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => { env.speed = parseFloat(b.dataset.speed); refreshWx(); });
function refreshWx() {
  document.querySelectorAll('[data-weather]').forEach(b => b.classList.toggle('on', b.dataset.weather === env.weather));
  document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', parseFloat(b.dataset.speed) === env.speed));
}

/* =====================================================================
   TRAVEL DOCK
   ===================================================================== */
$('dock').innerHTML = PLACES.map(p => `<button data-go="${p.id}" title="Travel to ${esc(p.name)}"><i style="background:${p.color};box-shadow:0 0 8px ${p.color}"></i>${esc(p.name)}</button>`).join('')
  + `<span class="sep"></span><button id="bGarage" title="Garage (V)">🚗 Garage</button><button id="bMap" title="Map (M)">🗺 Map</button><button id="bDrone" title="Drone camera (F)">🛸 Drone</button><button id="bTour" title="Cinematic tour">🎬 Tour</button>`;
document.querySelectorAll('#dock [data-go]').forEach(b => b.onclick = () => { closeModals(); travelTo(b.dataset.go); });
$('bGarage').onclick = () => openGarage(); $('bMap').onclick = () => openMap(); $('bDrone').onclick = () => { if (P.mode === 'drone') toggleDrone(); else if (P.mode === 'walk') toggleDrone(); else toast('Step out of the vehicle first (E)'); }; $('bTour').onclick = () => { closeModals(); startTour(); $('tourBar').style.display = 'flex'; };
$('tourExit').onclick = () => { $('tourBar').style.display = 'none'; stopTour('hotspot'); };

/* =====================================================================
   MODALS
   ===================================================================== */
function modal(html, cls = '') { const m = $('modal'); m.className = 'glass modal ' + cls; m.innerHTML = `<button class="x" id="mClose">✕</button>` + html; m.style.display = 'block'; $('mClose').onclick = closeModals; if (document.pointerLockElement) document.exitPointerLock(); return m; }
export function closeModals() { $('modal').style.display = 'none'; $('embed').style.display = 'none'; $('embed').querySelector('iframe').src = 'about:blank'; }
addEventListener('keydown', e => {
  if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) { if (e.code === 'Escape') e.target.blur(); return; }
  if (e.code === 'Escape') { closeModals(); hidePanel(); }
  if ($('title').style.display !== 'none') return;
  if (e.code === 'KeyV') ($('modal').style.display === 'block' && $('modal').classList.contains('garage')) ? closeModals() : openGarage();
  if (e.code === 'KeyM') ($('modal').style.display === 'block' && $('modal').classList.contains('map')) ? closeModals() : openMap();
  if (e.code === 'KeyH') $('help').classList.toggle('show');
  if (e.code === 'KeyT') { const order = [6.6, 12.5, 19.15, 22.5]; const i = order.findIndex(h => h > env.hour + 0.3); env.hour = order[(i + order.length) % order.length]; toast(fmtH(env.hour), '#ffd27a'); }
  if (e.code === 'KeyN') { const ks = ['clear', 'overcast', 'rain']; setWeather(ks[(ks.indexOf(env.weather) + 1) % ks.length]); refreshWx(); toast(WEATHERS[env.weather].label, '#9fd6ff'); }
  if (/^Digit[1-9]$/.test(e.code)) { const p = PLACES[+e.code.slice(5) - 1]; if (p) travelTo(p.id); }
});

/* ---------- Garage ---------- */
let gTab = 'cars', gSel = { cars: 'sport', boats: 'sport', air: 'skyline' }, gPaint = null, gGlow = null, gRim = null;
export function openGarage(tab) {
  if (tab) gTab = tab;
  const tabs = `<div class="tabs">${[['cars', 'Cars'], ['boats', 'Boats'], ['air', 'Air']].map(([k, l]) => `<button data-tab="${k}" class="${gTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  let list = '', custom = '';
  if (gTab === 'cars') {
    list = Object.entries(CARS).map(([k, c]) => `<div class="card ${gSel.cars === k ? 'on' : ''}" data-sel="${k}"><div class="sw" style="background:${c.paint}"></div><b>${c.code}</b><span>${c.name}</span><small>${c.spec}</small></div>`).join('');
    custom = `<div class="cust"><div class="h">PAINT</div><div class="sws">${PAINTS.map(p => `<i data-paint="${p[1]}" title="${p[0]}" style="background:${p[1]}" class="${gPaint === p[1] ? 'on' : ''}"></i>`).join('')}</div>
      <div class="h">UNDERGLOW</div><div class="sws">${GLOWS.map(g => `<i data-glow="${g}" title="${g}" style="background:${g === 'off' ? '#222' : g}" class="${gGlow === g ? 'on' : ''}">${g === 'off' ? '∅' : ''}</i>`).join('')}</div>
      <div class="h">WHEELS</div><div class="sws">${RIMS.map(r => `<i data-rim="${r}" style="background:${r}" class="${gRim === r ? 'on' : ''}"></i>`).join('')}</div></div>`;
  } else if (gTab === 'boats') list = Object.entries(BOATS).map(([k, c]) => `<div class="card ${gSel.boats === k ? 'on' : ''}" data-sel="${k}"><div class="sw" style="background:${c.color}"></div><b>${c.code}</b><span>${c.name}</span><small>${c.spec}</small></div>`).join('');
  else list = `<div class="card on"><div class="sw" style="background:#10121a;box-shadow:0 0 10px #5fe3ff"></div><b>${FLYERS.skyline.code}</b><span>${FLYERS.skyline.name}</span><small>${FLYERS.skyline.spec}</small></div>`;
  const go = gTab === 'cars' ? 'Drive it out' : gTab === 'boats' ? 'Launch at the Boat Basin' : 'Call the Skyline';
  const m = modal(`<div class="mh"><b>★ STAR VIBES GARAGE</b><span>Explore · Luxury · Freedom</span></div>${tabs}<div class="cards">${list}</div>${custom}<div class="row"><button class="primary" id="gGo">${go}</button><span class="hint">${gTab === 'boats' ? 'Boats wait at the Star Vibes dock — E to step off at any pier' : gTab === 'air' ? 'Space up · Ctrl/Q down · W/S thrust · A/D yaw · fast-travel uses autopilot' : 'W/S throttle · A/D steer · Space brake · Shift boost · C camera · E exit'}</span></div>`, 'garage');
  m.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => openGarage(b.dataset.tab));
  m.querySelectorAll('[data-sel]').forEach(b => b.onclick = () => { gSel[gTab] = b.dataset.sel; openGarage(); });
  m.querySelectorAll('[data-paint]').forEach(b => b.onclick = () => { gPaint = b.dataset.paint; applyCustom(); openGarage(); });
  m.querySelectorAll('[data-glow]').forEach(b => b.onclick = () => { gGlow = b.dataset.glow; applyCustom(); openGarage(); });
  m.querySelectorAll('[data-rim]').forEach(b => b.onclick = () => { gRim = b.dataset.rim; applyCustom(); openGarage(); });
  $('gGo').onclick = () => {
    closeModals();
    if (P.mode === 'drone' || P.mode === 'tour') setMode('walk');
    if (gTab === 'cars') { if (['car', 'boat', 'fly'].includes(P.mode)) interact(); spawnCar(gSel.cars, { paint: gPaint || undefined, glow: gGlow || undefined, rim: gRim || undefined }); enterCar(); toast(`${CARS[gSel.cars].code} ${CARS[gSel.cars].name} ready`, '#b46bff'); }
    else if (gTab === 'boats') { if (P.mode === 'car' || P.mode === 'fly') interact(); spawnBoat(gSel.boats); enterBoat(); camera.position.set(P.boat.x + 20, 8, P.boat.z + 10); toast(`${BOATS[gSel.boats].code} ${BOATS[gSel.boats].name} launched from the Boat Basin`, '#4dc8ff'); }
    else { if (['car', 'boat'].includes(P.mode)) interact(); const b = P.mode === 'walk' ? P.pos : camera.position; spawnFlyer([b.x + 4, Math.max(b.y, 0) + 0.3, b.z + 4, P.yaw + Math.PI]); enterFly(); toast('Skyline VTOL · Space to climb', '#5fe3ff'); }
  };
}
function applyCustom() { if (P.car && P.mode === 'car') { if (gPaint) P.car.custom.paint = gPaint; if (gGlow) P.car.custom.glow = gGlow; if (gRim) P.car.custom.rim = gRim; P.car.rebuild(); } }

/* ---------- Lift ---------- */
events.liftMenu = (a) => {
  const m = modal(`<div class="mh"><b>${esc(a.levels.length > 3 ? 'LIFT' : 'LIFT')}</b><span>Choose a floor</span></div><div class="lift">${a.levels.map((l, i) => `<button data-l="${i}">${i === 0 ? 'G' : i}<span>${esc(l.name)}</span></button>`).join('')}</div>`, 'small');
  m.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { closeModals(); useLift(a, a.levels[+b.dataset.l]); toast(a.levels[+b.dataset.l].name, '#5fe3ff'); });
};
/* ---------- Plot builder ---------- */
let bMod = 'studio', bCol = BIZ_COLORS[0];
events.plotMenu = (p) => {
  const D = DISTRICTS[p.district];
  const m = modal(`<div class="mh"><b>BUILD A BUSINESS</b><span>${esc(D.name)} · plot ${esc(p.id)} · ${p.w}×${p.d} m</span></div>
    <label class="fld">Business name<input id="bName" maxlength="26" placeholder="e.g. Vibe Coffee Co." value=""></label>
    <div class="h">MODULE</div><div class="cards mods">${Object.entries(MODULES).map(([k, v]) => `<div class="card ${bMod === k ? 'on' : ''}" data-mod="${k}"><b>${v.name}</b><small>${v.desc}</small></div>`).join('')}</div>
    <div class="h">BRAND COLOR</div><div class="sws">${BIZ_COLORS.map(c => `<i data-col="${c}" style="background:${c}" class="${bCol === c ? 'on' : ''}"></i>`).join('')}</div>
    <div class="row"><button class="primary" id="bGo">Build it</button><span class="hint">New businesses are saved with your world and connect to the street grid.</span></div>`, 'build');
  m.querySelectorAll('[data-mod]').forEach(b => b.onclick = () => { bMod = b.dataset.mod; m.querySelectorAll('[data-mod]').forEach(x => x.classList.toggle('on', x === b)); });
  m.querySelectorAll('[data-col]').forEach(b => b.onclick = () => { bCol = b.dataset.col; m.querySelectorAll('[data-col]').forEach(x => x.classList.toggle('on', x === b)); });
  setTimeout(() => $('bName') && $('bName').focus(), 50);
  $('bGo').onclick = () => {
    const name = ($('bName').value || '').trim() || `${MODULES[bMod].name}`;
    const rec = buildBusiness({ plotId: p.id, module: bMod, name, color: bCol }); closeModals();
    if (rec) { toast(`${name} is going up in ${D.name}!`, bCol); log(`Growth · ${name} opened in ${D.name}`, bCol); milestones.built++; checkMilestones(true); persist(); }
  };
};
events.bizMenu = (rec) => {
  const m = modal(`<div class="mh"><b>${esc(rec.name.toUpperCase())}</b><span>${esc(MODULES[rec.module].name)} · ${esc(DISTRICTS[plots.find(p => p.id === rec.plotId).district].name)}</span></div>
    <p class="note">${esc(MODULES[rec.module].desc)}. Built on plot ${esc(rec.plotId)}.</p><div class="row"><button id="bzInfo">Open info</button><button class="danger" id="bzDel">Demolish & free the plot</button></div>`, 'small');
  $('bzInfo').onclick = () => { closeModals(); showPanel(rec.info); };
  $('bzDel').onclick = () => { removeBusiness(rec.plotId); closeModals(); toast(`${rec.name} removed · plot available again`, '#ff9d3d'); persist(); };
};

/* =====================================================================
   BUILDING PANEL
   ===================================================================== */
let panelSite = null, panelAuto = 0;
const NOW = {
  hotspot: h => h >= 16 || h < 2 ? (h >= 20 || h < 2 ? 'LIVE · K Lovee — Champlain Nights Tour' : 'Doors open · DJ warm-up on the rooftop') : 'Load-in & rehearsals · doors at 4 PM',
  klovee: h => h >= 11 || h < 1 ? (h >= 18 || h < 1 ? 'Release party · “Lakefront Heat” live set' : 'Fan meet & signing · merch store open') : 'Closed · opens 11 AM',
  glostar: h => h >= 8 && h < 22 ? (h < 12 ? 'Build Your Brand 101 · Room 2A' : h < 17 ? 'Video Editing Masterclass · Room 2B' : 'Podcast Lab · Creator Studio') : 'Closed · opens 8 AM',
  kitchen: h => h >= 7 && h < 23 ? (h < 11 ? 'Breakfast · cider donuts & cold brew' : h < 16 ? 'Lunch service · Cooking Live at 2 PM' : 'Dinner · maple-glazed salmon on the patio') : 'Closed · opens 7 AM',
  starvibes: h => h >= 9 && h < 21 ? 'Shooting on Stage 1 · Studio A recording' : 'Night edit · screening dailies',
  garage: h => 'Showroom open · 5 cars on turntables',
};
export function showPanel(s, auto = false) {
  panelSite = s; panelAuto = auto ? 7 : 0; const el = $('panel');
  const open = s.isOpen ? s.isOpen() : true; const h = env.hour;
  const now = NOW[s.id] ? NOW[s.id](h) : (open ? 'Open for business' : 'Closed');
  const embed = CONFIG.embeds[s.id] || s.embed || '';
  el.innerHTML = `<button class="x" id="pClose">✕</button><div class="bar" style="background:${s.color};box-shadow:0 0 12px ${s.color}"></div>
    <h3>${esc(s.name)}</h3><div class="sub">${esc(s.tagline)}</div>
    <div class="st ${open ? 'open' : 'closed'}">${open ? 'OPEN NOW' : 'CLOSED'}</div><div class="now">▸ ${esc(now)}</div>
    <ul>${(s.about || []).map(a => `<li>${esc(a)}</li>`).join('')}</ul>
    <div class="kv"><span>Floors</span><b>${esc(s.floorsInfo || '—')}</b></div><div class="kv"><span>Guests today</span><b>${(s.visits || 0) + (s.custom ? 0 : 120 + Math.floor((s.name.length * 37) % 90))}</b></div>
    ${s.custom ? '' : `<div class="h">BUILDING STATE</div>
    <div class="seg" data-k="lights">${['auto', 'on', 'off'].map(v => `<button data-v="${v}" class="${s.lights === v ? 'on' : ''}">Lights ${v}</button>`).join('')}</div>
    <div class="seg" data-k="doors">${['auto', 'open', 'closed'].map(v => `<button data-v="${v}" class="${s.doors === v ? 'on' : ''}">Doors ${v}</button>`).join('')}</div>`}
    <div class="row"><button class="primary" id="pGo">Go inside</button><button id="pOps">${embed ? 'Operator console' : 'Connect console'}</button>${CONFIG.chatUrl ? '<button id="pChat">Chat</button>' : ''}</div>`;
  el.style.display = 'block';
  $('pClose').onclick = hidePanel;
  $('pGo').onclick = () => { hidePanel(); if (s.custom) { const p = plots.find(q => q.id === s.plotId); if (p) travelToXY(p.x, p.z + p.d / 2 - 4); } else travelTo(s.id); };
  el.querySelectorAll('.seg').forEach(sg => sg.querySelectorAll('button').forEach(b => b.onclick = () => { s[sg.dataset.k] = b.dataset.v; showPanel(s); persist(); log(`${s.name} · ${sg.dataset.k} set to ${b.dataset.v}`, s.color); }));
  $('pOps').onclick = () => openEmbed(s);
  if ($('pChat')) $('pChat').onclick = () => { const e = $('embed'); e.querySelector('.t').textContent = 'Chat'; e.querySelector('iframe').src = CONFIG.chatUrl; e.style.display = 'flex'; };
}
function hidePanel() { $('panel').style.display = 'none'; panelSite = null; }
function openEmbed(s) {
  const url = CONFIG.embeds[s.id] || s.embed;
  if (url) { const e = $('embed'); e.querySelector('.t').textContent = `${s.name} · Operator console`; e.querySelector('iframe').src = url; e.style.display = 'flex'; return; }
  const m = modal(`<div class="mh"><b>CONNECT OPERATOR CONSOLE</b><span>${esc(s.name)}</span></div><p class="note">Paste the URL of this building's operator visualizer. It opens inside the building as an embedded screen and is saved with your world. (Teams can also pre-wire it in <code>js/config.js</code> or with <code>?embed_${esc(s.id)}=URL</code>.)</p>
    <label class="fld">Visualizer URL<input id="eUrl" placeholder="https://…" value=""></label><div class="row"><button class="primary" id="eGo">Save & open</button></div>`, 'small');
  $('eGo').onclick = () => { const v = $('eUrl').value.trim(); if (!/^https?:\/\//.test(v)) { toast('Enter a full https:// URL', '#ff5c8a'); return; } s.embed = v; persist(); closeModals(); openEmbed(s); };
}
$('embedClose').onclick = () => { $('embed').style.display = 'none'; $('embed').querySelector('iframe').src = 'about:blank'; };
events.inspect = (s) => showPanel(s);

/* =====================================================================
   MINIMAP + FULL MAP
   ===================================================================== */
const MAP = { x0: -760, x1: 760, z0: -720, z1: 640, ppm: 0.5 };
const base = document.createElement('canvas'); base.width = (MAP.x1 - MAP.x0) * MAP.ppm; base.height = (MAP.z1 - MAP.z0) * MAP.ppm;
const toPx = (x, z) => [(x - MAP.x0) * MAP.ppm, (z - MAP.z0) * MAP.ppm];
function drawBase() {
  const g = base.getContext('2d'); g.fillStyle = '#1b2a1e'; g.fillRect(0, 0, base.width, base.height);
  const S = 4; g.fillStyle = '#0d2a44';
  for (let z = MAP.z0; z < MAP.z1; z += S) for (let x = MAP.x0; x < MAP.x1; x += S) if (isWater(x, z)) { const [px, pz] = toPx(x, z); g.fillRect(px, pz, S * MAP.ppm + 0.6, S * MAP.ppm + 0.6); }
  g.fillStyle = 'rgba(80,90,100,0.55)'; for (const b of [[-193, 32, -142, -8]]) {}
  g.lineCap = 'round';
  for (const e of EDGES) { const A = NODES[e.a], B = NODES[e.b]; g.strokeStyle = e.kind === 'highway' ? '#c9a4ff' : e.kind === 'main' ? '#e8d8b0' : '#9aa8b8'; g.lineWidth = Math.max(1.6, e.w * MAP.ppm * 0.8); g.beginPath(); g.moveTo(...toPx(A.x, A.z)); g.lineTo(...toPx(B.x, B.z)); g.stroke(); }
  g.setLineDash([3, 3]); g.lineWidth = 1.2;
  for (const p of PLOTS) { g.strokeStyle = DISTRICTS[p.district].color; const [x, y] = toPx(p.x - p.w / 2, p.z - p.d / 2); g.strokeRect(x, y, p.w * MAP.ppm, p.d * MAP.ppm); }
  g.setLineDash([]);
  g.font = '700 11px system-ui'; g.textAlign = 'center'; g.fillStyle = 'rgba(160,210,255,0.85)';
  g.save(); g.translate(...toPx(-560, 0)); g.rotate(-Math.PI / 2); g.fillText('LAKE CHAMPLAIN', 0, 0); g.restore();
  g.save(); g.translate(...toPx(392, -380)); g.rotate(Math.PI / 2); g.fillText('SARANAC RIVER', 0, 0); g.restore();
  g.fillStyle = 'rgba(201,164,255,0.9)'; g.save(); g.translate(...toPx(662, -500)); g.rotate(Math.PI / 2); g.fillText('I-87 NORTHWAY', 0, 0); g.restore();
}
drawBase();
const mm = $('minimap'), mg = mm.getContext('2d');
function drawMarkers(g, xf, size) {
  for (const s of sites) { if (!s.site) continue; const [x, y] = xf(s.site.x, s.site.z); g.fillStyle = s.color; g.shadowColor = s.color; g.shadowBlur = 10; g.beginPath(); g.arc(x, y, size, 0, 7); g.fill(); g.shadowBlur = 0; g.fillStyle = '#0a0d1c'; g.font = `800 ${size * 1.25}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.custom ? '+' : ({ hotspot: 'H', starvibes: '★', klovee: '♥', glostar: 'G', kitchen: 'K', garage: 'V' }[s.id] || s.name[0]), x, y + 0.5); }
}
function drawMinimap() {
  const W = mm.width, H = mm.height, scale = 0.8; // px per m at minimap
  const cx = P.mode === 'walk' ? P.pos.x : camera.position.x, cz = P.mode === 'walk' ? P.pos.z : camera.position.z;
  const v = P.mode === 'car' ? P.car : P.mode === 'boat' ? P.boat : P.mode === 'fly' ? P.fly : null;
  const px = v ? v.x : cx, pz = v ? v.z : cz;
  mg.fillStyle = '#0a1018'; mg.fillRect(0, 0, W, H);
  const k = scale / MAP.ppm; const [bx, by] = toPx(px, pz);
  mg.drawImage(base, bx - W / 2 / k, by - H / 2 / k, W / k, H / k, 0, 0, W, H);
  const xf = (x, z) => [W / 2 + (x - px) * scale, H / 2 + (z - pz) * scale];
  mg.fillStyle = 'rgba(255,240,220,0.75)'; for (const m of traffic) { const [x, y] = xf(m.x, m.z); if (x > 0 && y > 0 && x < W && y < H) mg.fillRect(x - 1, y - 1, 2.4, 2.4); }
  mg.fillStyle = 'rgba(160,220,255,0.9)'; for (const b of aiBoats) { const [x, y] = xf(b.g.position.x, b.g.position.z); if (x > 0 && y > 0 && x < W && y < H) mg.fillRect(x - 1.5, y - 1.5, 3, 3); }
  drawMarkers(mg, xf, 7);
  for (const [o, c] of [[P.car, '#b46bff'], [P.boat, '#4dc8ff'], [P.fly, '#5fe3ff']]) if (o && v !== o) { const [x, y] = xf(o.x, o.z); mg.strokeStyle = c; mg.lineWidth = 2; mg.strokeRect(x - 3, y - 3, 6, 6); }
  const head = v ? v.h : P.mode === 'walk' ? P.yaw + Math.PI : Math.atan2(-camera.getWorldDirection(new THREE.Vector3()).x, -camera.getWorldDirection(new THREE.Vector3()).z) + Math.PI;
  mg.save(); mg.translate(W / 2, H / 2); mg.rotate(-head + Math.PI); mg.fillStyle = '#fff'; mg.shadowColor = '#5fe3ff'; mg.shadowBlur = 8; mg.beginPath(); mg.moveTo(0, -9); mg.lineTo(6, 7); mg.lineTo(0, 3); mg.lineTo(-6, 7); mg.closePath(); mg.fill(); mg.restore();
  mg.fillStyle = 'rgba(255,255,255,0.7)'; mg.font = '800 10px system-ui'; mg.textAlign = 'center'; mg.fillText('N', W / 2, 12);
}
mm.onclick = () => openMap();
export function openMap() {
  const m = modal(`<div class="mh"><b>STAR VIBES WORLD · PLATTSBURGH, NY</b><span>Click a pin to travel · dashed lots are available plots</span></div><div class="mapwrap"><canvas id="bigmap"></canvas></div>
    <div class="legend">${Object.values(DISTRICTS).map(d => `<span><i style="background:${d.color}"></i>${esc(d.name)}</span>`).join('')}</div>`, 'map');
  const c = $('bigmap'), W = Math.min(innerWidth * 0.86, 1100, innerHeight * 0.66 * base.width / base.height), H = W * base.height / base.width; c.width = W * 1.5; c.height = H * 1.5; c.style.width = W + 'px'; c.style.height = H + 'px';
  const g = c.getContext('2d'), k = c.width / base.width; g.drawImage(base, 0, 0, c.width, c.height);
  const xf = (x, z) => { const [a, b] = toPx(x, z); return [a * k, b * k]; };
  g.font = '800 15px system-ui'; g.textAlign = 'center';
  g.font = '800 12px system-ui'; for (const D of Object.values(DISTRICTS)) { const [x, y] = xf((D.box[0] + D.box[2]) / 2, D.box[1] + 14); g.fillStyle = D.color; g.globalAlpha = 0.8; g.fillText(D.name.toUpperCase(), x, y); g.globalAlpha = 1; }
  drawMarkers(g, xf, 11);
  for (const s of sites) { if (!s.site) continue; const [x, y] = xf(s.site.x, s.site.z); g.fillStyle = '#fff'; g.font = '700 13px system-ui'; g.fillText(s.name, x, y + 26); }
  const v = P.mode === 'car' ? P.car : P.mode === 'boat' ? P.boat : P.mode === 'fly' ? P.fly : null; const [ux, uy] = xf(v ? v.x : P.pos.x, v ? v.z : P.pos.z);
  g.fillStyle = '#fff'; g.beginPath(); g.arc(ux, uy, 7, 0, 7); g.fill(); g.strokeStyle = '#5fe3ff'; g.lineWidth = 3; g.stroke(); g.fillText('YOU', ux, uy - 14);
  c.onclick = (e) => {
    const r = c.getBoundingClientRect(), mx = (e.clientX - r.left) / r.width * c.width, my = (e.clientY - r.top) / r.height * c.height;
    let best = null, bd = 30; for (const s of sites) { if (!s.site) continue; const [x, y] = xf(s.site.x, s.site.z); const d = Math.hypot(x - mx, y - my); if (d < bd) { bd = d; best = s; } }
    if (best) { closeModals(); if (best.custom) { const p = plots.find(q => q.id === best.plotId); travelToXY(p.x, p.z + p.d / 2 + 4); } else travelTo(best.id); return; }
    for (const p of plots) { const [x, y] = xf(p.x, p.z); if (Math.hypot(x - mx, y - my) < 22) { closeModals(); travelToXY(p.x, p.z + p.d / 2 + 4); return; } }
  };
}
function travelToXY(x, z) { PLACE_XY.x = x; PLACE_XY.z = z; travelTo('__xy'); }

/* =====================================================================
   PER-FRAME HUD
   ===================================================================== */
let panelRefresh = 3, hudT = 0, lastWhere = '', lastSite = null, mmT = 0, wasOpen = {};
const MODE_LABEL = { walk: 'ON FOOT', car: 'DRIVING', boat: 'ON THE WATER', fly: 'FLYING', drone: 'DRONE CAM', tour: 'CINEMATIC TOUR' };
updaters.push((dt) => {
  hudT -= dt; mmT -= dt;
  if (mmT <= 0) { mmT = 0.1; drawMinimap(); }
  if (hudT > 0) return; hudT = 0.15;
  $('clock').textContent = fmtH(env.hour);
  $('daypart').textContent = env.hour < 5 ? 'Late night' : env.hour < 7.2 ? 'Sunrise' : env.hour < 11 ? 'Morning' : env.hour < 16 ? 'Afternoon' : env.hour < 18.6 ? 'Golden hour' : env.hour < 20 ? 'Sunset' : 'Night';
  $('mode').textContent = MODE_LABEL[P.mode] || '';
  // where
  const v = P.mode === 'car' ? P.car : P.mode === 'boat' ? P.boat : P.mode === 'fly' ? P.fly : null;
  const x = v ? v.x : P.mode === 'walk' ? P.pos.x : camera.position.x, z = v ? v.z : P.mode === 'walk' ? P.pos.z : camera.position.z;
  const w = whereIs(x, z); let label = '', color = '#9fd6ff';
  if (P.mode === 'boat' || isWater(x, z)) { label = x < shoreX(z) ? 'Lake Champlain' : 'Saranac River'; color = '#4dc8ff'; }
  else if (w.site) { label = w.site.name; color = w.site.color; }
  else if (w.district === 'east') { label = 'East Bank · Residential'; }
  else if (w.district) { label = DISTRICTS[w.district].name; color = DISTRICTS[w.district].color; }
  else label = 'Plattsburgh, NY';
  if (label !== lastWhere) { $('where').textContent = label; $('where').style.color = color; lastWhere = label; }
  const inside = P.mode === 'walk' && w.site ? w.site : null; P.inside = inside;
  if (inside && inside !== lastSite) { if (!panelSite || panelSite !== inside) showPanel(inside, true); milestones.visited[inside.id] = true; if (!inside.custom) inside.visits = (inside.visits || 0) + 1; checkMilestones(); }
  lastSite = inside;
  if (w.district && DISTRICTS[w.district] && !milestones.districts[w.district]) { milestones.districts[w.district] = true; checkMilestones(); }
  if (panelSite && $('panel').style.display === 'block' && !$('panel').matches(':hover')) { panelRefresh -= 0.15; if (panelRefresh <= 0) { panelRefresh = 3; const keep = panelAuto; showPanel(panelSite); panelAuto = keep; } }
  if (panelAuto > 0) { panelAuto -= 0.15; if (panelAuto <= 0 && panelSite && !inside) hidePanel(); }
  // prompt
  const it = nearestInteract();
  const pr = $('prompt');
  if (it && P.mode === 'walk' && !P.transition) { pr.innerHTML = `<kbd>E</kbd> ${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}`; pr.style.display = 'block'; }
  else if (['car', 'boat', 'fly'].includes(P.mode)) { pr.innerHTML = `<kbd>E</kbd> ${P.mode === 'boat' ? 'Step off (near a dock)' : P.mode === 'fly' ? 'Step out (after landing)' : 'Get out'} · <kbd>C</kbd> camera · <kbd>V</kbd> garage`; pr.style.display = 'block'; }
  else pr.style.display = 'none';
  // speedo
  const sp = $('speedo');
  if (v) { const mph = Math.round(Math.abs(v.speed) * 2.6); sp.style.display = 'block'; $('spd').textContent = mph;
    const name = P.mode === 'car' ? `${CARS[P.car.type].code} · ${CARS[P.car.type].name}` : P.mode === 'boat' ? `${BOATS[P.boat.type].code} · ${BOATS[P.boat.type].name}` : `SV-SKY · ALT ${Math.round(P.fly.y)} m${P.autopilot ? ' · AUTOPILOT' : ''}`;
    $('vname').textContent = name; vehicleAudio.kind = P.mode; vehicleAudio.speed = v.speed; vehicleAudio.vmax = P.mode === 'car' ? P.car.T.vmax : P.mode === 'boat' ? P.boat.T.vmax : 90;
    if (P.mode === 'car') milestones.drove = true; if (P.mode === 'boat') milestones.sailed = true; if (P.mode === 'fly') milestones.flew = true;
  } else { sp.style.display = 'none'; vehicleAudio.kind = null; }
  $('flyBtns').style.display = P.mode === 'fly' || P.mode === 'drone' ? 'flex' : 'none';
  // open/close announcements
  for (const b of Object.values(BRANDS)) { const o = b.isOpen(); if (wasOpen[b.id] !== undefined && wasOpen[b.id] !== o) log(`${b.name} · ${o ? 'doors open' : 'closing up for the night'}`, b.color); wasOpen[b.id] = o; }
  const sunsetNow = env.hour > 19.0 && env.hour < 19.2; if (sunsetNow && !wasOpen.__sunset) { log('Sunset over Lake Champlain', '#ff9d3d'); } wasOpen.__sunset = sunsetNow;
});

/* =====================================================================
   MILESTONES
   ===================================================================== */
const MS_TOTAL = () => 6 + 6 + 3 + 1;
function msCount() { return Object.keys(milestones.visited).filter(k => BRANDS[k]).length + Object.keys(milestones.districts).length + (milestones.drove ? 1 : 0) + (milestones.sailed ? 1 : 0) + (milestones.flew ? 1 : 0) + (milestones.built > 0 ? 1 : 0); }
let lastMs = -1;
function checkMilestones(force) {
  const n = msCount(); $('ms').textContent = `★ ${n}/${MS_TOTAL()}`;
  if (lastMs >= 0 && n > lastMs) { toast(`Milestone unlocked · ${n}/${MS_TOTAL()}`, '#ffd27a'); }
  lastMs = n;
}
setInterval(() => checkMilestones(), 1500);

/* =====================================================================
   SAVE / LOAD
   ===================================================================== */
export function snapshot() {
  const veh = o => o ? { type: o.type, x: +o.x.toFixed(2), z: +o.z.toFixed(2), y: +(o.y || 0).toFixed(2), h: +o.h.toFixed(3), custom: o.custom } : null;
  return {
    v: 1, mode: ['car', 'boat', 'fly'].includes(P.mode) ? P.mode : 'walk', pos: [P.pos.x, P.pos.y, P.pos.z].map(n => +n.toFixed(2)), yaw: P.yaw, pitch: P.pitch, view: P.view,
    car: veh(P.car), boat: veh(P.boat), fly: P.fly ? { x: P.fly.x, y: P.fly.y, z: P.fly.z, h: P.fly.h } : null,
    hour: env.hour, weather: env.weather, speed: env.speed,
    brands: Object.fromEntries(Object.values(BRANDS).map(b => [b.id, { lights: b.lights, doors: b.doors, embed: b.embed, visits: b.visits }])),
    businesses: businesses.map(b => ({ plotId: b.plotId, module: b.module, name: b.name, color: b.color })),
    milestones, audio: audio.on, quality: QUALITY.high ? 'high' : 'low',
  };
}
let saveFlash = 0;
export function persist() { if (save.write(snapshot())) { $('saved').classList.add('on'); clearTimeout(saveFlash); saveFlash = setTimeout(() => $('saved').classList.remove('on'), 1200); } }
export function restore(d) {
  if (!d) return;
  env.hour = d.hour ?? env.hour; setWeather(d.weather || 'clear', true); env.speed = d.speed ?? 1; refreshWx();
  for (const [id, s] of Object.entries(d.brands || {})) if (BRANDS[id]) Object.assign(BRANDS[id], s);
  for (const b of d.businesses || []) buildBusiness(b, true);
  Object.assign(milestones, d.milestones || {});
  if (d.car) { spawnCar(d.car.type, d.car.custom || {}, d.car); }
  if (d.boat) { spawnBoat(d.boat.type, d.boat); }
  if (d.fly) { spawnFlyer([d.fly.x, d.fly.y, d.fly.z, d.fly.h]); }
  P.pos.set(...d.pos); P.lastSafe.copy(P.pos); P.yaw = d.yaw ?? P.yaw; P.pitch = d.pitch ?? P.pitch; P.view = d.view || 'third';
  if (d.mode === 'car' && P.car) enterCar(); else if (d.mode === 'boat' && P.boat) enterBoat(); else if (d.mode === 'fly' && P.fly) enterFly(); else setMode('walk');
  audio.on = d.audio ?? true;
}
setInterval(() => { if ($('title').style.display === 'none') persist(); }, 6000);
addEventListener('visibilitychange', () => { if (document.hidden && $('title').style.display === 'none') persist(); });
addEventListener('beforeunload', () => { if ($('title').style.display === 'none') persist(); });

/* =====================================================================
   SETTINGS + MISC BUTTONS
   ===================================================================== */
$('bSound').onclick = () => { startAudio(); audio.on = !audio.on; $('bSound').textContent = audio.on ? '🔊' : '🔈'; };
$('bHelp').onclick = () => $('help').classList.toggle('show');
$('bSettings').onclick = () => {
  const m = modal(`<div class="mh"><b>SETTINGS</b><span>Saved locally in this browser</span></div>
    <div class="row"><button id="sQ">${QUALITY.high ? 'Quality: High (shadows, AA)' : 'Quality: Performance'}</button><span class="hint">Reloads the world</span></div>
    <div class="row"><button id="sSave" class="primary">Save now</button><button id="sReset" class="danger">Reset world</button></div>
    <p class="note">Your position, vehicles, time, weather, building states, built businesses and milestones are saved automatically every few seconds.</p>`, 'small');
  $('sQ').onclick = () => { try { localStorage.setItem('svw.quality', QUALITY.high ? 'low' : 'high'); } catch (_) {} persist(); location.reload(); };
  $('sSave').onclick = () => { persist(); toast('World saved', '#7cffb2'); };
  $('sReset').onclick = () => { if (confirm('Reset Star Vibes World? Built businesses, vehicles and milestones will be cleared.')) { save.clear(); location.reload(); } };
};
// touch / flight buttons
for (const [id, k] of [['fUp', 'up'], ['fDown', 'down']]) { const b = $(id); const on = e => { e.preventDefault(); vbtn[k] = true; }, off = () => { vbtn[k] = false; }; b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); }
if ('ontouchstart' in window) { document.body.classList.add('touch'); $('tE').onclick = () => interact(); $('tBoost').addEventListener('pointerdown', () => vbtn.boost = true); $('tBoost').addEventListener('pointerup', () => vbtn.boost = false); $('tBrake').addEventListener('pointerdown', () => vbtn.brake = true); $('tBrake').addEventListener('pointerup', () => vbtn.brake = false); }

/* =====================================================================
   FLOATING BRAND MARKERS
   ===================================================================== */
const markerEls = new Map(); const _v = new THREE.Vector3();
function updateMarkers() {
  const box = $('markers'); const placed = [];
  const order = sites.filter(s => s.site).map(s => [s, (s.site.x - camera.position.x) ** 2 + (s.site.z - camera.position.z) ** 2]).sort((a, b) => a[1] - b[1]).map(a => a[0]);
  for (const s of order) {
    if (!s.site) continue; let el = markerEls.get(s);
    if (!el) { el = document.createElement('div'); el.className = 'pin'; el.innerHTML = `<i></i><b></b><span></span>`; el.onclick = () => showPanel(s); box.appendChild(el); markerEls.set(s, el); }
    const h = (s.foot ? s.foot.h : 20) + 4; _v.set(s.site.x, h, s.site.z);
    const d = camera.position.distanceTo(_v); const p = _v.clone().project(camera);
    const far = P.mode === 'walk' ? 380 : P.mode === 'car' || P.mode === 'boat' ? 700 : 1700;
    const sx = (p.x * 0.5 + 0.5) * innerWidth, sy = (-p.y * 0.5 + 0.5) * innerHeight;
    let vis = p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05 && d > 60 && d < far && P.mode !== 'tour' && !P.inside && !P.transition;
    if (vis && placed.some(q => Math.abs(q[0] - sx) < 120 && Math.abs(q[1] - sy) < 34)) vis = false;
    if (vis) placed.push([sx, sy]);
    if (!vis) { if (el.style.display !== 'none') el.style.display = 'none'; continue; }
    el.style.display = 'flex'; el.style.transform = `translate(${(p.x * 0.5 + 0.5) * innerWidth}px, ${(-p.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%)`;
    el.style.setProperty('--c', s.color); el.style.opacity = clamp(1.4 - d / 1400, 0.35, 1);
    const open = s.isOpen ? s.isOpen() : true; const txt = `${s.name}`; if (el.dataset.t !== txt + open) { el.querySelector('b').textContent = txt; el.querySelector('span').textContent = open ? 'OPEN' : 'CLOSED'; el.dataset.t = txt + open; el.classList.toggle('closed', !open); }
  }
  for (const [s, el] of markerEls) if (!sites.includes(s)) { el.remove(); markerEls.delete(s); }
}
updaters.push(updateMarkers);

export { refreshWx, checkMilestones };
