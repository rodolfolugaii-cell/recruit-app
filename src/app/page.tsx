import Link from "next/link";

export default function Home() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 relative"
      style={{
        backgroundImage: "url('/hk-bg.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-black/55" />

      {/* Card */}
      <div className="relative z-10 max-w-md w-full bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-2xl p-8 text-center space-y-6">
        
        <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4 shadow-lg">
          HT
        </div>
        
        <h1 className="text-2xl font-bold text-white">Welcome to Hometalent</h1>
        <p className="text-white/70 text-sm">Your gateway to employment opportunities. Please select your portal below.</p>

        <div className="space-y-3 pt-2">
          <Link
            href="/apply"
            className="block w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-500 transition-colors shadow"
          >
            I am an Applicant — Apply Here
          </Link>

          <Link
            href="/login"
            className="block w-full bg-white/15 text-white border border-white/30 py-3 rounded-lg font-medium hover:bg-white/25 transition-colors"
          >
            I am a Recruiter — Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}