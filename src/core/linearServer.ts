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
  labels: {
    nodes: Array<{ id: string; name: string }>;
  };
};

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

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
      issues(first: 100, orderBy: updatedAt) {
        nodes {
          id
          identifier
          title
          description
          priority
          url
          updatedAt
          state { id name type }
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
};

function scorePriority(priority: number | null | undefined): number {
  // Linear: 1 urgent, 2 high, 3 medium, 4 low, 0 none
  if (priority === 1) return 1;
  if (priority === 2) return 2;
  if (priority === 3) return 3;
  if (priority === 4) return 4;
  return 5;
}

export async function listLinearIssues(teamId = LINEAR_TEAM_ID): Promise<LinearIssue[]> {
  const data = await linearQuery<{ team?: { issues?: { nodes?: LinearIssue[] } } }>(QUERIES.listIssues, { teamId });
  return data.team?.issues?.nodes ?? [];
}

export async function getTopTodoIssue(teamId = LINEAR_TEAM_ID): Promise<LinearIssue | null> {
  const issues = await listLinearIssues(teamId);
  const todo = issues.filter((issue) => {
    const stateType = issue.state?.type ?? 'unstarted';
    return stateType === 'backlog' || stateType === 'unstarted';
  });

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
