import { mapLinearProjectContract, normalizeIssueState, toIssueBreakdownBucket, type LinearProjectRef } from './linearProject';
import type { LinearProjectContract } from './types';
const LINEAR_API = 'https://api.linear.app/graphql';
export const LINEAR_TEAM_ID = '8687f779-d37c-49dc-82bf-3f2177df56a8';

export type LinearIssue = {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  url: string;
  updatedAt: string;
  state: {
    id: string;
    name: string;
    type: string;
  } | null;
  project?: LinearProjectRef;
  labels: {
    nodes: Array<{ id: string; name: string }>;
  };
};

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

type JsonRecord = Record<string, unknown>;

async function linearQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    throw new Error('LINEAR_API_KEY is not configured');
  }

  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });

  const json = await res.json() as GraphQLResponse<T>;
  if (!res.ok) {
    throw new Error(`Linear API ${res.status}`);
  }
  if (json.errors && json.errors.length > 0) {
    const msg = json.errors.map((e) => e.message).filter(Boolean).join('; ');
    throw new Error(msg || 'Linear GraphQL error');
  }
  if (!json.data) {
    throw new Error('Linear returned no data');
  }
  return json.data;
}

const QUERIES = {
  listIssues: `query($teamId: String!) {
    team(id: $teamId) {
      issues(first: 50, orderBy: updatedAt) {
        nodes {
          id
          identifier
          title
          description
          priority
          url
          updatedAt
          state { id name type }
          project { id name description icon color state progress }
          labels { nodes { id name } }
        }
      }
    }
  }`,
  states: `query($teamId: String!) {
    team(id: $teamId) {
      states {
        nodes { id name type position }
      }
    }
  }`,
  updateStatus: `mutation($issueId: String!, $stateId: String!) {
    issueUpdate(id: $issueId, input: { stateId: $stateId }) {
      success
    }
  }`,
  createIssue: `mutation($teamId: String!, $title: String!, $description: String, $priority: Int, $stateId: String, $labelIds: [String!]) {
    issueCreate(input: { teamId: $teamId, title: $title, description: $description, priority: $priority, stateId: $stateId, labelIds: $labelIds }) {
      success
      issue {
        id
        identifier
        title
        description
        priority
        url
        updatedAt
        state { id name type }
        project { id name description icon color state progress }
        labels { nodes { id name } }
      }
    }
  }`,
  listLabels: `query($teamId: String!) {
    team(id: $teamId) {
      labels(first: 100) {
        nodes { id name }
      }
    }
  }`,
  createLabel: `mutation($teamId: String!, $name: String!, $color: String!) {
    issueLabelCreate(input: { teamId: $teamId, name: $name, color: $color }) {
      success
      issueLabel { id name }
    }
  }`,
  listProjects: `query($teamId: String!) {
    team(id: $teamId) {
      projects(first: 20) {
        nodes {
          id
          name
          description
          icon
          color
          state
          progress
          issues(first: 50) {
            nodes {
              id
              identifier
              state { type }
            }
          }
        }
      }
    }
  }`,
};

function scorePriority(priority: number | null | undefined): number {
  // Linear: 1 urgent, 2 high, 3 medium, 4 low, 0 none
  if (priority === 1) return 1;
  if (priority === 2) return 2;
  if (priority === 3) return 3;
  if (priority === 4) return 4;
  return 5;
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type ParsedLinearProject = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  state: string | null;
  progress: number | null;
  issues: Array<{
    id: string;
    identifier: string;
    title: string;
    url: string | null;
    updatedAt: string | null;
    state: {
      id: string | null;
      name: string | null;
      type: string | null;
    };
  }>;
  issueBreakdown: {
    todo: number;
    in_progress: number;
    done: number;
  };
  issueCount: number;
};

function parseProjectStateLabel(value: unknown): string | null {
  if (typeof value === 'string') return toTrimmedString(value);
  const state = asRecord(value);
  if (!state) return null;
  return toTrimmedString(state.name) ?? toTrimmedString(state.type);
}

function parseProjectProgress(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, value);
}

function parseIssueStateType(value: unknown): string | null {
  if (typeof value === 'string') return toTrimmedString(value);
  const state = asRecord(value);
  if (!state) return null;
  return toTrimmedString(state.type) ?? toTrimmedString(state.name);
}

function parseLinearProjectIssue(issueNode: unknown, issueIndex: number): ParsedLinearProject['issues'][number] | null {
  const issue = asRecord(issueNode);
  if (!issue) return null;
  const state = asRecord(issue.state);

  return {
    id: toTrimmedString(issue.id) ?? `linear-project-issue-${issueIndex + 1}`,
    identifier: toTrimmedString(issue.identifier) ?? '',
    title: toTrimmedString(issue.title) ?? 'Untitled Issue',
    url: toNullableString(issue.url),
    updatedAt: toNullableString(issue.updatedAt),
    state: {
      id: toNullableString(state?.id),
      name: toNullableString(state?.name),
      type: parseIssueStateType(state),
    },
  };
}

function parseLinearProjectsFromResponse(data: unknown): ParsedLinearProject[] {
  const team = asRecord(asRecord(data)?.team);
  const projects = asRecord(team?.projects);
  const projectNodes = asArray(projects?.nodes);

  return projectNodes
    .map((node, index): ParsedLinearProject | null => {
      const project = asRecord(node);
      if (!project) return null;

      const issueBreakdown = {
        todo: 0,
        in_progress: 0,
        done: 0,
      };
      const issueNodes = asArray(asRecord(project.issues)?.nodes);
      const issues: ParsedLinearProject['issues'] = [];

      for (let issueIndex = 0; issueIndex < issueNodes.length; issueIndex += 1) {
        const normalizedIssue = parseLinearProjectIssue(issueNodes[issueIndex], issueIndex);
        if (!normalizedIssue) continue;
        issues.push(normalizedIssue);
        const stateType = normalizedIssue.state.type;
        const bucket = toIssueBreakdownBucket(stateType);
        issueBreakdown[bucket] += 1;
      }

      return {
        id: toTrimmedString(project.id) ?? `linear-project-${index + 1}`,
        name: toTrimmedString(project.name) ?? 'Untitled Project',
        description: toNullableString(project.description),
        icon: toNullableString(project.icon),
        color: toNullableString(project.color),
        state: parseProjectStateLabel(project.state),
        progress: parseProjectProgress(project.progress),
        issues,
        issueBreakdown,
        issueCount: issues.length,
      };
    })
    .filter((project): project is ParsedLinearProject => project !== null);
}

export async function listLinearProjects(teamId = LINEAR_TEAM_ID): Promise<LinearProjectContract[]> {
  const data = await linearQuery<unknown>(
    QUERIES.listProjects,
    { teamId },
  );
  const parsedProjects = parseLinearProjectsFromResponse(data);

  return parsedProjects.map((project) => {
    const projectRef: LinearProjectRef = {
      id: project.id,
      name: project.name,
      description: project.description,
      icon: project.icon,
      color: project.color,
      state: project.state,
      progress: project.progress,
    };

    return mapLinearProjectContract(projectRef, {
      issues: project.issueCount,
      issueBreakdown: project.issueBreakdown,
    });
  });
}

export async function listLinearIssues(teamId = LINEAR_TEAM_ID): Promise<LinearIssue[]> {
  const data = await linearQuery<{ team?: { issues?: { nodes?: LinearIssue[] } } }>(QUERIES.listIssues, { teamId });
  return data.team?.issues?.nodes ?? [];
}

export async function getTopTodoIssue(teamId = LINEAR_TEAM_ID): Promise<LinearIssue | null> {
  const issues = await listLinearIssues(teamId);
  const todo = issues.filter((issue) => normalizeIssueState(issue.state?.type) === 'todo');

  todo.sort((a, b) => {
    const priorityDiff = scorePriority(a.priority) - scorePriority(b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
  });

  return todo[0] ?? null;
}

export async function getStateIdForType(
  targetType: string,
  teamId = LINEAR_TEAM_ID,
): Promise<string | null> {
  const data = await linearQuery<{ team?: { states?: { nodes?: Array<{ id: string; type: string }> } } }>(
    QUERIES.states,
    { teamId },
  );
  const states = data.team?.states?.nodes ?? [];
  return states.find((s) => s.type === targetType)?.id ?? null;
}

export async function updateIssueStateByType(
  issueId: string,
  targetType: string,
  teamId = LINEAR_TEAM_ID,
): Promise<boolean> {
  const stateId = await getStateIdForType(targetType, teamId);
  if (!stateId) return false;
  const data = await linearQuery<{ issueUpdate?: { success?: boolean } }>(QUERIES.updateStatus, { issueId, stateId });
  return data.issueUpdate?.success ?? false;
}

async function getOrCreateLabelId(name: string, teamId = LINEAR_TEAM_ID): Promise<string | null> {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;

  const listed = await linearQuery<{ team?: { labels?: { nodes?: Array<{ id: string; name: string }> } } }>(
    QUERIES.listLabels,
    { teamId },
  );
  const labels = listed.team?.labels?.nodes ?? [];
  const existing = labels.find((label) => label.name.trim().toLowerCase() === normalized);
  if (existing) return existing.id;

  const created = await linearQuery<{ issueLabelCreate?: { success?: boolean; issueLabel?: { id: string } } }>(
    QUERIES.createLabel,
    { teamId, name, color: '#8b5cf6' },
  );
  if (created.issueLabelCreate?.success && created.issueLabelCreate.issueLabel?.id) {
    return created.issueLabelCreate.issueLabel.id;
  }
  return null;
}

export async function createLinearIssueServer(params: {
  title: string;
  description?: string;
  priority?: number;
  stateType?: string;
  labels?: string[];
  teamId?: string;
}): Promise<LinearIssue | null> {
  const teamId = params.teamId ?? LINEAR_TEAM_ID;
  const labelIds = params.labels?.length
    ? (await Promise.all(params.labels.map((label) => getOrCreateLabelId(label, teamId)))).filter(Boolean) as string[]
    : [];
  const stateId = params.stateType ? await getStateIdForType(params.stateType, teamId) : null;

  const data = await linearQuery<{ issueCreate?: { issue?: LinearIssue | null } }>(QUERIES.createIssue, {
    teamId,
    title: params.title,
    description: params.description,
    priority: params.priority,
    stateId,
    labelIds: labelIds.length > 0 ? labelIds : undefined,
  });

  return data.issueCreate?.issue ?? null;
}
