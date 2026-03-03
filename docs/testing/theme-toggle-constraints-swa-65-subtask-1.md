# SWA-65 Subtask 1/5: Research Constraints for Theme Toggle Accessibility E2E Assertions

## Scope

Audit repository architecture and test constraints for adding end-to-end accessibility assertions to the dashboard theme toggle, then provide implementation-ready guidance for SWA-65 subtasks 2-5.

## Current Architecture Snapshot (Verified)

- Implementation surface:
  - `src/components/TopBar.tsx`: `button[data-testid="theme-toggle-switch"]` with `role="switch"`, `aria-checked`, dynamic `aria-label`, and focus-visible ring styles.
  - `src/core/theme.ts`: source-of-truth mapping for toggle UI contract via `resolveThemeToggleUiState(...)`.
- Theme state coupling:
  - `<html data-theme="dark|light">` always reflects current theme.
  - `<html class="dark">` is present only in dark mode.
  - persisted preference key: `localStorage['swarm:theme']`.
- Test assets:
  - `tests/theme-toggle.spec.ts`: behavior and accessibility scenarios `TT-A11Y-01..06`.
  - `tests/support/themeToggleHarness.ts`: deterministic setup + coupled state assertions.
  - `tests/support/themeToggleA11yHarness.ts`: keyboard focus and contrast helpers.

## Hard Constraints

1. Deterministic setup is mandatory
- Use `prepareThemeHarness(...)` + `gotoThemeDashboard(...)` flow from fixtures/harness.
- Skipping deterministic setup risks storage/cookie leakage and flaky state assertions.

2. Assertions must validate coupled state, not single attributes
- Every activation path must keep these in sync:
  - toggle semantics (`role="switch"`, `aria-checked`, accessible name),
  - root state (`html[data-theme]`, `html.dark`),
  - persistence (`localStorage['swarm:theme']`) for user-triggered changes.

3. Keyboard order is responsive-aware
- `model-preset-select` is within `hidden md:flex`; focus-order assertions must remain conditional when this element is not visible.
- Current helper (`focusThemeToggleViaTab`) already handles this and should remain the single focus-order primitive.

4. Locator strategy must remain split between stability and accessibility contract
- Use `getByTestId('theme-toggle-switch')` for deterministic interaction.
- Keep explicit role-based assertion(s) such as `getByRole('switch', { name: ... })` to guard accessibility semantics.

5. Contrast checks must be runtime-computed
- Theme values come from CSS variables and runtime DOM state; hardcoded hex comparisons are insufficient.
- Contrast assertions should resolve colors via `getComputedStyle` in browser context.

6. Environment constraints affect validation strategy
- `playwright.config.ts` launches a local server on `127.0.0.1:3000` by default.
- Restricted environments may block local bind/listen; use lightweight checks there and run full Playwright validation in a standard dev/CI environment.

## Verified Gap vs Required SWA-65 Coverage

- `docs/testing/theme-toggle-accessibility-matrix.md` requires:
  - `theme-toggle-icon-text-on-icon-bg` (`>= 4.5:1`)
  - `theme-toggle-indicator-on-toggle-bg` (`>= 3.0:1`)
- Current `tests/support/themeToggleA11yHarness.ts` does not yet include these probes in `THEME_TOKEN_CONTRAST_PROBES`/element probes.
- Result: keyboard and switch semantics are covered, but contrast coverage is incomplete against documented SWA-65 acceptance criteria.

## Actionable Implementation Guidance (Subtasks 2-5)

1. Subtask 2: Lock contract references
- Keep `docs/testing/theme-toggle-accessibility-matrix.md` as the acceptance source.
- Ensure `tests/theme-toggle.spec.ts` test names and IDs (`TT-A11Y-01..06`) remain stable for traceability.

2. Subtask 3: Keep harness-first assertion flow
- Extend or reuse helpers in:
  - `tests/support/themeToggleHarness.ts`
  - `tests/support/themeToggleA11yHarness.ts`
- Avoid duplicating ARIA/theme/storage checks inline across tests.

3. Subtask 4: Close contrast coverage gap
- Update `tests/support/themeToggleA11yHarness.ts` probe definitions to include:
  - `theme-toggle-icon-text-on-icon-bg` (`--theme-toggle-icon-text` on `--theme-toggle-icon-bg`, `4.5`)
  - `theme-toggle-indicator-on-toggle-bg` (`--theme-toggle-indicator` on `--theme-toggle-bg`, `3.0`)
- Keep existing runtime contrast calculation path unchanged; add probes only.

4. Subtask 5: Targeted validation and evidence
- Primary validation command:
  - `npx playwright test tests/theme-toggle.spec.ts --project=chromium`
- If local bind is unavailable, run at minimum:
  - `npx playwright test tests/theme-toggle.spec.ts --project=chromium --list`
  - then execute full run in CI or an unrestricted local environment.

## Implementation Checklist

- [ ] Preserve `TopBar` switch semantics contract (`role`, ARIA, focus-visible styles).
- [ ] Keep `focusThemeToggleViaTab(...)` as the only keyboard-order helper.
- [ ] Maintain mixed locator strategy (test ID for interaction, role/name for accessibility guardrails).
- [ ] Add missing icon and indicator contrast probes.
- [ ] Validate `TT-A11Y-01..06` on Chromium and record output status.
