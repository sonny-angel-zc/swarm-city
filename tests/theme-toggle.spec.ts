import { expect, test } from 'playwright/test';

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

  test('supports keyboard navigation and updates ARIA state/label', async ({ page }) => {
    await page.goto('/');

    const toggle = page.getByRole('switch', { name: 'Switch to light mode' });
    let reachedToggleWithTab = false;

    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press('Tab');
      const focusedRole = await page.evaluate(() => document.activeElement?.getAttribute('role'));
      if (focusedRole === 'switch') {
        reachedToggleWithTab = true;
        break;
      }
    }

    expect(reachedToggleWithTab).toBeTruthy();
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to light mode');

    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to dark mode');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to light mode');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('meets WCAG AA contrast for the theme toggle text in dark and light modes', async ({ page }) => {
    await page.goto('/');

    const toggle = page.getByRole('switch', { name: 'Switch to light mode' });

    const darkColors = await toggle.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        fg: style.color,
        bg: style.backgroundColor,
      };
    });

    await toggle.click();

    const lightColors = await page.getByRole('switch', { name: 'Switch to dark mode' }).evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        fg: style.color,
        bg: style.backgroundColor,
      };
    });

    const parseRgb = (color: string): [number, number, number] => {
      const matches = color.match(/\d+/g);
      if (!matches || matches.length < 3) {
        throw new Error(`Unable to parse RGB color value: ${color}`);
      }
      return [Number(matches[0]), Number(matches[1]), Number(matches[2])];
    };

    const darkContrast = contrastRatio(parseRgb(darkColors.fg), parseRgb(darkColors.bg));
    const lightContrast = contrastRatio(parseRgb(lightColors.fg), parseRgb(lightColors.bg));

    expect(darkContrast).toBeGreaterThanOrEqual(4.5);
    expect(lightContrast).toBeGreaterThanOrEqual(4.5);
  });
});
