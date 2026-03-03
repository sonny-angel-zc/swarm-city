import { OverlayMode } from './types';

export type OverlayEmphasis = 0 | 1 | 2 | 3;
export type OverlayEmphasisLabel = 'off' | 'supporting' | 'primary' | 'dominant';

export type OverlayModeContract = {
  mode: OverlayMode;
  label: string;
  helper: string;
  rendererIntent: string;
  focusArea: 'balanced' | 'network' | 'budget';
  roadsEmphasis: OverlayEmphasis;
  transitEmphasis: OverlayEmphasis;
  greenspaceEmphasis: OverlayEmphasis;
  cityLifeEmphasis: OverlayEmphasis;
  spendEmphasis: OverlayEmphasis;
};

export const CITY_OVERLAY_COPY = {
  panelLabel: 'City view mode',
  panelHeading: 'View mode',
  panelSubheading: 'Tune what stands out as roads, transit, parks, and city life evolve.',
  impactHeading: 'Visual impact',
  keyboardHint: 'Use Arrow keys, Home, or End to switch modes. Enter or Space activates the focused tab.',
} as const;

export const CITY_OVERLAY_DATA_CONTRACT_VERSION = 'swa-68-subtask-2';

export const CITY_OVERLAY_EMPHASIS_COPY: Record<OverlayEmphasis, OverlayEmphasisLabel> = {
  0: 'off',
  1: 'supporting',
  2: 'primary',
  3: 'dominant',
};

export const CITY_OVERLAY_CONTRACT: Record<OverlayMode, OverlayModeContract> = {
  activity: {
    mode: 'activity',
    label: 'City Life',
    helper: 'Live streets, transit flow, and active neighborhoods',
    rendererIntent: 'Full city-life composition with roads, transit, trees/parks, and ambient effects.',
    focusArea: 'balanced',
    roadsEmphasis: 2,
    transitEmphasis: 2,
    greenspaceEmphasis: 2,
    cityLifeEmphasis: 3,
    spendEmphasis: 1,
  },
  power: {
    mode: 'power',
    label: 'Transit Grid',
    helper: 'Focus network flow, route load, and connection stress',
    rendererIntent: 'Prioritize transit/power network readability and active connection diagnostics.',
    focusArea: 'network',
    roadsEmphasis: 2,
    transitEmphasis: 3,
    greenspaceEmphasis: 1,
    cityLifeEmphasis: 1,
    spendEmphasis: 1,
  },
  economy: {
    mode: 'economy',
    label: 'Spend Heatmap',
    helper: 'Compare district spend intensity across the city',
    rendererIntent: 'Prioritize spend-based building/zone tinting and suppress non-essential network emphasis.',
    focusArea: 'budget',
    roadsEmphasis: 1,
    transitEmphasis: 1,
    greenspaceEmphasis: 1,
    cityLifeEmphasis: 1,
    spendEmphasis: 3,
  },
};

export const CITY_OVERLAY_MODE_ORDER: OverlayMode[] = ['activity', 'power', 'economy'];
