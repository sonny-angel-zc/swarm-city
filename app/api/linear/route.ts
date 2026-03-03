import { NextRequest, NextResponse } from 'next/server';
import {
  getIssueProjectIdentity,
  mapLinearProjectContract,
  toIssueBreakdownBucket,
  UNASSIGNED_PROJECT_ID,
  type LinearProjectRef,
} from '@/core/linearProject';
import type { LinearProjectContract } from '@/core/types';

const LINEAR_API = 'https://api.linear.app/graphql';
const API_KEY = process.env.LINEAR_API_KEY ?? '';

async function linearQuery(query: string, variables?: Record<string, unknown>) {
  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: API_KEY,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { error: `Linear API ${res.status}: ${text}` };
  }
  return res.json();
}

type LinearIssueNode = {
  state?: { type?: string | null } | null;
  project?: LinearProjectRef;
};

type LinearProjectNode = {
  id?: string | null;
  name?: string | null;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  state?: string | { name?: string | null; type?: string | null } | null;
  progress?: number | null;
  issues?: { nodes?: LinearIssueNode[] | null } | null;
};

type LinearListPayload = {
  data?: {
    team?: {
      issues?: { nodes?: LinearIssueNode[] | null } | null;
      projects?: { nodes?: LinearProjectNode[] | null } | null;
    } | null;
  } | null;
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

function toProjectStateLabel(state: LinearProjectNode['state']): string | null {
  if (typeof state === 'string') return state;
  if (state?.name) return state.name;
  if (state?.type) return state.type;
  return null;
}

function mapProjectContractsFromListPayload(payload: LinearListPayload): LinearProjectContract[] {
  const issues = payload.data?.team?.issues?.nodes ?? [];
  const projectNodes = payload.data?.team?.projects?.nodes ?? [];
  const projectStats = new Map<string, ProjectStats>();
  const includeIssueDerivedStats = projectNodes.length === 0;

  for (const projectNode of projectNodes) {
    const projectIssues = projectNode?.issues?.nodes ?? [];
    const projectRef: LinearProjectRef = {
      id: projectNode?.id ?? '',
      name: projectNode?.name ?? '',
      description: projectNode?.description ?? null,
      icon: projectNode?.icon ?? null,
      color: projectNode?.color ?? null,
      state: toProjectStateLabel(projectNode?.state ?? null),
      progress: projectNode?.progress ?? null,
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

  for (const issue of issues) {
    const projectIdentity = getIssueProjectIdentity(issue?.project);
    if (
      !includeIssueDerivedStats &&
      projectIdentity.id !== UNASSIGNED_PROJECT_ID &&
      projectStats.has(projectIdentity.id)
    ) {
      continue;
    }
    const existing = projectStats.get(projectIdentity.id) ?? {
      project: issue?.project,
      issues: 0,
      issueBreakdown: { todo: 0, in_progress: 0, done: 0 },
    };
    existing.issues += 1;
    existing.issueBreakdown[toIssueBreakdownBucket(issue?.state?.type)] += 1;
    projectStats.set(projectIdentity.id, existing);
  }

  const mappedProjects = new Map<string, LinearProjectContract>();
  for (const [projectId, stats] of projectStats.entries()) {
    mappedProjects.set(projectId, mapLinearProjectContract(stats.project, stats));
  }
  return Array.from(mappedProjects.values());
}

const QUERIES = {
  list: `query($teamId: String!) {
    team(id: $teamId) {
      issues(first: 50, orderBy: updatedAt) {
        nodes {
          id identifier title description priority priorityLabel
          state { name type }
          project { id name }
          assignee { name }
          url
          createdAt updatedAt
          labels { nodes { name color } }
        }
      }
      projects(first: 20) {
        nodes {
          id
          name
          description
          color
          state
          progress
          issues(first: 50) {
            nodes {
              state { type }
            }
          }
        }
      }
    }
  }`,
  create: `mutation($teamId: String!, $title: String!, $description: String, $priority: Int, $stateId: String) {
    issueCreate(input: { teamId: $teamId, title: $title, description: $description, priority: $priority, stateId: $stateId }) {
      success
      issue { id identifier title url state { name type } project { id name description icon color state progress } priority }
    }
  }`,
  updateStatus: `mutation($issueId: String!, $stateId: String!) {
    issueUpdate(id: $issueId, input: { stateId: $stateId }) {
      success
      issue { id identifier state { name type } }
    }
  }`,
  states: `query($teamId: String!) {
    team(id: $teamId) {
      states { nodes { id name type position } }
    }
  }`,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, teamId, title, description, priority, issueId, stateId } = body;

    switch (action) {
      case 'list': {
        const response = await linearQuery(QUERIES.list, { teamId });
        if (response && typeof response === 'object' && 'error' in response) {
          return NextResponse.json(response, { status: 502 });
        }
        const payload = response as LinearListPayload;
        const projects = mapProjectContractsFromListPayload(payload);
        return NextResponse.json({
          ...payload,
          contracts: {
            projects,
          },
        });
      }
      case 'create':
        return NextResponse.json(
          await linearQuery(QUERIES.create, { teamId, title, description, priority, stateId }),
        );
      case 'updateStatus':
        return NextResponse.json(
          await linearQuery(QUERIES.updateStatus, { issueId, stateId }),
        );
      case 'states':
        return NextResponse.json(await linearQuery(QUERIES.states, { teamId }));
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
