# SWA-66 Subtask 1/6: Theme Surface Coverage + Test Infrastructure Audit

## Objective

Provide implementation anchors for theme regression guardrails by:
- mapping target dashboard surfaces and stable selectors,
- inventorying current test infrastructure (unit/visual/snapshot),
- locating existing theme-toggle implementation points to reuse in new tests.

## Dashboard Surface Coverage (Audited Targets)

| Surface | Component | Primary selector(s) | Notes |
| --- | --- | --- | --- |
| Top bar | `src/components/TopBar.tsx` | `[data-testid="dashboard-topbar"]` | Uses semantic theme vars for root background/border/text. |
| Sidebar | `src/components/Sidebar.tsx` | `[data-testid="dashboard-sidebar"]` | Uses semantic theme vars for container; contains hardcoded status colors in descendants. |
| Activity feed | `src/components/ActivityFeed.tsx` | `[data-testid="dashboard-activity-feed"]` | Root is theme-tokenized; content includes hardcoded state colors. |
| Task input (top bar field) | `src/components/TopBar.tsx` | `[data-testid="task-input"]` | Uses `--bg-panel-muted`, `--border-subtle`, `--accent-primary`. |
| Task input (floating root + field) | `src/components/TaskInput.tsx` | `[data-testid="dashboard-task-input-floating"]`, `[data-testid="task-input-floating-field"]` | Root participates in audited surfaces; input uses semantic vars but still has hardcoded shadow/state classes nearby. |

Canonical selector registry used by tests:
- `tests/support/themeToggleHarness.ts` (`DASHBOARD_TEST_IDS`)
- `tests/support/themeSurfaceFixtures.ts` (`AUDITED_SURFACE_SELECTORS`, `AUDITED_SURFACE_ROOTS`)

## Where Theme Toggling Is Already Implemented

Theme system source-of-truth:
- `src/core/theme.ts`
  - `DASHBOARD_THEME_TOKENS` (dark/light token values),
  - `resolveInitialDashboardTheme` (storage/default resolution),
  - `resolveThemeToggleUiState` (switch ARIA/data/label contract),
  - `THEME_STORAGE_KEY = 'swarm:theme'`.

Runtime toggle wiring:
- `src/components/TopBar.tsx`
  - `applyTheme(nextTheme, persist)` mutates `document.documentElement`:
    - dark => `class="dark"` + `data-theme="dark"`
    - light => remove `dark` class + `data-theme="light"`
  - Persists user choice to `localStorage['swarm:theme']`.
  - Toggle control: `[data-testid="theme-toggle-switch"]` with `role="switch"` and explicit `data-theme-*` state attributes.

Initial render baseline:
- `app/layout.tsx` defaults SSR HTML to dark (`className="dark" data-theme="dark"`), then client hydration in `TopBar` reconciles stored preference.

## Current Test Infrastructure (Unit / Visual / Snapshot)

### Unit tests
- No dedicated unit-test runner/framework is configured (`vitest`/`jest` not present in `package.json`).
- Theme behavior is currently validated through Playwright E2E + harness assertions.

### Visual tests
- No pixel screenshot snapshot assertions are currently used (`toHaveScreenshot` not present).
- Visual-style coverage is implemented via computed-style assertions in Playwright.

### Snapshot-style tests (semantic, not image snapshots)
- `tests/theme-regression.spec.ts` is the active guardrail suite.
- Uses semantic style snapshots from `tests/support/themeRegressionHarness.ts`:
  - `captureSurfaceSnapshot`
  - `collectHardcodedColorFingerprint`
  - root CSS var contract reads/resolution helpers.
- Contract values and audited slot mappings live in:
  - `tests/support/themeSurfaceTokenExpectations.ts`.

Supporting deterministic test setup:
- `tests/support/dashboardFixtures.ts` mocks backend endpoints.
- `tests/support/themeToggleFixtures.ts` + `tests/support/themeToggleHarness.ts` clear storage, seed theme, and gate page readiness.

## Actionable Guidance For New Regression Tests

1. Reuse existing audited selector constants, do not add ad-hoc selectors.
   - Use `DASHBOARD_TEST_IDS` and `AUDITED_SURFACE_SELECTORS`.
2. Anchor all theme state assertions to root contract + toggle contract together.
   - Assert `<html data-theme>`, dark class presence/absence, and toggle `data-theme-*` + ARIA state in one flow.
3. Keep semantic snapshot approach (computed CSS), not image snapshots.
   - Extend `captureSurfaceSnapshot` only when adding new audited slots.
4. Keep token contract expectations centralized.
   - Update `THEME_SEMANTIC_CSS_VAR_CONTRACT` and `AUDITED_SURFACE_STATE_TOKEN_EXPECTATIONS` first, then assert in spec.
5. Maintain hardcoded-color guardrails for audited roots.
   - Continue `collectHardcodedColorFingerprint` checks for disallowed literal palette classes/inline colors.

## Validation Commands For This Subtask

- Targeted theme guardrail run:
  - `npm run test:theme:guardrails`
- Theme toggle behavior run:
  - `npx playwright test tests/theme-toggle.spec.ts --project=chromium`
