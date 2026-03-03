import { expect, test } from 'playwright/test';

type MockIssue = {
  id: string;
  identifier: string;
  title: string;
  description: string;
  priority: number;
  priorityLabel: string;
  url: string;
  updatedAt: string;
  createdAt: string;
  state: { name: string; type: string };
  project?: { id: string; name: string } | null;
  assignee: { name: string } | null;
  labels: { nodes: Array<{ name: string; color: string }> };
};

test('linear integration flow: sync, create, and status update', async ({ page }) => {
  const now = new Date().toISOString();
  const issues: MockIssue[] = [
    {
      id: 'linear-1',
      identifier: 'SWA-1',
      title: 'Initial linear issue',
      description: '',
      priority: 2,
      priorityLabel: 'High',
      url: 'https://linear.app/swarm-city/issue/SWA-1',
      updatedAt: now,
      createdAt: now,
      state: { name: 'Backlog', type: 'backlog' },
      project: { id: 'project-1', name: 'Mobility Upgrade' },
      assignee: { name: 'Sonny' },
      labels: { nodes: [] },
    },
  ];
  let updateStatusCalls = 0;

  await page.route('**/api/limits', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        provider: 'openai',
        plan: 'local-cli',
        model: 'gpt-5.3-codex',
        codexAvailable: true,
        claudeAvailable: false,
        tokensPerMin: 50000,
        requestsPerMin: 300,
        contextWindow: 200000,
      }),
    });
  });

  await page.route('**/api/autonomous**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
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
      }),
    });
  });

  await page.route('**/api/linear', async route => {
    const payload = route.request().postDataJSON() as {
      action?: string;
      title?: string;
      issueId?: string;
      stateId?: string;
      priority?: number;
    };
    const action = payload.action;

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
              projects: {
                nodes: [],
              },
            },
          },
          contracts: {
            projects: [
              {
                id: 'project-1',
                name: 'Mobility Upgrade',
                description: 'Upgrade mobility and transit systems.',
                progress: 0.6,
                state: 'In Progress',
                issues: 3,
                issueBreakdown: { todo: 1, in_progress: 1, done: 1 },
                districtId: 'mobility-upgrade',
                status: 'in_progress',
                progressSource: 'linear',
                totalIssues: 3,
                doneIssues: 1,
                icon: null,
                color: null,
                isUnassigned: false,
              },
            ],
          },
        }),
      });
      return;
    }

    if (action === 'states') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            team: {
              states: {
                nodes: [
                  { id: 'state-backlog', name: 'Backlog', type: 'backlog', position: 0 },
                  { id: 'state-started', name: 'In Progress', type: 'started', position: 1 },
                  { id: 'state-completed', name: 'Done', type: 'completed', position: 2 },
                ],
              },
            },
          },
        }),
      });
      return;
    }

    if (action === 'create') {
      const next = issues.length + 1;
      const createdAt = new Date().toISOString();
      const newIssue: MockIssue = {
        id: `linear-${next}`,
        identifier: `SWA-${next}`,
        title: payload.title ?? `Created issue ${next}`,
        description: '',
        priority: payload.priority ?? 3,
        priorityLabel: 'Medium',
        url: `https://linear.app/swarm-city/issue/SWA-${next}`,
        updatedAt: createdAt,
        createdAt,
        state: { name: 'Backlog', type: 'backlog' },
        assignee: null,
        labels: { nodes: [] },
      };
      issues.unshift(newIssue);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            issueCreate: {
              success: true,
              issue: newIssue,
            },
          },
        }),
      });
      return;
    }

    if (action === 'updateStatus') {
      updateStatusCalls += 1;
      const issue = issues.find((entry) => entry.id === payload.issueId);
      if (issue && payload.stateId === 'state-started') {
        issue.state = { name: 'In Progress', type: 'started' };
        issue.updatedAt = new Date().toISOString();
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            issueUpdate: {
              success: true,
              issue: issue
                ? {
                  id: issue.id,
                  identifier: issue.identifier,
                  state: issue.state,
                }
                : null,
            },
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: `Unhandled action: ${action}` }),
    });
  });

  await page.goto('/');

  await expect(page.getByText('Linear Backlog')).toBeVisible();
  await expect(page.getByText('Initial linear issue')).toBeVisible();
  await expect(page.getByText('1 issues')).toBeVisible();
  const strategicDistricts = page.getByTestId('strategic-districts');
  const mobilityTab = page.getByTestId('district-tab-mobility-upgrade');
  await expect(strategicDistricts).toBeVisible();
  await expect(mobilityTab).toContainText('In Progress');
  await expect(mobilityTab).toContainText('T1 I1 D1');
  await expect(mobilityTab).toContainText('Linear-estimated');
  await expect(mobilityTab).toHaveAttribute('data-district-status', 'in_progress');
  await expect(mobilityTab).toHaveAttribute('data-district-progress-source', 'linear');
  await expect(mobilityTab).toHaveAttribute('data-district-progress', '60');

  const createdTitle = `Linear test issue ${Date.now()}`;
  await page.getByRole('button', { name: '+ New' }).click();
  await page.getByPlaceholder('Issue title...').fill(createdTitle);
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByText(createdTitle)).toBeVisible();
  await expect(page.getByText('2 issues')).toBeVisible();
  await mobilityTab.click();
  await expect(page.locator('[data-backlog-filter-project-id]')).toHaveAttribute('data-backlog-filter-project-id', 'project-1');
  await expect(page.getByText('Queue focus: Mobility Upgrade • Showing 1 of 2 issues')).toBeVisible();
  await expect(page.getByText(createdTitle)).toHaveCount(0);

  await page.locator('button[title*="click to cycle"]').first().click();
  await expect.poll(() => updateStatusCalls).toBe(1);
  await expect(page.getByText('◑ in progress (1)')).toBeVisible();
});
