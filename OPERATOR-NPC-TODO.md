# Star Vibes City — Operator Ecosystem TODO

Architecture map: [OPERATOR-ECOSYSTEM-ARCHITECTURE.md](./OPERATOR-ECOSYSTEM-ARCHITECTURE.md)

## Phase 0 — Architecture and source of truth

- [x] Prototype-first rule: development links target desktop prototype surfaces
- [x] Runtime promotion is a later gate after testing and extended use
- [x] Prototype and runtime share data; they are separate deployment surfaces
- [x] T2R prototype Overseer path confirmed as `/prototype/overseer/app.html`
- [x] Star Vibes is a client/world, not a second operator backend
- [x] Reuse shared operator visualizers, voice, skills, and call system
- [x] Confirm Elfie API (`:3000`) and Overseer/Void (`:8877`)
- [x] Keep city calls behind existing runtime contracts
- [ ] Load operator roster from the canonical runtime endpoint
- [ ] Version the cross-city context contract in the Void

## Phase 1 — World embodiment

- [x] Named operator NPCs separate from generic pedestrians
- [x] Reuse the actual Star Vibes player body and chest star
- [x] Visible nameplates, status, proximity detection, and E interaction
- [x] Operator movement between authored work points
- [ ] Add authored work points for every operator and floor
- [x] Add road-graph navigation for dispatched operators
- [ ] Add collision-aware navigation and richer movement states
- [ ] Add availability/out-of-city states
- [x] Add dispatch destination state and minimap position tracking
- [ ] Add summon, dispatch, and operator vehicles

## Phase 2 — Identity, context, and consoles

- [x] Shared Sage/T2R visualizer iframe entry
- [x] Pass city/building/district/role/sibling context into embeds
- [x] Register operator station on building entry
- [x] Add embedded Overseer control plane
- [x] Add verified operator chat bridge
- [ ] Verify visualizers display Star Vibes context and correct identity
- [ ] Add city/context indicators to NPCs and consoles
- [ ] Add cross-city switch/return behavior

## Phase 3 — Elfie skills and automations

- [x] Station route: `POST /api/operator/station`
- [x] Existing routines/workflows: `/api/routines`, `/api/workflows`
- [x] Verified run-now automation calls
- [x] Shared Elfie settings bridge
- [x] Add capability-domain mapping without inventing routine/workflow IDs
- [ ] Load automation definitions into the in-world Overseer panel
- [ ] Map automation owner → operator ID
- [ ] Map automation destination → city/building/plot
- [ ] Show automation state, failures, and blocked approvals on NPCs
- [ ] Never duplicate an existing Elfie automation

## Phase 4 — Work requests and handoffs

- [x] Identify canonical task/chat creation route: `POST /api/chats?characterId=...`, followed by `POST /api/chats/:id/message`
- [x] Identify the existing handoff primitive: assigned Void task with `parent_conversation_turn` and role/capability context
- [x] Verify existing Void operator task bus: `GET/POST /operator/tasks` with assigned operator and approval metadata
- [ ] Add verified routes to their owning `void/APIs.md`
- [ ] Confirm routes appear in `/api/void/index`
- [ ] Add persistent task and handoff IDs to city state
- [ ] Player → operator request with city context
- [ ] Operator → operator request with role context
- [x] Add Rift research workflow entry point through the existing operator task bus
- [ ] Rift scouting → Omnis/Sage → Forge workflow completion test
- [ ] Forge remains approval-gated
- [ ] Completion returns to Sage/Elfie and updates the city

## Phase 5 — City actions and building pipeline

- [ ] Represent free plots as addressable resources
- [ ] Rift reports candidate buildings/plots
- [ ] Research attaches competitor evidence
- [ ] Proposal uses the existing proposal system and Overseer
- [ ] Chairman approval gates acquisition/build
- [ ] Forge receives approved build work
- [ ] Growth API spawns/updates the building
- [ ] New building receives an operator/manager and Void-backed state

## Phase 6 — Cross-city operation

- [ ] Define city registry: T2R Enterprise, Star Vibes, Crypto City, Media City
- [ ] Give every operator current city and assignment
- [ ] Dispatch operators between cities through runtime state
- [ ] Keep one identity, chat history, and skill set per operator
- [ ] Show current city and cross-city handoffs in Overseer

## Phase 7 — Persistence, monitoring, and safety

- [x] Persist NPC task/status/destination/location projection in the local world save
- [ ] Reconcile persisted NPC state with the backend task record after reload
- [ ] Mark stale tasks honestly
- [ ] Add Elfie/operator/Overseer/Void health checks
- [ ] Disable actions when required runtime is offline
- [ ] Log every city-triggered automation with source/context
- [ ] Preserve Guardian/Gideon safety gates and Forge audit trail

## Phase 8 — Test and promotion gate

- [ ] Static JavaScript and runtime route checks
- [ ] All-operator identity, nameplate, and E interaction tests
- [ ] All building console and voice/call tests
- [ ] Routine/workflow listing and safe run-now tests
- [ ] Cross-city context test
- [ ] Rift → Omnis/Sage → Forge handoff test
- [ ] Approval-block and building spawn/update tests
- [ ] Reload/recovery test
- [ ] Final runtime promotion review

## Prototype-first operating rule

- Star Vibes changes land in the desktop prototype first.
- T2R/Overseer/Void links use the `/prototype/` namespace while testing.
- Shared operator visualizers remain `/agents/{id}/visualizer.html` because the
  prototype bridge serves the same operator assets; they are not copied into a
  second visualizer tree.
- No runtime promotion happens until the test phase is complete and the system
  has been used long enough to expose real workflow failures.
- The runtime is a clean promotion target, not the active development target.

## Current bounded next item

- [x] Implement operator capability-domain mapping projection
- [ ] Add read-only in-world automation browser
- [ ] Do not trigger production automations until the test harness exists

## Ordered next execution queue

These are the next seven implementation gates, in dependency order. Complete and test each gate before starting the next one.

1. **Collision-aware road/path movement**
- [x] Keep dispatched operators on valid road/sidewalk segments.
- [x] Prevent movement through building colliders, water, and blocked lots.
   - [ ] Add walking, waiting, rerouting, blocked, and arrived states.
   - [ ] Test dispatch to every authored building drop-off point.

2. **Operator vehicle ownership and entry/exit**
   - [ ] Reuse the existing `PlayerCar` vehicle geometry and physics primitives.
- [x] Add a vehicle projection to operator state without duplicating the player garage.
- [x] Support summon, exit, park, dock, land, and return-to-foot behavior.
- [x] Keep vehicle actions collision- and water-aware for car and boat dispatch.
- [x] Add flying-car dispatch using the existing `PlayerFlyer` physics.

3. **NPC driving between building drop-offs**
   - [ ] Convert road waypoints into driveable routes.
   - [ ] Drive operators between registered `BRANDS[*].dropoff` points.
   - [ ] Handle intersections, arrival radius, parking, and rerouting.
   - [ ] Show en-route/driving/parked/arrived status in the nameplate and minimap.

4. **Vehicle parking and arrival states**
   - [x] Persist the operator’s vehicle, route, destination, and arrival state.
- [x] Reconcile the local projection with the Void task record after reload.
   - [ ] Mark stale, cancelled, blocked, and completed travel honestly.

5. **Backend reconciliation after reload**
   - [ ] Load the existing task record by task ID.
   - [ ] Restore the operator’s assigned city, building, destination, and status.
   - [ ] Disable movement actions when the required runtime is unavailable.
   - [ ] Test browser refresh, bridge restart, backend restart, and recovery.

6. **Operator-to-operator meeting and handoff flow**
   - [x] Identify the existing handoff/event primitive in Void/Elfie before coding.
   - [x] Route one operator to another operator’s live `operatorAt` position.
   - [x] Preserve task ID, sender, receiver, role context, city, and approval state.
   - [ ] Test Rift → Omnis/Sage → Forge with Forge approval still enforced.

7. **Completion announcements through Elfie daemon**
   - [ ] Subscribe to the existing task completion/event source.
   - [ ] Send completion events through the existing Elfie daemon operator path.
   - [ ] Keep browser text/captions silent for audio; daemon remains the only speaker.
   - [ ] Test completed, failed, cancelled, blocked, and approval-required announcements.

## Final acceptance

1. Walk to an operator and see identity, role, city, building, and status.
2. Press `E` and open the same real T2R/Elfie operator console.
3. Trigger a safe existing automation with Star Vibes context.
4. Observe the result in Elfie/Overseer and in the city.
5. Complete one real cross-operator handoff.
6. Confirm Forge cannot execute an approval-gated build without authorization.
