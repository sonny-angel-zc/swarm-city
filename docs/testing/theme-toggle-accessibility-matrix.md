# Theme Toggle Accessibility E2E Matrix (SWA-65)

## Scope

This matrix defines SWA-65 subtask 2/7: explicit, testable accessibility acceptance criteria for the dashboard theme toggle.

## Accessibility Acceptance Criteria (Subtask 2/7)

1. `AC-TT-01` Keyboard Tab order must reach the theme toggle in deterministic top-bar sequence:
   `task-input` -> `create-task-button` -> `model-preset-select` (when visible) -> `theme-toggle-switch`.
2. `AC-TT-02` Theme toggle must expose switch semantics at all times:
   - element is queryable as `role="switch"`
   - dark mode maps to `aria-checked="true"`
   - light mode maps to `aria-checked="false"`
3. `AC-TT-03` Pressing `Space` on focused toggle must activate exactly one transition per keypress and keep focus on the toggle for both starting themes (`dark` and `light`).
4. `AC-TT-04` Pressing `Enter` on focused toggle must activate exactly one transition per keypress and keep focus on the toggle for both starting themes (`dark` and `light`).
5. `AC-TT-05` Post-activation state must remain coupled across semantics and product state:
   - `aria-checked`
   - `aria-label`
   - `data-theme-current`
   - `data-theme-target`
   - `<html data-theme>`
   - persisted `localStorage['swarm:theme']`
6. `AC-TT-06` Dark and light themes must satisfy explicit contrast thresholds for required probes:
   - text probes `>= 4.5:1`
   - non-text probes `>= 3.0:1`
7. `AC-TT-07` Any mismatch in focusability, keyboard activation, role/state semantics, or contrast threshold is a hard fail for E2E acceptance.

## Core Assertion Matrix

| ID | Focus Area | Preconditions | Interaction | Required Assertions | Pass Criteria | Fail Criteria |
| --- | --- | --- | --- | --- | --- | --- |
| `TT-A11Y-01` | Tab focus behavior | Initial page load in default theme. | Press `Tab` repeatedly from no focused element. | Focus order is: task input -> create task button -> preset select -> theme toggle. Toggle receives visible keyboard focus. | Theme toggle is reachable in expected top-bar keyboard order without pointer input. | Toggle is skipped, unreachable, or appears before required controls. |
| `TT-A11Y-02` | Switch semantics | Toggle rendered in DOM (dark or light state). | Query with `getByRole('switch')`. | Toggle exposes `role="switch"` and state-reflective accessible name (`Switch to light mode` when dark, `Switch to dark mode` when light). | Semantic role and label are present and valid for both states. | Missing role/label or stale label that does not reflect next action. |
| `TT-A11Y-03` | Keyboard activation with `Space` | Toggle focused, starting in dark or light theme. | Press `Space` once. | Toggle remains focused; exactly one transition occurs; `aria-checked`, `aria-label`, `<html data-theme>`, `data-theme-current`, `data-theme-target`, and `localStorage['swarm:theme']` update to the matching target state. | One-and-only-one state transition with full semantic and state coupling in both starting themes. | No transition, multiple transitions, focus loss, or any semantic/product-state mismatch. |
| `TT-A11Y-04` | Keyboard activation with `Enter` | Toggle focused, starting in dark or light theme. | Press `Enter` once. | Toggle remains focused; exactly one transition occurs; `aria-checked`, `aria-label`, `<html data-theme>`, `data-theme-current`, `data-theme-target`, and `localStorage['swarm:theme']` update to the matching target state. | One-and-only-one state transition with full semantic and state coupling in both starting themes. | No transition, multiple transitions, focus loss, or any semantic/product-state mismatch. |
| `TT-A11Y-05` | Contrast threshold in dark mode | Theme is dark. | Resolve runtime computed foreground/background pairs and calculate contrast ratio. | Required text probes are `>= 4.5:1`; required non-text indicator probe is `>= 3.0:1`. | All required dark-mode probes meet their thresholds. | Any required dark-mode probe is below its threshold. |
| `TT-A11Y-06` | Contrast threshold in light mode | Theme toggled to light. | Resolve runtime computed foreground/background pairs and calculate contrast ratio. | Required text probes are `>= 4.5:1`; required non-text indicator probe is `>= 3.0:1`. | All required light-mode probes meet their thresholds. | Any required light-mode probe is below its threshold. |

## Aria-Checked Transition Matrix

| Key | Starting Theme | Before | After | Required Coupled Assertions |
| --- | --- | --- | --- | --- |
| `Space` | `dark` | `aria-checked="true"`, `data-theme="dark"` | `aria-checked="false"`, `data-theme="light"` | `aria-label="Switch to dark mode"`, `data-theme-current="light"`, `data-theme-target="dark"`, `localStorage['swarm:theme']="light"` |
| `Space` | `light` | `aria-checked="false"`, `data-theme="light"` | `aria-checked="true"`, `data-theme="dark"` | `aria-label="Switch to light mode"`, `data-theme-current="dark"`, `data-theme-target="light"`, `localStorage['swarm:theme']="dark"` |
| `Enter` | `dark` | `aria-checked="true"`, `data-theme="dark"` | `aria-checked="false"`, `data-theme="light"` | `aria-label="Switch to dark mode"`, `data-theme-current="light"`, `data-theme-target="dark"`, `localStorage['swarm:theme']="light"` |
| `Enter` | `light` | `aria-checked="false"`, `data-theme="light"` | `aria-checked="true"`, `data-theme="dark"` | `aria-label="Switch to light mode"`, `data-theme-current="dark"`, `data-theme-target="light"`, `localStorage['swarm:theme']="dark"` |

## Keyboard Activation Coverage Matrix

| ID | Key | Starting Theme | Expected Result Theme | Pass | Fail |
| --- | --- | --- | --- | --- | --- |
| `TT-A11Y-03A` | `Space` | `dark` | `light` | Focus stays on toggle and all coupled state updates match `light`. | Toggle not focused, duplicate transition, or any state mismatch. |
| `TT-A11Y-03B` | `Space` | `light` | `dark` | Focus stays on toggle and all coupled state updates match `dark`. | Toggle not focused, duplicate transition, or any state mismatch. |
| `TT-A11Y-04A` | `Enter` | `dark` | `light` | Focus stays on toggle and all coupled state updates match `light`. | Toggle not focused, duplicate transition, or any state mismatch. |
| `TT-A11Y-04B` | `Enter` | `light` | `dark` | Focus stays on toggle and all coupled state updates match `dark`. | Toggle not focused, duplicate transition, or any state mismatch. |

## Contrast Assertion Set

| Probe ID | Foreground Token | Background Token | Minimum Ratio | Applies To |
| --- | --- | --- | --- | --- |
| `body-primary-on-canvas` | `--text-primary` | `--bg-canvas` | `4.5:1` | Dark + Light |
| `body-secondary-on-canvas` | `--text-secondary` | `--bg-canvas` | `4.5:1` | Dark + Light |
| `body-primary-on-panel` | `--text-primary` | `--bg-panel` | `4.5:1` | Dark + Light |
| `theme-toggle-text-on-toggle-bg` | `--theme-toggle-text` | `--theme-toggle-bg` | `4.5:1` | Dark + Light |
| `theme-toggle-icon-text-on-icon-bg` | `--theme-toggle-icon-text` | `--theme-toggle-icon-bg` | `4.5:1` | Dark + Light |
| `theme-toggle-indicator-on-toggle-bg` | `--theme-toggle-indicator` | `--theme-toggle-bg` | `3.0:1` | Dark + Light |

## Notes

- Contrast checks intentionally use runtime computed CSS values to validate shipped tokens, not hard-coded hex assumptions.
- Keyboard assertions validate interaction parity and semantic state alignment (`role`, `aria-checked`, label, and theme dataset).

## Test Mapping (Subtask 2/7)

- `TT-A11Y-01`: Covered by Playwright test `TT-A11Y-01 moves focus to theme toggle using keyboard-only Tab navigation` in `tests/theme-toggle.spec.ts`.
- `TT-A11Y-02`: Covered by Playwright test `TT-A11Y-02 keeps switch semantics and updates ARIA state on repeated interactions` in `tests/theme-toggle.spec.ts`.
- `TT-A11Y-03`: Covered by Playwright test `TT-A11Y-03 toggles theme with Space key from dark to light with deterministic state updates` in `tests/theme-toggle.spec.ts`.
- `TT-A11Y-04`: Covered by Playwright test `TT-A11Y-04 toggles theme with Enter key from light to dark with deterministic state updates` in `tests/theme-toggle.spec.ts`.
- `TT-A11Y-05`: Covered by Playwright test `TT-A11Y-05/TT-A11Y-06 meets WCAG AA contrast thresholds for key theme foreground/background combinations` while `data-theme="dark"`.
- `TT-A11Y-06`: Covered by Playwright test `TT-A11Y-05/TT-A11Y-06 meets WCAG AA contrast thresholds for key theme foreground/background combinations` after toggling to `data-theme="light"`.
