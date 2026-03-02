import { expect, test } from 'playwright/test';

type ThemeName = 'dark' | 'light';

type ContrastProbe = {
  id: string;
  foregroundVar: string;
  backgroundVar: string;
  minimumRatio: number;
};

type ElementContrastProbe = {
  id: string;
  selector: string;
  minimumRatio: number;
};

type ResolvedProbe = {
  id: string;
  foregroundVar: string;
  backgroundVar: string;
  fg: string;
  bg: string;
};

type ResolvedElementProbe = {
  id: string;
  selector: string;
  fg: string;
  bg: string;
};

const THEME_STORAGE_KEY = 'swarm:theme';
const LAST_TASK_STORAGE_KEY = 'swarm:lastTaskId';
const TEST_IDS = {
  taskInput: 'task-input',
  createTaskButton: 'create-task-button',
  modelPresetSelect: 'model-preset-select',
  themeToggleSwitch: 'theme-toggle-switch',
} as const;

const TOKEN_CONTRAST_PROBES: ContrastProbe[] = [
  {
    id: 'body-primary-on-canvas',
    foregroundVar: '--text-primary',
    backgroundVar: '--bg-canvas',
    minimumRatio: 4.5,
  },
  {
    id: 'body-secondary-on-canvas',
    foregroundVar: '--text-secondary',
    backgroundVar: '--bg-canvas',
    minimumRatio: 4.5,
  },
  {
    id: 'body-primary-on-panel',
    foregroundVar: '--text-primary',
    backgroundVar: '--bg-panel',
    minimumRatio: 4.5,
  },
];

const ELEMENT_CONTRAST_PROBES: ElementContrastProbe[] = [
  {
    id: 'theme-toggle-text-on-toggle-bg',
    selector: '[data-testid="theme-toggle-switch"]',
    minimumRatio: 4.5,
  },
];

function sRgbToLinear(channel: number): number {
  const normalized = channel / 255;
  if (normalized <= 0.03928) return normalized / 12.92;
  return ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb;
  return 0.2126 * sRgbToLinear(r) + 0.7152 * sRgbToLinear(g) + 0.0722 * sRgbToLinear(b);
}

function contrastRatio(foreground: [number, number, number], background: [number, number, number]): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgb(color: string): [number, number, number] {
  const matches = color.match(/\d+/g);
  if (!matches || matches.length < 3) {
    throw new Error(`Unable to parse RGB color value: ${color}`);
  }
  return [Number(matches[0]), Number(matches[1]), Number(matches[2])];
}

async function resolveContrastProbes(page: import('playwright/test').Page, probes: ContrastProbe[]): Promise<ResolvedProbe[]> {
  return page.evaluate((probeList: ContrastProbe[]) => {
    const container = document.createElement('div');
    container.setAttribute('data-test-id', 'contrast-probes');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.pointerEvents = 'none';

    document.body.appendChild(container);

    try {
      const resolved = probeList.map((probe) => {
        const sample = document.createElement('div');
        sample.textContent = 'contrast probe';
        sample.style.color = `var(${probe.foregroundVar})`;
        sample.style.backgroundColor = `var(${probe.backgroundVar})`;
        container.appendChild(sample);

        const style = window.getComputedStyle(sample);
        return {
          id: probe.id,
          foregroundVar: probe.foregroundVar,
          backgroundVar: probe.backgroundVar,
          fg: style.color,
          bg: style.backgroundColor,
        };
      });

      return resolved;
    } finally {
      container.remove();
    }
  }, probes);
}

async function resolveElementContrastProbes(
  page: import('playwright/test').Page,
  probes: ElementContrastProbe[],
): Promise<ResolvedElementProbe[]> {
  return page.evaluate((probeList: ElementContrastProbe[]) => {
    return probeList.map((probe) => {
      const element = document.querySelector<HTMLElement>(probe.selector);
      if (!element) {
        throw new Error(`Contrast probe element not found for selector: ${probe.selector}`);
      }

      const style = window.getComputedStyle(element);
      return {
        id: probe.id,
        selector: probe.selector,
        fg: style.color,
        bg: style.backgroundColor,
      };
    });
  }, probes);
}

async function focusThemeToggleViaTab(page: import('playwright/test').Page) {
  const taskInput = page.getByTestId(TEST_IDS.taskInput);
  const createTaskButton = page.getByTestId(TEST_IDS.createTaskButton);
  const presetSelect = page.getByTestId(TEST_IDS.modelPresetSelect);
  const toggle = page.getByTestId(TEST_IDS.themeToggleSwitch);

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

async function mockDashboardBootstrap(page: import('playwright/test').Page) {
  await page.route('**/api/limits', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        provider: 'playwright',
        plan: 'test',
        tokensPerMin: 50000,
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
    const payload = route.request().postDataJSON() as { action?: string };
    const action = payload.action;

    if (action === 'list') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            team: {
              issues: {
                nodes: [],
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
}

async function gotoDashboard(page: import('playwright/test').Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId(TEST_IDS.themeToggleSwitch)).toBeVisible();
  await expect(page.getByText('Loading swarm control plane...')).toHaveCount(0);
}

async function expectThemeState(
  page: import('playwright/test').Page,
  expectedTheme: ThemeName,
  options?: { persistedTheme?: ThemeName | null },
) {
  const toggle = page.getByTestId(TEST_IDS.themeToggleSwitch);
  const isDarkTheme = expectedTheme === 'dark';

  await expect(page.locator('html')).toHaveAttribute('data-theme', expectedTheme);
  if (isDarkTheme) {
    await expect(page.locator('html')).toHaveClass(/dark/);
  } else {
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  }

  await expect(toggle).toHaveAttribute('role', 'switch');
  await expect(toggle).toHaveAttribute('aria-checked', String(isDarkTheme));
  await expect(toggle).toHaveAttribute(
    'aria-label',
    isDarkTheme ? 'Switch to light mode' : 'Switch to dark mode',
  );

  if (options && Object.prototype.hasOwnProperty.call(options, 'persistedTheme')) {
    await expect
      .poll(async () =>
        page.evaluate((storageKey) => window.localStorage.getItem(storageKey), THEME_STORAGE_KEY),
      )
      .toBe(options.persistedTheme);
  }
}

async function expectThemeToggleState(
  page: import('playwright/test').Page,
  toggle: import('playwright/test').Locator,
  expectedTheme: 'dark' | 'light',
) {
  const isDarkTheme = expectedTheme === 'dark';

  await expect(toggle).toHaveAttribute('role', 'switch');
  await expect(toggle).toHaveAttribute('aria-checked', String(isDarkTheme));
  await expect(toggle).toHaveAttribute(
    'aria-label',
    isDarkTheme ? 'Switch to light mode' : 'Switch to dark mode',
  );
  await expect(page.locator('html')).toHaveAttribute('data-theme', expectedTheme);
}

test.describe('dashboard theme toggle', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.addInitScript(
      ({ themeStorageKey, lastTaskStorageKey }) => {
        window.localStorage.removeItem(themeStorageKey);
        window.localStorage.removeItem(lastTaskStorageKey);
      },
      { themeStorageKey: THEME_STORAGE_KEY, lastTaskStorageKey: LAST_TASK_STORAGE_KEY },
    );
    await mockDashboardBootstrap(page);
  });

  test('defaults to dark mode when there is no stored preference', async ({ page }) => {
    await gotoDashboard(page);
    await expectThemeState(page, 'dark', { persistedTheme: null });
  });

  test('restores a persisted light mode preference on load', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('swarm:theme', 'light');
    });

    await gotoDashboard(page);
    await expectThemeState(page, 'light', { persistedTheme: 'light' });
  });

  test('falls back to dark mode for an invalid stored preference', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('swarm:theme', 'invalid-theme');
    });

    await gotoDashboard(page);
    await expectThemeState(page, 'dark');
    await expect
      .poll(async () =>
        page.evaluate((storageKey) => window.localStorage.getItem(storageKey), THEME_STORAGE_KEY),
      )
      .toBe('invalid-theme');
  });

  test('toggles theme and persists to localStorage', async ({ page }) => {
    await gotoDashboard(page);

    const toggle = page.getByTestId(TEST_IDS.themeToggleSwitch);
    await expectThemeState(page, 'dark', { persistedTheme: null });
    await toggle.click();

    await expectThemeState(page, 'light', { persistedTheme: 'light' });

    await toggle.click();
    await expectThemeState(page, 'dark', { persistedTheme: 'dark' });

    await toggle.click();
    await expectThemeState(page, 'light', { persistedTheme: 'light' });

    await page.reload();
    await expect(page.getByTestId(TEST_IDS.themeToggleSwitch)).toBeVisible();
    await expectThemeState(page, 'light', { persistedTheme: 'light' });
  });

  test('TT-A11Y-02 keeps switch semantics and updates ARIA state on repeated interactions', async ({ page }) => {
    await gotoDashboard(page);

    const toggle = page.getByTestId(TEST_IDS.themeToggleSwitch);
    await expect(toggle).toHaveAttribute('role', 'switch');
    let expectedTheme: 'dark' | 'light' = 'dark';
    await expectThemeToggleState(page, toggle, expectedTheme);

    for (let i = 0; i < 4; i += 1) {
      await toggle.click();
      expectedTheme = expectedTheme === 'dark' ? 'light' : 'dark';
      await expectThemeToggleState(page, toggle, expectedTheme);
    }
  });

  test('TT-A11Y-01 moves focus to theme toggle using keyboard-only Tab navigation', async ({ page }) => {
    await gotoDashboard(page);

    const toggle = await focusThemeToggleViaTab(page);
    await expect(toggle).toHaveAttribute('role', 'switch');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to light mode');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('TT-A11Y-03 toggles theme with Space key from dark to light with deterministic state updates', async ({ page }) => {
    await gotoDashboard(page);

    const toggle = await focusThemeToggleViaTab(page);
    await expect(toggle).toHaveAttribute('role', 'switch');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toHaveAccessibleName('Switch to light mode');
    await expectThemeState(page, 'dark', { persistedTheme: null });

    await toggle.press('Space');
    await expectThemeState(page, 'light', { persistedTheme: 'light' });
  });

  test('TT-A11Y-04 toggles theme with Enter key from light to dark with deterministic state updates', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('swarm:theme', 'light');
    });
    await gotoDashboard(page);

    const toggle = await focusThemeToggleViaTab(page);
    await expect(toggle).toHaveAttribute('role', 'switch');
    await expect(toggle).toHaveAccessibleName('Switch to dark mode');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expectThemeState(page, 'light', { persistedTheme: 'light' });

    await toggle.press('Enter');
    await expectThemeState(page, 'dark', { persistedTheme: 'dark' });
  });

  test('TT-A11Y-05/TT-A11Y-06 meets WCAG AA contrast thresholds for key theme foreground/background combinations', async ({ page }) => {
    await gotoDashboard(page);
    const toggle = page.getByTestId(TEST_IDS.themeToggleSwitch);

    const assertThemeContrast = async (theme: ThemeName) => {
      const resolvedTokenProbes = await resolveContrastProbes(page, TOKEN_CONTRAST_PROBES);
      for (const probe of resolvedTokenProbes) {
        const config = TOKEN_CONTRAST_PROBES.find((candidate) => candidate.id === probe.id);
        if (!config) {
          throw new Error(`Missing contrast probe configuration for ${probe.id}`);
        }

        const ratio = contrastRatio(parseRgb(probe.fg), parseRgb(probe.bg));
        expect(
          ratio,
          `${theme} theme contrast failure for "${probe.id}" (${probe.foregroundVar} on ${probe.backgroundVar}): `
            + `${probe.fg} on ${probe.bg} = ${ratio.toFixed(2)}:1, expected >= ${config.minimumRatio}:1`,
        ).toBeGreaterThanOrEqual(config.minimumRatio);
      }

      const resolvedElementProbes = await resolveElementContrastProbes(page, ELEMENT_CONTRAST_PROBES);
      for (const probe of resolvedElementProbes) {
        const config = ELEMENT_CONTRAST_PROBES.find((candidate) => candidate.id === probe.id);
        if (!config) {
          throw new Error(`Missing element contrast probe configuration for ${probe.id}`);
        }

        const ratio = contrastRatio(parseRgb(probe.fg), parseRgb(probe.bg));
        expect(
          ratio,
          `${theme} theme element contrast failure for "${probe.id}" (${probe.selector}): `
            + `${probe.fg} on ${probe.bg} = ${ratio.toFixed(2)}:1, expected >= ${config.minimumRatio}:1`,
        ).toBeGreaterThanOrEqual(config.minimumRatio);
      }
    };

    await expectThemeState(page, 'dark', { persistedTheme: null });
    await assertThemeContrast('dark');

    await toggle.click();
    await expectThemeState(page, 'light', { persistedTheme: 'light' });
    await assertThemeContrast('light');
  });
});
