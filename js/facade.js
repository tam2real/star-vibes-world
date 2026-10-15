// Facade materials with procedural windows that light up through the evening.
import { THREE, updaters } from './core.js';
import { env } from './env.js';

export const facadeU = { uLights: { value: 0 }, uTime: { value: 0 } };
updaters.push((dt, time) => { facadeU.uLights.value = env.lights; facadeU.uTime.value = time; });

/**
 * opts: floorH, groundH, winW (cell width), lit colour mix, storefront (bool), glassy (curtain wall)
 * Uses vertex colors for the wall tint; roofs (normal.y>0.5) get no windows.
 */
export function facadeMaterial(opts = {}) {
  const o = { floorH: 3.6, groundH: 4.6, cell: 3.2, fill: [0.22, 0.78, 0.25, 0.8], glassy: 0, storefront: 1, roughness: 0.85, ...opts };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: o.roughness, metalness: o.glassy ? 0.4 : 0.02 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uLights = facadeU.uLights; sh.uniforms.uTime = facadeU.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 wpp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wpp = instanceMatrix * wpp;
        #endif
        vWP = (modelMatrix * wpp).xyz;
        vWN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWP; varying vec3 vWN; uniform float uLights; uniform float uTime;
        float fh21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float winMask = 0.0; vec3 winEmit = vec3(0.0); float isStore = 0.0;
        if (abs(vWN.y) < 0.5) {
          float along = abs(vWN.x) > 0.5 ? vWP.z : vWP.x;
          float y = vWP.y;
          vec2 bid = floor(vWP.xz / 26.0);
          float gH = ${o.groundH.toFixed(2)};
          if (y < gH && ${o.storefront.toFixed(1)} > 0.5) {
            // storefront: wide glass, warm interior
            float u = along / 6.0; vec2 cl = vec2(floor(u), 0.0); float fx = fract(u);
            float m = step(0.08, fx) * step(fx, 0.92) * step(0.5, y) * step(y, gH - 0.9);
            winMask = m; isStore = 1.0;
            float open = step(0.25, fh21(cl + bid * 3.1));
            vec3 tone = mix(vec3(1.0, 0.72, 0.42), vec3(1.0, 0.9, 0.75), fh21(cl * 1.3 + bid));
            winEmit = m * open * tone * (0.25 + 1.35 * uLights);
          } else {
            float u = along / ${o.cell.toFixed(2)}, v = (y - gH) / ${o.floorH.toFixed(2)};
            vec2 cell = floor(vec2(u, v)); vec2 f = fract(vec2(u, v));
            float m = step(${o.fill[0].toFixed(2)}, f.x) * step(f.x, ${o.fill[1].toFixed(2)}) * step(${o.fill[2].toFixed(2)}, f.y) * step(f.y, ${o.fill[3].toFixed(2)});
            winMask = m;
            float r = fh21(cell + bid * 17.0);
            float lit = step(1.0 - (0.15 + 0.6 * uLights), r) * step(0.02, uLights + 0.03);
            float tone = fh21(cell * 1.7 + bid);
            vec3 wc = mix(vec3(1.0, 0.66, 0.32), mix(vec3(0.82, 0.9, 1.0), vec3(1.0, 0.5, 0.9), step(0.95, tone)), step(0.78, tone));
            float flick = 0.85 + 0.15 * sin(uTime * 0.5 + r * 60.0);
            winEmit = m * lit * wc * (0.45 + 0.9 * fh21(cell * 3.1 + bid)) * flick * (0.2 + uLights);
          }
          vec3 glassCol = mix(vec3(0.07, 0.09, 0.12), vec3(0.24, 0.3, 0.38), ${o.glassy.toFixed(2)});
          diffuseColor.rgb = mix(diffuseColor.rgb, glassCol, winMask);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.12, winMask);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += winEmit;`);
  };
  mat.customProgramCacheKey = () => JSON.stringify(o);
  return mat;
}
export const brickMat = facadeMaterial({});
export const officeMat = facadeMaterial({ floorH: 3.8, cell: 2.4, fill: [0.06, 0.94, 0.12, 0.9], glassy: 1, roughness: 0.4 });
export const houseMat = facadeMaterial({ floorH: 3.0, groundH: 0.6, cell: 3.6, fill: [0.35, 0.65, 0.3, 0.75], storefront: 0 });
