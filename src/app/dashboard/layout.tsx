import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-200 flex flex-col border-r border-slate-800">
        <div className="p-6 text-xl font-bold tracking-wider text-white border-b border-slate-800 flex items-center space-x-2">
          <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
          <span>RECRUITER</span>
        </div>
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
          <span className="block px-4 py-2.5 rounded-lg text-sm font-medium text-slate-500 cursor-not-allowed">
            Settings (Soon)
          </span>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-8 overflow-y-auto">
        <header className="flex justify-between items-center mb-8 pb-4 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-800">Application Submissions</h1>
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center">
              AD
            </div>
            <span className="text-sm font-medium text-gray-600">Admin Dashboard</span>
          </div>
        </header>
        
        {children}
      </main>
    </div>
  );
}