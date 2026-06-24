"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function checkUser() {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        // No session -> boot user to login page
        router.push("/login");
      } else {
        setUserEmail(session.user.email || "Admin");
        setCheckingAuth(false);
      }
    }
    checkUser();
  }, [router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">
        Authenticating session...
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-200 flex flex-col border-r border-slate-800">
        <div className="p-6 text-xl font-bold tracking-wider text-white border-b border-slate-800 flex items-center space-x-2">
          <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
          <span>RECRUITER</span>
        </div>
        
        {/* Nav Links */}
        <nav className="flex-1 p-4 space-y-1">
          <Link href="/dashboard" className="block px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-800 hover:text-white transition-colors bg-slate-800 text-white">
            Candidates
          </Link>
          <div className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4">
            Suggestions
          </div>
          <span className="block px-4 py-2.5 rounded-lg text-sm font-medium text-slate-500 cursor-not-allowed">
            For Interview (Soon)
          </span>
          <span className="block px-4 py-2.5 rounded-lg text-sm font-medium text-slate-500 cursor-not-allowed">
            Reports (Soon)
          </span>
        </nav>

        {/* Sidebar Footer with Sign Out */}
        <div className="p-4 border-t border-slate-800 space-y-2">
          <div className="px-4 py-1 text-xs text-slate-400 truncate">
            👤 {userEmail}
          </div>
          <button 
            onClick={handleSignOut}
            className="w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-950/30 hover:text-red-300 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-8 overflow-y-auto">
        <header className="flex justify-between items-center mb-8 pb-4 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-800">Application Submissions</h1>
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center uppercase">
              {userEmail ? userEmail.substring(0,2) : "AD"}
            </div>
            <span className="text-sm font-medium text-gray-600">Admin Dashboard</span>
          </div>
        </header>
        
        {children}
      </main>
    </div>
  );
}