// [CONFIG] — hook the existing ecosystem into the world.
// Operator visualizers and chat are already built elsewhere; the world just frames them.
// Fill these in (or pass ?embed_hotspot=https://...  ?chat=https://... in the URL).
export const CONFIG = {
  embeds: {
    hotspot: '',    // e.g. 'https://your-host/visualizers/hotspot'
    klovee: '',
    glostar: '',
    kitchen: '',
    starvibes: '',
    garage: '',
  },
  chatUrl: '',      // existing Elfie chat UI (iframe)
};
const Q = new URLSearchParams(location.search);
for (const k of Object.keys(CONFIG.embeds)) { const v = Q.get('embed_' + k); if (v) CONFIG.embeds[k] = v; }
if (Q.get('chat')) CONFIG.chatUrl = Q.get('chat');
