export type DashboardTheme = 'dark' | 'light';
export type ThemeResolutionSource = 'default' | 'storage';

export const THEME_STORAGE_KEY = 'swarm:theme';
export const DEFAULT_THEME: DashboardTheme = 'dark';

export type ThemeTokens = {
  bgCanvas: string;
  bgPanel: string;
  bgPanelMuted: string;
  borderSubtle: string;
  textPrimary: string;
  textSecondary: string;
  textInverse: string;
  accentPrimary: string;
  accentSuccess: string;
  accentWarning: string;
  accentDanger: string;
  overlayBackdrop: string;
};

export const DASHBOARD_THEME_TOKENS: Record<DashboardTheme, ThemeTokens> = {
  dark: {
    bgCanvas: '#0a0e1a',
    bgPanel: '#0d1117',
    bgPanelMuted: '#121826',
    borderSubtle: '#1e2a3a',
    textPrimary: '#f8fbff',
    textSecondary: '#a7b4c8',
    textInverse: '#0b1020',
    accentPrimary: '#38bdf8',
    accentSuccess: '#22c55e',
    accentWarning: '#f59e0b',
    accentDanger: '#ef4444',
    overlayBackdrop: 'rgba(0, 0, 0, 0.6)',
  },
  light: {
    bgCanvas: '#eef3ff',
    bgPanel: '#ffffff',
    bgPanelMuted: '#f4f7ff',
    borderSubtle: '#d3deee',
    textPrimary: '#111827',
    textSecondary: '#4b5563',
    textInverse: '#ffffff',
    accentPrimary: '#0ea5e9',
    accentSuccess: '#16a34a',
    accentWarning: '#d97706',
    accentDanger: '#dc2626',
    overlayBackdrop: 'rgba(15, 23, 42, 0.25)',
  },
};

export function isDashboardTheme(value: string | null | undefined): value is DashboardTheme {
  return value === 'dark' || value === 'light';
}

export function resolveInitialDashboardTheme(
  storedTheme: string | null | undefined,
): { theme: DashboardTheme; source: ThemeResolutionSource } {
  if (isDashboardTheme(storedTheme)) {
    return { theme: storedTheme, source: 'storage' };
  }

  return { theme: DEFAULT_THEME, source: 'default' };
}

export function toggleDashboardTheme(theme: DashboardTheme): DashboardTheme {
  return theme === 'dark' ? 'light' : 'dark';
}

export function rootThemeClass(theme: DashboardTheme): string {
  return theme === 'dark' ? 'dark' : '';
}

export function rootThemeDataset(theme: DashboardTheme): DashboardTheme {
  return theme;
}
