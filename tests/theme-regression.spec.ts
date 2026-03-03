import { expect, test } from 'playwright/test';
import {
  type ThemeName,
  applyThemeFixtureBeforeNavigation,
  gotoDashboardReady,
  prepareThemeHarness,
} from './support/themeToggleHarness';
import {
  AUDITED_SURFACE_STATE_TOKEN_EXPECTATIONS,
  THEME_SEMANTIC_CSS_VAR_CONTRACT,
} from './support/themeSurfaceTokenExpectations';
import {
  AUDITED_SURFACE_ROOTS,
  AUDITED_SURFACE_SELECTORS,
} from './support/themeSurfaceFixtures';
import {
  THEME_MATRIX,
  captureSurfaceSnapshot,
  collectHardcodedColorFingerprint,
  collectHardcodedColorFingerprintForSelectors,
  filterDisallowedClassTokens,
  readRootCssVariables,
  resolveColorExpressions,
} from './support/themeRegressionHarness';

const KNOWN_HARDCODED_COLOR_DEBT = new Set<string>([
  'bg-gray-500',
  'text-amber-300',
  'text-blue-400',
  'text-emerald-300',
]);

const NAVIGATION_SURFACE_SEMANTIC_WIRING_SNAPSHOT: {
  topbar: { backgroundColor: string; borderColor: string; color: string };
  sidebar: { backgroundColor: string; borderColor: string; color: string };
} = {
  topbar: {
    backgroundColor: '--bg-panel',
    borderColor: '--border-subtle',
    color: '--text-primary',
  },
  sidebar: {
    backgroundColor: '--bg-panel',
    borderColor: '--border-subtle',
    color: '--text-primary',
  },
};

const AUDITED_SURFACE_ROOT_SEMANTIC_SELECTORS = [
  AUDITED_SURFACE_SELECTORS.topbar,
  AUDITED_SURFACE_SELECTORS.sidebar,
  AUDITED_SURFACE_SELECTORS.activityFeed,
  AUDITED_SURFACE_SELECTORS.floatingTaskInputRoot,
  AUDITED_SURFACE_SELECTORS.floatingTaskInputField,
  AUDITED_SURFACE_SELECTORS.topbarTaskInputField,
  AUDITED_SURFACE_SELECTORS.createTaskButton,
  AUDITED_SURFACE_SELECTORS.themeToggleSwitch,
] as const;

function getRequiredVar(
  surface: keyof typeof AUDITED_SURFACE_STATE_TOKEN_EXPECTATIONS,
  state: keyof (typeof AUDITED_SURFACE_STATE_TOKEN_EXPECTATIONS)[keyof typeof AUDITED_SURFACE_STATE_TOKEN_EXPECTATIONS],
  slot: string,
): string {
  const stateExpectation = AUDITED_SURFACE_STATE_TOKEN_EXPECTATIONS[surface][state];
  const value = stateExpectation.vars?.[slot as keyof typeof stateExpectation.vars];
  if (!value) {
    throw new Error(`Missing canonical var mapping for ${surface}.${state}.${slot}`);
  }
  return value;
}

function detectUnexpectedHardcodedColorTokens(tokens: string[]): string[] {
  return tokens.filter(token => !KNOWN_HARDCODED_COLOR_DEBT.has(token));
}

test.describe('theme regression guardrails', () => {
  test.beforeEach(async ({ context, page }) => {
    await prepareThemeHarness(context, page);
  });

  for (const theme of THEME_MATRIX) {
    test(`guards navigation surfaces semantic wiring and literal color bans in ${theme} theme`, async ({ page }) => {
      await applyThemeFixtureBeforeNavigation(page, theme);
      await gotoDashboardReady(page, { assertAuditedSurfaces: true });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      const expectedRootCssVars = THEME_SEMANTIC_CSS_VAR_CONTRACT[theme];
      const rootValues = await readRootCssVariables(page, Object.keys(expectedRootCssVars));
      const resolvedSemanticVarColors = await resolveColorExpressions(page, rootValues);
      const surfaceSnapshot = await captureSurfaceSnapshot(page);

      const navigationSnapshot = {
        topbar: surfaceSnapshot.topbar,
        sidebar: surfaceSnapshot.sidebar,
      };

      expect(navigationSnapshot.topbar).toEqual({
        backgroundColor: resolvedSemanticVarColors[getRequiredVar('topbar', 'default', 'backgroundColor')],
        borderColor: resolvedSemanticVarColors[getRequiredVar('topbar', 'default', 'borderColor')],
        color: resolvedSemanticVarColors[getRequiredVar('topbar', 'default', 'color')],
      });
      expect(navigationSnapshot.sidebar).toEqual({
        backgroundColor: resolvedSemanticVarColors[getRequiredVar('sidebar', 'default', 'backgroundColor')],
        borderColor: resolvedSemanticVarColors[getRequiredVar('sidebar', 'default', 'borderColor')],
        color: resolvedSemanticVarColors[getRequiredVar('sidebar', 'default', 'color')],
      });
      expect({
        topbar: {
          backgroundColor: getRequiredVar('topbar', 'default', 'backgroundColor'),
          borderColor: getRequiredVar('topbar', 'default', 'borderColor'),
          color: getRequiredVar('topbar', 'default', 'color'),
        },
        sidebar: {
          backgroundColor: getRequiredVar('sidebar', 'default', 'backgroundColor'),
          borderColor: getRequiredVar('sidebar', 'default', 'borderColor'),
          color: getRequiredVar('sidebar', 'default', 'color'),
        },
      }).toEqual(NAVIGATION_SURFACE_SEMANTIC_WIRING_SNAPSHOT);

      const navigationRootFingerprint = await collectHardcodedColorFingerprintForSelectors(
        page,
        [AUDITED_SURFACE_SELECTORS.topbar, AUDITED_SURFACE_SELECTORS.sidebar],
        { includeDescendants: false },
      );
      const disallowedNavigationRootClassTokens = filterDisallowedClassTokens(navigationRootFingerprint.classTokens);
      expect(disallowedNavigationRootClassTokens).toEqual([]);
      expect(navigationRootFingerprint.inlineColorStyles).toEqual([]);
    });

    test(`validates token contracts, semantic surface wiring, and hardcoded color regression fingerprint in ${theme} theme`, async ({ page }) => {
      await applyThemeFixtureBeforeNavigation(page, theme);
      await gotoDashboardReady(page, { assertAuditedSurfaces: true });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      const expectedRootCssVars = THEME_SEMANTIC_CSS_VAR_CONTRACT[theme];

      const rootValues = await readRootCssVariables(page, Object.keys(expectedRootCssVars));
      for (const [varName, expectedValue] of Object.entries(expectedRootCssVars)) {
        expect(rootValues[varName], `Missing resolved CSS variable value for ${varName}`).not.toBe('');
        expect(rootValues[varName], `Theme contract drift for ${varName} in ${theme} theme`).toBe(expectedValue.toLowerCase());
      }

      const resolvedSemanticVarColors = await resolveColorExpressions(page, rootValues);

      const surfaceSnapshot = await captureSurfaceSnapshot(page);
      expect(surfaceSnapshot.topbar).toEqual({
        backgroundColor: resolvedSemanticVarColors[getRequiredVar('topbar', 'default', 'backgroundColor')],
        borderColor: resolvedSemanticVarColors[getRequiredVar('topbar', 'default', 'borderColor')],
        color: resolvedSemanticVarColors[getRequiredVar('topbar', 'default', 'color')],
      });
      expect(surfaceSnapshot.sidebar).toEqual({
        backgroundColor: resolvedSemanticVarColors[getRequiredVar('sidebar', 'default', 'backgroundColor')],
        borderColor: resolvedSemanticVarColors[getRequiredVar('sidebar', 'default', 'borderColor')],
        color: resolvedSemanticVarColors[getRequiredVar('sidebar', 'default', 'color')],
      });
      expect(surfaceSnapshot.activityFeed).toEqual({
        backgroundColor: resolvedSemanticVarColors[getRequiredVar('activityFeed', 'default', 'backgroundColor')],
        borderColor: resolvedSemanticVarColors[getRequiredVar('activityFeed', 'default', 'borderColor')],
        color: resolvedSemanticVarColors[getRequiredVar('activityFeed', 'default', 'color')],
      });
      expect(surfaceSnapshot.floatingTaskInputField).toEqual({
        backgroundColor: resolvedSemanticVarColors[getRequiredVar('floatingTaskInputField', 'default', 'backgroundColor')],
        borderColor: resolvedSemanticVarColors[getRequiredVar('floatingTaskInputField', 'default', 'borderColor')],
        color: resolvedSemanticVarColors[getRequiredVar('floatingTaskInputField', 'default', 'color')],
      });
      expect(surfaceSnapshot.topbarTaskInputField).toEqual({
        backgroundColor: resolvedSemanticVarColors[getRequiredVar('topbarTaskInputField', 'default', 'backgroundColor')],
        borderColor: resolvedSemanticVarColors[getRequiredVar('topbarTaskInputField', 'default', 'borderColor')],
        color: resolvedSemanticVarColors[getRequiredVar('topbarTaskInputField', 'default', 'color')],
      });
      expect(surfaceSnapshot.createTaskButton).toEqual({
        backgroundColor: resolvedSemanticVarColors[getRequiredVar('createTaskButton', 'default', 'backgroundColor')],
        borderColor: resolvedSemanticVarColors[getRequiredVar('createTaskButton', 'default', 'borderColor')],
        color: resolvedSemanticVarColors[getRequiredVar('createTaskButton', 'default', 'color')],
      });
      expect(surfaceSnapshot.themeToggle).toEqual({
        backgroundColor: resolvedSemanticVarColors[getRequiredVar('themeToggleSwitch', 'default', 'backgroundColor')],
        borderColor: resolvedSemanticVarColors[getRequiredVar('themeToggleSwitch', 'default', 'borderColor')],
        color: resolvedSemanticVarColors[getRequiredVar('themeToggleSwitch', 'default', 'color')],
        iconBackgroundColor: resolvedSemanticVarColors[getRequiredVar('themeToggleSwitch', 'default', 'iconBackgroundColor')],
        iconColor: resolvedSemanticVarColors[getRequiredVar('themeToggleSwitch', 'default', 'iconColor')],
        indicatorBackgroundColor: resolvedSemanticVarColors[getRequiredVar('themeToggleSwitch', 'default', 'indicatorBackgroundColor')],
      });

      const auditedSurfaceRootFingerprint = await collectHardcodedColorFingerprintForSelectors(
        page,
        [...AUDITED_SURFACE_ROOT_SEMANTIC_SELECTORS],
        { includeDescendants: false },
      );
      const disallowedAuditedRootTokens = filterDisallowedClassTokens(auditedSurfaceRootFingerprint.classTokens);
      expect(
        disallowedAuditedRootTokens,
        `Audited surface roots must not include hardcoded palette color classes in ${theme} theme`,
      ).toEqual([]);
      expect(auditedSurfaceRootFingerprint.inlineColorStyles).toEqual([]);

      const topbarFocusBorderVar = getRequiredVar('topbarTaskInputField', 'focus', 'borderColor');
      const topbarFocusShadowVar = getRequiredVar('topbarTaskInputField', 'focus', 'boxShadowColor');
      const floatingFocusBorderVar = getRequiredVar('floatingTaskInputField', 'focus', 'borderColor');
      const floatingFocusShadowVar = getRequiredVar('floatingTaskInputField', 'focus', 'boxShadowColor');
      const themeToggleFocusShadowVar = getRequiredVar('themeToggleSwitch', 'focus', 'boxShadowColor');
      const themeToggleFocusOutlineVar = getRequiredVar('themeToggleSwitch', 'focus', 'outlineColor');

      expect(surfaceSnapshot.focus.topbarTaskInput.borderColor).toBe(resolvedSemanticVarColors[topbarFocusBorderVar]);
      expect(surfaceSnapshot.focus.floatingTaskInput.borderColor).toBe(resolvedSemanticVarColors[floatingFocusBorderVar]);
      expect(surfaceSnapshot.focus.topbarTaskInput.boxShadow).toContain(resolvedSemanticVarColors[topbarFocusShadowVar]);
      expect(surfaceSnapshot.focus.floatingTaskInput.boxShadow).toContain(resolvedSemanticVarColors[floatingFocusShadowVar]);
      const themeToggleFocusUsesAccent =
        surfaceSnapshot.focus.themeToggle.boxShadow.includes(resolvedSemanticVarColors[themeToggleFocusShadowVar])
        || surfaceSnapshot.focus.themeToggle.outlineColor === resolvedSemanticVarColors[themeToggleFocusOutlineVar];
      expect(
        themeToggleFocusUsesAccent,
        `Theme toggle focus ring must use accent token (${resolvedSemanticVarColors[themeToggleFocusShadowVar]}); `
          + `got boxShadow="${surfaceSnapshot.focus.themeToggle.boxShadow}" `
          + `outlineColor="${surfaceSnapshot.focus.themeToggle.outlineColor}"`,
      ).toBe(true);

      const hardcodedFingerprint = await collectHardcodedColorFingerprint(page);
      const disallowedClassTokens = filterDisallowedClassTokens(hardcodedFingerprint.classTokens);
      const unexpectedDisallowedTokens = detectUnexpectedHardcodedColorTokens(disallowedClassTokens);
      expect(
        unexpectedDisallowedTokens,
        `Unexpected hardcoded color classes detected in ${theme} theme: ${unexpectedDisallowedTokens.join(', ')}`,
      ).toEqual([]);
      expect(hardcodedFingerprint.inlineColorStyles).toEqual([]);
    });

    test(`guards activity feed content and task input interactive states in ${theme} theme`, async ({ page }) => {
      await applyThemeFixtureBeforeNavigation(page, theme);
      await gotoDashboardReady(page, { assertAuditedSurfaces: true });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      const expectedRootCssVars = THEME_SEMANTIC_CSS_VAR_CONTRACT[theme];
      const rootValues = await readRootCssVariables(page, Object.keys(expectedRootCssVars));
      const resolvedSemanticVarColors = await resolveColorExpressions(page, rootValues);

      const activityFeed = page.getByTestId('dashboard-activity-feed');
      await expect(activityFeed.getByText('Activity Feed', { exact: true })).toBeVisible();
      await expect(activityFeed.getByText('Live', { exact: true })).toBeVisible();
      await expect(activityFeed.getByText('Autonomous mode', { exact: true })).toBeVisible();
      await expect(activityFeed.getByText('Messages in transit', { exact: true })).toBeVisible();
      await expect(activityFeed.getByText('Log entries', { exact: true })).toBeVisible();
      await expect(activityFeed.getByText('Auto completed', { exact: true })).toBeVisible();
      await expect(activityFeed.getByText('Cost burn', { exact: true })).toBeVisible();
      await expect(activityFeed.getByText(/tokens\/min budget/i)).toBeVisible();

      const secondaryColor = resolvedSemanticVarColors['--text-secondary'];
      await expect(activityFeed.getByText('Activity Feed', { exact: true })).toHaveCSS('color', secondaryColor);
      await expect(activityFeed.getByText('Live', { exact: true })).toHaveCSS('color', secondaryColor);
      await expect(activityFeed.getByText(/tokens\/min budget/i)).toHaveCSS('color', secondaryColor);

      const autonomousStatusValue = page.getByTestId('activity-feed-autonomous-status');
      await expect(autonomousStatusValue).toHaveText('OFF');
      await expect(autonomousStatusValue).toHaveCSS('color', secondaryColor);

      const topbarInput = page.getByTestId('task-input');
      const topbarSubmitButton = page.getByTestId('create-task-button');
      const floatingInput = page.getByTestId('task-input-floating-field');
      const floatingRoot = page.getByTestId('dashboard-task-input-floating');
      const floatingSubmitButton = floatingRoot.locator('button[type="submit"]');

      await expect(topbarInput).toHaveCSS(
        'background-color',
        resolvedSemanticVarColors[getRequiredVar('topbarTaskInputField', 'default', 'backgroundColor')],
      );
      await expect(topbarInput).toHaveCSS(
        'border-color',
        resolvedSemanticVarColors[getRequiredVar('topbarTaskInputField', 'default', 'borderColor')],
      );
      await expect(topbarInput).toHaveCSS(
        'color',
        resolvedSemanticVarColors[getRequiredVar('topbarTaskInputField', 'default', 'color')],
      );

      await expect(floatingInput).toHaveCSS(
        'background-color',
        resolvedSemanticVarColors[getRequiredVar('floatingTaskInputField', 'default', 'backgroundColor')],
      );
      await expect(floatingInput).toHaveCSS(
        'border-color',
        resolvedSemanticVarColors[getRequiredVar('floatingTaskInputField', 'default', 'borderColor')],
      );
      await expect(floatingInput).toHaveCSS(
        'color',
        resolvedSemanticVarColors[getRequiredVar('floatingTaskInputField', 'default', 'color')],
      );

      await floatingInput.hover();
      await expect(floatingInput).toHaveCSS(
        'border-color',
        resolvedSemanticVarColors[getRequiredVar('floatingTaskInputField', 'focus', 'borderColor')],
      );
      await floatingInput.focus();
      await expect(floatingInput).toHaveCSS(
        'border-color',
        resolvedSemanticVarColors[getRequiredVar('floatingTaskInputField', 'focus', 'borderColor')],
      );
      await expect(floatingInput).toHaveCSS(
        'box-shadow',
        new RegExp(resolvedSemanticVarColors[getRequiredVar('floatingTaskInputField', 'focus', 'boxShadowColor')].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      );

      await expect(floatingSubmitButton).toHaveCount(0);
      await floatingInput.fill('floating task for theme regression guardrails');
      await expect(floatingSubmitButton).toBeVisible();
      await expect(floatingSubmitButton).toHaveCSS(
        'background-color',
        resolvedSemanticVarColors[getRequiredVar('createTaskButton', 'default', 'backgroundColor')],
      );
      await expect(floatingSubmitButton).toHaveCSS(
        'color',
        resolvedSemanticVarColors[getRequiredVar('createTaskButton', 'default', 'color')],
      );

      let releaseCreateIssueRequest: (() => void) | null = null;
      let createIssueRequestSeen = false;
      await page.route('**/api/linear', async (route) => {
        const body = route.request().postDataJSON() as { action?: string };
        if (body?.action !== 'create' || createIssueRequestSeen) {
          await route.fallback();
          return;
        }

        createIssueRequestSeen = true;
        await new Promise<void>((resolve) => {
          releaseCreateIssueRequest = resolve;
        });
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              issueCreate: {
                issue: {
                  id: 'linear-guardrail-1',
                  identifier: 'SWA-66',
                  title: 'Theme regression guardrail task',
                  priority: 1,
                  url: 'https://linear.example/SWA-66',
                  state: { name: 'Backlog', type: 'backlog' },
                },
              },
            },
          }),
        });
      });

      await topbarInput.fill('topbar task for submitting state');
      await topbarSubmitButton.click();
      await expect.poll(() => createIssueRequestSeen).toBe(true);
      await expect(topbarSubmitButton).toHaveText('Creating...');
      await expect(topbarSubmitButton).toBeDisabled();
      await expect(topbarSubmitButton).toHaveCSS('opacity', '0.6');

      if (!releaseCreateIssueRequest) {
        throw new Error('Expected create issue request release callback to be defined.');
      }
      releaseCreateIssueRequest();
      await expect(topbarSubmitButton).toHaveText('Create Task →');
      await expect(topbarSubmitButton).toBeEnabled();
      await expect(topbarInput).toHaveValue('');
    });

    test(`detects intentional hardcoded color injections on all audited surfaces in ${theme} theme`, async ({ page }) => {
      await applyThemeFixtureBeforeNavigation(page, theme);
      await gotoDashboardReady(page, { assertAuditedSurfaces: true });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      for (const surface of AUDITED_SURFACE_ROOTS) {
        await page.evaluate(({ selector }) => {
          const root = document.querySelector<HTMLElement>(selector);
          if (!root) throw new Error(`Audited root not found for class injection: ${selector}`);
          root.classList.add('text-red-500');
        }, { selector: surface.selector });

        const classInjectedFingerprint = await collectHardcodedColorFingerprint(page);
        const classInjectedDisallowedTokens = filterDisallowedClassTokens(classInjectedFingerprint.classTokens);
        expect(
          classInjectedDisallowedTokens,
          `Expected injected palette class token to be detected for ${surface.key} in ${theme} theme`,
        ).toContain('text-red-500');

        await page.evaluate(({ selector }) => {
          const root = document.querySelector<HTMLElement>(selector);
          if (!root) throw new Error(`Audited root not found for class cleanup: ${selector}`);
          root.classList.remove('text-red-500');
        }, { selector: surface.selector });

        await page.evaluate(({ selector }) => {
          const root = document.querySelector<HTMLElement>(selector);
          if (!root) throw new Error(`Audited root not found for inline style injection: ${selector}`);
          root.setAttribute('data-inline-style-backup', root.getAttribute('style') ?? '__none__');
          const existing = root.getAttribute('style')?.trim() ?? '';
          const withTerminator = existing && !existing.endsWith(';') ? `${existing};` : existing;
          root.setAttribute('style', `${withTerminator}${withTerminator ? ' ' : ''}background-color:#ff00aa;`);
        }, { selector: surface.selector });

        const inlineInjectedFingerprint = await collectHardcodedColorFingerprint(page);
        expect(
          inlineInjectedFingerprint.inlineColorStyles,
          `Expected injected inline color property to include background-color:#ff00aa for ${surface.key} in ${theme} theme`,
        ).toContain('background-color:#ff00aa');
        expect(
          inlineInjectedFingerprint.inlineColorStyles.some(style => style.includes('background-color')),
          `Expected injected inline color property to include background-color for ${surface.key} in ${theme} theme`,
        ).toBe(true);

        await page.evaluate(({ selector }) => {
          const root = document.querySelector<HTMLElement>(selector);
          if (!root) throw new Error(`Audited root not found for inline style cleanup: ${selector}`);
          const backup = root.getAttribute('data-inline-style-backup');
          root.removeAttribute('data-inline-style-backup');
          if (backup === '__none__' || backup === null) {
            root.removeAttribute('style');
            return;
          }
          root.setAttribute('style', backup);
        }, { selector: surface.selector });
      }
    });
  }
});
