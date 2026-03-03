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
    id: 'city-visual-spec-swa-68-subtask-1',
    title: 'City Visual Spec (SWA-68 Subtask 1/10)',
    path: 'docs/references/city-visual-spec-swa-68-subtask-1.md',
    category: 'reference',
    track: 'foundation',
    updatedAt: '2026-03-03',
    summary: 'Concise visual baseline for isometric roads, sidewalks, grass variation, trees/parks, water, transit, vehicles, and pedestrians with light/dark tokens and strict layering.',
    tags: ['city', 'visual-design', 'isometric', 'low-poly', 'tokens', 'legend', 'swa-68'],
    content: [
      'SWA-68 subtask 1/10 defines the city visual baseline before implementation details.',
      '- Establishes style direction for isometric low-poly readability and consistent motion language.',
      '- Defines light and dark semantic tokens for roads, sidewalks, parks, water, trees, transit, vehicles, and pedestrians.',
      '- Locks tile occupancy precedence and draw order from ground through overlays, including parks/trees and cars/pedestrians layers.',
      '- Captures non-negotiable constraints: no drawBuilding changes and 60fps target.',
    ].join('\n'),
  },
  {
    id: 'city-canvas-render-pipeline-audit-swa-68-subtask-1',
    title: 'City Canvas Render Pipeline Audit (SWA-68 Subtask 1/11)',
    path: 'docs/testing/city-canvas-render-pipeline-audit-swa-68-subtask-1.md',
    category: 'reference',
    track: 'foundation',
    updatedAt: '2026-03-03',
    summary: 'Concrete audit of CityCanvas draw order, coordinate/timing constraints, and safe insertion slots for roads, transit, trees, parks, and city-life layers without changing building draw logic.',
    tags: ['city', 'rendering', 'canvas', 'pipeline', 'isometric', 'swa-68', 'constraints', 'research'],
    content: [
      'SWA-68 subtask 1/11 captures the current canvas pipeline and expansion guardrails.',
      '- Documents frame draw order from terrain through full-scene overlays with exact insertion points.',
      '- Captures coordinate-space and animation-loop constraints that affect safe layer composition.',
      '- Clarifies current entity coverage: buildings, fountain/plaza, lamp glow, transit vehicles, particles, and pedestrian gap.',
      '- Defines implementation-ready pass splits for terrain, static props, and transit underlay/overlay without touching drawBuilding.',
    ].join('\n'),
  },
  {
    id: 'city-visual-constraints-swa-68-subtask-1',
    title: 'Research Constraints for City Visual Upgrade (SWA-68 Subtask 1/5)',
    path: 'docs/testing/city-visual-constraints-swa-68-subtask-1.md',
    category: 'reference',
    track: 'foundation',
    updatedAt: '2026-03-03',
    summary: 'Architecture and code-verified constraints for upgrading roads, transit, trees, parks, and city life, with implementation-ready guidance for SWA-68 subtasks 2-5.',
    tags: ['city', 'visual-design', 'constraints', 'research', 'rendering', 'transit', 'parks', 'swa-68'],
    content: [
      'SWA-68 subtask 1/5 audits architecture and implementation constraints before execution work.',
      '- Maps CityCanvas pass ownership, store-driven dynamic updates, layout topology sets, and visual token contracts.',
      '- Captures hard constraints around layering determinism, hot-path performance, and overlay mode coupling.',
      '- Defines incremental guidance for tree/park props, road-aware transit, and pedestrian city-life rollout.',
      '- Provides concrete definition-of-done gates for implementation and targeted validation planning.',
    ].join('\n'),
  },
  {
    id: 'city-visual-ux-data-contract-swa-68-subtask-2',
    title: 'City Visuals UX/Data Contract (SWA-68 Subtask 2/5)',
    path: 'docs/testing/city-visual-ux-data-contract-swa-68-subtask-2.md',
    category: 'reference',
    track: 'foundation',
    updatedAt: '2026-03-03',
    summary: 'Defines overlay interaction model, copy contract, and deterministic UI/data mapping for roads, transit, trees, parks, and city-life visual modes.',
    tags: ['city', 'visual-design', 'ux', 'data-contract', 'interaction', 'overlay', 'swa-68', 'design'],
    content: [
      'SWA-68 subtask 2/5 defines the UX and data contract before deeper rendering implementation.',
      '- Establishes single-select tablist behavior for city visual modes with keyboard parity.',
      '- Defines explicit operator-facing copy for City Life, Transit Grid, and Spend Heatmap modes.',
      '- Requires deterministic ARIA + data-attribute state mapping between toggle and city canvas.',
      '- Locks pass/fail coupling for interaction semantics and mode-state synchronization.',
    ].join('\n'),
  },
  {
    id: 'playwright-full-suite-ci-constraints-swa-64-subtask-1',
    title: 'Playwright Full Suite CI Execution Strategy (SWA-64 Subtask 1/6)',
    path: 'docs/testing/playwright-full-suite-ci-constraints-swa-64-subtask-1.md',
    category: 'reference',
    track: 'foundation',
    updatedAt: '2026-03-03',
    summary: 'Execution strategy for full-suite Playwright CI including runner choice, trigger policy, localhost/browser setup, and explicit timeout/retry/env contracts.',
    tags: ['playwright', 'ci', 'e2e', 'testing', 'swa-64', 'constraints', 'research'],
    content: [
      'SWA-64 subtask 1/6 defines the full-suite CI execution strategy before further workflow expansion.',
      '- Selects ubuntu-latest hosted runners with Playwright browser dependency provisioning.',
      '- Confirms explicit localhost app lifecycle ownership in workflow (build/start/readiness gate).',
      '- Defines trigger policy: PR to main, push to main, nightly schedule, and manual dispatch.',
      '- Locks required env vars and no-required-secrets contract for deterministic execution.',
      '- Sets stability defaults for retries, workers, and timeout budgets for cross-browser runs.',
    ].join('\n'),
  },
  {
    id: 'playwright-full-suite-ci-ux-data-contract-swa-64-subtask-2',
    title: 'Playwright Full Suite CI UX/Data Contract (SWA-64 Subtask 2/6)',
    path: 'docs/testing/playwright-full-suite-ci-ux-data-contract-swa-64-subtask-2.md',
    category: 'reference',
    track: 'foundation',
    updatedAt: '2026-03-03',
    summary: 'Defines CI interaction flow, operator-facing copy, and deterministic workflow-to-artifact mapping for full Playwright suite runs.',
    tags: ['playwright', 'ci', 'ux', 'data-contract', 'e2e', 'swa-64', 'design'],
    content: [
      'SWA-64 subtask 2/6 defines the UX and data contract before workflow implementation.',
      '- Establishes PR/push/nightly/manual trigger behavior and check lifecycle semantics.',
      '- Defines concise copy contract for workflow, job, failure summary, and fallback messaging.',
      '- Maps CI UI surfaces to deterministic commands, env vars, and artifact/report paths.',
      '- Defines pass/fail coupling for status clarity, triage guidance, and artifact discoverability.',
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
    id: 'theme-toggle-constraints-swa-65-subtask-1',
    title: 'Theme Toggle Accessibility Constraints (SWA-65 Subtask 1/5)',
    path: 'docs/testing/theme-toggle-constraints-swa-65-subtask-1.md',
    category: 'reference',
    track: 'foundation',
    updatedAt: '2026-03-03',
    summary: 'Repository-specific constraints and implementation-ready guidance for adding and validating theme-toggle accessibility E2E assertions.',
    tags: ['theme', 'accessibility', 'e2e', 'playwright', 'swa-65', 'constraints', 'research'],
    content: [
      'SWA-65 subtask 1/5 captures architecture and execution constraints before implementation.',
      '- Confirms TopBar switch semantics contract and html theme-state coupling requirements.',
      '- Documents deterministic harness requirements and viewport-sensitive keyboard focus-order behavior.',
      '- Defines selector, contrast, and validation constraints to reduce flake and false confidence.',
      '- Provides implementation checklist for SWA-65 subtasks 2-5.',
    ].join('\n'),
  },
  {
    id: 'theme-toggle-e2e-accessibility-assertions-research-swa-65-subtask-1',
    title: 'Theme Toggle E2E Accessibility Assertions Research (SWA-65 Subtask 1/6)',
    path: 'docs/testing/theme-toggle-e2e-accessibility-assertions-research-swa-65-subtask-1.md',
    category: 'reference',
    track: 'foundation',
    updatedAt: '2026-03-03',
    summary: 'Repository-context research and implementation-ready guidance for end-to-end accessibility assertions on the dashboard theme toggle.',
    tags: ['theme', 'accessibility', 'e2e', 'playwright', 'swa-65', 'research', 'constraints'],
    content: [
      'SWA-65 subtask 1/6 maps current implementation and test harness contracts before additional assertion work.',
      '- Defines explicit pass/fail accessibility acceptance criteria for keyboard interaction, switch semantics, ARIA transitions, and contrast.',
      '- Enumerates TopBar/theme core files and deterministic state attributes for switch assertions.',
      '- Documents keyboard, semantic, root-theme, and persistence coupling invariants as hard-fail requirements.',
      '- Recommends harness-first extension workflow and viewport-aware focus-order assertion strategy.',
      '- Defines concrete execution sequence for subtasks 2-6 with targeted validation command.',
    ].join('\n'),
  },
  {
    id: 'theme-toggle-ux-data-contract-swa-65-subtask-2',
    title: 'Theme Toggle UX/Data Contract (SWA-65 Subtask 2/7)',
    path: 'docs/testing/theme-toggle-ux-data-contract-swa-65-subtask-2.md',
    category: 'reference',
    track: 'foundation',
    updatedAt: '2026-03-03',
    summary: 'Interaction model and copy/data mapping contract for theme-toggle accessibility assertions, including explicit state-attribute semantics.',
    tags: ['theme', 'accessibility', 'ux', 'data-contract', 'e2e', 'playwright', 'swa-65', 'design'],
    content: [
      'SWA-65 subtask 2/7 defines the UX and data contract before assertion hardening.',
      '- Establishes switch interaction parity for click, Space, and Enter.',
      '- Defines action-oriented ARIA label copy and current-state inline label copy per theme.',
      '- Introduces explicit data-theme-current/data-theme-target/state attributes for deterministic UI-to-data assertions.',
      '- Defines pass/fail coupling requirements across role=switch, aria-checked transitions, UI copy, root theme state, and persistence.',
      '- Adds explicit contrast acceptance thresholds for text/icon and non-text indicator probes in both themes.',
    ].join('\n'),
  },
  {
    id: 'theme-toggle-accessibility-matrix',
    title: 'Theme Toggle Accessibility E2E Matrix (SWA-65)',
    path: 'docs/testing/theme-toggle-accessibility-matrix.md',
    category: 'reference',
    track: 'foundation',
    updatedAt: '2026-03-03',
    summary: 'End-to-end accessibility matrix covering keyboard focus order, switch semantics, ARIA state transitions, and contrast pass/fail criteria.',
    tags: ['theme', 'accessibility', 'e2e', 'playwright', 'swa-65', 'wcag'],
    content: [
      'SWA-65 subtask 2/7 defines the theme toggle accessibility acceptance criteria and test scenarios.',
      '- Validate tab focus order reaches the theme switch in expected top-bar sequence.',
      '- Validate switch semantics with role=switch and dynamic accessible labels.',
      '- Validate Space and Enter keyboard activation exactly once per keypress with focus retention across dark/light starts.',
      '- Validate aria-checked truth-table transitions for both keys in both theme directions.',
      '- Validate dark/light text contrast at 4.5:1+ and non-text indicator contrast at 3.0:1+.',
    ].join('\n'),
  },
  {
    id: 'theme-toggle-coverage-review-swa-65-subtask-8',
    title: 'Theme Toggle Coverage Review (SWA-65 Subtask 8/8)',
    path: 'docs/testing/theme-toggle-coverage-review-swa-65-subtask-8.md',
    category: 'reference',
    track: 'foundation',
    updatedAt: '2026-03-02',
    summary: 'Final SWA-65 closure review mapping each accessibility requirement to concrete Playwright assertions and validation evidence.',
    tags: ['theme', 'accessibility', 'e2e', 'playwright', 'swa-65', 'coverage', 'traceability'],
    content: [
      'SWA-65 subtask 8/8 validates closure of planned QA scope with traceable requirement coverage.',
      '- Maps TT-A11Y-01..06 to concrete assertions in tests/theme-toggle.spec.ts.',
      '- Confirms explicit keyboard focus visibility assertion for theme toggle.',
      '- Confirms switch semantics, keyboard activation parity, and WCAG contrast checks in both themes.',
      '- Records targeted validation command and pass result for auditability.',
    ].join('\n'),
  },
  {
    id: 'theme-regression-guardrails-swa-66-subtask-1',
    title: 'Theme Regression Guardrails Surface Audit (SWA-66 Subtask 1/9)',
    path: 'docs/testing/theme-regression-guardrails-swa-66-subtask-1.md',
    category: 'reference',
    track: 'foundation',
    updatedAt: '2026-03-02',
    summary: 'Audit of dashboard theme-sensitive surfaces with selector strategy, semantic variable mapping, and a hardcoded-color anti-pattern blocklist.',
    tags: ['theme', 'regression', 'guardrails', 'audit', 'dashboard', 'swa-66'],
    content: [
      'SWA-66 subtask 1/9 identifies theme-sensitive surfaces and concrete guardrail targets.',
      '- Captures component-level surface selectors for top bar, sidebar, activity feed, and task input.',
      '- Maps required semantic CSS variables with expected dark and light values.',
      '- Inventories hardcoded color anti-patterns that bypass theme tokens.',
      '- Defines implementation-ready guidance for selector hardening and color-token regression checks.',
    ].join('\n'),
  },
  {
    id: 'theme-regression-guardrails-swa-66-subtask-2',
    title: 'Theme Regression Guardrail Strategy (SWA-66 Subtask 2/9)',
    path: 'docs/testing/theme-regression-guardrails-swa-66-subtask-2.md',
    category: 'reference',
    track: 'foundation',
    updatedAt: '2026-03-02',
    summary: 'Defines lightweight hybrid guardrails for theme regression detection with token assertions, semantic wiring snapshots, deterministic setup, and explicit dark/light pass-fail gates.',
    tags: ['theme', 'regression', 'guardrails', 'strategy', 'playwright', 'swa-66'],
    content: [
      'SWA-66 subtask 2/9 defines the executable guardrail strategy for both dashboard themes.',
      '- Chooses a hybrid approach: token-level contract assertions plus compact semantic style snapshots.',
      '- Defines assertion granularity on audited surfaces only: top bar, sidebar, activity feed, and task input.',
      '- Specifies deterministic data setup using mocked APIs and explicit dark/light storage fixtures.',
      '- Defines hard fail criteria for token drift, snapshot drift, and hardcoded color regressions.',
    ].join('\n'),
  },
  {
    id: 'theme-regression-guardrails-swa-66-subtask-8',
    title: 'Theme Regression Guardrail Intentional Break Validation (SWA-66 Subtask 8/9)',
    path: 'docs/testing/theme-regression-guardrails-swa-66-subtask-8.md',
    category: 'reference',
    track: 'foundation',
    updatedAt: '2026-03-03',
    summary: 'Defines and automates a controlled hardcoded-color break/revert workflow to verify guardrails fail on regressions and pass after restoration.',
    tags: ['theme', 'regression', 'guardrails', 'playwright', 'swa-66', 'validation', 'qa'],
    content: [
      'SWA-66 subtask 8/9 validates guardrail signal quality with an intentional product-code regression.',
      '- Introduces a controlled hardcoded topbar text color change (text-red-500) on an audited surface.',
      '- Expects targeted guardrail failure from semantic snapshot drift and disallowed color-token fingerprint.',
      '- Reverts the break and expects a clean full-suite pass.',
      '- Provides script-based execution for repeatable CI/local verification.',
    ].join('\n'),
  },
  {
    id: 'theme-regression-guardrails-swa-66-subtask-9',
    title: 'Theme Regression Guardrails Coverage and Maintenance Review (SWA-66 Subtask 9/9)',
    path: 'docs/testing/theme-regression-guardrails-swa-66-subtask-9.md',
    category: 'reference',
    track: 'foundation',
    updatedAt: '2026-03-03',
    summary: 'Final review of SWA-66 guardrail coverage completeness and maintenance risk, with assertion hardening to prevent flake and reduce long-term baseline churn.',
    tags: ['theme', 'regression', 'guardrails', 'coverage', 'maintenance', 'swa-66', 'qa'],
    content: [
      'SWA-66 subtask 9/9 verifies coverage completeness and maintainability for theme regression guardrails.',
      '- Confirms audited surface coverage across both dark and light themes.',
      '- Replaces brittle selector usage with stable test IDs for activity feed status assertions.',
      '- Converts hardcoded-color debt checks to a no-new-debt model to reduce avoidable baseline churn.',
      '- Removes unnecessary cross-theme distinctness assertions that could fail on intentional token convergence.',
      '- Documents targeted validation and residual risk for future upkeep.',
    ].join('\n'),
  },
  {
    id: 'linear-strategic-layer-constraints-swa-67-subtask-1',
    title: 'Linear Strategic Layer Constraints (SWA-67 Subtask 1/5)',
    path: 'docs/testing/linear-strategic-layer-constraints-swa-67-subtask-1.md',
    category: 'reference',
    track: 'foundation',
    updatedAt: '2026-03-03',
    summary: 'Architecture and implementation constraints for integrating Linear projects as a strategic district layer with progress tracking and backlog organization.',
    tags: ['linear', 'strategy', 'districts', 'progress', 'backlog', 'swa-67', 'constraints', 'research'],
    content: [
      'SWA-67 subtask 1/5 audits current architecture and defines implementation-ready guardrails.',
      '- Confirms strategic project contract and mapping ownership in src/core/linearProject.ts.',
      '- Documents pagination and state-mapping constraints that affect district accuracy.',
      '- Defines store/UI implementation guidance for district-first backlog organization.',
      '- Specifies targeted validation expectations for strategic-layer rollout subtasks.',
    ].join('\n'),
  },
  {
    id: 'infrastructure-connections-constraints-swa-76-subtask-1',
    title: 'Infrastructure Connections Constraints (SWA-76 Subtask 1/5)',
    path: 'docs/testing/infrastructure-connections-constraints-swa-76-subtask-1.md',
    category: 'reference',
    track: 'foundation',
    updatedAt: '2026-03-03',
    summary: 'Architecture and runtime constraints for roads, rail lines, and power grid connections between districts, with implementation-ready guidance for SWA-76 subtasks 2-5.',
    tags: ['infrastructure', 'roads', 'rail', 'power-grid', 'districts', 'city-canvas', 'swa-76', 'constraints', 'research'],
    content: [
      'SWA-76 subtask 1/5 audits existing infrastructure rendering before adding inter-district connections.',
      '- Confirms outer road bands (rows/cols 3-4, 11-12) are the natural inter-district arterials but lack distinct visual treatment.',
      '- Identifies transit_underlay render pass slot as the correct location for rail line rendering.',
      '- Documents that current power grid is agent-to-agent only; district-level power connections are absent.',
      '- Defines ordered implementation guidance for infra tokens, rail routes, district power mesh, and overlay integration.',
    ].join('\n'),
  },
  {
    id: 'building-interaction-requirements-swa-77-subtask-1',
    title: 'Building Interaction and Data Requirements (SWA-77 Subtask 1/8)',
    path: 'docs/testing/building-interaction-requirements-swa-77-subtask-1.md',
    category: 'reference',
    track: 'foundation',
    updatedAt: '2026-03-03',
    summary: 'Acceptance criteria, event flows, and data contracts for task building click selection, deselection, issue detail panel, agent activity, and test outcomes for SWA-77.',
    tags: ['interaction', 'selection', 'buildings', 'districts', 'panel', 'linear', 'city-canvas', 'swa-77', 'requirements', 'research'],
    content: [
      'SWA-77 subtask 1/8 defines interaction and data requirements before implementation work.',
      '- Establishes selectedTaskBuildingId store field and selectTaskBuilding action with mutual exclusion against selectedAgent.',
      '- Defines task building click hit-test formula and event flow through handleClick after fountain and agent building checks.',
      '- Specifies IssueDetailView derived data contract linking TaskBuilding → BacklogItem → LinearProjectContract via districtId.',
      '- Locks stable data-testid selector contract for IssueDetailPanel and defines IT-SEL/IT-PNL/IT-LOG/IT-EXC/IT-REG test gate IDs.',
      '- Provides ordered implementation guidance for subtasks 2-8 covering store, canvas hit detection, highlight pass, panel, keyboard, and E2E.',
    ].join('\n'),
  },
  {
    id: 'district-theming-constraints-swa-75-subtask-1',
    title: 'District Theming Constraints (SWA-75 Subtask 1/5)',
    path: 'docs/testing/district-theming-constraints-swa-75-subtask-1.md',
    category: 'reference',
    track: 'foundation',
    updatedAt: '2026-03-03',
    summary: 'Architecture and runtime constraints for visually distinct district theming and separation, with implementation-ready guidance for SWA-75 subtasks 2-5.',
    tags: ['districts', 'theming', 'visual-design', 'city-canvas', 'swa-75', 'constraints', 'research'],
    content: [
      'SWA-75 subtask 1/5 audits district rendering and strategic-district architecture before implementation work.',
      '- Confirms four-quadrant district topology and project-to-district assignment constraints.',
      '- Documents current district color/tint usage in city canvas and the lack of explicit boundary rendering passes.',
      '- Captures performance and theme-mode guardrails for adding richer district theming safely.',
      '- Defines ordered implementation guidance for token contracts, separation rendering, and targeted regression validation.',
    ].join('\n'),
  },
  {
    id: 'budget-alert-requirements-swa-73-subtask-1',
    title: 'Budget Alert Requirements and Threshold Rules (SWA-73 Subtask 1/9)',
    path: 'docs/testing/budget-alert-requirements-swa-73-subtask-1.md',
    category: 'reference',
    track: 'foundation',
    updatedAt: '2026-03-03',
    summary: 'Defines percent/absolute threshold behavior, notification timing, severity mapping, scope precedence, reset logic, and channel payload requirements for SWA-73.',
    tags: ['budget', 'alerts', 'cost-tracking', 'thresholds', 'swa-73', 'requirements', 'research'],
    content: [
      'SWA-73 subtask 1/9 defines budget alert behavior and threshold rules before implementation expansion.',
      '- Locks default threshold contract at 50/75/90/100 percent and defines optional absolute thresholds.',
      '- Defines notification timing, grouped threshold delivery, and deterministic dedupe key behavior.',
      '- Defines scope precedence for alerts across project, environment, and workspace layers.',
      '- Defines reset triggers for run start, project/budget context changes, and manual reset actions.',
      '- Defines required channel coverage and minimum alert payload for deterministic downstream implementation/testing.',
      '- Provides explicit SWA-73 acceptance criteria for requirement completeness and traceability.',
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
