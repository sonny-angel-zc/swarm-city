import type { Page } from 'playwright/test';

type LinearIssueFixture = {
  id: string;
  identifier: string;
  title: string;
  url: string;
  priority: number;
  updatedAt: string;
  state: { name: string; type: string };
  labels: { nodes: Array<{ name: string; color: string }> };
};

type DashboardFixtureOptions = {
  linearIssues?: LinearIssueFixture[];
};

const LIMITS_FIXTURE = {
  provider: 'playwright',
  plan: 'test',
  tokensPerMin: 50000,
} as const;

const AUTONOMOUS_STATUS_FIXTURE = {
  enabled: false,
  running: false,
  paused: false,
  pauseReason: null,
  cooldownUntil: null,
  intervalMs: 60000,
  currentTask: null,
  completedTasks: [],
  events: [],
  seeded: false,
  lastTickAt: null,
} as const;

const LINEAR_STATES_FIXTURE = {
  data: {
    team: {
      states: {
        nodes: [
          { id: 'state-backlog', name: 'Backlog', type: 'backlog', position: 0 },
          { id: 'state-started', name: 'In Progress', type: 'started', position: 1 },
          { id: 'state-done', name: 'Done', type: 'completed', position: 2 },
        ],
      },
    },
  },
} as const;

const AGENT_STATUS_FIXTURE = {
  pm: {
    status: 'idle',
    currentTask: null,
    lastOutput: null,
    updatedAt: 1,
    tokensUsed: 0,
    taskStartedAt: null,
  },
  engineer: {
    status: 'idle',
    currentTask: null,
    lastOutput: null,
    updatedAt: 1,
    tokensUsed: 0,
    taskStartedAt: null,
  },
  designer: {
    status: 'idle',
    currentTask: null,
    lastOutput: null,
    updatedAt: 1,
    tokensUsed: 0,
    taskStartedAt: null,
  },
  qa: {
    status: 'idle',
    currentTask: null,
    lastOutput: null,
    updatedAt: 1,
    tokensUsed: 0,
    taskStartedAt: null,
  },
  devils_advocate: {
    status: 'idle',
    currentTask: null,
    lastOutput: null,
    updatedAt: 1,
    tokensUsed: 0,
    taskStartedAt: null,
  },
  reviewer: {
    status: 'idle',
    currentTask: null,
    lastOutput: null,
    updatedAt: 1,
    tokensUsed: 0,
    taskStartedAt: null,
  },
  researcher: {
    status: 'idle',
    currentTask: null,
    lastOutput: null,
    updatedAt: 1,
    tokensUsed: 0,
    taskStartedAt: null,
  },
} as const;

function readLinearAction(request: { postData(): string | null }): string | undefined {
  const raw = request.postData();
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as { action?: string };
    return parsed.action;
  } catch {
    return undefined;
  }
}

export async function installDeterministicDashboardMocks(
  page: Page,
  options: DashboardFixtureOptions = {},
): Promise<void> {
  const issues = options.linearIssues ?? [];

  await page.route('**/api/limits', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(LIMITS_FIXTURE),
    });
  });

  await page.route('**/api/autonomous**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(AUTONOMOUS_STATUS_FIXTURE),
    });
  });

  await page.route('**/api/agents/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(AGENT_STATUS_FIXTURE),
    });
  });

  await page.route('**/api/linear', async (route) => {
    const action = readLinearAction(route.request());

    if (action === 'list') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            team: {
              issues: {
                nodes: issues,
              },
            },
          },
        }),
      });
      return;
    }

    if (action === 'states') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(LINEAR_STATES_FIXTURE),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: {} }),
    });
  });
}
