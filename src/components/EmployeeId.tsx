/**
 * EmployeeId.tsx — the helper's five-character ID, e.g. 4K7Q2.
 *
 * Given out by the database on insert (20261104000100_employee_codes.sql), so
 * every card that reads the applicant row can show it. Monospaced so the
 * characters line up when IDs are compared down a board. Renders nothing for a
 * row without a code, i.e. before that migration has run.
 */
export default function EmployeeId({ code, className = "" }: { code?: string | null; className?: string }) {
  if (!code) return null;
  return (
    <span
      title="Employee ID"
      className={`inline-flex items-center gap-1 rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white ${className}`}
    >
      <span className="text-slate-400">ID</span>
      <span className="font-mono tracking-wider">{code.toUpperCase()}</span>
    </span>
  );
}
