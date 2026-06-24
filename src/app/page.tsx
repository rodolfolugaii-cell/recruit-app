import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-md p-8 text-center space-y-6">
        <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
          Logo
        </div>
        <h1 className="text-2xl font-bold text-gray-800">Welcome to Our Agency</h1>
        <p className="text-gray-600">Please select your portal below:</p>
        
        <div className="space-y-4 pt-4">
          <Link 
            href="/apply" 
            className="block w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            I am an Applicant (Apply Here)
          </Link>
          
          <Link 
            href="/dashboard" 
            className="block w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            I am a Recruiter (Dashboard)
          </Link>
        </div>
      </div>
    </div>
  );
}