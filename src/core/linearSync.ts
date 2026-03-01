import { AgentRole, BacklogItem, BacklogPriority, BacklogStatus } from './types';

const TEAM_ID = '8687f779-d37c-49dc-82bf-3f2177df56a8';

// ─── Priority mapping ──────────────────────────────────────────────────────
// Linear: 0=none, 1=urgent, 2=high, 3=medium, 4=low
function mapPriority(linearPriority: number): BacklogPriority {
  switch (linearPriority) {
    case 1: return 'P0';
    case 2: return 'P1';
    case 3: return 'P2';
    default: return 'P3';
  }
}

// ─── Status mapping ────────────────────────────────────────────────────────
// Linear state types: backlog, unstarted, started, completed, canceled
function mapStatus(stateType: string): BacklogStatus {
  switch (stateType) {
    case 'started': return 'in_progress';
    case 'completed': return 'done';
    case 'canceled': return 'done';
    case 'unstarted': return 'todo';
    case 'backlog': return 'todo';
    default: return 'todo';
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

export async function syncFromLinear(): Promise<BacklogItem[]> {
  const result = await linearApi('list');
  const issues = result?.data?.team?.issues?.nodes ?? [];

  return issues.map((issue: Record<string, unknown>, i: number) => {
    const state = issue.state as { name: string; type: string } | undefined;
    const assignee = issue.assignee as { name: string } | undefined;
    const labels = (issue.labels as { nodes: { name: string; color: string }[] })?.nodes ?? [];

    return {
      id: issue.identifier as string,
      linearId: issue.id as string,
      linearUrl: issue.url as string,
      title: issue.title as string,
      ownerRole: pickOwner(i),
      ownerName: assignee?.name,
      status: mapStatus(state?.type ?? 'unstarted'),
      statusLabel: state?.name,
      priority: mapPriority(issue.priority as number),
      source: 'linear' as const,
      updatedAt: new Date(issue.updatedAt as string).getTime(),
      labels: labels.map(l => l.name),
    };
  });
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
    status: mapStatus(issue.state?.type ?? 'unstarted'),
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
