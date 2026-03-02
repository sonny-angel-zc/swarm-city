# SWA-65 Subtask 1/8: Theme Toggle Accessibility Audit

## Scope

Audit current implementation and Playwright coverage for:
- keyboard interactions
- switch semantics
- contrast assertions

## Current Implementation Snapshot

- Theme toggle UI lives in `src/components/TopBar.tsx`.
- Toggle is a native `<button>` with:
  - `role="switch"`
  - `aria-checked={isDarkTheme}`
  - stateful `aria-label` (`Switch to light mode` / `Switch to dark mode`)
  - `focus-visible` ring classes for keyboard focus affordance
- Theme state is applied to `<html>` via:
  - `class="dark"` for dark mode
  - `data-theme="dark|light"`
  - persisted key: `localStorage['swarm:theme']`

## Existing Playwright Coverage

Primary spec: `tests/theme-toggle.spec.ts`

- Baseline theme behavior:
  - default dark load
  - restore persisted light preference
  - invalid stored preference fallback
  - click toggle + persistence after reload
- Accessibility coverage aligned to matrix IDs:
  - `TT-A11Y-01`: keyboard Tab sequence reaches toggle
  - `TT-A11Y-02`: switch semantics and ARIA state transitions
  - `TT-A11Y-03`: Space toggles dark -> light and updates ARIA/theme/storage
  - `TT-A11Y-04`: Enter toggles light -> dark and updates ARIA/theme/storage
  - `TT-A11Y-05/06`: runtime contrast-ratio assertions in dark and light themes

## Selector Strategy Assessment

Current selectors mostly rely on accessibility queries (`getByRole`, accessible names), which is the right default.

Observed fragility points:

1. Tab-order helper relies on exact UI text
- Placeholder text: `getByPlaceholder('Enter a task for the swarm to execute...')`
- Button label with symbol: `getByRole('button', { name: 'Create Task →' })`
- These are vulnerable to copy edits or localization.

2. Tab-order helper assumes desktop-only focus path
- Helper expects: input -> create button -> preset combobox -> theme switch.
- `Preset` control is hidden under `md` breakpoint, so this sequence is viewport-dependent.

3. Toggle locator is broad in semantic test
- `TT-A11Y-02` uses `getByRole('switch')` with no unique anchor.
- Works now because only one switch exists; brittle if another switch is added.

## Gap Analysis vs SWA-65 Requirements

### Keyboard interactions

- Covered: Tab reachability, Space activation, Enter activation.
- Gap: no direct assertion that the focus indicator is visually present when focused.
- Gap: no viewport-agnostic focus-order test path.

### Switch semantics

- Covered: `role="switch"`, `aria-checked`, dynamic label updates, accessible name.
- Gap: switch selector uniqueness should be hardened for future additional switches.

### Contrast assertions

- Covered: WCAG AA threshold (`>= 4.5:1`) using computed CSS values in both themes.
- Gap: current probes validate key token pairs, but not an explicit focus-ring contrast/visibility check.
- Gap: contrast checks are not tied to a stable element-level test hook for the toggle itself.

## Actionable Implementation Guidance

1. Add stable test hooks for toggle and top-bar controls
- Add `data-testid="theme-toggle-switch"` to theme toggle.
- Add optional test ids for keyboard-order anchors (`task-input`, `create-task-button`, `model-preset-select`) to decouple tests from copy.

2. Make keyboard-order assertion viewport-aware
- Use a helper that conditionally includes `Preset` only when visible, or split into:
  - desktop focus-order test
  - mobile focus-order test

3. Assert visible focus affordance
- After focusing the toggle with keyboard, assert effective focus styling (for example by checking non-`none` outline/ring-related computed style).

4. Harden switch semantics selector
- In semantics test, target `getByTestId('theme-toggle-switch')` and still assert role/name/aria.
- Keep at least one `getByRole('switch', { name: /Switch to (light|dark) mode/ })` assertion for accessibility contract.

5. Extend contrast coverage minimally
- Keep token-level checks.
- Add a direct computed-style contrast assertion for the actual toggle text on actual toggle background (not only synthetic probes).

## Recommended Execution Order (Subtasks 2-8)

1. Introduce stable selectors/test ids in `TopBar`.
2. Refactor focus-order helper to support desktop/mobile paths.
3. Add focus-visible assertion for keyboard focus.
4. Tighten switch selector uniqueness while preserving role/name checks.
5. Extend contrast assertions to include the real toggle element.
6. Run `tests/theme-toggle.spec.ts` across Chromium first.
7. Run cross-browser project matrix for the same spec.

