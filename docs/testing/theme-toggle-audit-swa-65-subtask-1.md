# SWA-65 Subtask 1/6: Audit Existing Toggle Behavior and Test Infrastructure

## Scope

Issue: `SWA-65 Add End-to-End Accessibility Assertions for Theme Toggle`

This audit verifies:
- current theme-toggle behavior and state coupling,
- current e2e accessibility test infrastructure,
- concrete assertion coverage gaps to address in later subtasks.

## Current Toggle Behavior (verified against source)

Source files:
- `src/components/TopBar.tsx`
- `src/core/theme.ts`
- `app/layout.tsx`
- `app/globals.css`

Observed contract:
- Toggle control: `button[data-testid="theme-toggle-switch"]`.
- Accessibility semantics:
  - `role="switch"`
  - `aria-checked` maps `dark=true`, `light=false`
  - action-oriented `aria-label` (`Switch to light mode` / `Switch to dark mode`)
- Deterministic state metadata:
  - `data-theme-current`
  - `data-theme-target`
  - `data-theme-switch-checked`
- Root coupling:
  - `html[data-theme="dark|light"]`
  - `html.dark` class present only for dark theme
- Persistence:
  - localStorage key `swarm:theme`
- Keyboard focus treatment:
  - `focus-visible` ring classes are present on the toggle button.

## E2E Accessibility Infrastructure (verified)

Primary test assets:
- `tests/theme-toggle.spec.ts`
- `tests/support/themeToggleFixtures.ts`
- `tests/support/themeToggleHarness.ts`
- `tests/support/themeToggleA11yHarness.ts`
- `playwright.config.ts`

Infrastructure behavior:
- Shared fixture setup resets localStorage/cookies and installs deterministic dashboard mocks before each test.
- `gotoThemeDashboard(...)` seeds optional stored theme state, then waits for dashboard readiness.
- Harness helpers centralize invariants:
  - theme + ARIA + root/document + storage state (`expectThemeState`, `expectThemeToggleState`)
  - keyboard tab sequencing to the toggle (`focusThemeToggleViaTab`)
  - visual label/icon checks (`expectThemeToggleVisualState`)
  - runtime contrast and focus-ring assertions (`expectThemeContrastToMeetWcagAa`, `expectVisibleKeyboardFocus`)
- Playwright config runs tests under Chromium/Firefox/WebKit with a Next.js web server unless `PLAYWRIGHT_SKIP_WEBSERVER=1`.

## Existing Coverage vs SWA-65 Assertions

Covered today:
- Keyboard path to toggle and visible keyboard focus (`TT-A11Y-01`).
- Switch semantics and repeated ARIA/state transitions (`TT-A11Y-02`).
- `Space` activation state coupling (`TT-A11Y-03`).
- `Enter` activation state coupling (`TT-A11Y-04`).
- Runtime contrast checks in both themes for:
  - `--text-primary` on `--bg-canvas`
  - `--text-secondary` on `--bg-canvas`
  - `--text-primary` on `--bg-panel`
  - computed text/background colors on `[data-testid="theme-toggle-switch"]`.

Gap requiring follow-up implementation:
- `tests/support/themeToggleA11yHarness.ts` is still missing two matrix-required probes:
  - `theme-toggle-icon-text-on-icon-bg` (`--theme-toggle-icon-text` on `--theme-toggle-icon-bg`, `>= 4.5:1`)
  - `theme-toggle-indicator-on-toggle-bg` (`--theme-toggle-indicator` on `--theme-toggle-bg`, `>= 3.0:1`)

## Actionable Implementation Guidance

1. Extend `THEME_TOKEN_CONTRAST_PROBES` in `tests/support/themeToggleA11yHarness.ts`:
   - add icon text/background probe with `minimumRatio: 4.5`
   - add indicator/toggle background probe with `minimumRatio: 3.0`
2. Keep `TT-A11Y-05/TT-A11Y-06` as the single execution path for contrast assertions so both themes inherit new probes automatically.
3. Preserve current harness-first pattern:
   - if any new invariant is needed, add helper support first, then consume in spec tests.
4. Keep mixed selector strategy:
   - `getByTestId(...)` for deterministic interaction
   - at least one `getByRole('switch', { name: ... })` assertion as semantic guardrail.

## Audit Result

- Toggle behavior contract is clear and testable.
- Test infrastructure is reusable and already aligned with harness-first accessibility assertions.
- One blocking gap remains: missing icon and indicator contrast probes in the a11y harness.
