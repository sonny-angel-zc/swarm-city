'use client';

import { useMemo } from 'react';
import { useSwarmStore } from '@/core/store';
import { DocCategory, filterDocuments, getDocumentById } from '@/core/planRegistry';

const categoryOptions: Array<{ value: 'all' | DocCategory; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'plan', label: 'Plans' },
  { value: 'memory', label: 'Memory' },
  { value: 'reference', label: 'Refs' },
  { value: 'note', label: 'Notes' },
];

export default function DocsPanel() {
  const docsRegistry = useSwarmStore((s) => s.docsRegistry);
  const docsFilter = useSwarmStore((s) => s.docsFilter);
  const docsQuery = useSwarmStore((s) => s.docsQuery);
  const selectedDocId = useSwarmStore((s) => s.selectedDocId);
  const documentMemory = useSwarmStore((s) => s.documentMemory);
  const setDocsFilter = useSwarmStore((s) => s.setDocsFilter);
  const setDocsQuery = useSwarmStore((s) => s.setDocsQuery);
  const selectDocument = useSwarmStore((s) => s.selectDocument);
  const indexDocuments = useSwarmStore((s) => s.indexDocuments);
  const captureDocumentMemory = useSwarmStore((s) => s.captureDocumentMemory);
  const unpinMemory = useSwarmStore((s) => s.unpinMemory);
  const clearDocumentMemory = useSwarmStore((s) => s.clearDocumentMemory);

  const visibleDocs = useMemo(
    () => filterDocuments(docsRegistry, docsFilter, docsQuery),
    [docsRegistry, docsFilter, docsQuery],
  );

  const selectedDoc = useMemo(
    () => getDocumentById(docsRegistry, selectedDocId) ?? visibleDocs[0] ?? null,
    [docsRegistry, selectedDocId, visibleDocs],
  );

  return (
    <div className="p-4 border-b border-[#1e2a3a]">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Docs</h2>
        <button
          onClick={indexDocuments}
          className="text-[10px] px-2 py-1 rounded border border-[#30363d] text-white/50 hover:text-white/75 hover:border-[#3f4a5f] transition-colors"
        >
          Reindex
        </button>
      </div>

      <input
        type="text"
        value={docsQuery}
        onChange={(e) => setDocsQuery(e.target.value)}
        placeholder="Search docs..."
        className="w-full bg-[#161b22] border border-[#21262d] rounded-md px-2.5 py-1.5 text-[11px] text-white/80 placeholder-white/25 focus:outline-none focus:border-[#58a6ff]/50 transition-colors"
      />

      <div className="flex gap-1 mt-2 flex-wrap">
        {categoryOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => setDocsFilter(option.value)}
            className={`text-[10px] px-2 py-1 rounded border transition-colors ${
              docsFilter === option.value
                ? 'bg-blue-500/20 border-blue-500/30 text-blue-300'
                : 'border-[#30363d] text-white/45 hover:text-white/70 hover:border-[#3f4a5f]'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-1 max-h-28 overflow-y-auto pr-1">
        {visibleDocs.length === 0 ? (
          <div className="text-[11px] text-white/25 italic">No matching docs</div>
        ) : (
          visibleDocs.map((doc) => (
            <button
              key={doc.id}
              onClick={() => selectDocument(doc.id)}
              className={`w-full text-left p-2 rounded border transition-colors ${
                selectedDoc?.id === doc.id
                  ? 'bg-[#1b2535] border-[#35507a]'
                  : 'bg-[#161b22] border-[#21262d] hover:bg-[#1b2230] hover:border-[#303a4a]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-white/80 truncate">{doc.title}</span>
                <span className="text-[9px] text-white/30 uppercase">{doc.category}</span>
              </div>
              <div className="text-[10px] text-white/35 truncate mt-0.5">{doc.path}</div>
            </button>
          ))
        )}
      </div>

      {selectedDoc && (
        <div className="mt-3 p-2.5 rounded-lg bg-[#10161f] border border-[#212b39]">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="text-[11px] text-white/75 font-medium truncate">{selectedDoc.title}</div>
            <button
              onClick={() => captureDocumentMemory(selectedDoc.id)}
              className="text-[10px] px-2 py-1 rounded border border-emerald-700/40 text-emerald-300/90 hover:bg-emerald-500/10 transition-colors"
            >
              Pin Key Lines
            </button>
          </div>
          <p className="text-[10px] text-white/35 leading-relaxed">{selectedDoc.summary}</p>
          <div className="text-[10px] text-white/25 mt-1">Updated {selectedDoc.updatedAt}</div>
        </div>
      )}

      <div className="mt-3">
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-[10px] text-white/40 uppercase tracking-wider">Document Memory</h3>
          {documentMemory.length > 0 && (
            <button
              onClick={clearDocumentMemory}
              className="text-[10px] text-white/35 hover:text-white/65 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        {documentMemory.length === 0 ? (
          <p className="text-[11px] text-white/20 italic">No pinned snippets yet</p>
        ) : (
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {documentMemory.map((item) => (
              <div key={item.id} className="p-2 rounded bg-[#161b22] border border-[#21262d]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-blue-300/80 truncate">{item.docTitle}</span>
                  <button
                    onClick={() => unpinMemory(item.id)}
                    className="text-[10px] text-white/35 hover:text-white/70 transition-colors"
                  >
                    Remove
                  </button>
                </div>
                <p className="text-[11px] text-white/60 leading-relaxed mt-1">{item.snippet}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
