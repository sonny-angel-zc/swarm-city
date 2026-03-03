# SWA-73 Subtask 1/8: Budget Alert Requirements and Threshold Rules

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

### 1) Threshold Semantics

- Warning thresholds:
  - `warning_1 = 0.50` (50%)
  - `warning_2 = 0.75` (75%)
- Critical thresholds:
  - `critical_1 = 0.90` (90%)
  - `critical_2 = 1.00` (100%, exhausted)
- Evaluation rule:
  - On every spend event, evaluate thresholds in ascending order.
  - If a spend jump crosses multiple thresholds, emit all newly crossed thresholds in one transaction cycle.
- Severity mapping:
  - `< 0.90` => warning severity
  - `>= 0.90` => critical severity

### 2) Default Values and Validation

- Default threshold set for new scope records: `[0.5, 0.75, 0.9, 1]`.
- Threshold list must be:
  - strictly ascending,
  - unique,
  - bounded `(0, 1]`,
  - include `1.0`.
- Invalid custom threshold config falls back to defaults and logs one operator-visible warning event.

### 3) Scope Rules (Per-Project and Per-User)

- Alert configuration scope precedence:
  1. project + user override
  2. project default
  3. global workspace default
- Alert trigger state (`triggeredBudgetAlerts`) is run/session scoped, not persisted across runs.
- Budget source-of-truth for threshold calculations in SWA-73:
  - project runtime budget (`economy.totalBudget`) for the active swarm task.
- No cross-project spillover:
  - spending or alerts from project A must not mark thresholds as triggered for project B.

### 4) Reset Logic

- Reset triggered thresholds when any of the following occurs:
  - new swarm run starts,
  - active project changes,
  - total budget value changes for the active project,
  - operator manually resets budget tracking.
- Do not reset on incremental spend updates within the same run.
- Reset must be atomic with budget context update to avoid stale alerts on first post-reset spend event.

### 5) Notification Channels

- Required channels in SWA-73:
  - in-app notification center (`notifications[]`),
  - activity log/audit trail (`activityLog[]`),
  - budget UI surface indicator (`Treasury`/`BudgetPanel` threshold status).
- Channel payload contract:
  - `scopeType` (`project_user` | `project` | `workspace`),
  - `scopeId` (project and/or user identifier),
  - `threshold`,
  - `severity`,
  - `spent`,
  - `budget`,
  - `spentPct`,
  - `triggeredAt` timestamp.
- Deduplication rule:
  - one emitted alert event per threshold per run per scope.

## Acceptance Criteria for SWA-73 (Subtask 1 Output)

1. Threshold contract is documented and uses exact defaults `[50, 75, 90, 100]%` with severity split at `90%`.
2. Rules explicitly define multi-threshold crossing behavior in a single spend event.
3. Scope precedence is documented (`project+user > project > workspace`) and includes non-leakage across projects.
4. Reset triggers are fully enumerated and distinguish reset events from normal spend updates.
5. Notification channels and minimum alert payload fields are explicitly defined.
6. Deduplication behavior is explicit: no repeated alert for the same threshold in one run/scope.
7. Documentation references current implementation baseline and identifies required extension points for later subtasks.

## Implementation Guidance for Subtasks 2-8

- Add explicit severity type to alert records (`warning` | `critical`) and map existing UI copy to severity.
- Introduce scope-aware alert state structure (keyed by `{projectId}:{userId?}`) instead of a single global `triggeredBudgetAlerts` array.
- Keep threshold evaluation in `spendTokens` but extract into a pure helper for testability.
- Add targeted tests for:
  - threshold crossing order,
  - dedupe,
  - reset conditions,
  - scope isolation.
