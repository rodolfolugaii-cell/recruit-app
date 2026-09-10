"use client";

/**
 * ContractsDashboard.tsx — /dashboard/contracts
 *
 * Every ID 407 in flight, and where each one has got to. A contract is created
 * from For Review once a helper has an employer assigned; this page is where the
 * terms get set and the two signing links get sent out.
 *
 * The two links are shown separately and never mixed up: each unlocks only its
 * own party's signature panel, so handing the employer's link to the helper does
 * not let her sign as the employer.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import ContractTermsForm from "@/components/ContractTermsForm";
import { supabase } from "@/lib/supabase";
import {
  fetchContracts, signingLink, signingProgress, updateContract,
  type Contract,
} from "@/lib/contracts";
import { employerInitials, employerTint, fetchEmployers, type Employer } from "@/lib/employers";
import { exportContractPdf } from "@/lib/exportContractPdf";
import { id407Gaps } from "@/lib/id407";

const STATUS_STYLE: Record<string, string> = {
  Draft:           "bg-gray-200 text-gray-700",
  Sent:            "bg-blue-100 text-blue-700",
  "Partly Signed": "bg-amber-100 text-amber-800",
  Signed:          "bg-emerald-100 text-emerald-800",
};

/** A signing link with a copy button. Read-only — the token is never editable. */
function LinkRow({
  title, token, signed, signedBy, signedAt,
}: {
  title: string; token: string;
  signed: boolean; signedBy?: string | null; signedAt?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const url = signingLink(token);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked outside a secure context — the input is selectable
      alert(url);
    }
  };

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{title}</span>
        {signed ? (
          <span className="text-[11px] text-emerald-600 font-medium truncate" title={signedBy ?? ""}>
            ✓ signed{signedAt ? ` ${new Date(signedAt).toLocaleDateString()}` : ""}
          </span>
        ) : (
          <span className="text-[11px] text-gray-400">not signed yet</span>
        )}
      </div>
      <div className="flex gap-1.5">
        <input
          readOnly value={url}
          onFocus={e => e.currentTarget.select()}
          className="flex-1 min-w-0 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-[11px] text-gray-600 font-mono focus:outline-none focus:border-blue-400"
        />
        <button onClick={copy}
          className="flex-shrink-0 px-2.5 py-1.5 rounded-md text-[11px] font-semibold bg-slate-800 text-white hover:bg-slate-700 transition-colors">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export default function ContractsDashboard() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [employers, setEmployers] = useState<Map<string, Employer>>(new Map());
  const [helpers, setHelpers]     = useState<Map<string, { full_name: string; nationality: string | null; signature_url: string | null }>>(new Map());
  const [exporting, setExporting] = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [editing, setEditing]     = useState<Contract | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await fetchContracts();
      setContracts(rows);

      // Employer names for the cards. A missing employers table just means no
      // names — it must not take the contract list down with it.
      try {
        setEmployers(new Map((await fetchEmployers()).map(e => [e.id, e])));
      } catch { /* leave the map empty */ }

      const ids = [...new Set(rows.map(r => r.applicant_id))];
      if (ids.length) {
        const { data } = await supabase
          .from("applicants")
          .select("id, full_name, nationality, signature_url")
          .in("id", ids);
        if (data) {
          setHelpers(new Map(
            (data as { id: string; full_name: string; nationality: string | null; signature_url: string | null }[])
              .map(a => [a.id, a])
          ));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const markSent = async (c: Contract) => {
    try {
      const saved = await updateContract(c.id, { status: "Sent" });
      setContracts(prev => prev.map(x => (x.id === saved.id ? saved : x)));
    } catch (e) {
      alert("Could not update: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  // The export deliberately does not require a complete contract — a recruiter
  // often needs the form on paper before it is finished. Gaps are reported, and
  // confirmed, rather than blocking the download.
  const handleExport = async (c: Contract) => {
    const helper = helpers.get(c.applicant_id);
    if (!helper) { alert("Could not load the helper's record for this contract."); return; }
    const employer = c.employer_id ? employers.get(c.employer_id) ?? null : null;

    const gaps = id407Gaps(employer, c);
    if (gaps.length && !confirm(
      "This contract is not complete yet. The form will print with these left blank:\n\n" +
      gaps.map(g => `  · ${g}`).join("\n") +
      "\n\nExport anyway?"
    )) return;

    setExporting(c.id);
    try {
      await exportContractPdf(helper, employer, c);
    } catch (e) {
      alert("Could not export: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExporting(null);
    }
  };

  const handleSaved = (saved: Contract) => {
    setContracts(prev => prev.map(c => (c.id === saved.id ? saved : c)));
    setEditing(null);
  };

  const sorted = useMemo(
    () => [...contracts].sort((a, b) => (a.status === "Signed" ? 1 : 0) - (b.status === "Signed" ? 1 : 0)),
    [contracts],
  );

  if (loading) return <div className="text-gray-500 text-sm">Loading contracts…</div>;

  return (
    <div>
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700">{error}</div>
      )}

      {!error && !contracts.length && (
        <div className="p-10 rounded-xl border border-dashed border-gray-300 bg-white text-center">
          <p className="text-4xl mb-3">📄</p>
          <h3 className="font-semibold text-gray-800">No contracts yet</h3>
          <p className="mt-1 text-sm text-gray-500 max-w-md mx-auto">
            Assign a helper to an employer in <span className="font-medium">For Review</span>,
            then create her contract from the same panel. It will appear here with a
            signing link for each party.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {sorted.map(c => {
          const emp  = c.employer_id ? employers.get(c.employer_id) : null;
          const tint = employerTint(emp?.name ?? "—");
          return (
            <div key={c.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

              {/* Header */}
              <div className="p-5 flex items-start gap-3 border-b border-gray-100">
                <div className={`w-11 h-11 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center ${tint.bg}`}>
                  {emp?.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={emp.logo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className={`text-xs font-black ${tint.text}`}>{employerInitials(emp?.name ?? "?")}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-gray-900 truncate">
                    {helpers.get(c.applicant_id)?.full_name ?? "Unknown helper"}
                  </h3>
                  <p className="text-xs text-gray-500 truncate">
                    {emp?.name ?? "No employer"}
                    {c.terms?.wages ? ` · HK$ ${c.terms.wages}/month` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_STYLE[c.status] ?? STATUS_STYLE.Draft}`}>
                    {c.status}
                  </span>
                  <span className="text-[10px] text-gray-400">{signingProgress(c)}</span>
                </div>
              </div>

              {/* Links */}
              <div className="p-5 space-y-4">
                <LinkRow
                  title="Employer's signing link" token={c.employer_token}
                  signed={!!c.employer_signed_at} signedBy={c.employer_name} signedAt={c.employer_signed_at}
                />
                <LinkRow
                  title="Helper's signing link" token={c.helper_token}
                  signed={!!c.helper_signed_at} signedBy={c.helper_name} signedAt={c.helper_signed_at}
                />
              </div>

              {/* Actions */}
              <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2">
                <span className="text-[11px] text-gray-400">
                  Created {new Date(c.created_at).toLocaleDateString()}
                </span>
                <div className="flex items-center gap-1">
                  {c.status === "Draft" && (
                    <button onClick={() => markSent(c)}
                      className="px-2.5 py-1 rounded-md text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors">
                      Mark as sent
                    </button>
                  )}
                  <button onClick={() => setEditing(c)}
                    className="px-2.5 py-1 rounded-md text-xs font-semibold text-gray-600 hover:bg-gray-200 transition-colors">
                    Terms
                  </button>
                  <button onClick={() => handleExport(c)} disabled={exporting === c.id}
                    title="Values only, to print onto the real pre-printed ID 407. Print at actual size — any scaling moves every value off its line."
                    className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-800 text-white hover:bg-slate-700 transition-colors disabled:opacity-50">
                    {exporting === c.id ? "Building…" : "📄 Print Overlay"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl w-full max-w-3xl my-8 overflow-hidden shadow-xl"
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xs font-bold text-gray-600 uppercase tracking-widest">Contract Terms</h2>
              <button onClick={() => setEditing(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <ContractTermsForm
              contract={editing}
              onCancel={() => setEditing(null)}
              onSaved={handleSaved}
            />
          </div>
        </div>
      )}
    </div>
  );
}
