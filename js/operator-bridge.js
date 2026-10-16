// Verified runtime bridge. The city never becomes a second operator backend.
const BRAIN_RUNTIME = 'http://127.0.0.1:18908';
const STATION_RUNTIME = 'http://127.0.0.1:3000';
const ELFIE_API = 'http://127.0.0.1:3000';

export async function sendOperatorMessage(operator, message, context = {}, onChunk = null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    // Proven T2R/Elfie flow: resolve the real character, bind to that
    // character's own chat, then use /voice so the single Elfie daemon owns
    // audio playback and the operator's voice/identity stays correct.
    const charsRes = await fetch(`${ELFIE_API}/api/characters`, { signal: controller.signal });
    if (!charsRes.ok) throw new Error(`Elfie characters unavailable (${charsRes.status})`);
    const charsPayload = await charsRes.json();
    const chars = charsPayload.characters || charsPayload;
    const key = String(operator || '').trim().toLowerCase();
    const character = chars.find(c => String(c.key || c.slug || '').toLowerCase() === key)
      || chars.find(c => String(c.name || '').trim().toLowerCase() === key);
    if (!character?._id) throw new Error(`Elfie character not found: ${operator}`);

    const chatsRes = await fetch(`${ELFIE_API}/api/chats?characterId=${encodeURIComponent(character._id)}`, { signal: controller.signal });
    if (!chatsRes.ok) throw new Error(`Elfie chats unavailable (${chatsRes.status})`);
    const chatsPayload = await chatsRes.json();
    const chats = Array.isArray(chatsPayload) ? chatsPayload : (chatsPayload.chats || []);
    let chat = chats.find(c => String(c.characterId) === String(character._id));
    if (!chat?._id) {
      const createRes = await fetch(`${ELFIE_API}/api/chats`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: character._id }), signal: controller.signal,
      });
      if (!createRes.ok) throw new Error(`Elfie chat creation unavailable (${createRes.status})`);
      chat = await createRes.json();
    }

    const contextLine = `[Star Vibes context: ${JSON.stringify({ city: 'Star Vibes City', ...context })}]`;
    const res = await fetch(`${ELFIE_API}/api/chats/${encodeURIComponent(chat._id)}/voice`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `${message}\n\n${contextLine}` }), signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Elfie voice chat unavailable (${res.status})`);
    const reader = res.body?.getReader();
    if (!reader) return { ok: true, operator: key, name: character.name, reply: '' };
    const decoder = new TextDecoder(); let buffer = ''; let reply = '';
    while (true) {
      const part = await reader.read(); if (part.done) break;
      buffer += decoder.decode(part.value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop() || '';
      for (const line of lines) if (line.startsWith('data:')) {
        try {
          const event = JSON.parse(line.slice(5).trim());
          if (event.text) { reply += event.text; if (typeof onChunk === 'function') onChunk(event.text, event); }
        } catch (_) {}
      }
    }
    return { ok: true, operator: key, name: character.name, reply: reply.trim() };
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Operator response timed out after 60 seconds');
    throw error;
  } finally { clearTimeout(timer); }
}

export async function registerOperatorStation(operator, building, details = {}) {
  const res = await fetch(`${STATION_RUNTIME}/api/operator/station`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operator, building, ...details }),
  });
  if (!res.ok) throw new Error(`Operator station unavailable (${res.status})`);
  return res.json();
}

async function elfieJson(path, options = {}) {
  const res = await elfieFetch(path, options);
  if (!res.ok) throw new Error(`Elfie API unavailable (${res.status})`);
  return res.json();
}
async function elfieFetch(path, options = {}) {
  return fetch(`${STATION_RUNTIME}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
}
async function brainJson(path, options = {}) {
  const res = await fetch(`${BRAIN_RUNTIME}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json(); if (!res.ok) throw new Error(data.error || `Operator API unavailable (${res.status})`); return data;
}

// These are existing Elfie resources, not Star Vibes-specific automations.
export const listAutomations = () => Promise.all([elfieJson('/api/routines'), elfieJson('/api/workflows')]);
export const runRoutine = (id, context = {}) => elfieJson(`/api/routines/${encodeURIComponent(id)}/run`, { method: 'POST', body: JSON.stringify({ source: 'star-vibes-city', city: 'Star Vibes City', context }) });
export const runWorkflow = (id, context = {}) => elfieJson(`/api/workflows/${encodeURIComponent(id)}/run`, { method: 'POST', body: JSON.stringify({ source: 'star-vibes-city', city: 'Star Vibes City', context }) });
export const getElfieSettings = () => elfieJson('/api/settings');
export const listSkills = () => elfieJson('/api/skills');
export const listTools = () => elfieJson('/api/tools');
export const listSkillPackages = () => elfieJson('/api/skill-packages');
export const listOperatorStations = () => elfieJson('/api/operator/stations');
export const listCapabilityCatalog = async () => {
  const [skills, tools, voidIndex] = await Promise.all([
    elfieJson('/api/skills'), elfieJson('/api/tools'), fetch('http://127.0.0.1:8877/api/void/index').then(async res => { if (!res.ok) throw new Error(`Void inventory unavailable (${res.status})`); return res.json(); }),
  ]);
  return { skills: Array.isArray(skills) ? skills : [], tools: tools || {}, voidIndex };
};
export const resolveCapability = async (name) => {
  const catalog = await listCapabilityCatalog(), key = String(name || '').trim().toLowerCase();
  const skill = catalog.skills.find(s => String(s.name || '').toLowerCase() === key);
  const tool = (catalog.tools.builtInTools || []).find(t => String(t.name || '').toLowerCase() === key);
  return { kind: skill ? 'skill' : tool ? 'tool' : null, capability: skill || tool || null, catalog };
};
export const listOperatorTasks = (assignedTo = '') => brainJson(`/operator/tasks${assignedTo ? `?assigned_to=${encodeURIComponent(assignedTo)}` : ''}`);
export const getOperatorTask = (taskId) => brainJson(`/operator/tasks/${encodeURIComponent(taskId)}`);
export const createOperatorTask = (goal, assignedTo, options = {}) => fetch(`${BRAIN_RUNTIME}/operator/tasks`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ goal, assigned_to: assignedTo, requested_by: options.requestedBy || 'star-vibes-city', task_type: options.taskType || 'city_request', project_path: options.projectPath || '', mode: options.mode || 'plan', constraints: options.constraints || 'Use existing Void/Elfie capabilities. Do not execute approval-gated work without authorization.', capability_tags: options.capabilityTags || [], approval_required: options.approvalRequired !== false }),
}).then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error || `Task unavailable (${res.status})`); return data; });
export const createOperatorHandoff = (from, to, goal, context = {}) => createOperatorTask(goal, to, {
  requestedBy: from, taskType: 'operator_handoff', mode: 'plan', parentConversationTurn: context.parentTaskId || '',
  constraints: `Handoff from ${from} to ${to}. Preserve role context and approval gates. Use existing Void/Elfie skills only.`,
  capabilityTags: ['operator-handoff', ...(context.capabilityTags || [])], approvalRequired: context.approvalRequired !== false,
});
export const startRiftResearchWorkflow = (goal, context = {}) => createOperatorTask(goal, 'rift', {
  requestedBy: context.requestedBy || 'star-vibes-city', taskType: 'research_workflow', mode: 'plan',
  projectPath: context.projectPath || '',
  constraints: 'Research only. Return evidence, sources, candidate directions, and a concise handoff for Omnis/Sage. Do not begin construction or execute approval-gated work.',
  capabilityTags: ['scouting', 'research', 'sources', 'operator-workflow'], approvalRequired: false,
});
// Canonical operator request flow. The city creates a normal Elfie chat for the
// selected character, then posts the request through the existing chat route;
// there is no parallel Star Vibes task store.
export const createOperatorChat = (operator) => elfieJson(`/api/chats?characterId=${encodeURIComponent(operator)}`, { method: 'POST' });
export const sendOperatorRequest = (chatId, content, context = {}) => elfieFetch(`/api/chats/${encodeURIComponent(chatId)}/message`, {
  method: 'POST',
  body: JSON.stringify({ content: `${content}\n\n[Star Vibes context: ${JSON.stringify({ city: 'Star Vibes City', ...context })}]` }),
});

export const operatorRuntime = { brain: BRAIN_RUNTIME, station: STATION_RUNTIME };
