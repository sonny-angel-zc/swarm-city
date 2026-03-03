import { DASHBOARD_TEST_IDS } from './themeToggleHarness';

export const AUDITED_SURFACE_ROOTS = [
  { key: 'themeSurfaceRoot', selector: `[data-testid="${DASHBOARD_TEST_IDS.themeSurfaceRoot}"]` },
  { key: 'topbar', selector: `[data-testid="${DASHBOARD_TEST_IDS.topbar}"]` },
  { key: 'sidebar', selector: `[data-testid="${DASHBOARD_TEST_IDS.sidebar}"]` },
  { key: 'activityFeed', selector: `[data-testid="${DASHBOARD_TEST_IDS.activityFeed}"]` },
  { key: 'floatingTaskInputRoot', selector: `[data-testid="${DASHBOARD_TEST_IDS.floatingTaskInputRoot}"]` },
] as const;

export type AuditedSurfaceRoot = (typeof AUDITED_SURFACE_ROOTS)[number];

export const AUDITED_SURFACE_SELECTORS = {
  themeSurfaceRoot: `[data-testid="${DASHBOARD_TEST_IDS.themeSurfaceRoot}"]`,
  topbar: `[data-testid="${DASHBOARD_TEST_IDS.topbar}"]`,
  sidebar: `[data-testid="${DASHBOARD_TEST_IDS.sidebar}"]`,
  activityFeed: `[data-testid="${DASHBOARD_TEST_IDS.activityFeed}"]`,
  floatingTaskInputRoot: `[data-testid="${DASHBOARD_TEST_IDS.floatingTaskInputRoot}"]`,
  floatingTaskInputField: `[data-testid="${DASHBOARD_TEST_IDS.floatingTaskInputField}"]`,
  topbarTaskInputField: `[data-testid="${DASHBOARD_TEST_IDS.topbarTaskInputField}"]`,
  createTaskButton: `[data-testid="${DASHBOARD_TEST_IDS.createTaskButton}"]`,
  themeToggleSwitch: `[data-testid="${DASHBOARD_TEST_IDS.themeToggleSwitch}"]`,
} as const;

export type AuditedSurfaceSelectorKey = keyof typeof AUDITED_SURFACE_SELECTORS;
