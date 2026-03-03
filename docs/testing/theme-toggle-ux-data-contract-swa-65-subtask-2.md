# SWA-65 Subtask 2/7: Theme Toggle UX/Data Contract

## Scope

Define the interaction model, user-facing copy, and UI-to-data mapping contract that accessibility E2E assertions must enforce for the dashboard theme toggle.

## Interaction Model

- Control type: native `button` with `role="switch"` and `data-testid="theme-toggle-switch"`.
- Keyboard focus order contract:
  - `task-input` -> `create-task-button` -> `model-preset-select` (if visible) -> `theme-toggle-switch`.
- Current state model:
  - Dark mode active: switch is checked (`aria-checked="true"`).
  - Light mode active: switch is unchecked (`aria-checked="false"`).
- Activation parity:
  - Pointer click toggles theme.
  - Keyboard `Space` and `Enter` both toggle theme when focused.
  - Activation keeps focus on `theme-toggle-switch`.
- Source-of-truth updates on every toggle:
  - `<html data-theme>` changes between `dark` and `light`.
  - `<html class="dark">` is present only in dark mode.
  - `localStorage['swarm:theme']` persists the selected theme after user interaction.

## Copy Contract

The toggle label is action-oriented (next action), while the inline text communicates current state.

| Current Theme | `aria-label` (next action) | `title` tooltip | Visible inline label | Icon |
| --- | --- | --- | --- | --- |
| `dark` | `Switch to light mode` | `Dark mode enabled. Switch to light mode.` | `Dark mode` | `🌙` |
| `light` | `Switch to dark mode` | `Light mode enabled. Switch to dark mode.` | `Light mode` | `☀️` |

## UI/Data Mapping Contract

Theme toggle state must expose explicit, machine-verifiable state attributes in addition to ARIA:

| Attribute | Meaning | Dark | Light |
| --- | --- | --- | --- |
| `aria-checked` | Switch checked state | `true` | `false` |
| `data-theme-current` | Current active theme | `dark` | `light` |
| `data-theme-target` | Theme that next activation applies | `light` | `dark` |
| `data-theme-switch-checked` | Redundant contract mirror of checked state | `true` | `false` |

This mapping allows E2E tests to assert semantic state (`role`/`aria-*`) and product-state wiring (`data-*` + `<html>` state) without coupling to fragile visual selectors.

## Key Activation Mapping Contract

| Key | Starting Theme | Expected Result Theme | `aria-checked` Transition |
| --- | --- | --- | --- |
| `Space` | `dark` | `light` | `true -> false` |
| `Space` | `light` | `dark` | `false -> true` |
| `Enter` | `dark` | `light` | `true -> false` |
| `Enter` | `light` | `dark` | `false -> true` |

## Pass/Fail Rules for SWA-65 Subtasks 3-5

- Pass:
  - Keyboard focus reaches the switch in top-bar order.
  - `Space` and `Enter` both trigger identical state transitions.
  - `role="switch"` remains present through all interactions.
  - `aria-checked` transitions are exact:
    - dark -> light: `true -> false`
    - light -> dark: `false -> true`
  - ARIA labels/tooltips/inline copy stay in sync with current and next state semantics.
  - `aria-*`, `data-*`, `<html data-theme>`, and persistence agree after each transition.
  - Contrast thresholds hold in dark and light themes:
    - text and icon text pairs: `>= 4.5:1`
    - non-text indicator pairs: `>= 3.0:1`
- Fail:
  - Any stale or contradictory state among ARIA, UI copy, data attributes, root theme state, or persisted preference.
  - Any theme where required contrast probes fall below threshold.
