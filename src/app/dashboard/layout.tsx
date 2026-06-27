"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const handleResize = () => {
      setCollapsed(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    async function checkUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
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

  // Dynamic class for nav links based on current route
  const navClass = (path: string) => `
    flex items-center py-2.5 rounded-lg text-sm font-medium transition-colors
    ${pathname === path
      ? "bg-slate-800 text-white"
      : "text-slate-400 hover:bg-slate-800 hover:text-white"
    }
    ${collapsed ? "justify-center px-0" : "px-4 space-x-3"}
  `;

  // Dynamic page title based on current route
  const pageTitle =
    pathname === "/dashboard/review" ? "For Review" : "Application Submissions";

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">
        Authenticating session...
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className={`
        flex-shrink-0
        ${collapsed ? "w-14" : "w-64"}
        bg-slate-900 text-slate-200
        flex flex-col
        border-r border-slate-800
        transition-[width] duration-300 ease-in-out
        overflow-hidden
      `}>

        {/* Sidebar Header */}
        <div className="h-16 px-3 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-2 overflow-hidden">
            <span className="w-3 h-3 bg-blue-500 rounded-full flex-shrink-0" />
            {!collapsed && (
              <span className="text-xl font-bold tracking-wider text-white whitespace-nowrap">
                RECRUITER
              </span>
            )}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex-shrink-0 p-1.5 rounded-md text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d={collapsed ? "M9 5l7 7-7 7" : "M15 19l-7-7 7-7"} />
            </svg>
          </button>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 p-2 space-y-1 overflow-hidden">

          <Link href="/dashboard" title="Candidates" className={navClass("/dashboard")}>
            <span className="text-xl leading-none flex-shrink-0">🧑‍💼</span>
            {!collapsed && <span className="whitespace-nowrap">Candidates</span>}
          </Link>

          <Link href="/dashboard/review" title="For Review" className={navClass("/dashboard/review")}>
            <span className="text-xl leading-none flex-shrink-0">📋</span>
            {!collapsed && <span className="whitespace-nowrap">For Review</span>}
          </Link>

          {/* Coming Soon */}
          {!collapsed ? (
            <div className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4">
              Coming Soon
            </div>
          ) : (
            <div className="my-3 mx-1 border-t border-slate-700/60" />
          )}

          <span title="For Interview (Coming Soon)" className={`
            flex items-center py-2.5 rounded-lg text-sm font-medium text-slate-500 cursor-not-allowed
            ${collapsed ? "justify-center px-0" : "px-4 space-x-3"}
          `}>
            <span className="text-xl leading-none flex-shrink-0">📅</span>
            {!collapsed && <span className="whitespace-nowrap">For Interview</span>}
          </span>

          <span title="Reports (Coming Soon)" className={`
            flex items-center py-2.5 rounded-lg text-sm font-medium text-slate-500 cursor-not-allowed
            ${collapsed ? "justify-center px-0" : "px-4 space-x-3"}
          `}>
            <span className="text-xl leading-none flex-shrink-0">📊</span>
            {!collapsed && <span className="whitespace-nowrap">Reports</span>}
          </span>

        </nav>

        {/* Sidebar Footer */}
        <div className="p-2 border-t border-slate-800 space-y-1 flex-shrink-0">
          {!collapsed && (
            <div className="px-4 py-1 text-xs text-slate-400 truncate">
              👤 {userEmail}
            </div>
          )}
          <button
            onClick={handleSignOut}
            title="Sign Out"
            className={`
              w-full flex items-center py-2.5 rounded-lg
              text-sm font-medium text-red-400 hover:bg-red-950/30 hover:text-red-300
              transition-colors
              ${collapsed ? "justify-center px-0" : "px-4 space-x-2"}
            `}
          >
            <span className="text-xl leading-none flex-shrink-0">🚪</span>
            {!collapsed && <span className="whitespace-nowrap">Sign Out</span>}
          </button>
        </div>

      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">

        <header className="flex justify-between items-center px-4 md:px-8 py-4 border-b border-gray-200 bg-white flex-shrink-0">
          <h1 className="text-lg md:text-2xl font-bold text-gray-800">{pageTitle}</h1>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center uppercase">
              {userEmail ? userEmail.substring(0, 2) : "AD"}
            </div>
            <span className="hidden sm:block text-sm font-medium text-gray-600">Admin</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </div>

      </main>
    </div>
  );
}