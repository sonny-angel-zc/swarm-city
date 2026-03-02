import { expect, test } from 'playwright/test';

type ThemeName = 'dark' | 'light';

type ContrastProbe = {
  id: string;
  foregroundVar: string;
  backgroundVar: string;
  minimumRatio: number;
};

type ResolvedProbe = {
  id: string;
  foregroundVar: string;
  backgroundVar: string;
  fg: string;
  bg: string;
};

const KEY_CONTRAST_PROBES: ContrastProbe[] = [
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
  {
    id: 'theme-toggle-text-on-toggle-bg',
    foregroundVar: '--theme-toggle-text',
    backgroundVar: '--theme-toggle-bg',
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

async function focusThemeToggleViaTab(page: import('playwright/test').Page) {
  const taskInput = page.getByPlaceholder('Enter a task for the swarm to execute...');
  const createTaskButton = page.getByRole('button', { name: 'Create Task →' });
  const presetSelect = page.getByRole('combobox', { name: 'Preset' });
  const toggle = page.getByRole('switch');

  await expect(taskInput).toBeVisible();
  await expect(createTaskButton).toBeVisible();
  await expect(presetSelect).toBeVisible();
  await expect(toggle).toBeVisible();
  await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    active?.blur();
  });

  await page.keyboard.press('Tab');
  await expect(taskInput).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(createTaskButton).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(presetSelect).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(toggle).toBeFocused();

  return toggle;
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
  test('defaults to dark mode when there is no stored preference', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('restores a persisted light mode preference on load', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('swarm:theme', 'light');
    });

    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('falls back to dark mode for an invalid stored preference', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('swarm:theme', 'invalid-theme');
    });

    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect
      .poll(async () =>
        page.evaluate(() => window.localStorage.getItem('swarm:theme')),
      )
      .toBe('invalid-theme');
  });

  test('toggles theme and persists to localStorage', async ({ page }) => {
    await page.goto('/');

    const toggle = page.getByRole('switch', { name: 'Switch to light mode' });
    await toggle.click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await expect
      .poll(async () =>
        page.evaluate(() => window.localStorage.getItem('swarm:theme')),
      )
      .toBe('light');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('TT-A11Y-02 keeps switch semantics and updates ARIA state on repeated interactions', async ({ page }) => {
    await page.goto('/');

    const toggle = page.getByRole('switch');
    let expectedTheme: 'dark' | 'light' = 'dark';
    await expectThemeToggleState(page, toggle, expectedTheme);

    for (let i = 0; i < 4; i += 1) {
      await toggle.click();
      expectedTheme = expectedTheme === 'dark' ? 'light' : 'dark';
      await expectThemeToggleState(page, toggle, expectedTheme);
    }
  });

  test('TT-A11Y-01 moves focus to theme toggle using keyboard-only Tab navigation', async ({ page }) => {
    await page.goto('/');

    const toggle = await focusThemeToggleViaTab(page);
    await expect(toggle).toHaveAttribute('role', 'switch');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to light mode');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('TT-A11Y-03 toggles theme with Space key from dark to light with deterministic state updates', async ({ page }) => {
    await page.goto('/');

    const toggle = await focusThemeToggleViaTab(page);
    await expect(toggle).toHaveAccessibleName('Switch to light mode');

    await toggle.press('Space');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to dark mode');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await expect
      .poll(async () =>
        page.evaluate(() => window.localStorage.getItem('swarm:theme')),
      )
      .toBe('light');
  });

  test('TT-A11Y-04 toggles theme with Enter key from light to dark with deterministic state updates', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('swarm:theme', 'light');
    });
    await page.goto('/');

    const toggle = await focusThemeToggleViaTab(page);
    await expect(toggle).toHaveAccessibleName('Switch to dark mode');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    await toggle.press('Enter');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to light mode');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect
      .poll(async () =>
        page.evaluate(() => window.localStorage.getItem('swarm:theme')),
      )
      .toBe('dark');
  });

  test('TT-A11Y-05/TT-A11Y-06 meets WCAG AA contrast thresholds for key theme foreground/background combinations', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByRole('switch', { name: 'Switch to light mode' });

    const assertThemeContrast = async (theme: ThemeName) => {
      const resolvedProbes = await resolveContrastProbes(page, KEY_CONTRAST_PROBES);
      for (const probe of resolvedProbes) {
        const config = KEY_CONTRAST_PROBES.find((candidate) => candidate.id === probe.id);
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
    };

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await assertThemeContrast('dark');

    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await assertThemeContrast('light');
  });
});
