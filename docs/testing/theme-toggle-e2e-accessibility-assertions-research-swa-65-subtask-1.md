# SWA-65 Subtask 1/6: E2E Accessibility Assertion Research for Theme Toggle

## Scope

Issue: `SWA-65 Add End-to-End Accessibility Assertions for Theme Toggle`

This research pass identifies:
- current theme toggle implementation details,
- existing Playwright coverage and reusable helpers,
- accessibility requirements that must remain true,
- actionable implementation guidance for remaining SWA-65 subtasks.

## Repository Context

### Primary implementation files

- `src/components/TopBar.tsx`
  - Theme toggle control is `button[data-testid="theme-toggle-switch"]`.
  - Exposes `role="switch"`, `aria-checked`, stateful `aria-label`, and `title`.
  - Exposes deterministic state attributes:
    - `data-theme-current`
    - `data-theme-target`
    - `data-theme-switch-checked`
  - Uses `focus-visible` ring classes for keyboard focus indication.
- `src/core/theme.ts`
  - `resolveThemeToggleUiState(theme)` defines copy/state contract for ARIA label/title and switch checked state.
  - `THEME_STORAGE_KEY = 'swarm:theme'` defines persistence key.
  - `rootThemeClass` + `rootThemeDataset` define root document coupling (`class="dark"`, `data-theme`).
- `app/layout.tsx`
  - Baseline SSR root state: `<html className="dark" data-theme="dark">`.
- `app/globals.css`
  - Theme tokens for dark/light and theme-toggle visual contract (`--theme-toggle-*`).

### Existing Playwright assets

- `tests/theme-toggle.spec.ts`
  - Core behavior + accessibility assertions already present (`TT-A11Y-01..06`).
- `tests/support/themeToggleHarness.ts`
  - Reusable setup and coupled-state assertions:
    - `prepareThemeHarness(...)`
    - `gotoDashboardReady(...)`
    - `focusThemeToggleViaTab(...)`
    - `expectThemeState(...)`
    - `expectThemeToggleState(...)`
    - `switchTheme(...)`
- Related docs:
  - `docs/testing/theme-toggle-accessibility-matrix.md`
  - `docs/testing/theme-toggle-audit-swa-65-subtask-1.md`
  - `docs/testing/theme-toggle-constraints-swa-65-subtask-1.md`

## Accessibility Contract to Preserve

### Semantic and state contract

On every state transition, the following must stay coupled:
- Toggle semantics:
  - `role="switch"`
  - `aria-checked` reflects current theme (`dark=true`, `light=false`).
- Accessible name:
  - Action-oriented label (`Switch to light mode` in dark, `Switch to dark mode` in light).
- Root document state:
  - `<html data-theme="dark|light">`
  - `<html class~="dark">` only when dark.
- Persistence:
  - `localStorage['swarm:theme']` updates on user interaction.

### Keyboard interaction contract

- Sequential keyboard navigation reaches toggle in top-bar order:
  - task input -> create task button -> preset select (when visible) -> theme toggle.
- Toggle must expose a visible keyboard focus indicator when focused.
- Both `Space` and `Enter` must toggle theme and preserve semantic/state coupling.

### Contrast contract

Runtime computed contrast (not static hex assumptions) must remain above WCAG AA thresholds for required text and non-text pairs in both themes.
Current probes cover:
- `--text-primary` on `--bg-canvas`
- `--text-secondary` on `--bg-canvas`
- `--text-primary` on `--bg-panel`
- actual toggle element foreground/background

Additional required theme-toggle visual pairs for SWA-65 acceptance:
- `--theme-toggle-icon-text` on `--theme-toggle-icon-bg`
- `--theme-toggle-indicator` on `--theme-toggle-bg`

Coverage note:
- Existing `expectThemeContrastToMeetWcagAa(...)` currently enforces the first four probes only.
- Subtask 4 should extend probe metadata in `tests/support/themeToggleA11yHarness.ts` to include the icon and indicator pairs.

## Accessibility Acceptance Criteria (Subtask 1/6)

The SWA-65 implementation is accepted only if all criteria below pass.

| ID | Requirement | Pass Criteria | Fail Criteria |
| --- | --- | --- | --- |
| `AC-TT-01` | Keyboard Tab order reaches the toggle in deterministic top-bar order. | Starting with no focused element, repeated `Tab` reaches controls in this order: `task-input` -> `create-task-button` -> `model-preset-select` (when visible) -> `theme-toggle-switch`; toggle receives visible keyboard focus indicator. | Toggle is skipped, order is wrong, or no visible keyboard focus indicator is present when focused. |
| `AC-TT-02` | Toggle exposes switch semantics. | `theme-toggle-switch` is queryable by `role="switch"` and keeps this role after interactions. | Missing `role="switch"` at any time. |
| `AC-TT-03` | `aria-checked` truth table is accurate. | Dark theme => `aria-checked="true"`; light theme => `aria-checked="false"`; transitions match state change after each activation. | `aria-checked` is stale, inverted, or diverges from resolved theme state. |
| `AC-TT-04` | `Space` activation toggles exactly once and preserves focus. | With toggle focused, pressing `Space` performs one theme transition, keeps focus on the toggle, and updates coupled state (`aria-checked`, accessible name, `data-theme-current`, `data-theme-target`, `<html data-theme>`, persisted `localStorage['swarm:theme']`). | No toggle, multiple toggles, focus loss, or any coupled-state mismatch after keypress. |
| `AC-TT-05` | `Enter` activation toggles exactly once and preserves focus. | With toggle focused, pressing `Enter` performs one theme transition, keeps focus on the toggle, and updates coupled state (`aria-checked`, accessible name, `data-theme-current`, `data-theme-target`, `<html data-theme>`, persisted `localStorage['swarm:theme']`). | No toggle, multiple toggles, focus loss, or any coupled-state mismatch after keypress. |
| `AC-TT-06` | Contrast meets WCAG thresholds in both themes for text/icon/background pairs. | Runtime-computed contrast in dark and light themes passes all required probes and thresholds: text pairs `>= 4.5:1` (`--text-primary` on `--bg-canvas`, `--text-secondary` on `--bg-canvas`, `--text-primary` on `--bg-panel`, `--theme-toggle-text` on `--theme-toggle-bg`, `--theme-toggle-icon-text` on `--theme-toggle-icon-bg`) and non-text indicator pair `>= 3.0:1` (`--theme-toggle-indicator` on `--theme-toggle-bg`). | Any required text pair falls below `4.5:1`, or the required indicator/background pair falls below `3.0:1`, in either theme. |

### Acceptance-to-Assertion Mapping

- `AC-TT-01` -> `TT-A11Y-01` + `focusThemeToggleViaTab(...)` + `expectVisibleKeyboardFocus(...)`.
- `AC-TT-02`, `AC-TT-03` -> `TT-A11Y-02` + `expectThemeToggleState(...)`.
- `AC-TT-04` -> `TT-A11Y-03` + `expectThemeState(...)` + `expectThemeToggleVisualState(...)`.
- `AC-TT-05` -> `TT-A11Y-04` + `expectThemeState(...)` + `expectThemeToggleVisualState(...)`.
- `AC-TT-06` -> `TT-A11Y-05/TT-A11Y-06` + `expectThemeContrastToMeetWcagAa(...)`.

## Actionable Implementation Guidance (for Subtasks 2-6)

1. Keep all new assertions harness-first
- Reuse `themeToggleHarness` helpers instead of duplicating local ARIA/theme checks in tests.
- If new assertions are needed, extend harness helpers first, then consume them in spec files.

2. Preserve selector strategy split
- Use `getByTestId('theme-toggle-switch')` for deterministic interaction.
- Keep at least one role-based assertion (`getByRole('switch', { name: ... })`) as an accessibility guardrail.

3. Treat ARIA/theme/storage coupling as a hard-fail invariant
- Any toggle-path assertion (`click`, `Space`, `Enter`) should verify:
  - `aria-checked`
  - accessible name
  - `html[data-theme]`
  - `html.dark` class behavior
  - persisted value (when interaction is user-initiated)

4. Keep focus-order tests viewport-aware
- Continue the conditional preset-select check in `focusThemeToggleViaTab(...)`.
- Avoid brittle assumptions that break when responsive visibility changes.

5. Keep contrast assertions runtime-computed
- Continue resolving styles in browser context using `getComputedStyle`.
- Add probe metadata first (ID + min ratio) for all required text/icon/background pairs, then calculate contrast centrally.
- Keep thresholds explicit by probe type: `4.5:1` for text pairs and `3.0:1` for non-text indicator/background pairs.

6. Add assertions only where they increase signal
- Prioritize assertions for behavior regressions likely to ship:
  - stale ARIA label after toggle,
  - mismatched `aria-checked` vs `data-theme`,
  - missing visible focus treatment,
  - token drift that drops contrast below AA.
- Avoid duplicative checks that repeat the same invariant across many tests.

7. Close the contrast-probe delta introduced by this criteria set
- Extend `THEME_TOKEN_CONTRAST_PROBES` with:
  - `theme-toggle-icon-text-on-icon-bg` (`--theme-toggle-icon-text` on `--theme-toggle-icon-bg`, `4.5`)
  - `theme-toggle-indicator-on-toggle-bg` (`--theme-toggle-indicator` on `--theme-toggle-bg`, `3.0`)
- Keep these in the same helper so `TT-A11Y-05/06` automatically validates both themes.

## Recommended Execution Plan

1. Subtask 2: lock/refresh assertion matrix and IDs (`TT-A11Y-*`) if needed.
2. Subtask 3: harden harness helpers for any newly identified invariants.
3. Subtask 4: update `tests/theme-toggle.spec.ts` to consume helpers and add missing high-signal cases only.
4. Subtask 5: run targeted Playwright in Chromium and verify deterministic pass.
5. Subtask 6: publish traceability map from each requirement to exact test assertions.

## Targeted Validation Command

- `npx playwright test tests/theme-toggle.spec.ts --project=chromium`

## Research Conclusion

Current implementation and tests satisfy keyboard interaction and switch semantic requirements, and satisfy baseline text contrast checks. To meet the full Subtask 1/6 criteria defined here, contrast probes still need to add explicit coverage for icon and indicator visual pairs in both themes.
