import type {
  LinearProjectContract,
  ProjectProgressSource,
  StrategicProjectStatus,
} from './types';

export const UNASSIGNED_PROJECT_ID = '__no_project__';
export const UNASSIGNED_PROJECT_NAME = 'No Project';
export const UNASSIGNED_PROJECT_DESCRIPTION = 'Issues without a linked Linear project';

export type LinearProjectRef = {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  state?: string | null;
  progress?: number | null;
} | null | undefined;

function clampProgress(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeLinearProjectProgress(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value <= 1) return clampProgress(value);
  // Linear project progress can arrive as a percentage (0-100).
  return clampProgress(value / 100);
}

export function normalizeIssueState(stateType: string | null | undefined): StrategicProjectStatus {
  const bucket = toIssueBreakdownBucket(stateType);
  if (bucket === 'in_progress') return 'in_progress';
  if (bucket === 'done') return 'done';
  return 'todo';
}

export function toIssueBreakdownBucket(
  stateType: string | null | undefined,
): 'todo' | 'in_progress' | 'done' {
  switch ((stateType ?? '').toLowerCase()) {
    case 'in progress':
    case 'started':
    case 'in_progress':
      return 'in_progress';
    case 'completed':
    case 'canceled':
    case 'cancelled':
    case 'done':
      return 'done';
    case 'triage':
    case 'backlog':
    case 'unstarted':
    case 'todo':
    default:
      // Fallback unknown/missing state types into TODO so strategic plans remain actionable.
      return 'todo';
  }
}

function deriveProjectStatusFromIssues(todo: number, inProgress: number): StrategicProjectStatus {
  if (inProgress > 0) return 'in_progress';
  if (todo > 0) return 'todo';
  return 'done';
}

function toDistrictId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unassigned';
}

type ProjectIssueStats = {
  issues: number;
  issueBreakdown: {
    todo: number;
    in_progress: number;
    done: number;
  };
};

export function getIssueProjectIdentity(project: LinearProjectRef): { id: string; name: string } {
  if (!project?.id || !project?.name) {
    return { id: UNASSIGNED_PROJECT_ID, name: UNASSIGNED_PROJECT_NAME };
  }
  return { id: project.id, name: project.name };
}

export function mapLinearProjectContract(
  project: LinearProjectRef,
  stats: ProjectIssueStats,
): LinearProjectContract {
  const identity = getIssueProjectIdentity(project);
  const linearProgress = normalizeLinearProjectProgress(project?.progress);
  // Canonical fallback rule: auto-calc done/total with a zero-issue guard.
  const issueDerivedProgress = stats.issues > 0 ? stats.issueBreakdown.done / stats.issues : 0;
  const progress = linearProgress ?? issueDerivedProgress;
  const progressSource: ProjectProgressSource = linearProgress == null ? 'issues_fallback' : 'linear';

  return {
    id: identity.id,
    name: identity.name,
    description: project?.description ?? (identity.id === UNASSIGNED_PROJECT_ID ? UNASSIGNED_PROJECT_DESCRIPTION : null),
    progress: clampProgress(progress),
    state: project?.state ?? null,
    issues: stats.issues,
    issueBreakdown: {
      todo: stats.issueBreakdown.todo,
      in_progress: stats.issueBreakdown.in_progress,
      done: stats.issueBreakdown.done,
    },
    districtId: identity.id === UNASSIGNED_PROJECT_ID ? 'unassigned' : toDistrictId(identity.name),
    status: deriveProjectStatusFromIssues(stats.issueBreakdown.todo, stats.issueBreakdown.in_progress),
    progressSource,
    totalIssues: stats.issues,
    doneIssues: stats.issueBreakdown.done,
    icon: project?.icon ?? null,
    color: project?.color ?? null,
    isUnassigned: identity.id === UNASSIGNED_PROJECT_ID,
  };
}
