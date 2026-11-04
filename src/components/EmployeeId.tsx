/**
 * EmployeeId.tsx — the ID tags shown on cards and in headers.
 *
 *   EmployeeId  a helper's five-character ID, e.g. 4K7Q2 — given out by the
 *               database on insert (20261104000100_employee_codes.sql)
 *   EmployerId  an employer's own ID, typed on the employer form
 *               (20261104000200_employer_codes.sql)
 *
 * Same tag for both, told apart by colour, so an ID reads as an ID wherever it
 * appears. Monospaced so characters line up when IDs are compared down a list.
 * Renders nothing when there is no code.
 */

function IdTag({
  label, code, tone, className = "",
}: { label: string; code?: string | null; tone: string; className?: string }) {
  if (!code) return null;
  return (
    <span
      title={`${label} ${code.toUpperCase()}`}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold leading-none shadow-sm ${tone} ${className}`}
    >
      <span className="text-[11px] opacity-60">ID</span>
      <span className="font-mono text-sm font-bold tracking-wider">{code.toUpperCase()}</span>
    </span>
  );
}

export default function EmployeeId({ code, className }: { code?: string | null; className?: string }) {
  return <IdTag label="Employee ID" code={code} tone="bg-slate-800 text-white" className={className} />;
}

export function EmployerId({ code, className }: { code?: string | null; className?: string }) {
  return <IdTag label="Employer ID" code={code} tone="bg-blue-600 text-white" className={className} />;
}
