// Procedural soundscape: lake water, city hum, rain, venue grooves (Hotspot / K Lovee), engines.
import { camera, updaters, clamp } from './core.js';
import { BRANDS } from './brands.js';
import { env } from './env.js';
import { shoreX } from './layout.js';

export const audio = { ctx: null, master: null, on: true, vol: 0.7 };
function noiseBuffer(ctx, sec = 2, brown = false) {
  const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0); let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
  return b;
}
export function startAudio() {
  if (audio.ctx) { audio.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const ctx = new AC(); audio.ctx = ctx;
  const master = ctx.createGain(); master.gain.value = audio.vol; master.connect(ctx.destination); audio.master = master;
  const loopSrc = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
  // water
  const wN = loopSrc(noiseBuffer(ctx, 3)); const wF = ctx.createBiquadFilter(); wF.type = 'lowpass'; wF.frequency.value = 600; const wG = ctx.createGain(); wG.gain.value = 0; wN.connect(wF).connect(wG).connect(master);
  // city hum
  const cN = loopSrc(noiseBuffer(ctx, 3, true)); const cF = ctx.createBiquadFilter(); cF.type = 'lowpass'; cF.frequency.value = 300; const cG = ctx.createGain(); cG.gain.value = 0; cN.connect(cF).connect(cG).connect(master);
  // rain
  const rN = loopSrc(noiseBuffer(ctx, 2)); const rF = ctx.createBiquadFilter(); rF.type = 'highpass'; rF.frequency.value = 1200; const rG = ctx.createGain(); rG.gain.value = 0; rN.connect(rF).connect(rG).connect(master);
  // engine
  const eO = ctx.createOscillator(); eO.type = 'sawtooth'; eO.frequency.value = 50; const eO2 = ctx.createOscillator(); eO2.type = 'square'; eO2.frequency.value = 25;
  const eF = ctx.createBiquadFilter(); eF.type = 'lowpass'; eF.frequency.value = 400; const eG = ctx.createGain(); eG.gain.value = 0; eO.connect(eF); eO2.connect(eF); eF.connect(eG).connect(master); eO.start(); eO2.start();
  audio.engine = { eO, eO2, eF, eG };
  // venue music bus
  const mG = ctx.createGain(); mG.gain.value = 0; const mF = ctx.createBiquadFilter(); mF.type = 'lowpass'; mF.frequency.value = 800; mG.connect(mF).connect(master);
  audio.music = { mG, mF };
  const hatBuf = noiseBuffer(ctx, 0.2);
  const BPM = 104, beat = 60 / BPM; let next = ctx.currentTime + 0.1, step = 0;
  const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]]; // Am7 Fmaj7 G7 Em7
  const hz = n => 440 * Math.pow(2, (n - 69) / 12);
  function sched() {
    while (next < ctx.currentTime + 0.25) {
      const t = next, bar = Math.floor(step / 16) % 4, s16 = step % 16;
      if (s16 % 4 === 0) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.18); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25); o.connect(g).connect(mG); o.start(t); o.stop(t + 0.3); }
      if (s16 % 8 === 4) { const n = ctx.createBufferSource(); n.buffer = hatBuf; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; const g = ctx.createGain(); g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16); n.connect(f).connect(g).connect(mG); n.start(t); }
      if (s16 % 2 === 1) { const n = ctx.createBufferSource(); n.buffer = hatBuf; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; const g = ctx.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); n.connect(f).connect(g).connect(mG); n.start(t); }
      if ([0, 3, 6, 10, 12].includes(s16)) { const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = hz(chords[bar][0] - 24 + (s16 === 10 ? 7 : 0)); f.type = 'lowpass'; f.frequency.value = 380; g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.001, t + beat * 0.7); o.connect(f).connect(g).connect(mG); o.start(t); o.stop(t + beat); }
      if (s16 === 0) for (const n of chords[bar]) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = hz(n); g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.3); g.gain.linearRampToValueAtTime(0.0, t + beat * 4); o.connect(g).connect(mG); o.start(t); o.stop(t + beat * 4 + 0.1); }
      if ([2, 7, 9, 14].includes(s16) && (step >> 4) % 2) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = hz(chords[bar][(s16 >> 1) % 4] + 12); g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35); o.connect(g).connect(mG); o.start(t); o.stop(t + 0.4); }
      next += beat / 4; step++;
    }
  }
  setInterval(sched, 60);
  audio.nodes = { wG, cG, rG, wF };
}
export const vehicleAudio = { kind: null, speed: 0, vmax: 1 };
updaters.push(() => {
  if (!audio.ctx) return; const t = audio.ctx.currentTime, N = audio.nodes, p = camera.position;
  audio.master.gain.setTargetAtTime(audio.on ? audio.vol : 0, t, 0.1);
  const dLake = Math.abs(p.x - shoreX(p.z)), alt = Math.max(0, p.y - 2);
  N.wG.gain.setTargetAtTime(clamp(1 - dLake / 160, 0, 1) * 0.35 * clamp(1 - alt / 120, 0, 1), t, 0.3);
  N.cG.gain.setTargetAtTime(0.12 + 0.1 * (1 - env.night * 0.5), t, 0.5);
  N.rG.gain.setTargetAtTime(env.rain * 0.18, t, 0.5);
  // venue music: loudest from the nearest open venue; muffled outside
  let best = 0, inside = false;
  for (const id of ['hotspot', 'klovee']) { const b = BRANDS[id]; if (!b || !b.isOpen()) continue; const d = Math.hypot(p.x - b.site.x, p.z - b.site.z); const k = clamp(1 - d / (id === 'hotspot' ? 240 : 120), 0, 1) ** 1.6 * (id === 'hotspot' ? 1 : 0.7); if (k > best) { best = k; inside = d < (id === 'hotspot' ? 34 : 18); } }
  audio.music.mG.gain.setTargetAtTime(best * 0.5, t, 0.4); audio.music.mF.frequency.setTargetAtTime(inside ? 9000 : 500 + best * 900, t, 0.3);
  const E = audio.engine, v = vehicleAudio, k = clamp(Math.abs(v.speed) / v.vmax, 0, 1);
  if (v.kind === 'car') { E.eO.frequency.setTargetAtTime(45 + k * 180, t, 0.05); E.eO2.frequency.setTargetAtTime(22 + k * 90, t, 0.05); E.eF.frequency.setTargetAtTime(300 + k * 1600, t, 0.05); E.eG.gain.setTargetAtTime(0.05 + k * 0.08, t, 0.1); }
  else if (v.kind === 'boat') { E.eO.frequency.setTargetAtTime(35 + k * 90, t, 0.1); E.eO2.frequency.setTargetAtTime(18 + k * 45, t, 0.1); E.eF.frequency.setTargetAtTime(200 + k * 700, t, 0.1); E.eG.gain.setTargetAtTime(0.05 + k * 0.07, t, 0.2); }
  else if (v.kind === 'fly') { E.eO.frequency.setTargetAtTime(160 + k * 220, t, 0.1); E.eO2.frequency.setTargetAtTime(80 + k * 110, t, 0.1); E.eF.frequency.setTargetAtTime(900 + k * 1500, t, 0.1); E.eG.gain.setTargetAtTime(0.035 + k * 0.03, t, 0.2); }
  else E.eG.gain.setTargetAtTime(0, t, 0.2);
});
