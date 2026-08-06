"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

/**
 * The recruiter sign-in card.
 *
 * Renders the card ONLY — no page background — so it can sit both on the
 * standalone /login page and inside the landing page's floating panel
 * without the auth logic being written twice.
 */
export default function LoginForm({ className = "" }: { className?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push("/dashboard");
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Invalid login credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`w-full bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl p-7 space-y-5 ${className}`}
    >
      <div className="space-y-1">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-red-600 flex items-center justify-center text-white font-bold text-[15px] tracking-tight shadow-lg mb-3">
          CDR
        </div>
        <h2 className="text-xl font-bold text-white tracking-tight">Recruiter Portal</h2>
        <p className="text-[13px] text-white/55">Sign in to access candidate profiles</p>
      </div>

      {errorMsg && (
        <div className="bg-red-500/20 text-red-100 p-3 rounded-lg text-[13px] font-medium border border-red-400/30">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label htmlFor="lf-email" className="block text-[13px] font-medium text-white/80 mb-1.5">
            Email Address
          </label>
          <input
            id="lf-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="block w-full rounded-lg border border-white/20 bg-white/10 text-white placeholder-white/35 p-2.5 text-sm transition-colors focus:border-amber-400/70 focus:outline-none focus:bg-white/15"
            placeholder="you@company.com"
          />
        </div>

        <div>
          <label htmlFor="lf-password" className="block text-[13px] font-medium text-white/80 mb-1.5">
            Password
          </label>
          <input
            id="lf-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="block w-full rounded-lg border border-white/20 bg-white/10 text-white placeholder-white/35 p-2.5 text-sm transition-colors focus:border-amber-400/70 focus:outline-none focus:bg-white/15"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-amber-500 to-red-600 text-white py-3 rounded-lg font-semibold text-sm shadow-lg shadow-red-900/30 transition-all hover:brightness-110 hover:shadow-red-900/50 focus:outline-none focus:ring-2 focus:ring-amber-300/50 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>

      <p className="text-[12px] text-white/45 text-center pt-1 border-t border-white/10">
        Looking for work?{" "}
        <Link href="/apply" className="text-amber-300 hover:text-amber-200 font-medium underline underline-offset-2">
          Apply as a helper
        </Link>
      </p>
    </div>
  );
}
