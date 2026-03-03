import { expect, test as base } from 'playwright/test';
import { gotoDashboardReady, prepareThemeHarness, seedStoredThemeBeforeNavigation } from './themeToggleHarness';

export type NavigateToDashboardOptions = {
  storedTheme?: string | null;
  assertAuditedSurfaces?: boolean;
};

type ThemeToggleFixtures = {
  gotoThemeDashboard: (options?: NavigateToDashboardOptions) => Promise<void>;
};

export const test = base.extend<ThemeToggleFixtures>({
  gotoThemeDashboard: async ({ page }, use) => {
    await use(async (options = {}) => {
      if (Object.prototype.hasOwnProperty.call(options, 'storedTheme')) {
        await seedStoredThemeBeforeNavigation(page, options.storedTheme ?? null);
      }

      await gotoDashboardReady(page, {
        assertAuditedSurfaces: options.assertAuditedSurfaces,
      });
    });
  },
});

test.beforeEach(async ({ context, page }) => {
  await prepareThemeHarness(context, page);
});

export { expect };
