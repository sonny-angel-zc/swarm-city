import { expect, test } from './support/themeToggleFixtures';
import {
  DASHBOARD_TEST_IDS,
  type ThemeName,
  beginThemeTransitionCapture,
  endThemeTransitionCapture,
  expectThemeState,
  expectThemeToggleVisualState,
  expectThemeToggleState,
  focusThemeToggleViaTab,
  switchTheme,
} from './support/themeToggleHarness';
import {
  expectThemeContrastToMeetWcagAa,
  expectVisibleKeyboardFocus,
} from './support/themeToggleA11yHarness';

test.describe('dashboard theme toggle', () => {
  test('defaults to dark mode when there is no stored preference', async ({ page, gotoThemeDashboard }) => {
    await gotoThemeDashboard();
    await expectThemeState(page, 'dark', { persistedTheme: null });
  });

  test('restores a persisted light mode preference on load', async ({ page, gotoThemeDashboard }) => {
    await gotoThemeDashboard({ storedTheme: 'light' });
    await expectThemeState(page, 'light', { persistedTheme: 'light' });
  });

  test('falls back to dark mode for an invalid stored preference', async ({ page, gotoThemeDashboard }) => {
    await gotoThemeDashboard({ storedTheme: 'invalid-theme' });
    await expectThemeState(page, 'dark');
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem('swarm:theme'))).toBe('invalid-theme');
  });

  test('toggles theme and persists to localStorage', async ({ page, gotoThemeDashboard }) => {
    await gotoThemeDashboard();

    const toggle = page.getByTestId(DASHBOARD_TEST_IDS.themeToggleSwitch);
    await expectThemeState(page, 'dark', { persistedTheme: null });
    await toggle.click();

    await expectThemeState(page, 'light', { persistedTheme: 'light' });

    await toggle.click();
    await expectThemeState(page, 'dark', { persistedTheme: 'dark' });

    await toggle.click();
    await expectThemeState(page, 'light', { persistedTheme: 'light' });

    await page.reload();
    await expect(page.getByTestId(DASHBOARD_TEST_IDS.themeToggleSwitch)).toBeVisible();
    await expectThemeState(page, 'light', { persistedTheme: 'light' });
  });

  test('TT-A11Y-02 keeps switch semantics and updates ARIA state on repeated interactions', async ({ page, gotoThemeDashboard }) => {
    await gotoThemeDashboard();

    const toggle = page.getByTestId(DASHBOARD_TEST_IDS.themeToggleSwitch);
    const expectedStates: Array<{
      theme: ThemeName;
      ariaChecked: 'true' | 'false';
      accessibleName: string;
      persistedTheme: ThemeName | null;
    }> = [
      { theme: 'dark', ariaChecked: 'true', accessibleName: 'Switch to light mode', persistedTheme: null },
      { theme: 'light', ariaChecked: 'false', accessibleName: 'Switch to dark mode', persistedTheme: 'light' },
      { theme: 'dark', ariaChecked: 'true', accessibleName: 'Switch to light mode', persistedTheme: 'dark' },
      { theme: 'light', ariaChecked: 'false', accessibleName: 'Switch to dark mode', persistedTheme: 'light' },
      { theme: 'dark', ariaChecked: 'true', accessibleName: 'Switch to light mode', persistedTheme: 'dark' },
    ];

    for (let i = 0; i < expectedStates.length; i += 1) {
      const expectedState = expectedStates[i];
      await expect(page.getByRole('switch', { name: expectedState.accessibleName })).toHaveCount(1);
      await expect(toggle).toHaveAttribute('role', 'switch');
      await expect(toggle).toHaveAttribute('aria-checked', expectedState.ariaChecked);
      await expectThemeToggleState(page, toggle, expectedState.theme);
      await expectThemeState(page, expectedState.theme, { persistedTheme: expectedState.persistedTheme });
      if (i === expectedStates.length - 1) {
        continue;
      }
      await toggle.click();
    }

    await page.reload();
    await expect(page.getByTestId(DASHBOARD_TEST_IDS.themeToggleSwitch)).toBeVisible();
    await expectThemeState(page, 'dark', { persistedTheme: 'dark' });
  });

  test('TT-A11Y-01 moves focus to theme toggle using keyboard-only Tab navigation', async ({ page, gotoThemeDashboard }) => {
    await gotoThemeDashboard();

    const toggle = await focusThemeToggleViaTab(page);
    await expectVisibleKeyboardFocus(toggle);
    await expect(toggle).toHaveAttribute('role', 'switch');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to light mode');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    const autonomousToggle = page.getByTitle('Toggle autonomous execution loop');
    await expect(autonomousToggle).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(autonomousToggle).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(toggle).toBeFocused();
  });

  test('TT-A11Y-03 toggles theme with Space key from dark and light with deterministic single-transition state updates', async ({ page, gotoThemeDashboard }) => {
    await gotoThemeDashboard();

    const toggle = await focusThemeToggleViaTab(page);
    const scenarios: ReadonlyArray<{
      fromTheme: ThemeName;
      toTheme: ThemeName;
      persistedThemeBefore: ThemeName | null;
    }> = [
      { fromTheme: 'dark', toTheme: 'light', persistedThemeBefore: null },
      { fromTheme: 'light', toTheme: 'dark', persistedThemeBefore: 'light' },
    ];

    for (const scenario of scenarios) {
      await expectVisibleKeyboardFocus(toggle);
      await expect(toggle).toHaveAttribute('role', 'switch');
      await expectThemeState(page, scenario.fromTheme, { persistedTheme: scenario.persistedThemeBefore });
      await expectThemeToggleVisualState(toggle, scenario.fromTheme);
      await expect(toggle).toBeFocused();

      await beginThemeTransitionCapture(page);
      await page.keyboard.press('Space');
      await expect(toggle).toBeFocused();
      await expectVisibleKeyboardFocus(toggle);
      await expect(toggle).toHaveAttribute('role', 'switch');
      await expectThemeState(page, scenario.toTheme, { persistedTheme: scenario.toTheme });
      await expectThemeToggleVisualState(toggle, scenario.toTheme);

      const themeTransitions = await endThemeTransitionCapture(page);
      expect(themeTransitions).toEqual([scenario.toTheme]);
    }

    await page.reload();
    const reloadedToggle = page.getByTestId(DASHBOARD_TEST_IDS.themeToggleSwitch);
    await expect(reloadedToggle).toBeVisible();
    await expectThemeState(page, 'dark', { persistedTheme: 'dark' });
    await expectThemeToggleVisualState(reloadedToggle, 'dark');
  });

  test('TT-A11Y-04 toggles theme with Enter key from dark and light with deterministic single-transition state updates', async ({ page, gotoThemeDashboard }) => {
    await gotoThemeDashboard();

    const toggle = await focusThemeToggleViaTab(page);
    const scenarios: ReadonlyArray<{
      fromTheme: ThemeName;
      toTheme: ThemeName;
      persistedThemeBefore: ThemeName | null;
    }> = [
      { fromTheme: 'dark', toTheme: 'light', persistedThemeBefore: null },
      { fromTheme: 'light', toTheme: 'dark', persistedThemeBefore: 'light' },
    ];

    for (const scenario of scenarios) {
      await expectVisibleKeyboardFocus(toggle);
      await expect(toggle).toHaveAttribute('role', 'switch');
      await expectThemeState(page, scenario.fromTheme, { persistedTheme: scenario.persistedThemeBefore });
      await expectThemeToggleVisualState(toggle, scenario.fromTheme);
      await expect(toggle).toBeFocused();

      await beginThemeTransitionCapture(page);
      await page.keyboard.press('Enter');
      await expect(toggle).toBeFocused();
      await expectVisibleKeyboardFocus(toggle);
      await expect(toggle).toHaveAttribute('role', 'switch');
      await expectThemeState(page, scenario.toTheme, { persistedTheme: scenario.toTheme });
      await expectThemeToggleVisualState(toggle, scenario.toTheme);

      const themeTransitions = await endThemeTransitionCapture(page);
      expect(themeTransitions).toEqual([scenario.toTheme]);
    }

    await page.reload();
    const reloadedToggle = page.getByTestId(DASHBOARD_TEST_IDS.themeToggleSwitch);
    await expect(reloadedToggle).toBeVisible();
    await expectThemeState(page, 'dark', { persistedTheme: 'dark' });
    await expectThemeToggleVisualState(reloadedToggle, 'dark');
  });

  test('TT-A11Y-05/TT-A11Y-06 meets WCAG AA contrast thresholds for key theme foreground/background combinations', async ({ page, gotoThemeDashboard }) => {
    await gotoThemeDashboard();
    await expectThemeState(page, 'dark', { persistedTheme: null });
    await expectThemeContrastToMeetWcagAa(page, 'dark');

    await switchTheme(page, 'light');
    await expectThemeContrastToMeetWcagAa(page, 'light');
  });
});
