# Star Vibes operator ecosystem architecture

Status: prototype architecture map — 2026-10-15

This document describes how Star Vibes participates in the existing T2R/Elfie/Void ecosystem. Star Vibes is an embodied city client. It is not a new operator backend, skill registry, voice service, or task store.

## 1. Source-of-truth layers

| Layer | Existing source | Responsibility |
|---|---|---|
| Elfie API | `http://127.0.0.1:3000` | Character identity, character-bound chats, voice requests, tools, dynamic skills, settings, routines, workflows |
| Sage Brain/Void task bus | `http://127.0.0.1:18908` | Assigned operator tasks, lifecycle, reports, approval metadata, task history |
| Overseer/Void index | `http://127.0.0.1:8877` | Shared dashboard, prototype routing, endpoint inventory, health and visibility |
| Star Vibes world | `/Users/hotmama/Desktop/Star AI/prototypes/star-vibes-world` | NPC bodies, city coordinates, roads, vehicles, buildings, map, local projection of remote state |
| Prototype mirror | `~/Library/Application Support/Sage/T2R Enterprise Prototype/star-vibes-world` | Readable source for the shared `:8877` prototype bridge |
| Elfie daemon | Existing shared daemon | The only operator voice speaker; browser displays text/captions but does not synthesize or play operator audio |

## 2. Operator request lifecycle

```text
Player presses E
  -> Star Vibes resolves the local operator identity
  -> Elfie character-bound chat/voice handles conversation and daemon speech
  -> Player chooses dispatch or handoff
  -> Sage Brain POST /operator/tasks creates the real task
  -> Star Vibes stores task_id + city destination as a local projection
  -> NPC navigation/vehicle layer moves the body
  -> Void task lifecycle remains authoritative for work status
  -> completion/event source later drives daemon announcement and city update
```

The city must never create a second task database or substitute a fake completion state for the Void record.

## 3. Existing operator task contract

Verified routes on Sage Brain:

| Method | Route | City use |
|---|---|---|
| GET | `/operator/tasks` | list tasks, optionally filter by `assigned_to` |
| GET | `/operator/tasks/{id}` | reconcile one task after reload |
| GET | `/operator/tasks/{id}/report` | read plan, result, files, and tests |
| POST | `/operator/tasks` | create assigned work or an operator handoff |
| POST | `/operator/tasks/{id}` | lifecycle updates |
| POST | `/operator/tasks/{id}/cancel` | cancel work |
| POST | `/operator/tasks/{id}/archive` | archive terminal work |

The task bus lifecycle is `open -> accepted -> running -> plan_ready -> completed`, with `failed`, `cancelled`, and `archived` terminal paths. Forge work remains approval-gated.

## 4. Handoffs

There is no separate handoff endpoint in the current backend contract. The existing handoff primitive is a normal assigned task with:

- `assigned_to` as the receiving operator
- `requested_by` as the sending operator
- `task_type: operator_handoff`
- `parent_conversation_turn` carrying the parent task ID when available
- `capability_tags` carrying sender/receiver role context
- `approval_required` preserved

Star Vibes routes the receiver to the sender’s live `operatorAt` position. The task bus remains the record of truth; the NPC meeting is the embodied projection.

## 5. Existing skills and applications

Live inventory checked 2026-10-15:

- `/api/void/index`: 40 indexed cross-system endpoints.
- Elfie `/api/tools`: 102 built-in tools and 28 dynamic skills reported.
- Elfie `/api/skills`: existing dynamic skill definitions, including method, URL template, enabled state, confirmation requirement, and authentication metadata.
- Live built-in lookup tools include `search_knowledge_base`, `read_knowledge_file`, `search_past_conversations`, `web_search`, `list_drive_files`, and `read_drive_file`.
- `/api/gaze/*`: position/P&L tracking surface.
- `/api/glutton/*`: media, folders, video, editing, and cron/status surface.
- Predator/trading routes: market, risk, scan, setup, and check-in surfaces through the registered trading service.

Star Vibes now exposes a read-only capability catalog through `listCapabilityCatalog()` and `resolveCapability()`. It should invoke an existing skill only through the character chat/tool pipeline after resolving its registered ID/route and honoring `enabled`, `requiresConfirmation`, approval, and service health. `POST /api/skills/:id/test` is a test route, not the production city execution path. No Gaze, Predator, Glutton, or other skill is duplicated in the city.

## 6. City embodiment layer

The world owns only the visual and spatial projection:

- named Star Vibes character bodies and nameplates
- `operatorAt` live world positions
- road graph and collision checks
- cars, boats, and flying cars reused from the existing fleet
- building doors, drop-offs, plots, stations, and map markers
- local save of task ID, vehicle, destination, and last-known projection

The world does not own operator identity, chat history, skill definitions, approval policy, or authoritative task completion.

## 7. Capability routing examples

### Rift research → Omnis/Sage synthesis → Forge prototype

1. Player asks Rift through the existing operator chat/voice path.
2. Star Vibes creates a Rift task tagged `scouting`/`research`.
3. Rift reports findings through the task report route.
4. A follow-up `operator_handoff` task assigns the synthesis to Omnis or Sage, preserving the parent task ID.
5. A proposal is handed to Forge only with approval metadata intact.
6. Forge’s task status/report returns to the Overseer and city projection.

### Skill-backed work

1. Resolve the skill/tool from Elfie `/api/tools` or `/api/skills`.
2. Check service health through the registered Void/Overseer inventory.
3. Check enabled/confirmation/approval requirements.
4. Create or update the operator task with the resolved capability tag.
5. Let the owning skill/app execute; Star Vibes only shows movement, station, status, and result context.

## 8. Remaining architecture gates

- Verify the exact dynamic-skill execution route and payload from Elfie before adding one-click skill execution.
- Add a completion/event subscription or polling contract; do not infer completion from NPC arrival.
- Reconcile vehicle and city projection state after bridge/backend restart.
- Add explicit cross-city registry and current-city assignment to the task context.
- Test Rift → Omnis/Sage → Forge with a real report and approval block.
- Add daemon announcement routing only from verified task completion/failure events.

## Non-negotiable boundaries

- Prototype first; no runtime promotion yet.
- One shared operator identity across cities.
- One shared Elfie daemon voice path.
- One shared Void/Sage Brain task bus.
- Existing skills and endpoints before any new skill is proposed.
- Browser never becomes an operator audio speaker.
