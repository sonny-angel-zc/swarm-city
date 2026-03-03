import { expect, type Locator, type Page } from 'playwright/test';
import type { ThemeName } from './themeToggleHarness';

export type ContrastProbe = {
  id: string;
  foregroundVar: string;
  backgroundVar: string;
  minimumRatio: number;
};

export type ElementContrastProbe = {
  id: string;
  selector: string;
  minimumRatio: number;
};

type ResolvedTokenProbe = {
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

export const THEME_TOKEN_CONTRAST_PROBES: readonly ContrastProbe[] = [
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
] as const;

export const THEME_ELEMENT_CONTRAST_PROBES: readonly ElementContrastProbe[] = [
  {
    id: 'theme-toggle-text-on-toggle-bg',
    selector: '[data-testid="theme-toggle-switch"]',
    minimumRatio: 4.5,
  },
] as const;

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

async function resolveTokenContrastProbes(page: Page, probes: readonly ContrastProbe[]): Promise<ResolvedTokenProbe[]> {
  return page.evaluate((probeList: ContrastProbe[]) => {
    const container = document.createElement('div');
    container.setAttribute('data-test-id', 'contrast-probes');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.pointerEvents = 'none';
    document.body.appendChild(container);

    try {
      return probeList.map((probe) => {
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
    } finally {
      container.remove();
    }
  }, probes.slice());
}

async function resolveElementContrastProbes(
  page: Page,
  probes: readonly ElementContrastProbe[],
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
  }, probes.slice());
}

export async function expectVisibleKeyboardFocus(toggle: Locator): Promise<void> {
  const focusIndicators = await toggle.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      boxShadow: style.boxShadow,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
    };
  });

  const hasBoxShadowFocusRing =
    focusIndicators.boxShadow !== 'none' && focusIndicators.boxShadow.trim().length > 0;
  const hasOutlineFocusRing =
    focusIndicators.outlineStyle !== 'none'
    && focusIndicators.outlineWidth !== '0px'
    && focusIndicators.outlineColor !== 'rgba(0, 0, 0, 0)';

  expect(
    hasBoxShadowFocusRing || hasOutlineFocusRing,
    `Expected visible keyboard focus indicator on theme toggle, got boxShadow="${focusIndicators.boxShadow}", `
      + `outlineStyle="${focusIndicators.outlineStyle}", outlineWidth="${focusIndicators.outlineWidth}", `
      + `outlineColor="${focusIndicators.outlineColor}"`,
  ).toBeTruthy();
}

export async function expectThemeContrastToMeetWcagAa(
  page: Page,
  theme: ThemeName,
  tokenProbes: readonly ContrastProbe[] = THEME_TOKEN_CONTRAST_PROBES,
  elementProbes: readonly ElementContrastProbe[] = THEME_ELEMENT_CONTRAST_PROBES,
): Promise<void> {
  const resolvedTokenProbes = await resolveTokenContrastProbes(page, tokenProbes);
  for (const probe of resolvedTokenProbes) {
    const config = tokenProbes.find((candidate) => candidate.id === probe.id);
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

  const resolvedElementProbes = await resolveElementContrastProbes(page, elementProbes);
  for (const probe of resolvedElementProbes) {
    const config = elementProbes.find((candidate) => candidate.id === probe.id);
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
}
