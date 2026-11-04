/**
 * pagedCache.ts — load a list one page at a time, and keep each page once seen.
 *
 * The boards used to fetch every applicant (form_data and all) and render every
 * photo up front. Now a board asks for one page of PAGE_SIZE rows; the first
 * visit fetches it, and every later visit to the same page is answered from
 * memory — including after switching to another dashboard page and back, since
 * the cache lives at module level for the whole browser session.
 *
 * Staleness is handled three ways:
 *   - anything this app changes (send for review, trash, restore, edit) calls
 *     invalidatePaged(), which drops the affected lists so they refetch;
 *   - a cached page older than REVALIDATE_MS is shown at once and then quietly
 *     refetched (needsRevalidate + force), so a new /apply submission appears
 *     within seconds rather than waiting out the cache;
 *   - every entry also expires outright after TTL_MS.
 *
 * A list's pages are only valid against the total they were fetched with: if
 * the total moves, rows have shifted between pages, so the whole list is
 * dropped and refetched rather than mixing old and new offsets.
 */

export const PAGE_SIZE = 15;

const TTL_MS        = 5 * 60 * 1000;
const REVALIDATE_MS = 30 * 1000;

export interface PageResult<T> {
  rows: T[];
  total: number;
  /** When the cached copy was fetched — absent for a fresh fetch. */
  cachedAt?: number;
}

/** Fetch rows `from`..`to` inclusive (Supabase .range()) plus the full count. */
export type PageFetcher<T> = (from: number, to: number) => Promise<PageResult<T>>;

interface Entry { at: number; total: number; pages: Map<number, { at: number; rows: unknown[] }> }

const cache = new Map<string, Entry>();

/** Number of pages for `total` rows — never less than 1, so page 1 always exists. */
export function pageCountFor(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

/**
 * One page of a list, from memory when it has been seen and is still fresh.
 * `force` skips the cache — used for the background re-check.
 */
export async function loadPage<T>(
  key: string, page: number, fetcher: PageFetcher<T>, opts: { force?: boolean } = {},
): Promise<PageResult<T>> {
  const entry = cache.get(key);
  const fresh = entry && Date.now() - entry.at < TTL_MS ? entry : null;
  const hit = fresh?.pages.get(page);
  if (fresh && hit && !opts.force) return { rows: hit.rows as T[], total: fresh.total, cachedAt: hit.at };

  const from = (page - 1) * PAGE_SIZE;
  const res  = await fetcher(from, from + PAGE_SIZE - 1);

  const keep = fresh && fresh.total === res.total ? fresh : { at: Date.now(), total: res.total, pages: new Map() };
  keep.pages.set(page, { at: Date.now(), rows: res.rows });
  cache.set(key, keep);
  return { rows: res.rows, total: res.total };
}

/** A page served from memory that is old enough to be worth re-checking. */
export function needsRevalidate(res: PageResult<unknown>): boolean {
  return res.cachedAt !== undefined && Date.now() - res.cachedAt > REVALIDATE_MS;
}

/** Drop every list whose key starts with `prefix` (all of them for ""). */
export function invalidatePaged(prefix = ""): void {
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
}

/** The slice of an already-loaded list that one page shows. */
export function pageSlice<T>(list: T[], page: number, size = PAGE_SIZE): T[] {
  return list.slice((page - 1) * size, page * size);
}
