import { DASHBOARD_THEME_TOKENS } from '../../src/core/theme';
import type { ThemeName } from './themeToggleHarness';

export const SURFACE_STATES = ['default', 'hover', 'active', 'disabled', 'focus'] as const;
export type SurfaceState = (typeof SURFACE_STATES)[number];

export const AUDITED_SURFACE_KEYS = [
  'topbar',
  'sidebar',
  'activityFeed',
  'floatingTaskInputField',
  'topbarTaskInputField',
  'createTaskButton',
  'themeToggleSwitch',
] as const;
export type AuditedSurfaceKey = (typeof AUDITED_SURFACE_KEYS)[number];

export const SEMANTIC_CSS_VAR_NAMES = [
  '--bg-canvas',
  '--bg-panel',
  '--bg-panel-muted',
  '--border-subtle',
  '--text-primary',
  '--text-secondary',
  '--text-inverse',
  '--accent-primary',
  '--accent-success',
  '--overlay-backdrop',
  '--theme-toggle-bg',
  '--theme-toggle-border',
  '--theme-toggle-text',
  '--theme-toggle-icon-bg',
  '--theme-toggle-icon-text',
  '--theme-toggle-indicator',
] as const;
export type SemanticCssVarName = (typeof SEMANTIC_CSS_VAR_NAMES)[number];

export type SurfaceColorSlot =
  | 'backgroundColor'
  | 'borderColor'
  | 'color'
  | 'iconBackgroundColor'
  | 'iconColor'
  | 'indicatorBackgroundColor'
  | 'boxShadowColor'
  | 'outlineColor'
  | 'ringOffsetColor';

type StateExpectationStatus = 'enforced' | 'planned' | 'not_applicable';

type SurfaceStateTokenExpectation = {
  status: StateExpectationStatus;
  vars?: Partial<Record<SurfaceColorSlot, SemanticCssVarName>>;
  notes?: string;
};

type SurfaceStateMap = Record<SurfaceState, SurfaceStateTokenExpectation>;

const THEME_TOGGLE_VAR_CONTRACT: Record<ThemeName, Record<
  | '--theme-toggle-bg'
  | '--theme-toggle-border'
  | '--theme-toggle-text'
  | '--theme-toggle-icon-bg'
  | '--theme-toggle-icon-text'
  | '--theme-toggle-indicator',
  string
>> = {
  dark: {
    '--theme-toggle-bg': '#0f172a',
    '--theme-toggle-border': 'rgba(100, 116, 139, 0.7)',
    '--theme-toggle-text': '#f1f5f9',
    '--theme-toggle-icon-bg': '#334155',
    '--theme-toggle-icon-text': '#f8fafc',
    '--theme-toggle-indicator': '#7dd3fc',
  },
  light: {
    '--theme-toggle-bg': '#f8fafc',
    '--theme-toggle-border': '#cbd5e1',
    '--theme-toggle-text': '#1f2937',
    '--theme-toggle-icon-bg': '#fef3c7',
    '--theme-toggle-icon-text': '#b45309',
    '--theme-toggle-indicator': '#0284c7',
  },
};

export const THEME_SEMANTIC_CSS_VAR_CONTRACT: Record<ThemeName, Record<SemanticCssVarName, string>> = {
  dark: {
    '--bg-canvas': DASHBOARD_THEME_TOKENS.dark.bgCanvas,
    '--bg-panel': DASHBOARD_THEME_TOKENS.dark.bgPanel,
    '--bg-panel-muted': DASHBOARD_THEME_TOKENS.dark.bgPanelMuted,
    '--border-subtle': DASHBOARD_THEME_TOKENS.dark.borderSubtle,
    '--text-primary': DASHBOARD_THEME_TOKENS.dark.textPrimary,
    '--text-secondary': DASHBOARD_THEME_TOKENS.dark.textSecondary,
    '--text-inverse': DASHBOARD_THEME_TOKENS.dark.textInverse,
    '--accent-primary': DASHBOARD_THEME_TOKENS.dark.accentPrimary,
    '--accent-success': DASHBOARD_THEME_TOKENS.dark.accentSuccess,
    '--overlay-backdrop': DASHBOARD_THEME_TOKENS.dark.overlayBackdrop,
    ...THEME_TOGGLE_VAR_CONTRACT.dark,
  },
  light: {
    '--bg-canvas': DASHBOARD_THEME_TOKENS.light.bgCanvas,
    '--bg-panel': DASHBOARD_THEME_TOKENS.light.bgPanel,
    '--bg-panel-muted': DASHBOARD_THEME_TOKENS.light.bgPanelMuted,
    '--border-subtle': DASHBOARD_THEME_TOKENS.light.borderSubtle,
    '--text-primary': DASHBOARD_THEME_TOKENS.light.textPrimary,
    '--text-secondary': DASHBOARD_THEME_TOKENS.light.textSecondary,
    '--text-inverse': DASHBOARD_THEME_TOKENS.light.textInverse,
    '--accent-primary': DASHBOARD_THEME_TOKENS.light.accentPrimary,
    '--accent-success': DASHBOARD_THEME_TOKENS.light.accentSuccess,
    '--overlay-backdrop': DASHBOARD_THEME_TOKENS.light.overlayBackdrop,
    ...THEME_TOGGLE_VAR_CONTRACT.light,
  },
};

export const AUDITED_SURFACE_STATE_TOKEN_EXPECTATIONS: Record<AuditedSurfaceKey, SurfaceStateMap> = {
  topbar: {
    default: {
      status: 'enforced',
      vars: {
        backgroundColor: '--bg-panel',
        borderColor: '--border-subtle',
        color: '--text-primary',
      },
    },
    hover: { status: 'not_applicable', notes: 'Top bar container is non-interactive.' },
    active: { status: 'not_applicable', notes: 'Top bar container is non-interactive.' },
    disabled: { status: 'not_applicable', notes: 'Top bar container cannot be disabled.' },
    focus: { status: 'not_applicable', notes: 'Top bar container is not focusable.' },
  },
  sidebar: {
    default: {
      status: 'enforced',
      vars: {
        backgroundColor: '--bg-panel',
        borderColor: '--border-subtle',
        color: '--text-primary',
      },
    },
    hover: { status: 'not_applicable', notes: 'Sidebar container is non-interactive.' },
    active: { status: 'not_applicable', notes: 'Sidebar container is non-interactive.' },
    disabled: { status: 'not_applicable', notes: 'Sidebar container cannot be disabled.' },
    focus: { status: 'not_applicable', notes: 'Sidebar container is not focusable.' },
  },
  activityFeed: {
    default: {
      status: 'enforced',
      vars: {
        backgroundColor: '--bg-panel',
        borderColor: '--border-subtle',
        color: '--text-primary',
      },
    },
    hover: { status: 'not_applicable', notes: 'Activity feed container is non-interactive.' },
    active: { status: 'not_applicable', notes: 'Activity feed container is non-interactive.' },
    disabled: { status: 'not_applicable', notes: 'Activity feed container cannot be disabled.' },
    focus: { status: 'not_applicable', notes: 'Activity feed container is not focusable.' },
  },
  floatingTaskInputField: {
    default: {
      status: 'enforced',
      vars: {
        backgroundColor: '--bg-panel',
        borderColor: '--border-subtle',
        color: '--text-primary',
      },
    },
    hover: {
      status: 'planned',
      vars: {
        borderColor: '--accent-primary',
      },
      notes: 'Driven by group-hover style.',
    },
    active: {
      status: 'planned',
      vars: {
        borderColor: '--accent-primary',
      },
    },
    disabled: {
      status: 'planned',
      vars: {
        backgroundColor: '--bg-panel',
        borderColor: '--border-subtle',
        color: '--text-secondary',
      },
    },
    focus: {
      status: 'enforced',
      vars: {
        borderColor: '--accent-primary',
        boxShadowColor: '--accent-primary',
      },
    },
  },
  topbarTaskInputField: {
    default: {
      status: 'enforced',
      vars: {
        backgroundColor: '--bg-panel-muted',
        borderColor: '--border-subtle',
        color: '--text-primary',
      },
    },
    hover: {
      status: 'planned',
      vars: {
        borderColor: '--border-subtle',
      },
    },
    active: {
      status: 'planned',
      vars: {
        borderColor: '--accent-primary',
      },
    },
    disabled: {
      status: 'planned',
      vars: {
        backgroundColor: '--bg-panel-muted',
        borderColor: '--border-subtle',
        color: '--text-secondary',
      },
    },
    focus: {
      status: 'enforced',
      vars: {
        borderColor: '--accent-primary',
        boxShadowColor: '--accent-primary',
      },
    },
  },
  createTaskButton: {
    default: {
      status: 'enforced',
      vars: {
        backgroundColor: '--accent-success',
        borderColor: '--accent-success',
        color: '--text-inverse',
      },
    },
    hover: {
      status: 'planned',
      vars: {
        backgroundColor: '--accent-success',
        borderColor: '--accent-success',
        color: '--text-inverse',
      },
      notes: 'Brightness change should not replace semantic token source.',
    },
    active: {
      status: 'planned',
      vars: {
        backgroundColor: '--accent-success',
        borderColor: '--accent-success',
        color: '--text-inverse',
      },
    },
    disabled: {
      status: 'planned',
      vars: {
        backgroundColor: '--accent-success',
        borderColor: '--accent-success',
        color: '--text-inverse',
      },
      notes: 'Opacity and cursor changes are non-token behavioral modifiers.',
    },
    focus: {
      status: 'planned',
      vars: {
        outlineColor: '--accent-primary',
      },
    },
  },
  themeToggleSwitch: {
    default: {
      status: 'enforced',
      vars: {
        backgroundColor: '--theme-toggle-bg',
        borderColor: '--theme-toggle-border',
        color: '--theme-toggle-text',
        iconBackgroundColor: '--theme-toggle-icon-bg',
        iconColor: '--theme-toggle-icon-text',
        indicatorBackgroundColor: '--theme-toggle-indicator',
      },
    },
    hover: {
      status: 'planned',
      vars: {
        backgroundColor: '--theme-toggle-bg',
        borderColor: '--theme-toggle-border',
        color: '--theme-toggle-text',
      },
    },
    active: {
      status: 'planned',
      vars: {
        backgroundColor: '--theme-toggle-bg',
        borderColor: '--theme-toggle-border',
        color: '--theme-toggle-text',
      },
    },
    disabled: {
      status: 'not_applicable',
      notes: 'Theme toggle is never disabled in current product behavior.',
    },
    focus: {
      status: 'enforced',
      vars: {
        boxShadowColor: '--accent-primary',
        outlineColor: '--accent-primary',
        ringOffsetColor: '--bg-canvas',
      },
    },
  },
};
