// Public extension API — window.StarVibes.* (for the wider ecosystem / operators)
import { buildBusiness, removeBusiness, plots, MODULES, businesses } from './growth.js';
import { PLOTS, DISTRICTS } from './layout.js';

export const BUSINESS_API = {
  /** StarVibes.addBusiness({ plotId:'n-1', module:'studio'|'cafe'|'gallery'|'loft'|'venue'|'tower', name:'Vibe Coffee', color:'#ff5c8a' }) */
  addBusiness: (b) => buildBusiness(b),
  removeBusiness: (plotId) => removeBusiness(plotId),
  /** list free plots */
  freePlots: () => plots.filter(p => !p.biz).map(p => ({ id: p.id, district: DISTRICTS[p.district].name, x: p.x, z: p.z, w: p.w, d: p.d })),
  modules: () => Object.keys(MODULES),
  businesses: () => businesses.map(b => ({ plotId: b.plotId, module: b.module, name: b.name, color: b.color })),
};
