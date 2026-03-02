import { expect, test } from 'playwright/test';
import { type FailureCode, validateFailurePayload } from './contracts/failure-contract';

type FailureCase = {
  name: string;
  method: 'GET' | 'POST';
  url: string;
  status: number;
  code: FailureCode;
  data?: Record<string, unknown>;
};

const CASES: FailureCase[] = [
  {
    name: 'tasks title required',
    method: 'POST',
    url: '/api/tasks',
    status: 400,
    code: 'TASK_TITLE_REQUIRED',
    data: {},
  },
  {
    name: 'tasks provider unsupported',
    method: 'POST',
    url: '/api/tasks',
    status: 400,
    code: 'TASK_PROVIDER_UNSUPPORTED',
    data: { title: 'x', provider: 'invalid-provider' },
  },
  {
    name: 'agent message requires taskId + message',
    method: 'POST',
    url: '/api/agents/pm/message',
    status: 400,
    code: 'AGENT_MESSAGE_REQUIRED_FIELDS',
    data: {},
  },
  {
    name: 'autonomous requires enabled boolean',
    method: 'POST',
    url: '/api/autonomous',
    status: 400,
    code: 'AUTONOMOUS_ENABLED_REQUIRED',
    data: {},
  },
  {
    name: 'linear unknown action',
    method: 'POST',
    url: '/api/linear',
    status: 400,
    code: 'LINEAR_UNKNOWN_ACTION',
    data: { action: 'not-a-real-action' },
  },
  {
    name: 'task event stream task not found',
    method: 'GET',
    url: `/api/tasks/not-a-real-task-${Date.now()}/events`,
    status: 404,
    code: 'TASK_NOT_FOUND',
  },
];

test('api failure contracts match centralized schemas', async ({ request }) => {
  for (const entry of CASES) {
    await test.step(entry.name, async () => {
      const response =
        entry.method === 'POST'
          ? await request.post(entry.url, { data: entry.data })
          : await request.get(entry.url);

      expect(response.status(), `unexpected status for ${entry.name}`).toBe(entry.status);

      const payload = await response.json();
      const validationErrors = validateFailurePayload(payload, entry.code);

      expect(payload.code, `code mismatch for ${entry.name}`).toBe(entry.code);
      expect(validationErrors, `contract mismatch for ${entry.name}`).toEqual([]);
    });
  }
});
