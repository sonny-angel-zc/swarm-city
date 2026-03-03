import { BacklogItem } from './types';

export const STRATEGIC_COPY = {
  title: 'Strategic Districts',
  helper: 'Plan by district first, then execute from the filtered queue.',
  allDistricts: 'All districts',
  unassigned: 'Unassigned',
  emptyFiltered: 'No issues in this district yet.',
  emptyProjects: 'No project districts available from Linear sync.',
  filterSummary: 'Queue focus',
  keyboardHint: 'Arrow keys move between districts. Enter or Space applies focus. Esc clears focus.',
  resetFocus: 'Reset focus',
};

export function mapStrategicProgressSourceLabel(progressSource: BacklogItem['projectProgressSource']) {
  return progressSource === 'linear' ? 'Linear-estimated' : 'Issue-derived';
}

export function mapStrategicStatusLabel(status: string | null): string {
  if (status === 'in_progress') return 'In Progress';
  if (status === 'done') return 'Done';
  return 'To Do';
}

export function mapStrategicStatusColor(status: string | null): string {
  if (status === 'in_progress') return '#60a5fa';
  if (status === 'done') return '#4ade80';
  return '#fbbf24';
}

export function mapBacklogGroupLabel(status: BacklogItem['status']): string {
  if (status === 'in_progress') return 'In Progress';
  if (status === 'done') return 'Done';
  if (status === 'blocked') return 'Blocked';
  return 'To Do';
}
