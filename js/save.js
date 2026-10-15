// Persistence: position, vehicle, time & weather, brand states, built businesses, milestones.
const KEY = 'svw.save.v1';
export const save = {
  data: null,
  load() { try { const s = localStorage.getItem(KEY); this.data = s ? JSON.parse(s) : null; } catch (_) { this.data = null; } return this.data; },
  write(d) { try { d.savedAt = Date.now(); localStorage.setItem(KEY, JSON.stringify(d)); this.data = d; return true; } catch (_) { return false; } },
  clear() { try { localStorage.removeItem(KEY); } catch (_) {} this.data = null; },
  export() { return JSON.stringify(this.data || {}, null, 2); },
};
export const milestones = { visited: {}, districts: {}, drove: false, sailed: false, flew: false, built: 0 };
