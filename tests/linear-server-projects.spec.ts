import { expect, test } from 'playwright/test';
import { listLinearProjects } from '../src/core/linearServer';

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

test('listLinearProjects normalizes projects and safely handles empty fields', async () => {
  process.env.LINEAR_API_KEY = 'test-key';

  let requestBody: Record<string, unknown> | null = null;
  const payload = {
    data: {
      team: {
        projects: {
          nodes: [
            {
              id: 'proj-1',
              name: ' Mobility Upgrade ',
              description: '   ',
              icon: '',
              color: ' #ff00aa ',
              state: { name: ' Planned ' },
              progress: 0.85,
              issues: {
                nodes: [
                  {
                    id: 'iss-1',
                    identifier: 'SWA-10',
                    title: 'Ship feature',
                    url: ' https://linear.app/swarm-city/issue/SWA-10 ',
                    updatedAt: ' 2026-03-01T10:00:00.000Z ',
                    state: { id: 'state-1', type: 'completed' },
                  },
                  {
                    id: 'iss-2',
                    identifier: 'SWA-11',
                    title: 'Investigate telemetry',
                    state: { name: 'started' },
                  },
                  {
                    id: 'iss-3',
                    identifier: 'SWA-12',
                    title: '',
                    state: null,
                  },
                  null,
                ],
              },
            },
            {
              id: '',
              name: '',
              description: null,
              issues: {
                nodes: null,
              },
            },
          ],
        },
      },
    },
  };

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit): Promise<MockFetchResponse> => {
    requestBody = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
    return {
      ok: true,
      status: 200,
      json: async () => payload,
    };
  }) as typeof fetch;

  const projects = await listLinearProjects('team-123');

  expect(requestBody?.variables).toEqual({ teamId: 'team-123' });
  expect(String(requestBody?.query)).toContain('projects(first: 100)');
  expect(String(requestBody?.query)).toContain('issues(first: 250)');
  expect(String(requestBody?.query)).toContain('identifier');
  expect(String(requestBody?.query)).toContain('state { id name type }');

  expect(projects).toHaveLength(2);
  expect(projects[0]).toMatchObject({
    id: 'proj-1',
    name: 'Mobility Upgrade',
    description: null,
    icon: null,
    color: '#ff00aa',
    state: 'Planned',
    totalIssues: 3,
    doneIssues: 1,
    issueBreakdown: {
      todo: 1,
      in_progress: 1,
      done: 1,
    },
    status: 'in_progress',
    progressSource: 'linear',
    progress: 0.85,
  });

  expect(projects[1]).toMatchObject({
    id: 'linear-project-2',
    name: 'Untitled Project',
    totalIssues: 0,
    doneIssues: 0,
    issueBreakdown: {
      todo: 0,
      in_progress: 0,
      done: 0,
    },
    status: 'done',
    progress: 0,
    progressSource: 'issues_fallback',
  });
});
