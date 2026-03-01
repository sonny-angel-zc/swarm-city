# Linear Integration Spec

## Context
We have a Linear workspace at linear.app/swarm-city with:
- Team: "Swarm City" (key: SWA, id: 8687f779-d37c-49dc-82bf-3f2177df56a8)
- API key available via env var LINEAR_API_KEY
- GraphQL endpoint: https://api.linear.app/graphql

## Current State
- `src/core/linearSync.ts` has mock/stub data
- `src/components/BacklogPanel.tsx` renders BacklogItem[] from store
- `src/core/types.ts` defines BacklogItem, LinearSyncState, etc.

## Your Job
Replace the mock with REAL Linear API integration:

### 1. `src/core/linearSync.ts` — Full rewrite
- Use fetch() to call Linear GraphQL API (no SDK dep)
- API key from: `process.env.NEXT_PUBLIC_LINEAR_API_KEY` (client-side) or create a Next.js API route
- Actually, create a Next.js API route at `src/app/api/linear/route.ts` for server-side calls (keeps API key secure)
- Implement these operations:
  - `fetchIssues(teamId)` → get all issues for team SWA
  - `createIssue(title, description, priority, status)` → create new issue
  - `updateIssueStatus(issueId, status)` → update issue status
  - `syncFromLinear()` → fetch all issues and map to BacklogItem[]
- Map Linear statuses to our BacklogStatus: Todo→todo, In Progress→in_progress, Done→done, Canceled→done
- Map Linear priorities (0-4) to our BacklogPriority: 0→P3(none), 1→P0(urgent), 2→P1(high), 3→P2(medium), 4→P3(low)
- Update BacklogSource type to include 'linear' (not just 'linear_stub')

### 2. `src/app/api/linear/route.ts` — New API route
- POST handler that proxies Linear GraphQL requests
- Reads LINEAR_API_KEY from process.env (server-side only)
- Supports actions: list, create, update
- Returns typed JSON responses

### 3. `src/core/types.ts` — Update types
- Add 'linear' to BacklogSource
- Add linearId field to BacklogItem (the real Linear issue ID)
- Add linearUrl field to BacklogItem (link to linear.app)

### 4. `src/components/BacklogPanel.tsx` — Upgrade
- Add "Sync from Linear" button that triggers real sync
- Show sync status (last synced, syncing indicator)
- Add "Create Issue" button with a simple form (title, priority)
- Issues link to their Linear URL
- Status changes in the panel should push back to Linear
- Show the SWA-### identifier

### 5. `src/core/store.ts` — Wire it up
- Replace fetchLinearBacklogStub calls with real syncFromLinear
- Add actions: syncLinear, createLinearIssue, updateLinearIssueStatus
- Track sync state properly

### 6. Environment
- Add LINEAR_API_KEY to `.env.local` (create the file)
- Value: $LINEAR_API_KEY

### Important
- No new npm dependencies — use native fetch for GraphQL
- Keep existing UI patterns from BacklogPanel
- Make it work with `npm run dev`
- Commit when done

When completely finished, run: openclaw system event --text "Done: Linear real integration — API route + sync + create/update issues" --mode now
