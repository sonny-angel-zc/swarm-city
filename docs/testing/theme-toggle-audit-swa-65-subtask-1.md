# SWA-65 Subtask 1/7: Audit Existing Theme Toggle and Test Infrastructure

## Scope

Issue: `SWA-65 Add End-to-End Accessibility Assertions for Theme Toggle`

This audit identifies:
- existing theme-toggle selectors and state contracts,
- existing accessibility semantics and keyboard behavior,
- reusable Playwright/a11y utilities for follow-on subtasks.

## Implementation Audit (current repository)

### Theme toggle selectors and state attributes

Source: `src/components/TopBar.tsx`

- Primary control selector: `button[data-testid="theme-toggle-switch"]`.
- Related deterministic selectors:
  - `[data-testid="theme-toggle-icon"]`
  - `[data-testid="theme-toggle-label"]`
  - `[data-testid="theme-toggle-indicator"]`
- State attributes already exposed for deterministic assertions:
  - `data-theme-current`
  - `data-theme-target`
  - `data-theme-switch-checked`

### Existing accessibility attributes

Source: `src/components/TopBar.tsx`, `src/core/theme.ts`

- Explicit switch semantics are present:
  - `role="switch"`
  - `aria-checked` derived from `resolveThemeToggleUiState(theme).isChecked`
  - `aria-label` is action-oriented:
    - dark -> `Switch to light mode`
    - light -> `Switch to dark mode`
- `title` mirrors semantic state copy for UX/tooling visibility.
- Decorative children use `aria-hidden="true"` for icon/indicator.

### Keyboard behavior

- No custom `onKeyDown` handler is implemented on the toggle.
- Keyboard activation relies on native `<button>` behavior:
  - `Space` and `Enter` dispatch `click`, invoking `onClick={() => applyTheme(...)}`
- Focus styling for keyboard users is implemented via `focus-visible:*` classes on the toggle.
- Tab-order dependency for keyboard-only navigation is currently:
  - `task-input` -> `create-task-button` -> `model-preset-select` (if visible) -> `theme-toggle-switch`
  - `model-preset-select` visibility is responsive (`hidden md:flex` container).

### Root theme + persistence coupling

Source: `src/components/TopBar.tsx`, `src/core/theme.ts`, `app/layout.tsx`

- Default SSR state: `<html class="dark" data-theme="dark">`.
- Runtime toggle coupling is already explicit:
  - dark theme: `html.dark` present, `data-theme="dark"`
  - light theme: `html.dark` removed, `data-theme="light"`
- Local persistence key is stable: `localStorage['swarm:theme']`.

## Playwright and A11y Test Infrastructure Audit

### Reusable fixtures/harnesses

Sources: `tests/support/themeToggleFixtures.ts`, `tests/support/themeToggleHarness.ts`, `tests/support/dashboardFixtures.ts`

- `prepareThemeHarness(...)` clears cookies/storage and installs deterministic API mocks.
- `seedStoredThemeBeforeNavigation(...)` supports controlled pre-navigation theme state.
- `gotoDashboardReady(...)` blocks until toggle is visible and loading UI is gone.
- Core reusable assertion helpers:
  - `expectThemeState(...)`
  - `expectThemeToggleState(...)`
  - `expectThemeToggleVisualState(...)`
  - `focusThemeToggleViaTab(...)`
  - `beginThemeTransitionCapture(...)` / `endThemeTransitionCapture(...)`

### Existing accessibility/contrast utilities

Source: `tests/support/themeToggleA11yHarness.ts`

- `expectVisibleKeyboardFocus(...)` validates computed focus indicator styles.
- `expectThemeContrastToMeetWcagAa(...)` performs runtime contrast checks using computed styles and WCAG ratio math.
- Current built-in probe coverage:
  - token probes: `body-primary-on-canvas`, `body-secondary-on-canvas`, `body-primary-on-panel`
  - element probe: `theme-toggle-text-on-toggle-bg`

### Playwright runtime setup

Source: `playwright.config.ts`

- Cross-browser projects: Chromium, Firefox, WebKit.
- Local web server auto-starts (`next dev` locally, `next start` in CI) unless `PLAYWRIGHT_SKIP_WEBSERVER=1`.
- Default base URL: `http://127.0.0.1:3000`.

## Coverage Snapshot (for subtask 1/7)

Source: `tests/theme-toggle.spec.ts`

- Already covered:
  - switch semantics and ARIA transitions (`TT-A11Y-02`)
  - keyboard tab reachability and focus indicator (`TT-A11Y-01`)
  - `Space` activation parity and single-transition capture (`TT-A11Y-03`)
  - `Enter` activation parity and single-transition capture (`TT-A11Y-04`)
  - WCAG contrast checks in both themes (`TT-A11Y-05/06`) for current probe list

## Actionable Implementation Guidance

1. Reuse `themeToggleHarness` helpers for all new assertions; do not duplicate low-level ARIA/theme/storage checks inline.
2. Keep selector strategy split:
   - interaction/state reads: `getByTestId(...)`
   - semantic guardrail: at least one `getByRole('switch', { name: ... })`.
3. Preserve native keyboard activation path (no custom key handlers) and validate single-transition behavior with transition-capture helpers.
4. For contrast expansion subtasks, extend probe metadata in `tests/support/themeToggleA11yHarness.ts` rather than adding ad hoc contrast logic in spec files.
5. Maintain viewport-aware focus-order logic through `focusThemeToggleViaTab(...)` because preset select is conditionally visible.

## Audit Outcome

- Theme toggle implementation already exposes stable selectors, switch semantics, and deterministic state metadata suitable for E2E accessibility assertions.
- Playwright infrastructure already provides deterministic setup and reusable helpers for keyboard, semantics, state coupling, and contrast checks.
- Subtasks 2-7 should focus on incremental assertion/probe expansion using existing harness primitives.
