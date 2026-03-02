import { expect, test } from 'playwright/test';

test('home page smoke test', async ({ page }) => {
  const issues: Array<{
    id: string;
    identifier: string;
    title: string;
    url: string;
    priority: number;
    updatedAt: string;
    state: { name: string; type: string };
    labels: { nodes: Array<{ name: string; color: string }> };
  }> = [];

  await page.route('**/api/linear', async route => {
    const payload = route.request().postDataJSON() as { action?: string; title?: string };
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
            },
          },
        }),
      });
      return;
    }

    if (action === 'create') {
      const issueNumber = issues.length + 1;
      const issue = {
        id: `issue-${issueNumber}`,
        identifier: `SW-${issueNumber}`,
        title: payload.title ?? `Smoke Task ${issueNumber}`,
        url: `https://linear.app/swarm/issue/SW-${issueNumber}`,
        priority: 1,
        updatedAt: new Date().toISOString(),
        state: { name: 'Backlog', type: 'backlog' },
        labels: { nodes: [] },
      };
      issues.unshift(issue);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            issueCreate: {
              success: true,
              issue,
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
        body: JSON.stringify({
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
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: {} }),
    });
  });

  await page.goto('/');

  await expect(page.getByText('SWARM CITY')).toBeVisible();
  await expect(page.getByPlaceholder('Enter a task for the swarm to execute...')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Task →' }).first()).toBeVisible();

  const taskTitle = `Smoke Task ${Date.now()}`;
  await page.getByPlaceholder('Enter a task for the swarm to execute...').fill(taskTitle);
  await page.getByRole('button', { name: 'Create Task →' }).first().click();

  await expect(page.getByText(taskTitle)).toBeVisible();
  await expect(page.getByText('1 issues')).toBeVisible();
});
