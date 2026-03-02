import { expect, test } from 'playwright/test';

test('orchestration SSE events update store and close stream on task failure', async ({ page }) => {
  await page.addInitScript(() => {
    class MockEventSource {
      url: string;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      closed = false;

      constructor(url: string) {
        this.url = url;
        (window as Window & { __mockEventSources?: MockEventSource[] }).__mockEventSources ??= [];
        (window as Window & { __mockEventSources?: MockEventSource[] }).__mockEventSources?.push(this);
      }

      close() {
        this.closed = true;
      }
    }

    (window as Window & { __mockEventSources?: MockEventSource[] }).__mockEventSources = [];
    (window as Window & { EventSource: typeof MockEventSource }).EventSource = MockEventSource;
  });

  await page.route('**/api/limits', async (route) => {
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

  await page.route('**/api/autonomous**', async (route) => {
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

  await page.route('**/api/linear', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          team: {
            issues: { nodes: [] },
            states: { nodes: [] },
          },
        },
      }),
    });
  });

  await page.route('**/api/tasks/**/events', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });

  await page.goto('/');
  await expect(page.getByText('SWARM CITY')).toBeVisible();

  await page.evaluate(async () => {
    const store = (window as Window & { __swarmStore?: { getState: () => { resumeTask: (taskId: string) => Promise<void> } } }).__swarmStore;
    if (!store) throw new Error('Missing test store handle');
    await store.getState().resumeTask('task-stream-1');
  });

  await page.evaluate(() => {
    const source = (window as Window & { __mockEventSources?: Array<{ onmessage: ((e: MessageEvent) => void) | null }> }).__mockEventSources?.[0];
    if (!source?.onmessage) throw new Error('Missing mocked event source');
    const emit = (event: unknown) => source.onmessage?.({ data: JSON.stringify(event) } as MessageEvent);

    emit({
      type: 'task_created',
      task: {
        id: 'task-stream-1',
        title: 'Test SSE task',
        subtasks: [],
        status: 'decomposing',
        createdAt: Date.now(),
      },
    });
    emit({
      type: 'agent_status',
      taskId: 'task-stream-1',
      role: 'engineer',
      status: 'working',
      currentTask: 'Implement SSE compatibility',
      progress: 0.35,
      output: 'Compiling change set',
    });
  });

  const statusSnapshot = await page.evaluate(() => {
    const store = (window as Window & {
      __swarmStore?: {
        getState: () => {
          agents: Record<string, { status: string; currentTask: string | null; progress: number; log: Array<{ message: string }> }>;
        };
      };
    }).__swarmStore;
    if (!store) throw new Error('Missing test store handle');
    const engineer = store.getState().agents.engineer;
    return {
      status: engineer.status,
      currentTask: engineer.currentTask,
      progress: engineer.progress,
      output: engineer.log[engineer.log.length - 1]?.message ?? null,
    };
  });

  expect(statusSnapshot).toEqual({
    status: 'working',
    currentTask: 'Implement SSE compatibility',
    progress: 0.35,
    output: 'Compiling change set',
  });

  await page.evaluate(() => {
    const source = (window as Window & { __mockEventSources?: Array<{ onmessage: ((e: MessageEvent) => void) | null }> }).__mockEventSources?.[0];
    if (!source?.onmessage) throw new Error('Missing mocked event source');
    const emit = (event: unknown) => source.onmessage?.({ data: JSON.stringify(event) } as MessageEvent);

    emit({
      type: 'agent_retry',
      taskId: 'task-stream-1',
      role: 'engineer',
      attempt: 2,
      maxAttempts: 3,
      reason: 'rate limit',
      progress: 0.1,
    });
    emit({
      type: 'task_failed',
      taskId: 'task-stream-1',
      role: 'engineer',
      error: 'Retry budget exhausted',
      output: 'final retry failed',
    });
  });

  const failedSnapshot = await page.evaluate(() => {
    const win = window as Window & {
      __swarmStore?: {
        getState: () => {
          currentTask: { status: string } | null;
          currentTaskId: string | null;
          eventSource: unknown;
          agents: Record<string, { status: string; currentTask: string | null; progress: number; log: Array<{ message: string }> }>;
        };
      };
      __mockEventSources?: Array<{ closed: boolean }>;
    };
    const store = win.__swarmStore;
    if (!store) throw new Error('Missing test store handle');
    const state = store.getState();
    const engineer = state.agents.engineer;
    return {
      taskStatus: state.currentTask?.status ?? null,
      currentTaskId: state.currentTaskId,
      hasEventSource: state.eventSource !== null,
      sourceClosed: Boolean(win.__mockEventSources?.[0]?.closed),
      status: engineer.status,
      currentTask: engineer.currentTask,
      progress: engineer.progress,
      output: engineer.log[engineer.log.length - 1]?.message ?? null,
    };
  });

  expect(failedSnapshot).toEqual({
    taskStatus: 'failed',
    currentTaskId: null,
    hasEventSource: false,
    sourceClosed: true,
    status: 'blocked',
    currentTask: 'Retry 2/3: rate limit',
    progress: 0.1,
    output: 'final retry failed',
  });
});
