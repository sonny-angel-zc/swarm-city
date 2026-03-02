# Theme Toggle Accessibility E2E Matrix (SWA-65)

## Scope

This matrix defines subtask 2/7 for SWA-65: end-to-end scenarios and assertions for the dashboard theme toggle accessibility behavior.

## Test Matrix

| ID | Scenario | Assertions | Pass Criteria | Fail Criteria |
| --- | --- | --- | --- | --- |
| `TT-A11Y-01` | Tab focus order reaches the theme switch in expected top-bar order. | From initial page load, `Tab` moves focus in sequence: task input -> create task button -> preset select -> theme toggle switch. | Theme toggle receives visible keyboard focus in sequence and is discoverable without pointer input. | Theme toggle is skipped, unreachable via `Tab`, or appears out of expected order before required controls. |
| `TT-A11Y-02` | Theme switch exposes switch semantics. | Toggle control is queryable as `getByRole('switch')` and includes an accessible name that describes the next action (`Switch to light mode` / `Switch to dark mode`). | Element role is `switch` and the accessible label is present for both states. | Control is not exposed as `switch`, or has missing/incorrect accessible naming. |
| `TT-A11Y-03` | `Space` activates switch and updates state. | With toggle focused in default dark mode, pressing `Space` flips `aria-checked` (`true -> false`) and sets document theme to light. | `aria-checked` and `data-theme` update together after `Space`; label updates to `Switch to dark mode`. | Keyboard activation does not toggle state, or ARIA/document theme become out of sync. |
| `TT-A11Y-04` | `Enter` activates switch and updates state. | With toggle focused in light mode, pressing `Enter` flips `aria-checked` (`false -> true`) and restores dark theme. | `aria-checked` and `data-theme` update together after `Enter`; label updates to `Switch to light mode`. | `Enter` is ignored, toggles wrong state, or ARIA/document theme diverge. |
| `TT-A11Y-05` | Contrast of switch text/background passes WCAG AA in dark mode. | Compute contrast ratio from computed `color` and `background-color` in dark state. | Contrast ratio is `>= 4.5:1` (normal text AA). | Contrast ratio is `< 4.5:1`. |
| `TT-A11Y-06` | Contrast of switch text/background passes WCAG AA in light mode. | Toggle to light mode and compute contrast ratio from computed `color` and `background-color`. | Contrast ratio is `>= 4.5:1` (normal text AA). | Contrast ratio is `< 4.5:1`. |

## Notes

- Contrast checks intentionally use runtime computed CSS values to validate shipped tokens, not hard-coded hex assumptions.
- Keyboard assertions validate interaction parity and semantic state alignment (`role`, `aria-checked`, label, and theme dataset).
