# Theme Toggle Accessibility E2E Matrix (SWA-65)

## Scope

This matrix defines SWA-65 subtask 2/8: a concrete, executable accessibility assertion set for the dashboard theme toggle.

## Core Assertion Matrix

| ID | Focus Area | Preconditions | Interaction | Required Assertions | Pass Criteria | Fail Criteria |
| --- | --- | --- | --- | --- | --- | --- |
| `TT-A11Y-01` | Tab focus behavior | Initial page load in default theme. | Press `Tab` repeatedly from no focused element. | Focus order is: task input -> create task button -> preset select -> theme toggle. Toggle receives visible keyboard focus. | Theme toggle is reachable in expected top-bar keyboard order without pointer input. | Toggle is skipped, unreachable, or appears before required controls. |
| `TT-A11Y-02` | Switch semantics | Toggle rendered in DOM (dark or light state). | Query with `getByRole('switch')`. | Toggle exposes `role="switch"` and state-reflective accessible name (`Switch to light mode` when dark, `Switch to dark mode` when light). | Semantic role and label are present and valid for both states. | Missing role/label or stale label that does not reflect next action. |
| `TT-A11Y-03` | Keyboard activation with `Space` | Toggle focused, starting in dark theme. | Press `Space`. | `aria-checked` transitions `true -> false`; root `data-theme` transitions `dark -> light`; accessible label updates to `Switch to dark mode`. | ARIA state, theme state, and label transition together after `Space`. | State fails to toggle or ARIA/theme/label become inconsistent. |
| `TT-A11Y-04` | Keyboard activation with `Enter` | Toggle focused, starting in light theme. | Press `Enter`. | `aria-checked` transitions `false -> true`; root `data-theme` transitions `light -> dark`; accessible label updates to `Switch to light mode`. | ARIA state, theme state, and label transition together after `Enter`. | `Enter` is ignored, toggles incorrectly, or ARIA/theme/label diverge. |
| `TT-A11Y-05` | Contrast threshold in dark mode | Theme is dark. | Resolve runtime computed foreground/background pairs and calculate contrast ratio. | Each required pair ratio is `>= 4.5:1` (WCAG AA normal text). | All dark-mode pairs meet or exceed 4.5:1. | Any pair is below 4.5:1. |
| `TT-A11Y-06` | Contrast threshold in light mode | Theme toggled to light. | Resolve runtime computed foreground/background pairs and calculate contrast ratio. | Each required pair ratio is `>= 4.5:1` (WCAG AA normal text). | All light-mode pairs meet or exceed 4.5:1. | Any pair is below 4.5:1. |

## Aria-Checked Transition Matrix

| Activation Path | Before | After | Required Coupled Assertions |
| --- | --- | --- | --- |
| `Space` on focused toggle (`TT-A11Y-03`) | `aria-checked="true"`, `data-theme="dark"` | `aria-checked="false"`, `data-theme="light"` | Accessible label becomes `Switch to dark mode`. |
| `Enter` on focused toggle (`TT-A11Y-04`) | `aria-checked="false"`, `data-theme="light"` | `aria-checked="true"`, `data-theme="dark"` | Accessible label becomes `Switch to light mode`. |

## Contrast Assertion Set

| Probe ID | Foreground Token | Background Token | Minimum Ratio | Applies To |
| --- | --- | --- | --- | --- |
| `body-primary-on-canvas` | `--text-primary` | `--bg-canvas` | `4.5:1` | Dark + Light |
| `body-secondary-on-canvas` | `--text-secondary` | `--bg-canvas` | `4.5:1` | Dark + Light |
| `body-primary-on-panel` | `--text-primary` | `--bg-panel` | `4.5:1` | Dark + Light |
| `theme-toggle-text-on-toggle-bg` | `--theme-toggle-text` | `--theme-toggle-bg` | `4.5:1` | Dark + Light |

## Notes

- Contrast checks intentionally use runtime computed CSS values to validate shipped tokens, not hard-coded hex assumptions.
- Keyboard assertions validate interaction parity and semantic state alignment (`role`, `aria-checked`, label, and theme dataset).

## Test Mapping (Subtask 2/8)

- `TT-A11Y-01`: Covered by Playwright test `TT-A11Y-01 moves focus to theme toggle using keyboard-only Tab navigation` in `tests/theme-toggle.spec.ts`.
- `TT-A11Y-02`: Covered by Playwright test `TT-A11Y-02 keeps switch semantics and updates ARIA state on repeated interactions` in `tests/theme-toggle.spec.ts`.
- `TT-A11Y-03`: Covered by Playwright test `TT-A11Y-03 toggles theme with Space key from dark to light with deterministic state updates` in `tests/theme-toggle.spec.ts`.
- `TT-A11Y-04`: Covered by Playwright test `TT-A11Y-04 toggles theme with Enter key from light to dark with deterministic state updates` in `tests/theme-toggle.spec.ts`.
- `TT-A11Y-05`: Covered by Playwright test `TT-A11Y-05/TT-A11Y-06 meets WCAG AA contrast thresholds for key theme foreground/background combinations` while `data-theme="dark"`.
- `TT-A11Y-06`: Covered by Playwright test `TT-A11Y-05/TT-A11Y-06 meets WCAG AA contrast thresholds for key theme foreground/background combinations` after toggling to `data-theme="light"`.
