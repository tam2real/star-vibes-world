// Sky, sun/moon, day-night cycle, weather, water and terrain.
import { THREE, V3, scene, renderer, camera, bloom, updaters, nightMats, makeCanvas, smooth, clamp, rand, QUALITY, M, selfLitU } from './core.js';
import { terrainHeight, WATER_Y, shoreX, riverDist, riverHalfW, fbm } from './layout.js';

/* =====================================================================
   ENV STATE — time of day (hours) + weather
   ===================================================================== */
export const env = {
  hour: 19.1, speed: 1, // speed: game-minutes per real second (1 => a day lasts 24 real minutes)
  weather: 'clear', cloud: 0.25, rain: 0, overcast: 0,
  sunDir: new V3(), sunElev: 0, night: 0, lights: 0, dayK: 1,
  _target: { cloud: 0.25, overcast: 0, rain: 0 },
};
export const WEATHERS = {
  clear: { cloud: 0.22, overcast: 0, rain: 0, label: 'Clear' },
  overcast: { cloud: 0.85, overcast: 1, rain: 0, label: 'Overcast' },
  rain: { cloud: 0.95, overcast: 1, rain: 1, label: 'Rain' },
  sunset: { cloud: 0.4, overcast: 0, rain: 0, label: 'Sunset', hour: 19.15 },
  night: { cloud: 0.18, overcast: 0, rain: 0, label: 'Night', hour: 22.5 },
};
export function setWeather(k, instant = false) {
  const W = WEATHERS[k]; if (!W) return; env.weather = k;
  env._target = { cloud: W.cloud, overcast: W.overcast, rain: W.rain };
  if (W.hour != null) env.hour = W.hour;
  if (instant) Object.assign(env, env._target);
}

/* =====================================================================
   SKY  — one GLSL sky function shared by the dome and the water reflections
   ===================================================================== */
export const skyU = {
  uSun: { value: new V3(0, 0.2, -1) }, uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
  uSunCol: { value: new THREE.Color() }, uCloud: { value: 0.3 }, uOver: { value: 0 }, uNight: { value: 0 }, uTime: { value: 0 }, uMoon: { value: new V3(0, 0.5, 1) },
  uCloudLit: { value: new THREE.Color() }, uCloudDark: { value: new THREE.Color() },
};
const SKY_GLSL = /* glsl */`
  uniform vec3 uSun; uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uGlow; uniform vec3 uSunCol; uniform float uCloud; uniform float uOver;
  uniform float uNight; uniform float uTime; uniform vec3 uMoon; uniform vec3 uCloudLit; uniform vec3 uCloudDark;
  float sh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
  float sn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(sh(i),sh(i+vec2(1,0)),f.x), mix(sh(i+vec2(0,1)),sh(i+vec2(1,1)),f.x), f.y); }
  float sfbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*sn(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return v; }
  vec3 skyColor(vec3 d, bool withSun){
    float h = d.y;
    float t = max(h, 0.0);
    vec3 col = mix(uHor, uZen, pow(smoothstep(0.0, 0.62, t), 0.55));
    float sd = max(dot(d, uSun), 0.0);
    float horizonBand = exp(-abs(h) * 9.0);
    col += uGlow * (pow(sd, 6.0) * 0.55 + pow(sd, 2.0) * 0.18) * (0.35 + horizonBand);
    if (withSun) {
      col += uSunCol * (pow(sd, 1800.0) * 26.0 + pow(sd, 260.0) * 0.9) * (1.0 - uOver * 0.92);
      float md = max(dot(d, uMoon), 0.0);
      col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.99955, 0.99975, md) * 2.4 + pow(md, 200.0) * 0.08) * uNight * (1.0 - uOver * 0.8);
    }
    if (h > 0.0) {
      vec2 sp = floor(d.xz / (h + 0.25) * 330.0);
      float st = step(0.9966, sh(sp)) * smoothstep(0.05, 0.4, h);
      col += vec3(st) * (0.4 + 0.9 * sh(sp + 3.0)) * uNight * (1.0 - uOver) * (0.75 + 0.25 * sin(uTime * 3.0 + sh(sp) * 40.0));
      vec2 uv = d.xz / (h + 0.06) * 1.25 + vec2(uTime * 0.004, uTime * 0.0015);
      float n = sfbm(uv * 0.9) * 0.65 + sfbm(uv * 3.1 + 7.0) * 0.35;
      float cov = mix(0.62, 0.2, uCloud);
      float cl = smoothstep(cov, cov + 0.26, n) * smoothstep(0.0, 0.08, h);
      float lit = clamp(0.35 + pow(sd, 3.0) * 0.9 + (1.0 - h) * 0.25, 0.0, 1.0);
      vec3 cc = mix(uCloudDark, uCloudLit, lit * (1.0 - uOver * 0.55));
      col = mix(col, cc, cl * (0.92 - 0.1 * uNight));
    }
    col = mix(col, uHor * 0.72, smoothstep(0.0, -0.08, h));
    return col;
  }`;
const skyMat = new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w * 0.99999; }`,
  fragmentShader: SKY_GLSL + `varying vec3 vDir; void main(){ gl_FragColor = vec4(skyColor(normalize(vDir), true), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`,
});
export const sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24), skyMat);
sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);

/* environment map for PBR reflections — re-baked as the sun moves */
const envScene = new THREE.Scene();
const envSkyMat = new THREE.ShaderMaterial({ uniforms: skyU, side: THREE.BackSide, depthWrite: false,
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: SKY_GLSL + `varying vec3 vDir; void main(){ vec3 d = normalize(vDir); vec3 c = skyColor(vec3(d.x, max(d.y, -0.02), d.z), false); if (d.y < 0.0) c = mix(c, vec3(0.05,0.05,0.06), smoothstep(0.0,-0.3,d.y)); gl_FragColor = vec4(c, 1.0); }` });
envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), envSkyMat));
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null, lastEnvKey = '';
function bakeEnv() {
  const key = `${env.sunDir.x.toFixed(2)},${env.sunDir.y.toFixed(2)},${env.overcast.toFixed(1)}`;
  if (key === lastEnvKey) return; lastEnvKey = key;
  const old = envRT; envRT = pmrem.fromScene(envScene, 0.03); scene.environment = envRT.texture; if (old) old.dispose();
}

/* =====================================================================
   LIGHTS
   ===================================================================== */
export const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x3a3328, 0.6); scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xffffff, 2.5); scene.add(sun); scene.add(sun.target);
if (QUALITY.high) {
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const S = 170; Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 10, far: 1400 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
}

/* =====================================================================
   PALETTE — keyed on sun elevation
   ===================================================================== */
const C = (h) => new THREE.Color(h);
const KEYS = [   // elev, zenith, horizon, glow, sun, sunI, hemiSky, hemiGnd, hemiI, fog, cloudLit, cloudDark
  [-0.40, C('#03050f'), C('#0c1230'), C('#0a0c24'), C('#7d93ff'), 0.32, C('#3a4a8a'), C('#0d0d14'), 0.32, C('#0a0f22'), C('#2b3254'), C('#05070f')],
  [-0.12, C('#060a22'), C('#262451'), C('#4a2a5a'), C('#8ea0ff'), 0.25, C('#4a4f99'), C('#141020'), 0.32, C('#191a3a'), C('#46406e'), C('#0b0b1c')],
  [-0.02, C('#1a2058'), C('#c0566a'), C('#ff6a3d'), C('#ff6a3a'), 0.6, C('#7a6ab0'), C('#2a1a22'), 0.42, C('#5a3e62'), C('#ff8a6a'), C('#3a2648')],
  [0.06, C('#2c4a9c'), C('#ff9a5c'), C('#ffb066'), C('#ffa060'), 2.0, C('#a8a6d8'), C('#4a3828'), 0.55, C('#c98a74'), C('#ffd0a0'), C('#6a5070')],
  [0.20, C('#2e6ad0'), C('#bcd2ec'), C('#ffe6c0'), C('#fff0dc'), 2.9, C('#bcd4ff'), C('#5a4c3a'), 0.68, C('#aec4dc'), C('#ffffff'), C('#a4b0c4')],
  [0.70, C('#2358c4'), C('#9ec4ec'), C('#ffffff'), C('#ffffff'), 3.2, C('#c6dcff'), C('#5e5240'), 0.72, C('#a2bedc'), C('#ffffff'), C('#b0bccc')],
];
const tmp = { z: new THREE.Color(), h: new THREE.Color(), g: new THREE.Color(), s: new THREE.Color(), hs: new THREE.Color(), hg: new THREE.Color(), f: new THREE.Color(), cl: new THREE.Color(), cd: new THREE.Color() };
function palette(e) {
  let i = 0; while (i < KEYS.length - 2 && e > KEYS[i + 1][0]) i++;
  const A = KEYS[i], B = KEYS[i + 1], t = clamp((e - A[0]) / (B[0] - A[0]), 0, 1), s = t * t * (3 - 2 * t);
  const L = (k, out) => out.copy(A[k]).lerp(B[k], s);
  return { z: L(1, tmp.z), h: L(2, tmp.h), g: L(3, tmp.g), s: L(4, tmp.s), si: A[5] + (B[5] - A[5]) * s, hs: L(6, tmp.hs), hg: L(7, tmp.hg), hi: A[8] + (B[8] - A[8]) * s, f: L(9, tmp.f), cl: L(10, tmp.cl), cd: L(11, tmp.cd) };
}
const GREY = new THREE.Color('#8a909c'), GREYN = new THREE.Color('#14161e');

export function sunFromHour(h, out) {
  const a = (h - 6.0) / 13.6 * Math.PI;          // 6:00 sunrise → 19:36 sunset
  const el = Math.sin(a);
  out.set(Math.cos(a) * 0.92, el * 0.78 + 0.0, 0.38 * Math.max(0.2, Math.sin(a)) + 0.12).normalize();
  // sunrise east (+x) → sunset west over the lake (-x)
  out.x = Math.cos(a); out.y = Math.sin(a) * 0.82 - 0.04; out.z = 0.32; out.normalize();
  return out;
}

/* =====================================================================
   TERRAIN
   ===================================================================== */
const groundTex = (() => {
  const c = makeCanvas(512, 512), g = c.ctx; g.fillStyle = '#808080'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) { const v = 100 + rand() * 60; g.fillStyle = `rgba(${v},${v},${v},${0.25 + rand() * 0.3})`; g.fillRect(rand() * 512, rand() * 512, 1 + rand() * 3, 1 + rand() * 3); }
  for (let i = 0; i < 400; i++) { const v = 150 + rand() * 50; g.strokeStyle = `rgba(${v},${v},${v * 0.9},0.25)`; g.beginPath(); const x = rand() * 512, y = rand() * 512; g.moveTo(x, y); g.lineTo(x + rr2(), y - 3 - rand() * 5); g.stroke(); }
  c.tex.wrapS = c.tex.wrapT = THREE.RepeatWrapping; c.tex.colorSpace = THREE.NoColorSpace; return c.tex;
  function rr2() { return (rand() - 0.5) * 4; }
})();
function buildTerrain(size, seg, cx, cz, hole) {
  const geo = new THREE.PlaneGeometry(size, size, seg, seg); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, n = p.count, col = new Float32Array(n * 3), uv = geo.attributes.uv;
  const cGrass = new THREE.Color('#4d6b34'), cGrass2 = new THREE.Color('#6a7d3a'), cDry = new THREE.Color('#857c4a'), cSand = new THREE.Color('#c8b48a'),
    cMud = new THREE.Color('#3b3a2c'), cRock = new THREE.Color('#5c5a58'), cForest = new THREE.Color('#2a4426'), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x = p.getX(i) + cx, z = p.getZ(i) + cz;
    let h = terrainHeight(x, z);
    if (hole && Math.abs(x) < hole && Math.abs(z + 150) < hole) h -= 12;
    p.setXYZ(i, x, h, z); uv.setXY(i, x / 9, z / 9);
    const shore = Math.min(x - shoreX(z), riverDist(x, z) - riverHalfW(z));
    const nf = fbm(x / 140, z / 140, 3);
    if (h < WATER_Y - 0.3) c.copy(cMud).lerp(cSand, clamp(1 + (h + 1) / 4, 0, 1) * 0.5);
    else if (shore < 7 && shore > -1 && h < 2) c.copy(cSand).lerp(cGrass, smooth(3, 7, shore));
    else {
      c.copy(cGrass).lerp(cGrass2, nf).lerp(cDry, smooth(0.62, 0.8, fbm(x / 60 + 9, z / 60, 2)) * 0.6);
      if (h > 20) c.lerp(cForest, smooth(20, 80, h) * 0.85);
      if (h > 260) c.lerp(cRock, smooth(260, 520, h));
    }
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  return geo;
}
export const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: groundTex, roughness: 0.96, metalness: 0 });
{
  const near = new THREE.Mesh(buildTerrain(2600, QUALITY.high ? 480 : 330, 0, -150, 0), groundMat); near.receiveShadow = true; scene.add(near);
  const far = new THREE.Mesh(buildTerrain(22000, 260, 0, -150, 1290), groundMat); far.receiveShadow = false; scene.add(far);
}

/* =====================================================================
   WATER — animated, sky-reflecting, sun glints, wake-aware
   ===================================================================== */
export const waterU = {
  uTime: { value: 0 }, uDeep: { value: new THREE.Color('#0b2a3a') }, uShallow: { value: new THREE.Color('#1d5560') },
  uCam: { value: new V3() }, uLights: { value: 0 }, uRain: { value: 0 },
  uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.0006 },
};
const waterMat = new THREE.ShaderMaterial({
  uniforms: { ...skyU, ...waterU }, transparent: false,
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: SKY_GLSL + /* glsl */`
    uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uCam; uniform float uLights; uniform float uRain; uniform vec3 uFogColor; uniform float uFogDensity;
    varying vec3 vW;
    vec2 wv(vec2 p, vec2 dir, float f, float sp, float a){ float ph = dot(p, dir) * f + uTime * sp; return dir * cos(ph) * a * f; }
    void main(){
      vec2 p = vW.xz;
      vec2 g = vec2(0.0);
      g += wv(p, normalize(vec2(1.0, 0.35)), 0.045, 1.1, 0.55);
      g += wv(p, normalize(vec2(-0.4, 1.0)), 0.07, 1.5, 0.34);
      g += wv(p, normalize(vec2(0.8, -0.6)), 0.16, 2.3, 0.14);
      g += wv(p, normalize(vec2(-1.0, -0.2)), 0.33, 3.1, 0.06);
      float n1 = sn(p * 0.35 + uTime * 0.6) - 0.5, n2 = sn(p * 0.35 + vec2(17.0, 3.0) - uTime * 0.5) - 0.5;
      g += vec2(n1, n2) * 0.12;
      if (uRain > 0.0) { vec2 c = floor(p * 1.2); float r = sh(c + floor(uTime * 3.0)); g += (vec2(sh(c), sh(c + 9.0)) - 0.5) * step(0.82, r) * uRain * 0.6; }
      float dist = length(uCam - vW);
      g *= mix(1.0, 0.25, smoothstep(80.0, 1400.0, dist));
      vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
      vec3 V = normalize(uCam - vW);
      vec3 R = reflect(-V, N); R.y = abs(R.y);
      float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
      vec3 refl = skyColor(R, false);
      vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 1.0, V.y)) * (0.25 + 0.75 * length(uHor + uZen) * 0.6);
      vec3 col = mix(body, refl, clamp(fres * 1.15, 0.0, 1.0));
      float s = max(dot(R, uSun), 0.0);
      col += uSunCol * (pow(s, 700.0) * 18.0 + pow(s, 60.0) * 0.35) * (1.0 - uOver * 0.9) * smoothstep(-0.05, 0.03, uSun.y);
      float m = max(dot(R, uMoon), 0.0); col += vec3(0.7, 0.8, 1.0) * pow(m, 400.0) * 3.0 * uNight;
      // shimmering town-light streaks at night
      float streak = sn(vec2(p.x * 0.05, p.y * 1.6 + uTime * 0.8)) * sn(vec2(p.x * 0.6, p.y * 0.25));
      col += vec3(1.0, 0.62, 0.3) * pow(streak, 6.0) * uLights * 0.8 * smoothstep(1200.0, 200.0, dist);
      float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
      col = mix(col, uFogColor, fogF);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
export const water = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000, 1, 1).rotateX(-Math.PI / 2), waterMat);
water.position.y = WATER_Y; scene.add(water);

/* =====================================================================
   RAIN
   ===================================================================== */
const RAIN_N = QUALITY.high ? 9000 : 3500;
const rainGeo = new THREE.BufferGeometry(); const rp = new Float32Array(RAIN_N * 6);
for (let i = 0; i < RAIN_N; i++) { const x = (rand() - 0.5) * 160, y = rand() * 80, z = (rand() - 0.5) * 160; rp.set([x, y, z, x - 0.1, y - 1.1, z], i * 6); }
rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
const rainMat = new THREE.LineBasicMaterial({ color: 0x9fb4d0, transparent: true, opacity: 0, depthWrite: false });
const rainMesh = new THREE.LineSegments(rainGeo, rainMat); rainMesh.frustumCulled = false; scene.add(rainMesh);

/* =====================================================================
   UPDATE
   ===================================================================== */
let envClock = 0;
const _c = new THREE.Color();
export function updateEnv(dt, time) {
  env.hour = (env.hour + dt * env.speed / 60 + 24) % 24;
  const k = 1 - Math.exp(-dt * 0.5);
  for (const key of ['cloud', 'overcast', 'rain']) env[key] += (env._target[key] - env[key]) * k;
  sunFromHour(env.hour, env.sunDir); const sd = env.sunDir;
  env.sunElev = sd.y;
  env.night = smooth(0.06, -0.1, sd.y);
  env.lights = Math.max(smooth(0.14, -0.04, sd.y), env.overcast * 0.45 + env.rain * 0.2);
  const P = palette(sd.y);
  const ov = env.overcast;
  skyU.uSun.value.copy(sd); skyU.uMoon.value.set(-sd.x, Math.abs(sd.y) * 0.6 + 0.25, -0.5).normalize();
  skyU.uZen.value.copy(P.z).lerp(_c.copy(GREY).lerp(GREYN, env.night).multiplyScalar(0.8), ov * 0.8);
  skyU.uHor.value.copy(P.h).lerp(_c.copy(GREY).lerp(GREYN, env.night), ov * 0.85);
  skyU.uGlow.value.copy(P.g).multiplyScalar(1 - ov * 0.8);
  skyU.uSunCol.value.copy(P.s);
  skyU.uCloud.value = env.cloud; skyU.uOver.value = ov; skyU.uNight.value = env.night; skyU.uTime.value = time;
  skyU.uCloudLit.value.copy(P.cl).lerp(_c.copy(GREY).multiplyScalar(1 - env.night * 0.85), ov * 0.7);
  skyU.uCloudDark.value.copy(P.cd).lerp(_c.copy(GREY).multiplyScalar(0.55 - env.night * 0.45), ov * 0.6);
  // lights
  const sunUp = sd.y > -0.02;
  sun.color.copy(sunUp ? P.s : new THREE.Color('#8ea6ff'));
  sun.intensity = (sunUp ? P.si : 0.28) * (1 - ov * 0.78);
  const ld = sunUp ? sd : skyU.uMoon.value;
  const focus = camera.position; const fx = Math.round(focus.x / 8) * 8, fz = Math.round(focus.z / 8) * 8;
  sun.target.position.set(fx, 0, fz); sun.position.set(fx + ld.x * 600, Math.max(40, ld.y * 600), fz + ld.z * 600);
  hemi.color.copy(P.hs).lerp(GREY, ov * 0.5); hemi.groundColor.copy(P.hg); hemi.intensity = P.hi * (1 + ov * 0.25);
  // fog
  scene.fog.color.copy(P.f).lerp(_c.copy(GREY).lerp(GREYN, env.night), ov * 0.75);
  scene.fog.density = 0.00042 + ov * 0.0006 + env.rain * 0.0008;
  waterU.uFogColor.value.copy(scene.fog.color); waterU.uFogDensity.value = scene.fog.density;
  waterU.uTime.value = time; waterU.uCam.value.copy(camera.position); waterU.uLights.value = env.lights; waterU.uRain.value = env.rain;
  renderer.toneMappingExposure = 0.95 + env.night * 0.05;
  bloom.strength = 0.22 + env.lights * 0.26; bloom.threshold = 0.96 - env.lights * 0.06; bloom.radius = 0.32;
  scene.environmentIntensity = 0.25 + (1 - env.night) * 0.55;
  // night-cycle materials
  for (const e of nightMats) {
    const kk = e.gate ? e.gate() : 1;
    const f = (e.day + (e.night - e.day) * env.lights) * kk;
    if (e.prop === 'color') e.mat.color.copy(e.base).multiplyScalar(f);
    else if (e.prop === 'emissive') e.mat.emissive.copy(e.base).multiplyScalar(f);
    else if (e.prop === 'intensity') e.mat.intensity = e.base.r * f;
    else if (e.prop === 'opacity') e.mat.opacity = clamp(f, 0, 1);
    else if (e.prop === 'uniform') e.mat.value = f;
  }
  selfLitU.value = 0.05 + env.lights * 0.22;
  // wet look
  M.paving.roughness = 0.95 - env.rain * 0.55;
  // rain follows the camera
  rainMat.opacity = env.rain * 0.55; rainMesh.visible = env.rain > 0.02;
  if (rainMesh.visible) {
    const a = rainGeo.attributes.position.array, fall = dt * 60;
    for (let i = 0; i < RAIN_N; i++) { const o = i * 6; a[o + 1] -= fall; a[o + 4] -= fall; if (a[o + 1] < 0) { a[o + 1] += 80; a[o + 4] += 80; } }
    rainGeo.attributes.position.needsUpdate = true; rainMesh.position.set(camera.position.x, camera.position.y - 40, camera.position.z);
  }
  sky.position.copy(camera.position);
  envClock -= dt; if (envClock <= 0) { envClock = 1.5; bakeEnv(); }
}
updaters.push(updateEnv);
