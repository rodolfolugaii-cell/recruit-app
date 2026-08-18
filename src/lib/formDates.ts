/**
 * formDates.ts — dates as the printed forms want them: dd/mm/yyyy.
 *
 * Two different things arrive here and they must not be treated alike.
 *
 * A date-only value — `date_of_birth`, `contractDate`, a `<input type="date">` —
 * is "1990-01-20" with no time zone attached. `new Date("1990-01-20")` reads it
 * as midnight UTC, so anyone whose clock is behind UTC renders the day before.
 * A birthday or a contract date that shifts by a day depending on who opened the
 * page is wrong on an Immigration form. zodiac.ts documents the same trap for
 * cusp birthdays; this is the printing side of it.
 *
 * A timestamp — `signed_at`, `helper_signed_at` — is a real instant, so it does
 * need converting, but to Hong Kong rather than to wherever the recruiter's
 * laptop happens to be set. The contract records when it was signed in the
 * place it was signed.
 */

const HK_TZ = "Asia/Hong_Kong";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** dd/mm/yyyy, or "" when there is nothing to print. */
export function formDate(value?: string | null): string {
  const s = (value ?? "").trim();
  if (!s) return "";

  // Date-only: reorder the parts, never construct a Date at all
  const plain = DATE_ONLY.exec(s);
  if (plain) return `${plain[3]}/${plain[2]}/${plain[1]}`;

  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { timeZone: HK_TZ });
}

/**
 * Age in whole years today. Reads the year, month and day off a date-only string
 * directly for the same reason as above, and subtracts a year when the birthday
 * has not come round yet — comparing years alone makes someone a year older on
 * 1 January.
 */
export function ageFrom(value?: string | null): string {
  const s = (value ?? "").trim();
  if (!s) return "";

  let y: number, m: number, d: number;
  const plain = DATE_ONLY.exec(s);
  if (plain) {
    [y, m, d] = [Number(plain[1]), Number(plain[2]), Number(plain[3])];
  } else {
    const parsed = new Date(s);
    if (Number.isNaN(parsed.getTime())) return "";
    [y, m, d] = [parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate()];
  }

  const now = new Date();
  let age = now.getFullYear() - y;
  const beforeBirthday =
    now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d);
  if (beforeBirthday) age -= 1;

  return age >= 0 ? String(age) : "";
}
