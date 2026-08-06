import Link from "next/link";
import LoginForm from "@/components/LoginForm";

export default function Page() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 relative font-sans"
      style={{
        backgroundImage: "url('/hk-bg.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="absolute inset-0 bg-slate-950/70" />

      <div className="relative z-10 w-full max-w-md space-y-4">
        <LoginForm />
        <Link
          href="/"
          className="block text-center text-[12px] text-white/45 hover:text-white/70 transition-colors"
        >
          ← Back to Castillo Del Rey Consultancy
        </Link>
      </div>
    </div>
  );
}
