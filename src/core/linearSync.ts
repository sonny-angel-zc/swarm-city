import { AgentRole, BacklogItem } from './types';

let syncCounter = 0;

function pickOwner(i: number): AgentRole {
  const owners: AgentRole[] = ['pm', 'researcher', 'designer', 'engineer', 'qa', 'devils_advocate', 'reviewer'];
  return owners[i % owners.length] ?? 'pm';
}

export async function fetchLinearBacklogStub(): Promise<BacklogItem[]> {
  await new Promise(resolve => setTimeout(resolve, 320));

  const now = Date.now();
  const batch = syncCounter;
  syncCounter += 1;

  return [
    {
      id: `LIN-${120 + batch}`,
      title: 'Telemetry drilldown by provider and model',
      ownerRole: pickOwner(batch + 0),
      status: 'in_progress',
      priority: 'P1',
      source: 'linear_stub',
      updatedAt: now - 15_000,
    },
    {
      id: `LIN-${121 + batch}`,
      title: 'Backlog panel filtering + assignment actions',
      ownerRole: pickOwner(batch + 1),
      status: 'todo',
      priority: 'P2',
      source: 'linear_stub',
      updatedAt: now - 30_000,
    },
    {
      id: `LIN-${122 + batch}`,
      title: 'Guardrail alerts when treasury runway under 10m',
      ownerRole: pickOwner(batch + 2),
      status: 'blocked',
      priority: 'P0',
      source: 'linear_stub',
      updatedAt: now - 5_000,
    },
  ];
}
