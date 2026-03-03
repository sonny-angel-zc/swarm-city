import { expect, type BrowserContext, type Locator, type Page } from 'playwright/test';
import { installDeterministicDashboardMocks } from './dashboardFixtures';
import { resolveThemeToggleUiState } from '../../src/core/theme';

export type ThemeName = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'swarm:theme';
export const LAST_TASK_STORAGE_KEY = 'swarm:lastTaskId';

export const DASHBOARD_TEST_IDS = {
  themeSurfaceRoot: 'dashboard-theme-surface-root',
  topbar: 'dashboard-topbar',
  sidebar: 'dashboard-sidebar',
  activityFeed: 'dashboard-activity-feed',
  floatingTaskInputRoot: 'dashboard-task-input-floating',
  floatingTaskInputField: 'task-input-floating-field',
  topbarTaskInputField: 'task-input',
  taskInput: 'task-input',
  createTaskButton: 'create-task-button',
  modelPresetSelect: 'model-preset-select',
  themeToggleSwitch: 'theme-toggle-switch',
  themeToggleIcon: 'theme-toggle-icon',
  themeToggleLabel: 'theme-toggle-label',
  themeToggleIndicator: 'theme-toggle-indicator',
} as const;

export async function prepareThemeHarness(context: BrowserContext, page: Page): Promise<void> {
  await context.clearCookies();
  await page.addInitScript(
    ({ themeStorageKey, lastTaskStorageKey }) => {
      window.localStorage.removeItem(themeStorageKey);
      window.localStorage.removeItem(lastTaskStorageKey);
    },
    {
      themeStorageKey: THEME_STORAGE_KEY,
      lastTaskStorageKey: LAST_TASK_STORAGE_KEY,
    },
  );
  await installDeterministicDashboardMocks(page);
}

export async function seedStoredThemeBeforeNavigation(
  page: Page,
  storedTheme: string | null,
): Promise<void> {
  await page.addInitScript(
    ({ themeStorageKey, nextStoredTheme }) => {
      if (nextStoredTheme === null) {
        window.localStorage.removeItem(themeStorageKey);
        return;
      }
      window.localStorage.setItem(themeStorageKey, nextStoredTheme);
    },
    {
      themeStorageKey: THEME_STORAGE_KEY,
      nextStoredTheme: storedTheme,
    },
  );
}

export async function applyThemeFixtureBeforeNavigation(page: Page, theme: ThemeName): Promise<void> {
  await seedStoredThemeBeforeNavigation(page, theme === 'light' ? 'light' : null);
}

export async function gotoDashboardReady(page: Page, options: { assertAuditedSurfaces?: boolean } = {}): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId(DASHBOARD_TEST_IDS.themeToggleSwitch)).toBeVisible();
  await expect(page.getByText('Loading swarm control plane...')).toHaveCount(0);

  if (options.assertAuditedSurfaces) {
    await expect(page.getByTestId(DASHBOARD_TEST_IDS.themeSurfaceRoot)).toBeVisible();
    await expect(page.getByTestId(DASHBOARD_TEST_IDS.topbar)).toBeVisible();
    await expect(page.getByTestId(DASHBOARD_TEST_IDS.sidebar)).toBeVisible();
    await expect(page.getByTestId(DASHBOARD_TEST_IDS.activityFeed)).toBeVisible();
    await expect(page.getByTestId(DASHBOARD_TEST_IDS.floatingTaskInputRoot)).toBeVisible();
  }
}

export async function expectThemeState(
  page: Page,
  expectedTheme: ThemeName,
  options?: { persistedTheme?: ThemeName | null },
): Promise<void> {
  const toggle = page.getByTestId(DASHBOARD_TEST_IDS.themeToggleSwitch);
  const themeToggleUiState = resolveThemeToggleUiState(expectedTheme);
  const isDarkTheme = themeToggleUiState.isChecked;

  await expect(page.locator('html')).toHaveAttribute('data-theme', expectedTheme);
  if (isDarkTheme) {
    await expect(page.locator('html')).toHaveClass(/dark/);
  } else {
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  }

  await expect(toggle).toHaveAttribute('role', 'switch');
  await expect(toggle).toHaveAttribute('aria-checked', String(isDarkTheme));
  await expect(toggle).toHaveAttribute('aria-label', themeToggleUiState.ariaLabel);
  await expect(toggle).toHaveAttribute('title', themeToggleUiState.title);
  await expect(toggle).toHaveAttribute('data-theme-current', themeToggleUiState.currentTheme);
  await expect(toggle).toHaveAttribute('data-theme-target', themeToggleUiState.nextTheme);
  await expect(toggle).toHaveAttribute('data-theme-switch-checked', String(themeToggleUiState.isChecked));

  if (options && Object.prototype.hasOwnProperty.call(options, 'persistedTheme')) {
    await expect
      .poll(async () =>
        page.evaluate((storageKey) => window.localStorage.getItem(storageKey), THEME_STORAGE_KEY),
      )
      .toBe(options.persistedTheme);
  }
}

export async function expectThemeToggleState(
  page: Page,
  toggle: Locator,
  expectedTheme: ThemeName,
): Promise<void> {
  const themeToggleUiState = resolveThemeToggleUiState(expectedTheme);

  await expect(toggle).toHaveAttribute('role', 'switch');
  await expect(toggle).toHaveAttribute('aria-checked', String(themeToggleUiState.isChecked));
  await expect(toggle).toHaveAttribute('aria-label', themeToggleUiState.ariaLabel);
  await expect(toggle).toHaveAttribute('title', themeToggleUiState.title);
  await expect(toggle).toHaveAttribute('data-theme-current', themeToggleUiState.currentTheme);
  await expect(toggle).toHaveAttribute('data-theme-target', themeToggleUiState.nextTheme);
  await expect(toggle).toHaveAttribute('data-theme-switch-checked', String(themeToggleUiState.isChecked));
  await expect(page.locator('html')).toHaveAttribute('data-theme', expectedTheme);
}

export async function expectThemeToggleVisualState(
  toggle: Locator,
  expectedTheme: ThemeName,
): Promise<void> {
  const themeToggleUiState = resolveThemeToggleUiState(expectedTheme);

  await expect(toggle.getByTestId(DASHBOARD_TEST_IDS.themeToggleIcon)).toHaveText(themeToggleUiState.icon);
  await expect(toggle.getByTestId(DASHBOARD_TEST_IDS.themeToggleLabel)).toHaveText(themeToggleUiState.visibleLabel);
}

export async function focusThemeToggleViaTab(page: Page): Promise<Locator> {
  const taskInput = page.getByTestId(DASHBOARD_TEST_IDS.taskInput);
  const createTaskButton = page.getByTestId(DASHBOARD_TEST_IDS.createTaskButton);
  const presetSelect = page.getByTestId(DASHBOARD_TEST_IDS.modelPresetSelect);
  const toggle = page.getByTestId(DASHBOARD_TEST_IDS.themeToggleSwitch);

  await expect(taskInput).toBeVisible();
  await expect(createTaskButton).toBeVisible();
  await expect(presetSelect).toHaveCount(1);
  await expect(toggle).toBeVisible();
  await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    active?.blur();
  });

  await page.keyboard.press('Tab');
  await expect(taskInput).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(createTaskButton).toBeFocused();
  if (await presetSelect.isVisible()) {
    await page.keyboard.press('Tab');
    await expect(presetSelect).toBeFocused();
  }
  await page.keyboard.press('Tab');
  await expect(toggle).toBeFocused();

  return toggle;
}

export async function switchTheme(page: Page, targetTheme: ThemeName): Promise<void> {
  const currentTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  if (currentTheme !== targetTheme) {
    await page.getByTestId(DASHBOARD_TEST_IDS.themeToggleSwitch).click();
  }
  await expectThemeState(page, targetTheme, {
    persistedTheme: targetTheme,
  });
}

export async function beginThemeTransitionCapture(page: Page): Promise<void> {
  await page.evaluate(() => {
    type TransitionCaptureWindow = Window & {
      __swarmThemeTransitionObserver?: MutationObserver;
      __swarmThemeTransitions?: string[];
    };

    const captureWindow = window as TransitionCaptureWindow;
    captureWindow.__swarmThemeTransitionObserver?.disconnect();
    captureWindow.__swarmThemeTransitions = [];

    const root = document.documentElement;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type !== 'attributes' || record.attributeName !== 'data-theme') {
          continue;
        }
        const currentTheme = root.getAttribute('data-theme');
        if (currentTheme) {
          captureWindow.__swarmThemeTransitions?.push(currentTheme);
        }
      }
    });

    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    captureWindow.__swarmThemeTransitionObserver = observer;
  });
}

export async function endThemeTransitionCapture(page: Page): Promise<ThemeName[]> {
  return page.evaluate(() => {
    type TransitionCaptureWindow = Window & {
      __swarmThemeTransitionObserver?: MutationObserver;
      __swarmThemeTransitions?: string[];
    };

    const captureWindow = window as TransitionCaptureWindow;
    captureWindow.__swarmThemeTransitionObserver?.disconnect();
    delete captureWindow.__swarmThemeTransitionObserver;

    const transitions = (captureWindow.__swarmThemeTransitions ?? [])
      .filter((theme): theme is ThemeName => theme === 'dark' || theme === 'light');

    delete captureWindow.__swarmThemeTransitions;
    return transitions;
  });
}
