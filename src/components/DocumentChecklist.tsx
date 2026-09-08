"use client";

/**
 * DocumentChecklist.tsx — the six required copies, as a panel beside a card.
 *
 * A second box attached to the right edge of an applicant card, overlapping it
 * slightly so the two read as one unit while staying visibly separate. Every
 * document is a tick, so a recruiter can clear paperwork straight from the
 * board without opening a profile.
 *
 * Ticks save the moment they are made — there is no Save button, because a
 * half-recorded checklist means nothing. The tick flips immediately and rolls
 * back if the write fails, so the panel never claims a document is in when the
 * database disagrees.
 *
 * Pointer events stop here: the card underneath starts a drag on pointerdown,
 * and ticking a box must never begin dragging the helper to another board.
 */

import { useState } from "react";
import {
  HELPER_DOCUMENTS, TOTAL_DOCUMENTS, allDocumentsIn, documentsDone,
  saveDocuments, toggleDocument,
  type DocumentKey, type DocumentRecord,
} from "@/lib/helperDocuments";

function Tick({ on }: { on: boolean }) {
  return (
    <span
      className={`w-[15px] h-[15px] rounded-[4px] border flex-shrink-0 flex items-center justify-center transition-colors ${
        on ? "bg-emerald-600 border-emerald-600" : "border-gray-300 bg-white group-hover:border-emerald-400"
      }`}
    >
      {on && (
        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
          <path d="M2 5l2.5 2.5 3.5-4" stroke="currentColor" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

export default function DocumentChecklist({
  applicantId, documents, onChange,
}: {
  applicantId: string;
  documents: DocumentRecord | null | undefined;
  onChange: (next: DocumentRecord) => void;
}) {
  const [saving, setSaving] = useState<DocumentKey | null>(null);
  const [error, setError]   = useState<string | null>(null);

  const done     = documentsDone(documents);
  const complete = allDocumentsIn(documents);

  const toggle = async (key: DocumentKey) => {
    const before = documents ?? {};
    const next   = toggleDocument(before, key);

    onChange(next);          // flip now; the board should feel instant
    setSaving(key);
    setError(null);
    try {
      await saveDocuments(applicantId, next);
    } catch (e) {
      onChange(before);      // the write failed, so the tick was never true
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  };

  return (
    <aside
      // Stops the card's drag from starting, and its click from opening the profile
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      className={`relative z-10 -ml-3 my-5 w-[136px] flex-shrink-0 self-stretch rounded-xl border bg-white shadow-[0_6px_18px_-6px_rgba(15,23,42,0.25)] flex flex-col ${
        complete ? "border-emerald-300" : "border-gray-200"
      }`}
    >
      {/* ── Heading ── */}
      <div className={`px-2.5 pt-2.5 pb-2 border-b rounded-t-xl ${
        complete ? "bg-emerald-50 border-emerald-100" : "bg-gray-50 border-gray-100"
      }`}>
        <div className="flex items-baseline justify-between gap-1">
          <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-gray-400">
            Documents
          </span>
          <span className={`text-[10px] font-bold tabular-nums ${
            complete ? "text-emerald-700" : "text-gray-500"
          }`}>
            {done}/{TOTAL_DOCUMENTS}
          </span>
        </div>
        <div className="mt-1.5 h-1 rounded-full bg-gray-200 overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${
              complete ? "bg-emerald-500" : "bg-amber-400"
            }`}
            style={{ width: `${(done / TOTAL_DOCUMENTS) * 100}%` }}
          />
        </div>
      </div>

      {/* ── The six copies ── */}
      <ul className="flex-1 p-1.5 space-y-0.5">
        {HELPER_DOCUMENTS.map(doc => {
          const at = documents?.[doc.key];
          const on = !!at;
          return (
            <li key={doc.key}>
              <button
                type="button"
                onClick={() => toggle(doc.key)}
                disabled={saving !== null}
                title={at ? `${doc.full} — received ${new Date(at).toLocaleDateString()}` : doc.full}
                className={`group w-full flex items-center gap-1.5 px-1.5 py-[5px] rounded-md text-left transition-colors disabled:cursor-wait ${
                  on ? "hover:bg-emerald-50" : "hover:bg-gray-50"
                }`}
              >
                <Tick on={on} />
                <span className={`text-[10.5px] leading-tight truncate ${
                  on ? "text-emerald-800 font-semibold" : "text-gray-600"
                }`}>
                  {doc.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="px-2.5 pb-2 text-[9px] leading-snug text-red-600">{error}</p>
      )}
    </aside>
  );
}
