import type { Page } from 'playwright/test';
import { DASHBOARD_TEST_IDS, type ThemeName } from './themeToggleHarness';
import { AUDITED_SURFACE_ROOTS } from './themeSurfaceFixtures';

const DISALLOWED_COLOR_CLASS_TOKEN = /^(?:bg|text|border|ring|stroke|fill|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950)(?:\/\d{1,3})?$/;
const DISALLOWED_NAMED_COLOR_CLASS_TOKEN = /^(?:bg|text|border|ring|stroke|fill|shadow)-(?:black|white|transparent|current)(?:\/\d{1,3})?$/;
const DISALLOWED_ARBITRARY_LITERAL_COLOR_CLASS_TOKEN = /^(?:bg|text|border|ring|stroke|fill|shadow)-\[(?:(?!var\().)*(?:#|rgb|hsl|oklch)\S*]$/i;

type SurfaceStyle = {
  backgroundColor: string;
  borderColor: string;
  color: string;
};

type FocusStyle = {
  borderColor: string;
  boxShadow: string;
  outlineColor: string;
};

type ThemeToggleStyle = SurfaceStyle & {
  iconBackgroundColor: string;
  iconColor: string;
  indicatorBackgroundColor: string;
};

export type SurfaceSnapshot = {
  topbar: SurfaceStyle;
  sidebar: SurfaceStyle;
  activityFeed: SurfaceStyle;
  floatingTaskInputField: SurfaceStyle;
  topbarTaskInputField: SurfaceStyle;
  createTaskButton: SurfaceStyle;
  themeToggle: ThemeToggleStyle;
  focus: {
    topbarTaskInput: FocusStyle;
    floatingTaskInput: FocusStyle;
    themeToggle: FocusStyle;
  };
};

export type HardcodedColorFingerprint = {
  classTokens: string[];
  inlineColorStyles: string[];
};

type HardcodedFingerprintOptions = {
  includeDescendants?: boolean;
};

export const THEME_MATRIX: readonly ThemeName[] = ['dark', 'light'] as const;

export async function readRootCssVariables(
  page: Page,
  varNames: string[],
): Promise<Record<string, string>> {
  return page.evaluate((inputVarNames: string[]) => {
    const root = window.getComputedStyle(document.documentElement);
    const output: Record<string, string> = {};
    for (const varName of inputVarNames) {
      output[varName] = root.getPropertyValue(varName).trim().toLowerCase();
    }
    return output;
  }, varNames);
}

export async function resolveColorExpressions(
  page: Page,
  expressions: Record<string, string>,
): Promise<Record<string, string>> {
  return page.evaluate((entries: Array<[string, string]>) => {
    const probe = document.createElement('span');
    probe.style.position = 'fixed';
    probe.style.left = '-9999px';
    probe.style.top = '-9999px';
    document.body.appendChild(probe);

    try {
      const resolved: Record<string, string> = {};
      for (const [key, expression] of entries) {
        probe.style.color = expression;
        resolved[key] = window.getComputedStyle(probe).color;
      }
      return resolved;
    } finally {
      probe.remove();
    }
  }, Object.entries(expressions));
}

export async function captureSurfaceSnapshot(page: Page): Promise<SurfaceSnapshot> {
  return page.evaluate((ids: typeof DASHBOARD_TEST_IDS) => {
    function mustGet(selector: string): HTMLElement {
      const node = document.querySelector<HTMLElement>(selector);
      if (!node) {
        throw new Error(`Required audited surface selector not found: ${selector}`);
      }
      return node;
    }

    function readSurfaceStyle(selector: string, borderProperty: 'borderTopColor' | 'borderBottomColor' | 'borderLeftColor') {
      const element = mustGet(selector);
      const style = window.getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderColor: style[borderProperty],
        color: style.color,
      };
    }

    function readControlStyle(selector: string) {
      const element = mustGet(selector);
      const style = window.getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        color: style.color,
      };
    }

    function readThemeToggleStyle(selector: string) {
      const element = mustGet(selector);
      const style = window.getComputedStyle(element);
      const iconAndIndicator = Array.from(element.querySelectorAll<HTMLElement>('span[aria-hidden="true"]'));
      if (iconAndIndicator.length < 2) {
        throw new Error(`Expected icon/indicator spans on theme toggle selector: ${selector}`);
      }
      const iconStyle = window.getComputedStyle(iconAndIndicator[0]);
      const indicatorStyle = window.getComputedStyle(iconAndIndicator[iconAndIndicator.length - 1]);
      return {
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        color: style.color,
        iconBackgroundColor: iconStyle.backgroundColor,
        iconColor: iconStyle.color,
        indicatorBackgroundColor: indicatorStyle.backgroundColor,
      };
    }

    function readFocusProbe(selector: string) {
      const element = mustGet(selector);
      element.focus();
      const style = window.getComputedStyle(element);
      const focused = {
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        outlineColor: style.outlineColor,
      };
      element.blur();
      return focused;
    }

    return {
      topbar: readSurfaceStyle(`[data-testid="${ids.topbar}"]`, 'borderBottomColor'),
      sidebar: readSurfaceStyle(`[data-testid="${ids.sidebar}"]`, 'borderLeftColor'),
      activityFeed: readSurfaceStyle(`[data-testid="${ids.activityFeed}"]`, 'borderTopColor'),
      floatingTaskInputField: readSurfaceStyle(`[data-testid="${ids.floatingTaskInputField}"]`, 'borderBottomColor'),
      topbarTaskInputField: readControlStyle(`[data-testid="${ids.topbarTaskInputField}"]`),
      createTaskButton: readControlStyle(`[data-testid="${ids.createTaskButton}"]`),
      themeToggle: readThemeToggleStyle(`[data-testid="${ids.themeToggleSwitch}"]`),
      focus: {
        topbarTaskInput: readFocusProbe(`[data-testid="${ids.topbarTaskInputField}"]`),
        floatingTaskInput: readFocusProbe(`[data-testid="${ids.floatingTaskInputField}"]`),
        themeToggle: readFocusProbe(`[data-testid="${ids.themeToggleSwitch}"]`),
      },
    };
  }, DASHBOARD_TEST_IDS);
}

export async function collectHardcodedColorFingerprint(page: Page): Promise<HardcodedColorFingerprint> {
  return collectHardcodedColorFingerprintForSelectors(
    page,
    AUDITED_SURFACE_ROOTS.map(surface => surface.selector),
    { includeDescendants: true },
  );
}

export async function collectHardcodedColorFingerprintForSelectors(
  page: Page,
  selectors: string[],
  options: HardcodedFingerprintOptions = {},
): Promise<HardcodedColorFingerprint> {
  return page.evaluate(({ rootSelectors, includeDescendants }) => {
    const roots = rootSelectors
      .map(selector => document.querySelector<HTMLElement>(selector))
      .filter((node): node is HTMLElement => !!node);

    if (roots.length !== rootSelectors.length) {
      throw new Error(`Expected ${rootSelectors.length} audited roots but found ${roots.length}`);
    }

    const classTokens = new Set<string>();
    const inlineColorStyles = new Set<string>();
    const colorPropertyName = /^(?:color|background(?:-color)?|border(?:-top|-right|-bottom|-left)?-color|outline-color|box-shadow|fill|stroke)$/i;
    const literalColorValue = /#(?:[0-9a-f]{3,8})\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)/i;

    for (const root of roots) {
      const elements = includeDescendants
        ? [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]
        : [root];
      for (const element of elements) {
        const className = element.getAttribute('class') || '';
        for (const token of className.split(/\s+/).filter(Boolean)) {
          classTokens.add(token);
        }

        const style = element.getAttribute('style') || '';
        if (!style.trim()) continue;
        for (const rawDeclaration of style.split(';')) {
          const declaration = rawDeclaration.trim();
          if (!declaration) continue;
          const [rawProperty, rawValue] = declaration.split(':');
          if (!rawProperty || !rawValue) continue;
          const property = rawProperty.trim();
          const value = rawValue.trim();
          if (!colorPropertyName.test(property)) continue;
          if (value.includes('var(')) continue;
          if (!literalColorValue.test(value)) continue;
          inlineColorStyles.add(`${property}:${value}`.toLowerCase());
        }
      }
    }

    return {
      classTokens: Array.from(classTokens).sort(),
      inlineColorStyles: Array.from(inlineColorStyles).sort(),
    };
  }, { rootSelectors: selectors, includeDescendants: options.includeDescendants ?? true });
}

export function filterDisallowedClassTokens(tokens: string[]): string[] {
  const disallowed = new Set<string>();
  for (const token of tokens) {
    const normalizedToken = token.includes(':') ? token.split(':').at(-1) ?? token : token;
    if (
      DISALLOWED_COLOR_CLASS_TOKEN.test(normalizedToken)
      || DISALLOWED_NAMED_COLOR_CLASS_TOKEN.test(normalizedToken)
      || DISALLOWED_ARBITRARY_LITERAL_COLOR_CLASS_TOKEN.test(normalizedToken)
    ) {
      disallowed.add(normalizedToken);
    }
  }
  return Array.from(disallowed).sort();
}
