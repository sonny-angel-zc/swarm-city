import { expect, test } from 'playwright/test';
import { syncFromLinear } from '../src/core/linearSync';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('prefers API-provided project contracts when available', async () => {
  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        data: {
          team: {
            issues: {
              nodes: [
                {
                  id: 'linear-1',
                  identifier: 'SWA-1',
                  title: 'Route stabilization',
                  priority: 2,
                  url: 'https://linear.app/swarm-city/issue/SWA-1',
                  updatedAt: '2026-03-02T10:00:00.000Z',
                  state: { name: 'In Progress', type: 'started' },
                  labels: { nodes: [] },
                  project: { id: 'project-1', name: 'Mobility Upgrade' },
                },
              ],
            },
            projects: {
              nodes: [
                {
                  id: 'project-1',
                  name: 'Mobility Upgrade',
                  progress: 0.25,
                  state: 'planned',
                  issues: { nodes: [{ state: { type: 'started' } }] },
                },
              ],
            },
          },
        },
        contracts: {
          projects: [
            {
              id: 'project-1',
              name: 'Mobility Upgrade',
              description: null,
              progress: 0.6,
              state: 'planned',
              issues: 5,
              issueBreakdown: { todo: 2, in_progress: 2, done: 1 },
              districtId: 'mobility-upgrade',
              status: 'in_progress',
              progressSource: 'issues_fallback',
              totalIssues: 5,
              doneIssues: 1,
              icon: null,
              color: null,
              isUnassigned: false,
            },
          ],
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;

  const synced = await syncFromLinear();

  expect(synced.projects).toHaveLength(1);
  expect(synced.projects[0]?.progress).toBe(0.6);
  expect(synced.projects[0]?.issueBreakdown).toEqual({ todo: 2, in_progress: 2, done: 1 });
  expect(synced.backlog[0]?.projectProgress).toBe(0.6);
});

test('falls back to raw Linear project mapping when API contracts are absent', async () => {
  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        data: {
          team: {
            issues: {
              nodes: [],
            },
            projects: {
              nodes: [
                {
                  id: 'project-2',
                  name: 'Supply Chain',
                  description: null,
                  icon: null,
                  color: null,
                  state: 'started',
                  progress: 80,
                  issues: { nodes: [] },
                },
              ],
            },
          },
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;

  const synced = await syncFromLinear();

  expect(synced.projects).toHaveLength(1);
  expect(synced.projects[0]?.id).toBe('project-2');
  expect(synced.projects[0]?.progress).toBe(0.8);
  expect(synced.projects[0]?.progressSource).toBe('linear');
  expect(synced.projects[0]?.issueBreakdown).toEqual({ todo: 0, in_progress: 0, done: 0 });
});

test('keeps issue project linkage when API project contracts are partial', async () => {
  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        data: {
          team: {
            issues: {
              nodes: [
                {
                  id: 'linear-2',
                  identifier: 'SWA-2',
                  title: 'Unlinked contract issue',
                  priority: 2,
                  url: 'https://linear.app/swarm-city/issue/SWA-2',
                  updatedAt: '2026-03-02T10:00:00.000Z',
                  state: { name: 'Backlog', type: 'backlog' },
                  labels: { nodes: [] },
                  project: { id: 'project-missing', name: 'Missing Contract Project' },
                },
              ],
            },
            projects: {
              nodes: [],
            },
          },
        },
        contracts: {
          projects: [
            {
              id: 'project-other',
              name: 'Other Project',
              description: null,
              progress: 0.1,
              state: 'planned',
              issues: 1,
              issueBreakdown: { todo: 1, in_progress: 0, done: 0 },
              districtId: 'other-project',
              status: 'todo',
              progressSource: 'linear',
              totalIssues: 1,
              doneIssues: 0,
              icon: null,
              color: null,
              isUnassigned: false,
            },
          ],
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;

  const synced = await syncFromLinear();

  expect(synced.projects).toHaveLength(1);
  expect(synced.backlog[0]?.projectId).toBe('project-missing');
  expect(synced.backlog[0]?.projectName).toBe('Missing Contract Project');
});
