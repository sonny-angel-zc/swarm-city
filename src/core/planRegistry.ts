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
