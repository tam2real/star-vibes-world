// Boot: build the world, run the loop, title screen.
import { THREE, renderer, composer, scene, camera, updaters, clamp, PR, bloom } from './core.js';
import { env, setWeather } from './env.js';
import './roads.js';
import './town.js';
import { BRANDS } from './brands.js';
import './growth.js';
import './vehicles.js';
import './people.js';
import './operators.js';
import { setOperatorDestination, clearOperatorDestination, getOperatorState, setOperatorVehicle, clearOperatorVehicle } from './operators.js';
import { OPERATOR_AUTOMATION_DOMAINS } from './operators.js';
import { P, startTour, travelTo, setMode, keys } from './player.js';
import * as PHYS from './physics.js';
import { restore, persist, log, refreshWx, checkMilestones, toast } from './hud.js';
import { save } from './save.js';
import { startAudio, audio } from './audio.js';
import { updateScreens } from './kit.js';
import { BUSINESS_API } from './api.js';
import { sendOperatorMessage, registerOperatorStation, listAutomations, listSkills, listTools, listSkillPackages, listOperatorStations, listCapabilityCatalog, resolveCapability, listOperatorTasks, getOperatorTask, createOperatorTask, createOperatorHandoff, startRiftResearchWorkflow, runRoutine, runWorkflow, getElfieSettings, createOperatorChat, sendOperatorRequest, operatorRuntime } from './operator-bridge.js';

const $ = id => document.getElementById(id);
const clock = new THREE.Clock();
let frames = 0, fpsT = 0, fps = 60;
// adaptive resolution: keeps the world smooth on modest GPUs
let pr = PR, slow = 0, quick = 0;
function adapt() {
  if ($('title').style.display !== 'none' && !$('hud').classList.contains('on')) return;
  if (fps < 26) { slow++; quick = 0; } else if (fps > 55) { quick++; slow = 0; } else { slow = quick = 0; }
  const set = v => { pr = v; renderer.setPixelRatio(pr); composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); bloom.setSize(innerWidth * pr, innerHeight * pr); };
  if (slow >= 3 && pr > 0.6) { set(Math.max(0.6, pr - 0.2)); slow = 0; }
  else if (quick >= 6 && pr < PR) { set(Math.min(PR, pr + 0.1)); quick = 0; }
}
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), time = clock.elapsedTime;
  for (const u of updaters) u(dt, time);
  updateScreens(dt, time, camera);
  composer.render();
  frames++; fpsT += dt; if (fpsT > 1) { fps = frames / fpsT; frames = 0; fpsT = 0; $('fps').textContent = Math.round(fps) + ' fps'; adapt(); }
  requestAnimationFrame(frame);
}
// title-screen backdrop: cinematic tour at golden hour
setWeather('sunset', true); refreshWx(); startTour();
requestAnimationFrame(frame);
window.__svwBooted = true; document.body.classList.add('live');
// pre-warm every shader (incl. env-mapped + shadow variants) while the title plays, so arriving is hitch-free
setTimeout(() => {
  const done = () => { $('loading').style.display = 'none'; $('titleBtns').style.display = 'flex'; };
  try { const p = renderer.compileAsync ? renderer.compileAsync(scene, camera) : null; if (p && p.then) p.then(done, done); else { renderer.compile(scene, camera); done(); } } catch (_) { done(); }
  setTimeout(done, 12000);
}, 700);

const saved = save.load();
if (saved) { $('bContinue').style.display = 'inline-flex'; $('bContinue').querySelector('small').textContent = `Saved ${new Date(saved.savedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`; $('bNew').querySelector('b').textContent = 'New visit'; }
function enter(fromSave) {
  $('title').classList.add('out'); setTimeout(() => { $('title').style.display = 'none'; }, 900);
  $('hud').classList.add('on'); startAudio();
  if (fromSave && saved) { setMode('walk'); restore(saved); toast('Welcome back to Star Vibes World', '#ffc65c'); log('World restored from your last visit', '#7cffb2'); }
  else { if (!fromSave && saved) { /* keep built businesses & states but start fresh at the Hotspot */ const keep = { ...saved, mode: 'walk', car: null, boat: null, fly: null }; restore(keep); } setWeather('sunset'); env.hour = 18.85; travelTo('hotspot'); log('Golden hour in Plattsburgh — doors open at The Hotspot', '#ff3fd0'); toast('Welcome to Star Vibes World', '#ffc65c'); }
  checkMilestones(); setTimeout(persist, 4000);
}
$('bNew').onclick = () => enter(false);
$('bContinue').onclick = () => enter(true);
window.StarVibes = { env, BRANDS, P, scene, camera, ...BUSINESS_API, OPERATOR_AUTOMATION_DOMAINS, operatorRuntime, sendOperatorMessage, registerOperatorStation, listAutomations, listSkills, listTools, listSkillPackages, listOperatorStations, listCapabilityCatalog, resolveCapability, listOperatorTasks, getOperatorTask, createOperatorTask, createOperatorHandoff, startRiftResearchWorkflow, runRoutine, runWorkflow, getElfieSettings, createOperatorChat, sendOperatorRequest, setOperatorDestination, clearOperatorDestination, getOperatorState, setOperatorVehicle, clearOperatorVehicle, setWeather, travelTo, _keys: keys, _phys: PHYS, _renderer: renderer, _step: (n = 60, dt = 1 / 30) => { let t = clock.elapsedTime; for (let i = 0; i < n; i++) { t += dt; for (const u of updaters) u(dt, t); } } };
