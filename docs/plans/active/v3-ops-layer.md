# V3 Ops Layer

## Objective
Ship an operations layer that keeps planning artifacts visible during execution and reduces context loss between agent cycles.

## Tracks

### Track 1: Runtime Observability
- Add richer event streams for task, agent, and tool phases.
- Surface latency and throughput at the session level.

### Track 2: Budget Guardrails
- Track spend by role and by task phase.
- Add configurable budget ceilings and warning thresholds.

### Track 3: Plan Registry + Document Memory + DocsPanel UI
- Introduce a plan registry that indexes active plans, references, and notes.
- Create document memory pins so important snippets survive long sessions.
- Add a DocsPanel in the sidebar for search, filtering, selection, and memory review.

## Track 3 Deliverables
- `src/core/planRegistry.ts`: typed registry + search + memory extraction helpers.
- `src/core/store.ts`: docs registry state and document memory actions.
- `src/components/DocsPanel.tsx`: UI for browsing docs and pinned memory.
- `src/components/Sidebar.tsx`: integration point for DocsPanel.

## Definition Of Done
- Docs are indexed into a registry on app load.
- Users can filter/search docs from the panel.
- Users can pin and remove memory snippets.
- Selected doc preview updates in-place.
