"use client";

/**
 * ContractSignPage.tsx — the public page behind a signing link.
 *
 * No login, like /apply. The party opens their link, reads back the terms the
 * agency agreed, types their name and signs. Nothing on this page is editable:
 * the agency sets the terms, and a contract that changed between being sent and
 * being signed would not be the one that was agreed.
 *
 * Everything it knows comes from the contract_by_token RPC — the browser never
 * touches the contracts table, so a link exposes exactly one contract and
 * nothing about any other.
 */

import { useEffect, useState } from "react";
import SignaturePad from "@/components/SignaturePad";
import {
  CLAUSE_2_OPTIONS, DUTY_FIELDS, fetchSigningView, signContract, uploadSignature,
  type SigningView,
} from "@/lib/contracts";

/* ── Read-back building blocks ────────────────────────────────────────────── */

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-white/10 last:border-0">
      <span className="text-[13px] text-white/50 flex-shrink-0">{label}</span>
      <span className="text-sm font-medium text-white text-right min-w-0">{value}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/12 bg-white/[0.05] backdrop-blur-sm p-5">
      <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-2">{title}</h2>
      {children}
    </section>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen bg-slate-950 text-white px-4 py-10 font-sans"
      style={{
        backgroundImage: "linear-gradient(rgba(2,6,23,0.88), rgba(2,6,23,0.95)), url('/hk-bg.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="max-w-2xl mx-auto space-y-5">{children}</div>
    </div>
  );
}

function Notice({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <Shell>
      <div className="rounded-2xl border border-white/12 bg-white/[0.05] p-10 text-center">
        <p className="text-5xl mb-4">{icon}</p>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-white/60 leading-relaxed max-w-sm mx-auto">{body}</p>
      </div>
    </Shell>
  );
}

/* ── Component ────────────────────────────────────────────────────────────── */
export default function ContractSignPage({ token }: { token: string }) {
  const [view, setView]         = useState<SigningView | null>(null);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadErr] = useState<string | null>(null);

  const [name, setName]           = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmit]   = useState(false);
  const [done, setDone]           = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const v = await fetchSigningView(token);
        setView(v);
        // The employer's own name is already on record; the helper types hers.
        if (v?.party === "employer" && v.employer_name) setName(v.employer_name);
        else if (v?.party === "helper" && v.helper_name) setName(v.helper_name);
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleSubmit = async () => {
    if (!name.trim())  { alert("Please type your full name."); return; }
    if (!signature)    { alert("Please sign in the box before submitting."); return; }
    setSubmit(true);
    try {
      const url = await uploadSignature(signature, view?.party ?? "party");
      await signContract(token, name.trim(), url);
      setDone(true);
    } catch (e) {
      alert("Could not submit: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSubmit(false);
    }
  };

  if (loading) {
    return <Notice icon="⏳" title="Loading your contract…" body="One moment." />;
  }
  if (loadError) {
    return <Notice icon="⚠️" title="Something went wrong" body={loadError} />;
  }
  if (!view) {
    return (
      <Notice
        icon="🔗"
        title="This link is not valid"
        body="It may have been mistyped or replaced. Ask Castillo Del Rey Consultancy to send you a new one."
      />
    );
  }
  if (done || view.signed) {
    return (
      <Notice
        icon="✅"
        title="Signed — thank you"
        body="Your signature has been recorded. Castillo Del Rey Consultancy will be in touch with the completed contract."
      />
    );
  }

  const t        = view.terms ?? {};
  const isHelper = view.party === "helper";
  const duties   = DUTY_FIELDS.filter(d => t.duties?.[d.key]);
  const clause2  = CLAUSE_2_OPTIONS.find(c => c.value === t.clause2);

  return (
    <Shell>
      {/* ── Heading ── */}
      <header className="text-center pb-1">
        <p className="text-[11px] font-semibold text-amber-300/80 uppercase tracking-[0.18em]">
          Castillo Del Rey Consultancy
        </p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight">
          Employment Contract
        </h1>
        <p className="mt-1 text-sm text-white/50">
          For a Domestic Helper recruited from abroad · ID 407
        </p>
        <p className="mt-4 text-sm text-white/70 max-w-md mx-auto leading-relaxed">
          {isHelper
            ? "Please read the terms below. If they are correct, type your name and sign at the bottom."
            : "Please review the terms below. If they are correct, type your name and sign at the bottom."}
        </p>
      </header>

      {/* ── The parties ── */}
      <Card title="The parties">
        <div className="flex items-center gap-4 pb-3 mb-1 border-b border-white/10">
          <div className="w-14 h-14 rounded-lg bg-white/10 overflow-hidden flex-shrink-0">
            {view.helper_photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={view.helper_photo} alt="" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold truncate">{view.helper_name}</p>
            <p className="text-xs text-white/50">The Helper</p>
          </div>
        </div>
        <Row label="The Employer" value={view.employer_name} />
        <Row label="Place of origin" value={t.placeOfOrigin || view.helper_origin} />
        <Row label="Residence" value={view.employer_address} />
      </Card>

      {/* ── Terms ── */}
      <Card title="Terms">
        <Row label="D. H. Contract No." value={t.contractNo} />
        <Row label="Date of contract" value={t.contractDate} />
        <Row label="Commencement" value={clause2?.label} />
        {t.clause2 === "B" && <Row label="Commencing on" value={t.clause2bCommenceDate} />}
        {t.clause2 === "B" && <Row label="Following contract no." value={t.clause2bPreviousNo} />}
        <Row label="Monthly wages" value={t.wages ? `HK$ ${t.wages}` : null} />
        <Row
          label="Food"
          value={
            t.foodArrangement === "provided" ? "Provided free by the Employer"
            : t.foodAllowance ? `Allowance of HK$ ${t.foodAllowance} a month`
            : null
          }
        />
        <Row label="Other fees" value={t.otherFees} />
      </Card>

      {/* ── Duties ── */}
      {(duties.length > 0 || t.dutiesOthers) && (
        <Card title="Major portion of domestic duties">
          <ul className="space-y-1.5 pt-1">
            {duties.map(d => (
              <li key={d.key} className="flex items-start gap-2 text-sm">
                <span className="text-emerald-400 flex-shrink-0">✓</span>
                <span>
                  {d.label}
                  {d.key === "agedPersons" && t.agedPersonsCare && (
                    <span className="text-white/50"> — constant care {t.agedPersonsCare}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {t.dutiesOthers && (
            <p className="mt-3 pt-3 border-t border-white/10 text-sm text-white/70 leading-relaxed">
              <span className="text-white/40">Others: </span>{t.dutiesOthers}
            </p>
          )}
        </Card>
      )}

      {/* ── Sign ── */}
      <Card title={isHelper ? "Signed by the Helper" : "Signed by the Employer"}>
        <div className="pt-1 space-y-4">
          <div>
            <label className="block text-[13px] text-white/60 mb-1.5">Your full name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Type your full name"
              className="block w-full rounded-lg border border-white/20 bg-white/[0.07] px-3 py-2.5 text-sm text-white placeholder-white/30 focus:border-amber-300/60 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[13px] text-white/60 mb-1.5">Your signature</label>
            {/* The pad draws dark ink, so it keeps its own light surface */}
            <div className="rounded-lg overflow-hidden bg-white p-2">
              <SignaturePad onChange={setSignature} />
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 rounded-lg bg-white text-slate-900 font-semibold text-sm hover:bg-amber-200 transition-colors disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Sign and submit"}
          </button>

          <p className="text-[11px] text-white/35 leading-relaxed text-center">
            By signing you confirm the details above are correct. If anything is wrong,
            do not sign — contact Castillo Del Rey Consultancy and we will send a corrected contract.
          </p>
        </div>
      </Card>
    </Shell>
  );
}
