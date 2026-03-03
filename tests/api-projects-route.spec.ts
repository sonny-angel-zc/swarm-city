import { expect, test } from 'playwright/test';
import { GET } from '../app/api/projects/route';

type MockFetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

const originalFetch = global.fetch;
const originalLinearApiKey = process.env.LINEAR_API_KEY;

test.afterEach(() => {
  global.fetch = originalFetch;
  if (originalLinearApiKey == null) {
    delete process.env.LINEAR_API_KEY;
  } else {
    process.env.LINEAR_API_KEY = originalLinearApiKey;
  }
});

test('GET /api/projects returns issue breakdown with issue-derived progress percentage', async () => {
  process.env.LINEAR_API_KEY = 'test-key';

  const payload = {
    data: {
      team: {
        projects: {
          nodes: [
            {
              id: 'project-1',
              name: 'Mobility Upgrade',
              description: 'Reduce travel time',
              state: { name: 'Active' },
              progress: 0.9,
              issues: {
                nodes: [
                  { id: 'i-1', identifier: 'SWA-1', title: 'A', state: { type: 'completed' } },
                  { id: 'i-2', identifier: 'SWA-2', title: 'B', state: { type: 'started' } },
                  { id: 'i-3', identifier: 'SWA-3', title: 'C', state: { type: 'backlog' } },
                  { id: 'i-4', identifier: 'SWA-4', title: 'D', state: { type: 'todo' } },
                ],
              },
            },
            {
              id: 'project-2',
              name: 'Ops Hardening',
              description: null,
              state: 'Planned',
              progress: null,
              issues: {
                nodes: [],
              },
            },
          ],
        },
      },
    },
  };

  global.fetch = (async () => {
    return {
      ok: true,
      status: 200,
      json: async () => payload,
    } as MockFetchResponse;
  }) as typeof fetch;

  const response = await GET();
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body).toEqual({
    projects: [
      {
        id: 'project-1',
        name: 'Mobility Upgrade',
        description: 'Reduce travel time',
        state: 'Active',
        issueBreakdown: {
          todo: 2,
          inProgress: 1,
          done: 1,
        },
        // Must be issue-derived (1 done out of 4), not Linear project.progress (90%).
        progressPercentage: 25,
        totalIssues: 4,
      },
      {
        id: 'project-2',
        name: 'Ops Hardening',
        description: null,
        state: 'Planned',
        issueBreakdown: {
          todo: 0,
          inProgress: 0,
          done: 0,
        },
        progressPercentage: 0,
        totalIssues: 0,
      },
    ],
  });
});
