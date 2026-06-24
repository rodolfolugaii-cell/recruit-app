"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
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
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Successful login -> Redirect to Recruiter Dashboard
      router.push("/dashboard");
    } catch (error: any) {
      setErrorMsg(error.message || "Invalid login credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4 text-gray-900">
      <div className="max-w-md w-full bg-white rounded-xl shadow-md border border-gray-100 p-8 space-y-6">
        
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-gray-800">Recruiter Portal</h1>
          <p className="text-sm text-gray-500">Please sign in to access candidate profiles</p>
        </div>

        {errorMsg && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-medium border border-red-100">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email Address</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none bg-white text-gray-900" 
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none bg-white text-gray-900" 
              placeholder="••••••••"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors focus:outline-none disabled:bg-gray-400"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

      </div>
    </div>
  );
}