/**
 * Pagination.tsx — the page switcher at the foot of every list.
 *
 * At most five page numbers are shown at once, kept centred on the current
 * page where possible. With more than five pages, ‹ and › arrows step one page
 * at a time and the row of numbers slides along with them. Renders nothing for
 * a single page.
 */

const WINDOW = 5;

export default function Pagination({
  page, pageCount, total, onChange, busy = false,
}: {
  page: number;
  pageCount: number;
  /** Rows across all pages, for the "of N" label. */
  total: number;
  onChange: (page: number) => void;
  /** A page is being fetched — the buttons stay put but show it. */
  busy?: boolean;
}) {
  if (pageCount <= 1) return null;

  const start = Math.min(Math.max(1, page - Math.floor(WINDOW / 2)), Math.max(1, pageCount - WINDOW + 1));
  const pages = Array.from({ length: Math.min(WINDOW, pageCount) }, (_, i) => start + i);
  const arrows = pageCount > WINDOW;

  const go = (p: number) => { if (p !== page && p >= 1 && p <= pageCount) onChange(p); };

  const arrow = "w-9 h-9 rounded-lg border border-gray-300 bg-white text-gray-600 flex items-center justify-center hover:bg-gray-50 hover:border-gray-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed";

  return (
    <nav aria-label="Pages" className={`mt-8 flex flex-col items-center gap-2 ${busy ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-1.5">
        {arrows && (
          <button onClick={() => go(page - 1)} disabled={page === 1} aria-label="Previous page" className={arrow}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}
        {pages.map(p => (
          <button
            key={p}
            onClick={() => go(p)}
            aria-current={p === page ? "page" : undefined}
            className={`min-w-9 h-9 px-2 rounded-lg text-sm font-semibold border transition-colors ${
              p === page
                ? "bg-slate-800 border-slate-800 text-white"
                : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400"
            }`}
          >
            {p}
          </button>
        ))}
        {arrows && (
          <button onClick={() => go(page + 1)} disabled={page === pageCount} aria-label="Next page" className={arrow}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400">
        Page {page} of {pageCount} · {total} total{busy && " · loading…"}
      </p>
    </nav>
  );
}
