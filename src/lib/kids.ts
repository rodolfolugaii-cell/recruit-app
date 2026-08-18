/**
 * kids.ts — the applicant's own children, as the printed biodata asks for them.
 *
 * The paper form has FOUR separate blanks, not two:
 *
 *     How many kids:  Boy/s: ____   Age/s: ____
 *                     Girl/s: ____  Age/s: ____
 *
 * so form_data carries four fields to match — boysCount / boysAges and
 * girlsCount / girlsAges. A count prints in a narrow one-or-two-digit box; the
 * ages print as a comma-separated list ("15, 3, 4") in a wider one.
 *
 * Ages are stored in that canonical comma form so the apply form, the biodata
 * modal, the edit form and the PDF all show the same string. formatAges()
 * accepts whatever was typed — spaces, slashes, "3yo" — and returns it.
 *
 * ── Legacy rows ─────────────────────────────────────────────────────────────
 * Rows submitted before the split have boysAges / girlsAges but no counts, and
 * a hand-typed numberOfKids total. resolveCount() infers the missing count from
 * how many ages were listed, so those rows still print correctly without anyone
 * re-typing them. It is a read-time fallback only — nothing writes the inferred
 * value back, so an applicant's own answer is never overwritten by a guess. The
 * same care applies to the total: a legacy row keeps the figure that was typed
 * at the time, and only starts adding up the counts once one has been entered.
 */

/** The slice of form_data this module reads. Every form_data type satisfies it. */
export interface KidsFields {
  numberOfKids?: string;
  boysCount?:    string;
  boysAges?:     string;
  girlsCount?:   string;
  girlsAges?:    string;
}

/** Every number in `raw`, in the order typed, with leading zeros dropped. */
export function parseAges(raw?: string | null): string[] {
  return (raw ?? "").match(/\d+/g)?.map(n => String(Number(n))) ?? [];
}

/** Canonical age list: "15 3  4" / "15/3/4" / "15,3,4" → "15, 3, 4" */
export function formatAges(raw?: string | null): string {
  return parseAges(raw).join(", ");
}

/** First number in `raw`, or "" — used to keep a count box to a bare number. */
export function formatCount(raw?: string | null): string {
  const n = (raw ?? "").match(/\d+/)?.[0];
  return n === undefined ? "" : String(Number(n));
}

/** A stated count, or — for legacy rows that have none — the number of ages listed. */
export function resolveCount(count?: string | null, ages?: string | null): string {
  const stated = formatCount(count);
  if (stated !== "") return stated;
  const listed = parseAges(ages).length;
  return listed > 0 ? String(listed) : "";
}

/** Everything a display or an export needs, resolved and formatted in one call. */
export function kidsOf(fd: KidsFields | null | undefined) {
  const f         = fd ?? {};
  const boys      = resolveCount(f.boysCount,  f.boysAges);
  const girls     = resolveCount(f.girlsCount, f.girlsAges);
  const boysAges  = formatAges(f.boysAges);
  const girlsAges = formatAges(f.girlsAges);

  // The total is the two counts added up — but only once at least one of them
  // was actually stated. A legacy row has no counts and a hand-typed total, and
  // that total may legitimately exceed the ages listed (a mother who wrote
  // "4 kids" but only gave three ages). Adding up inferred counts there would
  // quietly replace her 4 with a 3, so her own figure is kept instead.
  const stated = formatCount(f.boysCount) !== "" || formatCount(f.girlsCount) !== "";
  const typed  = formatCount(f.numberOfKids);
  const total  = !stated && typed !== ""
    ? typed
    : boys === "" && girls === ""
      ? ""
      : String((Number(boys) || 0) + (Number(girls) || 0));

  return { boys, boysAges, girls, girlsAges, total };
}

/** One-line summary for review screens: "2 boys (3, 7) · 1 girl (5)" */
export function kidsSummary(fd: KidsFields | null | undefined): string {
  const k = kidsOf(fd);
  const part = (n: string, ages: string, one: string, many: string) => {
    if (n === "" && ages === "") return "";
    const head = n === "" ? many : `${n} ${n === "1" ? one : many}`;
    return ages ? `${head} (${ages})` : head;
  };
  return [
    part(k.boys,  k.boysAges,  "boy",  "boys"),
    part(k.girls, k.girlsAges, "girl", "girls"),
  ].filter(Boolean).join(" · ");
}

/**
 * How many ages were listed, when that disagrees with a count the user actually
 * typed — otherwise null. Drives a soft hint in the forms; never blocks a save,
 * since a mother may well know a child's age is missing.
 */
export function agesMismatch(count?: string | null, ages?: string | null): number | null {
  const stated = formatCount(count);
  const listed = parseAges(ages).length;
  if (stated === "" || listed === 0) return null;
  return listed === Number(stated) ? null : listed;
}
