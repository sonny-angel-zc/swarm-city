export type DocCategory = 'plan' | 'memory' | 'reference' | 'note';

export type PlanTrack = 'track-1' | 'track-2' | 'track-3' | 'foundation' | 'unknown';

export type PlanDocument = {
  id: string;
  title: string;
  path: string;
  category: DocCategory;
  track: PlanTrack;
  updatedAt: string;
  summary: string;
  tags: string[];
  content: string;
};

export type DocumentMemoryItem = {
  id: string;
  docId: string;
  docTitle: string;
  snippet: string;
  sourceLine: string;
  createdAt: number;
};

const DOCS_SEED: PlanDocument[] = [
  {
    id: 'v3-ops-layer',
    title: 'V3 Ops Layer',
    path: 'docs/plans/active/v3-ops-layer.md',
    category: 'plan',
    track: 'track-3',
    updatedAt: '2026-03-01',
    summary: 'Operations layer rollout with registry, memory, and docs UI.',
    tags: ['ops', 'registry', 'memory', 'ui'],
    content: [
      'Track 3: Plan Registry + Document Memory + DocsPanel UI',
      '- Introduce a plan registry that indexes active plans, references, and notes.',
      '- Create document memory pins so important snippets survive long sessions.',
      '- Add a DocsPanel in the sidebar for search, filtering, selection, and memory review.',
      '- Definition of done includes indexing, filtering, pinning, and live previews.',
    ].join('\n'),
  },
  {
    id: 'doc-memory-readme',
    title: 'Document Memory Readme',
    path: 'docs/memory/README.md',
    category: 'memory',
    track: 'foundation',
    updatedAt: '2026-03-01',
    summary: 'Guidelines for preserving durable decisions across runs.',
    tags: ['memory', 'notes'],
    content: [
      'Store durable snippets here when they should outlive an individual task run.',
      '- Use date + short title.',
      '- Include source doc path.',
      '- Keep 1-3 bullets of retained decisions.',
    ].join('\n'),
  },
  {
    id: 'architecture-reference',
    title: 'Architecture References',
    path: 'docs/references/architecture.md',
    category: 'reference',
    track: 'foundation',
    updatedAt: '2026-03-01',
    summary: 'Pointers to core runtime, store, and sidebar integration points.',
    tags: ['architecture', 'core', 'ui'],
    content: [
      '- src/core/store.ts is the client state hub.',
      '- src/core/orchestrator.ts handles server-side task sequencing and SSE events.',
      '- src/components/Sidebar.tsx aggregates operations controls.',
    ].join('\n'),
  },
  {
    id: 'dashboard-theme-requirements',
    title: 'Dashboard Theme Requirements (SWA-63)',
    path: 'docs/references/dashboard-theme-requirements.md',
    category: 'reference',
    track: 'foundation',
    updatedAt: '2026-03-02',
    summary: 'Defines light/dark tokens, default dark behavior, toggle state transitions, and persistence rules.',
    tags: ['theme', 'dark-mode', 'dashboard', 'ui', 'swa-63'],
    content: [
      'SWA-63 subtask defines baseline dashboard theming states and requirements.',
      '- Theme options are dark and light with dark as default.',
      '- Persist user-selected theme to localStorage using swarm:theme key.',
      '- Initial load uses dark first, then applies valid stored preference after hydration.',
      '- Toggle behavior is binary and idempotent per interaction.',
    ].join('\n'),
  },
  {
    id: 'theme-toggle-audit-swa-65-subtask-1',
    title: 'Theme Toggle Accessibility Audit (SWA-65 Subtask 1/8)',
    path: 'docs/testing/theme-toggle-audit-swa-65-subtask-1.md',
    category: 'reference',
    track: 'foundation',
    updatedAt: '2026-03-02',
    summary: 'Audit of theme toggle accessibility implementation and Playwright coverage, including selector strategy and prioritized gaps.',
    tags: ['theme', 'accessibility', 'e2e', 'playwright', 'swa-65', 'audit'],
    content: [
      'SWA-65 subtask 1/8 audit captures current implementation, existing coverage, and concrete gaps.',
      '- Keyboard interactions are covered for Tab, Space, and Enter, but focus visibility assertion is missing.',
      '- Switch semantics are implemented, but selectors should be hardened for future additional switches.',
      '- Contrast checks meet AA thresholds for key pairs, with recommended real-element assertion extension.',
      '- Recommended order provided for follow-on subtasks.',
    ].join('\n'),
  },
  {
    id: 'theme-toggle-accessibility-matrix',
    title: 'Theme Toggle Accessibility E2E Matrix (SWA-65)',
    path: 'docs/testing/theme-toggle-accessibility-matrix.md',
    category: 'reference',
    track: 'foundation',
    updatedAt: '2026-03-02',
    summary: 'End-to-end accessibility matrix covering keyboard focus order, switch semantics, ARIA state transitions, and contrast pass/fail criteria.',
    tags: ['theme', 'accessibility', 'e2e', 'playwright', 'swa-65', 'wcag'],
    content: [
      'SWA-65 subtask 2/8 defines the theme toggle accessibility test scenarios and assertions.',
      '- Validate tab focus order reaches the theme switch in expected top-bar sequence.',
      '- Validate switch semantics with role=switch and dynamic accessible labels.',
      '- Validate Space and Enter keyboard activation update aria-checked and document theme state.',
      '- Validate dark and light theme contrast ratios pass WCAG AA at 4.5:1 or higher.',
    ].join('\n'),
  },
  {
    id: 'connect-your-tools-guide',
    title: 'Connect Your Tools Guide',
    path: 'docs/guides/connect-your-tools.md',
    category: 'note',
    track: 'foundation',
    updatedAt: '2026-03-02',
    summary: 'Linear integrations overview covering Slack, GitHub/GitLab, Agents, and API options.',
    tags: ['linear', 'integrations', 'slack', 'github', 'gitlab', 'api'],
    content: [
      'Integrations make Linear the source of truth for product development data.',
      '- Key integrations: Slack, GitHub/GitLab, and Agents.',
      '- Browse 150+ integrations in the Linear directory.',
      '- Build custom automation on the Linear GraphQL API via developer docs.',
    ].join('\n'),
  },
  {
    id: 'set-up-your-teams-guide',
    title: 'Set Up Your Teams Guide',
    path: 'docs/guides/set-up-your-teams.md',
    category: 'note',
    track: 'foundation',
    updatedAt: '2026-03-02',
    summary: 'Team setup guide covering workspace configuration, team structure, and member roles.',
    tags: ['linear', 'teams', 'workspace', 'members', 'roles'],
    content: [
      'Workspaces contain your organization work and team-level processes.',
      '- Configure workspace settings and default workflows.',
      '- Use teams to organize ownership and execution.',
      '- Invite members and assign Admin, Member, or Guest roles.',
    ].join('\n'),
  },
  {
    id: 'parallel-git-workflow-guide',
    title: 'Parallel Git Workflow',
    path: 'docs/guides/parallel-git-workflow.md',
    category: 'note',
    track: 'foundation',
    updatedAt: '2026-03-02',
    summary: 'Worktree-first branching workflow for parallel, observable agent execution.',
    tags: ['git', 'worktree', 'branches', 'github', 'parallel'],
    content: [
      'Swarm agents now use dedicated worktrees and swarm/* branches per task/role.',
      '- Default worktree root: ../swarm-city-worktrees.',
      '- Runtime emits agent_workspace events with branch and path for observability.',
      '- Use scripts/worktree-status.sh to inspect active worktrees and branches.',
      '- Merge via per-branch pull requests, then prune stale worktrees.',
    ].join('\n'),
  },
];

export function getPlanRegistry(): PlanDocument[] {
  return [...DOCS_SEED].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function filterDocuments(
  docs: PlanDocument[],
  category: 'all' | DocCategory,
  query: string,
): PlanDocument[] {
  const normalized = query.trim().toLowerCase();

  return docs.filter((doc) => {
    if (category !== 'all' && doc.category !== category) {
      return false;
    }

    if (!normalized) {
      return true;
    }

    return (
      doc.title.toLowerCase().includes(normalized) ||
      doc.path.toLowerCase().includes(normalized) ||
      doc.summary.toLowerCase().includes(normalized) ||
      doc.tags.some((tag) => tag.toLowerCase().includes(normalized)) ||
      doc.content.toLowerCase().includes(normalized)
    );
  });
}

export function extractMemoryCandidates(
  doc: PlanDocument,
  maxItems = 6,
): DocumentMemoryItem[] {
  const lines = doc.content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => line.startsWith('-') || line.startsWith('Track ') || line.includes('Definition'))
    .slice(0, maxItems);

  return lines.map((line, idx) => ({
    id: `${doc.id}-memory-${idx}`,
    docId: doc.id,
    docTitle: doc.title,
    snippet: line.replace(/^-\s*/, ''),
    sourceLine: line,
    createdAt: Date.now(),
  }));
}

export function getDocumentById(docs: PlanDocument[], docId: string | null): PlanDocument | null {
  if (!docId) return null;
  return docs.find((doc) => doc.id === docId) ?? null;
}
