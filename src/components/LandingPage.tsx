"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import LoginForm from "@/components/LoginForm";

/**
 * Scroll-driven landing page.
 *
 * On lg+ the whole thing is a single pinned stage: the sign-in card floats on
 * the left while the right-hand copy cross-fades between three panels and the
 * background wash shifts palette. Scroll position — not a timer or an observer
 * — drives everything, so scrubbing backwards looks identical to scrubbing
 * forwards.
 *
 * Below lg the stage un-pins and the three panels fall back into normal
 * document flow (see .ls-panel in globals.css). The CSS handles that switch by
 * media query rather than JS measuring the viewport, which would otherwise
 * flash the wrong layout on hydration.
 */

const SECTIONS = 3;
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Custom properties aren't in React's CSSProperties — this keeps the cast in one place. */
const vars = (o: Record<string, string | number>) => o as React.CSSProperties;

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E\")";

/* ── Backdrop ──────────────────────────────────────────────────────────── */

function Wash({
  weight, gradient, orbA, orbB,
}: { weight: number; gradient: string; orbA: string; orbB: string }) {
  return (
    <div className={`ls-bg bg-gradient-to-br ${gradient}`} style={vars({ "--op": weight })}>
      <div
        className="ls-orb absolute -top-32 -left-24 w-[38rem] h-[38rem] rounded-full blur-3xl opacity-40"
        style={{ background: orbA }}
      />
      <div
        className="ls-orb absolute -bottom-40 right-[-10rem] w-[42rem] h-[42rem] rounded-full blur-3xl opacity-35"
        style={{ background: orbB, animationDelay: "-8s" }}
      />
    </div>
  );
}

function Backdrop({ t }: { t: number }) {
  const w = (i: number) => clamp01(1 - Math.abs(t - i));

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-slate-950">
      {/* Hong Kong skyline, slowly pushing in and dimming as you descend */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-none"
        style={{
          backgroundImage: "url('/hk-bg.png')",
          opacity: 0.5 - t * 0.15,
          transform: `scale(${1 + t * 0.08})`,
        }}
      />

      <Wash
        weight={w(0)}
        gradient="from-slate-950/90 via-indigo-950/75 to-blue-950/90"
        orbA="radial-gradient(circle, rgba(59,130,246,0.55), transparent 65%)"
        orbB="radial-gradient(circle, rgba(129,80,255,0.45), transparent 65%)"
      />
      <Wash
        weight={w(1)}
        gradient="from-red-950/92 via-orange-950/78 to-amber-900/80"
        orbA="radial-gradient(circle, rgba(239,68,68,0.5), transparent 65%)"
        orbB="radial-gradient(circle, rgba(245,158,11,0.5), transparent 65%)"
      />
      <Wash
        weight={w(2)}
        gradient="from-slate-950/92 via-teal-950/78 to-emerald-950/88"
        orbA="radial-gradient(circle, rgba(16,185,129,0.45), transparent 65%)"
        orbB="radial-gradient(circle, rgba(56,189,248,0.4), transparent 65%)"
      />

      {/* Film grain + vignette keep the flat gradients from banding */}
      <div
        className="absolute inset-0 opacity-[0.13] mix-blend-overlay pointer-events-none"
        style={{ backgroundImage: GRAIN }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 40%, rgba(2,6,23,0.75) 100%)" }}
      />
    </div>
  );
}

/* ── Copy building blocks ──────────────────────────────────────────────── */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/50">
      <span className="w-8 h-px bg-white/40" />
      {children}
    </p>
  );
}

function FeatureCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/[0.07] backdrop-blur-sm p-4 transition-colors hover:bg-white/[0.12] hover:border-white/25">
      <div className="text-2xl mb-2 leading-none">{icon}</div>
      <p className="text-white font-semibold text-[14px] mb-1">{title}</p>
      <p className="text-white/60 text-[12.5px] leading-relaxed">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="flex gap-4 items-start">
      <span className="text-2xl font-black text-white/25 tabular-nums leading-none pt-0.5 w-9 flex-shrink-0">
        {n}
      </span>
      <div className="border-l border-white/15 pl-4">
        <p className="text-white font-semibold text-[15px]">{title}</p>
        <p className="text-white/60 text-[13px] leading-relaxed mt-0.5">{body}</p>
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(0); // continuous 0 → 2 across the three panels

  useEffect(() => {
    let raf = 0;

    const measure = () => {
      raf = 0;
      const el = wrapRef.current;
      if (!el) return;
      const span = el.offsetHeight - window.innerHeight;
      // span <= 0 means the stage isn't pinned (mobile / very short viewport)
      if (span <= 0) { setT(0); return; }
      const scrolled = -el.getBoundingClientRect().top;
      setT(clamp01(scrolled / span) * (SECTIONS - 1));
    };

    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const goToSection = useCallback((i: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const span = el.offsetHeight - window.innerHeight;
    if (span <= 0) return;
    const top = el.offsetTop + (span * i) / (SECTIONS - 1);
    window.scrollTo({ top, behavior: "smooth" });
  }, []);

  const scrollToSignIn = useCallback(() => {
    document.getElementById("signin")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  /** Panel visibility: full at its own index, gone one index away. */
  const panelStyle = (i: number) => {
    const d = t - i;
    const op = clamp01(1 - Math.abs(d) * 1.35);
    return vars({ "--op": op, "--ty": `${d * -44}px` });
  };
  const isLive = (i: number) => Math.abs(t - i) < 0.5;
  const active = Math.round(t);

  return (
    <main className="relative font-sans text-white selection:bg-amber-400/30">
      <Backdrop t={t} />

      {/* ── Scroll progress rail ── */}
      <div
        className="fixed top-0 left-0 h-[3px] z-50 bg-gradient-to-r from-amber-400 to-red-500 transition-none"
        style={{ width: `${(t / (SECTIONS - 1)) * 100}%` }}
      />

      {/* ── Top bar ── */}
      <header className="fixed top-0 inset-x-0 z-40 px-5 sm:px-8 py-4 flex items-center justify-between backdrop-blur-md bg-slate-950/25 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-red-600 flex items-center justify-center text-white font-bold text-[11px] tracking-tight shadow-lg">
            CDR
          </span>
          <span className="font-semibold tracking-tight text-[15px] hidden sm:block">
            Castillo Del Rey <span className="text-white/50">Consultancy</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={scrollToSignIn}
            className="lg:hidden text-[13px] font-medium text-white/70 hover:text-white px-3 py-2 transition-colors"
          >
            Sign in
          </button>
          <Link
            href="/apply"
            className="text-[13px] font-semibold bg-white text-slate-900 px-4 py-2 rounded-lg hover:bg-amber-200 transition-colors shadow-lg"
          >
            Apply as a Helper
          </Link>
        </div>
      </header>

      {/* ── Pinned stage ── */}
      <div ref={wrapRef} className="relative lg:h-[320vh]">
        <div className="lg:sticky lg:top-0 lg:h-screen flex items-center">
          <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 pt-28 pb-20 lg:py-0 grid gap-12 lg:grid-cols-[minmax(0,370px)_minmax(0,1fr)] lg:gap-16 items-center">

            {/* ── Floating sign-in (left on desktop, last on mobile) ── */}
            <div id="signin" className="lg:order-first w-full max-w-md mx-auto lg:mx-0">
              <div className="ls-float ls-enter">
                <div className="relative">
                  {/* soft glow behind the glass */}
                  <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-amber-500/25 to-red-600/20 blur-2xl pointer-events-none" />
                  <div className="relative">
                    <LoginForm />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Cross-fading copy ── */}
            <div className="relative lg:h-[540px] space-y-24 lg:space-y-0">

              {/* Panel 1 — brand */}
              <section
                className="ls-panel flex flex-col justify-center"
                style={panelStyle(0)}
                aria-hidden={!isLive(0) || undefined}
              >
                <div className="space-y-6">
                  <Eyebrow>Hong Kong · Domestic Helper Placement</Eyebrow>
                  <h1 className="text-4xl sm:text-5xl xl:text-6xl font-black leading-[0.95] tracking-tight">
                    <span className="block">Castillo Del Rey</span>
                    <span className="block bg-gradient-to-r from-amber-300 via-orange-400 to-red-500 bg-clip-text text-transparent">
                      Consultancy
                    </span>
                  </h1>
                  <p className="text-white/70 text-base sm:text-lg leading-relaxed max-w-xl">
                    We match Hong Kong households with vetted Filipino and Indonesian domestic
                    helpers — every profile documented, verified, and ready to interview.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {["Filipino & Indonesian helpers", "Verified biodata", "Hung Hom, Kowloon"].map((c) => (
                      <span
                        key={c}
                        className="text-[12px] font-medium px-3 py-1.5 rounded-full border border-white/20 bg-white/[0.07] text-white/75 backdrop-blur-sm"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </section>

              {/* Panel 2 — what's in a profile */}
              <section
                className="ls-panel flex flex-col justify-center"
                style={panelStyle(1)}
                aria-hidden={!isLive(1) || undefined}
              >
                <div className="space-y-6">
                  <Eyebrow>What&apos;s in every profile</Eyebrow>
                  <h2 className="text-4xl sm:text-5xl xl:text-6xl font-black leading-[0.95] tracking-tight">
                    Nothing left
                    <span className="block bg-gradient-to-r from-amber-200 to-orange-400 bg-clip-text text-transparent">
                      to guess.
                    </span>
                  </h2>
                  <p className="text-white/70 text-[15px] leading-relaxed max-w-xl">
                    Each applicant completes a full biodata online and signs it. Our recruiters
                    verify every line before it reaches you.
                  </p>
                  <div className="grid sm:grid-cols-2 gap-3 max-w-2xl">
                    <FeatureCard
                      icon="📋"
                      title="Complete Biodata"
                      body="Personal particulars, family, education and spoken languages — captured once, kept current."
                    />
                    <FeatureCard
                      icon="🏠"
                      title="Hong Kong Work History"
                      body="Every contract, flat size, duties, and the reason each one ended."
                    />
                    <FeatureCard
                      icon="🍳"
                      title="Skills & Cooking"
                      body="Childcare, elderly and pet care, driving, and the cuisines she can actually cook."
                    />
                    <FeatureCard
                      icon="🀄"
                      title="Zodiac & Fortune"
                      body="Western sign, Chinese zodiac and the year's outlook, read from her birthday."
                    />
                  </div>
                </div>
              </section>

              {/* Panel 3 — process + CTA */}
              <section
                className="ls-panel flex flex-col justify-center"
                style={panelStyle(2)}
                aria-hidden={!isLive(2) || undefined}
              >
                <div className="space-y-6">
                  <Eyebrow>How it works</Eyebrow>
                  <h2 className="text-4xl sm:text-5xl xl:text-6xl font-black leading-[0.95] tracking-tight">
                    Three steps to
                    <span className="block bg-gradient-to-r from-emerald-300 to-teal-400 bg-clip-text text-transparent">
                      the right helper.
                    </span>
                  </h2>
                  <div className="space-y-4 max-w-xl">
                    <Step n="01" title="Apply" body="The helper fills in her biodata online and signs it on her phone." />
                    <Step n="02" title="Review" body="Our recruiters verify the details and shortlist the best fits for your household." />
                    <Step n="03" title="Meet" body="Interview your shortlist, then we handle the contract and the paperwork." />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <Link
                      href="/apply"
                      className="bg-white text-slate-900 px-6 py-3 rounded-lg font-semibold text-sm shadow-xl hover:bg-emerald-200 transition-colors"
                    >
                      Apply as a Helper →
                    </Link>
                    <button
                      onClick={scrollToSignIn}
                      className="border border-white/25 bg-white/[0.07] backdrop-blur-sm text-white px-6 py-3 rounded-lg font-semibold text-sm hover:bg-white/15 transition-colors"
                    >
                      Recruiter sign-in
                    </button>
                  </div>
                  <p className="text-[12px] text-white/40 pt-1 leading-relaxed">
                    Shop D1, 1/F, Planet Square, 1-15 Tal Man Street,
                    Hung Hom, Kowloon, Hong Kong
                  </p>
                </div>
              </section>
            </div>
          </div>
        </div>

        {/* ── Section dots ── */}
        <nav className="hidden lg:flex fixed right-7 top-1/2 -translate-y-1/2 z-40 flex-col gap-3">
          {Array.from({ length: SECTIONS }, (_, i) => (
            <button
              key={i}
              onClick={() => goToSection(i)}
              aria-label={`Go to section ${i + 1}`}
              className="group flex items-center justify-end gap-2"
            >
              <span
                className={`h-px bg-white/60 transition-all duration-300 ${
                  active === i ? "w-5" : "w-0 group-hover:w-3"
                }`}
              />
              <span
                className={`rounded-full border transition-all duration-300 ${
                  active === i
                    ? "w-2.5 h-2.5 bg-white border-white"
                    : "w-2 h-2 bg-white/20 border-white/40 group-hover:bg-white/50"
                }`}
              />
            </button>
          ))}
        </nav>

        {/* ── Scroll hint — fades out as soon as you move ── */}
        <div
          className="hidden lg:flex fixed bottom-7 left-1/2 -translate-x-1/2 z-40 flex-col items-center gap-2 pointer-events-none"
          style={{ opacity: clamp01(1 - t * 4) }}
        >
          <span className="text-[10px] uppercase tracking-[0.3em] text-white/45">Scroll</span>
          <span className="w-5 h-8 rounded-full border border-white/30 flex justify-center pt-1.5">
            <span className="ls-hint-dot w-1 h-1 rounded-full bg-white/70" />
          </span>
        </div>
      </div>
    </main>
  );
}
