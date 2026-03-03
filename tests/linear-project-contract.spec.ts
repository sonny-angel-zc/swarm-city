import { expect, test } from 'playwright/test';
import {
  mapLinearProjectContract,
  normalizeIssueState,
  toIssueBreakdownBucket,
  UNASSIGNED_PROJECT_ID,
  UNASSIGNED_PROJECT_NAME,
} from '../src/core/linearProject';

test('maps Linear issue states into strategic buckets', () => {
  expect(normalizeIssueState('started')).toBe('in_progress');
  expect(normalizeIssueState('in_progress')).toBe('in_progress');
  expect(normalizeIssueState('completed')).toBe('done');
  expect(normalizeIssueState('canceled')).toBe('done');
  expect(normalizeIssueState('cancelled')).toBe('done');
  expect(normalizeIssueState('triage')).toBe('todo');
  expect(normalizeIssueState('unknown')).toBe('todo');
});

test('maps issue breakdown buckets for strategic project rollups', () => {
  expect(toIssueBreakdownBucket('in progress')).toBe('in_progress');
  expect(toIssueBreakdownBucket('started')).toBe('in_progress');
  expect(toIssueBreakdownBucket('completed')).toBe('done');
  expect(toIssueBreakdownBucket('todo')).toBe('todo');
  expect(toIssueBreakdownBucket(undefined)).toBe('todo');
});

test('uses Linear project progress when available', () => {
  const project = mapLinearProjectContract(
    {
      id: 'project-1',
      name: 'Mobility Upgrade',
      progress: 80,
    },
    {
      issues: 4,
      issueBreakdown: {
        todo: 2,
        in_progress: 1,
        done: 1,
      },
    },
  );

  expect(project.progress).toBe(0.8);
  expect(project.progressSource).toBe('linear');
  expect(project.status).toBe('in_progress');
  expect(project.doneIssues).toBe(1);
  expect(project.totalIssues).toBe(4);
});

test('falls back to done/total issue ratio when Linear progress is missing', () => {
  const project = mapLinearProjectContract(
    {
      id: 'project-2',
      name: 'Supply Chain',
      progress: null,
    },
    {
      issues: 4,
      issueBreakdown: {
        todo: 2,
        in_progress: 1,
        done: 1,
      },
    },
  );

  expect(project.progress).toBe(0.25);
  expect(project.progressSource).toBe('issues_fallback');
});

test('uses zero progress guard when project has no issues and no Linear progress', () => {
  const project = mapLinearProjectContract(
    {
      id: 'project-3',
      name: 'Supply Chain',
      progress: undefined,
    },
    {
      issues: 0,
      issueBreakdown: {
        todo: 0,
        in_progress: 0,
        done: 0,
      },
    },
  );

  expect(project.progress).toBe(0);
  expect(project.progressSource).toBe('issues_fallback');
  expect(project.status).toBe('done');
});

test('assigns unprojected issues to the synthetic "No Project" bucket', () => {
  const project = mapLinearProjectContract(
    null,
    {
      issues: 3,
      issueBreakdown: {
        todo: 2,
        in_progress: 0,
        done: 1,
      },
    },
  );

  expect(project.id).toBe(UNASSIGNED_PROJECT_ID);
  expect(project.name).toBe(UNASSIGNED_PROJECT_NAME);
  expect(project.name).toBe('No Project');
  expect(project.isUnassigned).toBe(true);
  expect(project.districtId).toBe('unassigned');
});
