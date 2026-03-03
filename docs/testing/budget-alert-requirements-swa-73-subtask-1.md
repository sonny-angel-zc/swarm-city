# SWA-73 Subtask 1/9: Budget Alert Requirements and Threshold Rules

## Scope

Define exact alert behavior for real-time cost tracking so implementation subtasks can ship deterministic warning/critical signals with no duplicate or ambiguous notifications.

## Current Baseline (Repository Audit)

- `src/core/store.ts` currently uses `budgetAlertThresholds = [0.5, 0.75, 0.9, 1]`.
- Alerts trigger when `economy.spent / economy.totalBudget >= threshold`.
- Triggered thresholds are stored in `economy.triggeredBudgetAlerts` and only fire once per run.
- Notification/log channel today is in-app only:
  - `notifications[]` with `type: 'warning'`
  - `activityLog[]` with `type: 'info'` for warning thresholds and `type: 'error'` at 100%
- Alerts reset when a new swarm run starts (`deploySwarm`) or limits are refreshed (`fetchLimits`).

## Requirement Decisions

### 1) Threshold Semantics (Percent + Absolute)

- Percent thresholds (of configured budget):
  - `warning_1 = 0.50` (50%)
  - `warning_2 = 0.75` (75%)
- Critical thresholds:
  - `critical_1 = 0.90` (90%)
  - `critical_2 = 1.00` (100%, exhausted)
- Absolute thresholds (currency or token-units) are supported as an optional second signal:
  - Defaults to disabled (`[]`) unless explicitly configured per scope.
  - Must be positive, strictly ascending, and unique.
- Evaluation rule on each spend event:
  - Evaluate percent thresholds in ascending order.
  - Evaluate absolute thresholds in ascending order.
  - If a spend jump crosses multiple thresholds, emit all newly crossed thresholds in one transaction cycle.
- Threshold identity and dedupe key:
  - `thresholdType` (`percent` | `absolute`) + `thresholdValue` + scope + run id.
- Severity mapping:
  - For `percent`: `< 0.90` => `warning`, `>= 0.90` => `critical`.
  - For `absolute`: severity comes from threshold config entry (`warning` or `critical`).

### 2) Default Values and Validation

- Default percent threshold set for new scope records: `[0.5, 0.75, 0.9, 1]`.
- Percent threshold list must be:
  - strictly ascending,
  - unique,
  - bounded `(0, 1]`,
  - include `1.0`.
- Absolute threshold list must be:
  - strictly ascending,
  - unique,
  - positive (`> 0`).
- Invalid custom threshold config behavior:
  - percent list falls back to defaults,
  - absolute list falls back to empty (`[]`),
  - one operator-visible warning event is logged per invalid scope config.

### 3) Scope Rules (Project, Environment, Account)

- Scope support:
  - project-scoped (default runtime alert scope),
  - environment-scoped (e.g. `dev`, `staging`, `prod`),
  - account/workspace-wide fallback.
- Alert configuration precedence:
  1. project + user override
  2. project + environment override
  3. project default
  4. environment default
  5. account/workspace default
- Alert trigger state (`triggeredBudgetAlerts`) is run/session scoped, not persisted across runs.
- Budget source-of-truth for threshold calculations in SWA-73:
  - project runtime budget (`economy.totalBudget`) for the active swarm task.
- No cross-project spillover:
  - spending or alerts from project A must not mark thresholds as triggered for project B.
- No cross-environment spillover:
  - spending or alerts in `staging` must not trigger already-fired state for `prod` under same account.

### 4) Notification Timing and Delivery

- Emit timing:
  - Evaluate and emit synchronously in the same `spendTokens` state transition that updates spend.
  - Notification center and activity log updates must be committed in the same transaction as threshold state updates.
- UI timing:
  - Banner/toast presentation may render on the next paint, but event timestamp must reflect threshold crossing time.
- Coalescing:
  - Multiple thresholds crossed in one spend event produce one grouped UI cycle (single render pass) containing all alerts.
  - Persist distinct audit records per crossed threshold.
- Retry/idempotency:
  - If the same spend event is retried, dedupe by threshold key + run + scope to prevent duplicate alerts.

### 5) Reset Logic

- Reset triggered thresholds when any of the following occurs:
  - new swarm run starts,
  - active project changes,
  - active environment changes,
  - total budget value changes for the active project,
  - operator manually resets budget tracking.
- Do not reset on incremental spend updates within the same run.
- Reset must be atomic with budget context update to avoid stale alerts on first post-reset spend event.

### 6) Notification Channels

- Required channels in SWA-73:
  - in-app notification center (`notifications[]`),
  - activity log/audit trail (`activityLog[]`),
  - budget UI surface indicator (`Treasury`/`BudgetPanel` threshold status).
- Channel payload contract:
  - `scopeType` (`project_user` | `project_env` | `project` | `environment` | `workspace`),
  - `scopeId` (project and/or user/environment identifier),
  - `thresholdType` (`percent` | `absolute`),
  - `thresholdValue`,
  - `severity`,
  - `spent`,
  - `budget`,
  - `spentPct`,
  - `environment`,
  - `triggeredAt` timestamp.
- Deduplication rule:
  - one emitted alert event per threshold-key per run per scope.

## Acceptance Criteria for SWA-73 (Subtask 1 Output)

1. Threshold contract explicitly defines both percent and absolute threshold behavior.
2. Defaults are locked to percent `[50, 75, 90, 100]%` and absolute `[]` (disabled by default).
3. Rules explicitly define multi-threshold crossing behavior in a single spend event.
4. Notification timing is explicit for emission, UI rendering, and grouped delivery.
5. Scope precedence is documented (`project+user > project+environment > project > environment > workspace`) and includes non-leakage across projects/environments.
6. Reset triggers are fully enumerated and distinguish reset events from normal spend updates.
7. Notification channels and minimum alert payload fields are explicitly defined.
8. Deduplication behavior is explicit: no repeated alert for the same threshold-key in one run/scope.
9. Documentation references current implementation baseline and identifies required extension points for later subtasks.

## Implementation Guidance for Subtasks 2-9

- Add explicit severity type to alert records (`warning` | `critical`) and map existing UI copy to severity.
- Extend threshold model to include `thresholdType` and absolute-threshold config with validation.
- Introduce scope-aware alert state structure (keyed by `{projectId}:{environment}:{userId?}`) instead of a single global `triggeredBudgetAlerts` array.
- Keep threshold evaluation in `spendTokens` but extract pure helpers for:
  - threshold normalization/validation,
  - threshold crossing calculation,
  - alert dedupe-key generation.
- Add targeted tests for:
  - threshold crossing order,
  - percent + absolute mixed thresholds,
  - dedupe,
  - reset conditions,
  - project/environment scope isolation,
  - synchronous emission with grouped UI delivery semantics.
