# SWA-68 Subtask 2/5: City Visuals UX/Data Contract

## Scope

Define the interaction model, copy contract, and deterministic UI/data mapping for upgrading city visuals across roads, transit, trees, parks, and city-life overlays.

## Interaction Model

- Primary control: `OverlayToggle` rendered as a single-select tablist in the bottom-right of the canvas.
- Modes and intent:
  - `activity`: balanced city-life view with roads, transit, and ambient scene effects.
  - `power`: transit-grid emphasis for route load and connection visibility.
  - `economy`: spend heatmap emphasis for district spend intensity.
- Activation parity:
  - Pointer click on a tab activates that mode.
  - Keyboard `ArrowLeft`/`ArrowRight` cycles tabs and activates target mode.
  - Keyboard `Home` and `End` jump to first/last tab and activate.
- Selection semantics:
  - Exactly one mode is selected at a time.
  - Selected tab is in tab order (`tabIndex=0`); unselected tabs are roving (`tabIndex=-1`).
  - Toggle and canvas expose shared mode/emphasis state for renderer-aware assertions.
- Visual impact strip:
  - Active mode exposes deterministic emphasis labels for `roads`, `transit`, `trees + parks`, `city life`, and `spend layer`.
  - Emphasis labels are contract-bound: `off`, `supporting`, `primary`, `dominant`.

## Copy Contract

Control copy should be operational and explain the decision impact in one glance.

| Surface | Contract copy |
| --- | --- |
| Toggle header | `View mode` |
| Toggle subheading | `Tune what stands out as roads, transit, parks, and city life evolve.` |
| Toggle ARIA label | `City view mode` |
| Impact heading | `Visual impact` |
| Keyboard hint | `Use Arrow keys, Home, or End to switch modes. Enter or Space activates the focused tab.` |
| Activity tab label | `City Life` |
| Activity tab helper | `Live streets, transit flow, and active neighborhoods` |
| Power tab label | `Transit Grid` |
| Power tab helper | `Focus network flow, route load, and connection stress` |
| Economy tab label | `Spend Heatmap` |
| Economy tab helper | `Compare district spend intensity across the city` |

## UI/Data Mapping Contract

State must be available through semantic ARIA and explicit `data-*` attributes.

| UI element | Required contract fields |
| --- | --- |
| Toggle root | `role="tablist"`, `data-testid="city-overlay-toggle"`, `data-overlay-current="{mode}"`, `data-overlay-contract-version="swa-68-subtask-2"` |
| Toggle tab | `role="tab"`, `aria-selected`, `aria-controls="city-canvas"`, `data-testid="city-overlay-mode-{mode}"` |
| Toggle tab state | `data-overlay-mode="{mode}"`, `data-overlay-selected="true/false"`, `data-overlay-renderer-intent="{intent}"` |
| Toggle tab emphasis | `data-overlay-roads-emphasis`, `data-overlay-transit-emphasis`, `data-overlay-greenspace-emphasis`, `data-overlay-city-life-emphasis`, `data-overlay-spend-emphasis` |
| Impact strip | `data-testid="city-overlay-impact-strip"`, `data-overlay-impact-mode`, per-row `data-overlay-impact-key`, `data-overlay-impact-level`, `data-overlay-impact-label` |
| Canvas root | `id="city-canvas"`, `data-testid="city-canvas"`, `data-overlay-contract-version="swa-68-subtask-2"`, `data-overlay-mode="{mode}"`, matching focus/emphasis `data-*` mirrors |

Deterministic mode mapping:

| Mode | Renderer intent |
| --- | --- |
| `activity` | Full city-life composition with roads, transit, trees/parks, and ambient effects |
| `power` | Prioritize transit/power network readability and active connection diagnostics |
| `economy` | Prioritize spend-based building/zone tinting and suppress non-essential network emphasis |

## Pass/Fail Rules for SWA-68 Subtasks 3-5

- Pass:
  - Tablist semantics and roving tab focus are consistent for pointer and keyboard interactions.
  - Copy labels/helpers match the contract exactly and remain mode-specific.
  - `data-overlay-current`, tab `data-overlay-selected`, impact strip labels, and canvas focus/emphasis `data-*` stay in sync after every mode change.
  - `power` and `economy` modes visibly alter rendering emphasis as defined in renderer subtasks.
- Fail:
  - Any mode switch where ARIA state and `data-*` state diverge.
  - Missing helper copy or generic labels that do not communicate mode impact.
  - Keyboard navigation that moves focus without updating active mode.
