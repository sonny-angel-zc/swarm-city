import { expect, test } from 'playwright/test';
import type { AgentRole, SubTask } from '../src/core/types';
import {
  executeStagedSubtasks,
  resolveStageExecutionPolicies,
  type SSEEvent,
} from '../src/core/orchestrator';

function buildSubtasks(): SubTask[] {
  const roles: AgentRole[] = ['researcher', 'designer', 'engineer', 'qa', 'devils_advocate', 'reviewer'];
  return roles.map((role, index) => ({
    id: `st-${index}`,
    title: `${role} task`,
    assignedTo: role,
    status: 'pending',
    progress: 0,
    description: `run ${role}`,
  }));
}

test('continues non-critical stages when qa fails', async () => {
  const events: SSEEvent[] = [];
  const attemptedRoles: AgentRole[] = [];

  const outcomes = await executeStagedSubtasks({
    taskId: 'task-partial-failure',
    subtasks: buildSubtasks(),
    accumulatedContext: [],
    humanMessages: new Map(),
    agentConfig: { provider: 'openai', model: 'gpt-5.3-codex' },
    stagePolicies: resolveStageExecutionPolicies(),
    deps: {
      setupWorkDirFn: (_taskId, role) => ({
        dir: `/tmp/${role}`,
        branch: `swarm/test/${role}`,
        created: false,
      }),
      runAgentFn: async (_taskId, role) => {
        attemptedRoles.push(role);
        if (role === 'qa') throw new Error('qa failure');
        return `${role} success`;
      },
      emitEventFn: (_taskId, event) => events.push(event),
    },
  });

  expect(outcomes.qa).toBe('failed');
  expect(outcomes.devils_advocate).toBe('succeeded');
  expect(attemptedRoles).toContain('devils_advocate');
  expect(events.some((event) => event.type === 'agent_done' && event.role === 'devils_advocate')).toBeTruthy();
});

test('blocks reviewer when a prerequisite stage fails', async () => {
  const events: SSEEvent[] = [];
  const attemptedRoles: AgentRole[] = [];

  const outcomes = await executeStagedSubtasks({
    taskId: 'task-blocked-reviewer',
    subtasks: buildSubtasks(),
    accumulatedContext: [],
    humanMessages: new Map(),
    agentConfig: { provider: 'openai', model: 'gpt-5.3-codex' },
    stagePolicies: resolveStageExecutionPolicies(),
    deps: {
      setupWorkDirFn: (_taskId, role) => ({
        dir: `/tmp/${role}`,
        branch: `swarm/test/${role}`,
        created: false,
      }),
      runAgentFn: async (_taskId, role) => {
        attemptedRoles.push(role);
        if (role === 'qa') throw new Error('qa failure');
        return `${role} success`;
      },
      emitEventFn: (_taskId, event) => events.push(event),
    },
  });

  expect(outcomes.reviewer).toBe('blocked');
  expect(attemptedRoles).not.toContain('reviewer');
  expect(events.some((event) => event.type === 'agent_assigned' && event.role === 'reviewer')).toBeFalsy();
  expect(
    events.some((event) => event.type === 'agent_error'
      && event.role === 'reviewer'
      && event.error.includes('Blocked by failed prerequisite stage(s): qa')),
  ).toBeTruthy();
});
