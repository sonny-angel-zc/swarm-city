import { AgentRole, BacklogItem, BacklogPriority, type LinearProjectContract } from './types';
import {
  getIssueProjectIdentity,
  mapLinearProjectContract,
  normalizeIssueState,
  toIssueBreakdownBucket,
  UNASSIGNED_PROJECT_ID,
  type LinearProjectRef,
} from './linearProject';

const TEAM_ID = '8687f779-d37c-49dc-82bf-3f2177df56a8';

// ─── Priority mapping ──────────────────────────────────────────────────────
// Linear: 0=none, 1=urgent, 2=high, 3=medium, 4=low
function mapPriority(linearPriority: number | null | undefined): BacklogPriority {
  switch (linearPriority) {
    case 1: return 'P0';
    case 2: return 'P1';
    case 3: return 'P2';
    default: return 'P3';
  }
}

function pickOwner(i: number): AgentRole {
  const owners: AgentRole[] = ['pm', 'researcher', 'designer', 'engineer', 'qa', 'devils_advocate', 'reviewer'];
  return owners[i % owners.length] ?? 'pm';
}

// ─── API helpers ───────────────────────────────────────────────────────────

async function linearApi(action: string, params: Record<string, unknown> = {}) {
  const res = await fetch('/api/linear', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, teamId: TEAM_ID, ...params }),
  });
  if (!res.ok) throw new Error(`Linear API error: ${res.status}`);
  return res.json();
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface LinearState {
  id: string;
  name: string;
  type: string;
  position: number;
}

type LinearIssueNode = {
  id: string;
  identifier: string;
  title: string;
  priority?: number | null;
  url: string;
  updatedAt: string;
  state?: { name: string; type: string } | null;
  assignee?: { name: string } | null;
  labels?: { nodes?: Array<{ name: string; color: string }> } | null;
  project?: LinearProjectRef;
};

type LinearProjectIssueNode = {
  state?: { type?: string | null } | null;
};

type LinearProjectNode = {
  id?: string | null;
  name?: string | null;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  state?: string | { name?: string | null; type?: string | null } | null;
  progress?: number | null;
  issues?: { nodes?: LinearProjectIssueNode[] | null } | null;
};

type ProjectStats = {
  project: LinearProjectRef;
  issues: number;
  issueBreakdown: {
    todo: number;
    in_progress: number;
    done: number;
  };
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNonNegativeNumber(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) return null;
  return Math.max(0, value);
}

function asIssueBreakdown(value: unknown): LinearProjectContract['issueBreakdown'] | null {
  const record = asObject(value);
  if (!record) return null;
  const todo = asNonNegativeNumber(record.todo);
  const inProgress = asNonNegativeNumber(record.in_progress ?? record.inProgress);
  const done = asNonNegativeNumber(record.done);
  if (todo == null || inProgress == null || done == null) return null;
  return { todo, in_progress: inProgress, done };
}

function asProjectStatus(value: unknown): LinearProjectContract['status'] | null {
  if (value === 'todo' || value === 'in_progress' || value === 'done') return value;
  return null;
}

function asProjectProgressSource(value: unknown): LinearProjectContract['progressSource'] | null {
  if (value === 'linear' || value === 'issues_fallback') return value;
  return null;
}

function parseProjectsFromApiContract(value: unknown): LinearProjectContract[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    const project = asObject(entry);
    if (!project) return [];

    const id = typeof project.id === 'string' ? project.id : null;
    const name = typeof project.name === 'string' ? project.name : null;
    const description = typeof project.description === 'string' ? project.description : null;
    const progress = asNonNegativeNumber(project.progress);
    const state = typeof project.state === 'string' ? project.state : null;
    const issues = asNonNegativeNumber(project.issues);
    const issueBreakdown = asIssueBreakdown(project.issueBreakdown);
    const districtId = typeof project.districtId === 'string' ? project.districtId : null;
    const status = asProjectStatus(project.status);
    const progressSource = asProjectProgressSource(project.progressSource);
    const totalIssues = asNonNegativeNumber(project.totalIssues);
    const doneIssues = asNonNegativeNumber(project.doneIssues);
    const icon = typeof project.icon === 'string' || project.icon === null ? project.icon : null;
    const color = typeof project.color === 'string' || project.color === null ? project.color : null;
    const isUnassigned = typeof project.isUnassigned === 'boolean' ? project.isUnassigned : null;

    if (
      id == null ||
      name == null ||
      progress == null ||
      issues == null ||
      issueBreakdown == null ||
      districtId == null ||
      status == null ||
      progressSource == null ||
      totalIssues == null ||
      doneIssues == null ||
      isUnassigned == null
    ) {
      return [];
    }

    return [{
      id,
      name,
      description,
      progress: Math.max(0, Math.min(1, progress)),
      state,
      issues,
      issueBreakdown,
      districtId,
      status,
      progressSource,
      totalIssues,
      doneIssues,
      icon,
      color,
      isUnassigned,
    }];
  });
}

function toProjectStateLabel(state: LinearProjectNode['state']): string | null {
  if (typeof state === 'string') return state;
  if (state?.name) return state.name;
  if (state?.type) return state.type;
  return null;
}

let cachedStates: LinearState[] | null = null;

export async function fetchStates(): Promise<LinearState[]> {
  if (cachedStates) return cachedStates;
  const result = await linearApi('states');
  cachedStates = result?.data?.team?.states?.nodes ?? [];
  return cachedStates!;
}

export async function getStateIdForStatus(targetType: string): Promise<string | undefined> {
  const states = await fetchStates();
  return states.find(s => s.type === targetType)?.id;
}

export async function syncFromLinear(): Promise<{ backlog: BacklogItem[]; projects: LinearProjectContract[] }> {
  const result = await linearApi('list');
  const issues = (result?.data?.team?.issues?.nodes ?? []) as LinearIssueNode[];
  const projectNodes = (result?.data?.team?.projects?.nodes ?? []) as LinearProjectNode[];
  const mappedProjectsFromApi = parseProjectsFromApiContract(result?.contracts?.projects);

  const preparedIssues = issues.map((issue) => {
    const issueStatus = normalizeIssueState(issue.state?.type ?? 'unstarted');
    const projectIdentity = getIssueProjectIdentity(issue.project);
    return {
      issue,
      issueStatus,
      projectIdentity,
    };
  });

  const projectStats = new Map<string, ProjectStats>();
  const includeIssueDerivedStats = projectNodes.length === 0;

  for (const projectNode of projectNodes) {
    const projectIssues = projectNode.issues?.nodes ?? [];
    const projectRef: LinearProjectRef = {
      id: projectNode.id ?? '',
      name: projectNode.name ?? '',
      description: projectNode.description ?? null,
      icon: projectNode.icon ?? null,
      color: projectNode.color ?? null,
      state: toProjectStateLabel(projectNode.state),
      progress: projectNode.progress ?? null,
    };
    const projectIdentity = getIssueProjectIdentity(projectRef);
    const stats: ProjectStats = {
      project: {
        ...projectRef,
        id: projectIdentity.id,
        name: projectIdentity.name,
      },
      issues: projectIssues.length,
      issueBreakdown: { todo: 0, in_progress: 0, done: 0 },
    };
    for (const issue of projectIssues) {
      stats.issueBreakdown[toIssueBreakdownBucket(issue?.state?.type)] += 1;
    }
    projectStats.set(projectIdentity.id, stats);
  }

  for (const entry of preparedIssues) {
    if (!includeIssueDerivedStats && entry.projectIdentity.id !== UNASSIGNED_PROJECT_ID && projectStats.has(entry.projectIdentity.id)) {
      continue;
    }
    const existing = projectStats.get(entry.projectIdentity.id) ?? {
      project: entry.issue.project,
      issues: 0,
      issueBreakdown: { todo: 0, in_progress: 0, done: 0 },
    };
    existing.issues += 1;
    existing.issueBreakdown[toIssueBreakdownBucket(entry.issue.state?.type)] += 1;
    projectStats.set(entry.projectIdentity.id, existing);
  }

  const mappedProjects = new Map<string, LinearProjectContract>(
    mappedProjectsFromApi.map((project) => [project.id, project]),
  );
  if (mappedProjects.size === 0) {
    for (const [projectId, stats] of projectStats.entries()) {
      mappedProjects.set(projectId, mapLinearProjectContract(stats.project, stats));
    }
  }
  const projects = Array.from(mappedProjects.values());

  const backlog = preparedIssues.map(({ issue, issueStatus, projectIdentity }, i: number) => {
    const assignee = issue.assignee ?? undefined;
    const labels = issue.labels?.nodes ?? [];
    const project = mappedProjects.get(projectIdentity.id);
    const updatedAt = new Date(issue.updatedAt).getTime();
    const fallbackDistrictId = projectIdentity.id === UNASSIGNED_PROJECT_ID ? 'unassigned' : undefined;

    return {
      id: issue.identifier,
      linearId: issue.id,
      linearUrl: issue.url,
      title: issue.title,
      ownerRole: pickOwner(i),
      ownerName: assignee?.name,
      status: issueStatus,
      statusLabel: issue.state?.name,
      priority: mapPriority(issue.priority),
      source: 'linear' as const,
      updatedAt: Number.isNaN(updatedAt) ? Date.now() : updatedAt,
      labels: labels.map((l) => l.name),
      projectId: project?.id ?? projectIdentity.id,
      projectName: project?.name ?? projectIdentity.name,
      projectDistrictId: project?.districtId ?? fallbackDistrictId,
      projectStatus: project?.status,
      projectProgress: project?.progress,
      projectProgressSource: project?.progressSource,
    };
  });

  return { backlog, projects };
}

export async function createLinearIssue(
  title: string,
  description?: string,
  priority?: number,
): Promise<BacklogItem | null> {
  const result = await linearApi('create', { title, description, priority });
  const issue = result?.data?.issueCreate?.issue;
  if (!issue) return null;

  return {
    id: issue.identifier,
    linearId: issue.id,
    linearUrl: issue.url,
    title: issue.title,
    ownerRole: 'pm',
    status: normalizeIssueState(issue.state?.type ?? 'unstarted'),
    statusLabel: issue.state?.name,
    priority: mapPriority(issue.priority ?? 0),
    source: 'linear',
    updatedAt: Date.now(),
  };
}

export async function updateLinearIssueStatus(
  issueId: string,
  newStatusType: string,
): Promise<boolean> {
  const stateId = await getStateIdForStatus(newStatusType);
  if (!stateId) return false;
  const result = await linearApi('updateStatus', { issueId, stateId });
  return result?.data?.issueUpdate?.success ?? false;
}
