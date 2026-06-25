"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface Applicant {
  id: string;
  created_at: string;
  full_name: string;
  date_of_birth: string;
  nationality: string;
  gender: string;
  mobile: string;
  photo_url: string;
  status: string;
  form_data: {
    placeOfBirth?: string;
    currentLocation?: string;
    height?: string;
    weight?: string;
    maritalStatus?: string;
    education?: string;
    religion?: string;
  };
}

export default function RecruiterDashboard() {
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApplicant, setSelectedApplicant] = useState<Applicant | null>(null);

  useEffect(() => {
    async function fetchApplicants() {
      try {
        const { data, error } = await supabase
          .from("applicants")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;
        setApplicants(data || []);
      } catch (error: any) {
        console.error("Error fetching data:", error.message);
      } finally {
        setLoading(false);
      }
    }

    fetchApplicants();
  }, []);

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading submissions...</div>;
  }

  return (
    <div>
      {applicants.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200 p-8 text-gray-500">
          No submissions yet. Share your form link with applicants to get started!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {applicants.map((applicant) => (
            <div 
              key={applicant.id} 
              onClick={() => setSelectedApplicant(applicant)}
              className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="p-6 flex items-start space-x-4 border-b border-gray-100">
                <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border">
                  {applicant.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={applicant.photo_url} alt={applicant.full_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No Photo</div>
                  )}
                </div>
                
                <div className="overflow-hidden">
                  <h3 className="font-bold text-gray-900 truncate" title={applicant.full_name}>
                    {applicant.full_name}
                  </h3>
                  <p className="text-xs text-blue-600 font-medium mt-1">{applicant.nationality}</p>
                  <span className="inline-block mt-2 text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">
                    {applicant.status || "New"}
                  </span>
                </div>
              </div>

              <div className="p-6 space-y-2 text-sm text-gray-600 flex-grow">
                <div className="flex justify-between">
                  <span className="text-gray-400">Gender:</span>
                  <span className="font-medium">{applicant.gender}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Mobile:</span>
                  <span className="font-medium">{applicant.mobile}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Location:</span>
                  <span className="font-medium">{applicant.form_data?.currentLocation || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Education:</span>
                  <span className="font-medium truncate max-w-[150px]" title={applicant.form_data?.education}>
                    {applicant.form_data?.education || "N/A"}
                  </span>
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center text-xs text-gray-400">
                <span>Applied: {new Date(applicant.created_at).toLocaleDateString()}</span>
                <button className="text-blue-600 hover:text-blue-800 font-semibold transition-colors">
                  View Profile
                </button>
              </div>

            </div>
          ))}
        </div>
      )}

      {selectedApplicant && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setSelectedApplicant(null)}
        >
          <div 
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl border border-gray-100 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-xl font-bold text-gray-800">Candidate Full Profile</h2>
              <button onClick={() => setSelectedApplicant(null)} className="text-gray-400 hover:text-gray-600 text-2xl font-semibold leading-none p-2">&times;</button>
            </div>

            <div className="p-6 space-y-6">
              <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6 pb-6 border-b border-gray-100">
                <div className="w-32 h-32 bg-gray-100 rounded-xl overflow-hidden border shadow-inner flex-shrink-0">
                  {selectedApplicant.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selectedApplicant.photo_url} alt={selectedApplicant.full_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No Photo</div>
                  )}
                </div>
                <div className="text-center sm:text-left space-y-1">
                  <h3 className="text-2xl font-bold text-gray-900">{selectedApplicant.full_name}</h3>
                  <p className="text-sm text-blue-600 font-semibold">{selectedApplicant.nationality}</p>
                  <div className="pt-2">
                    <span className="bg-emerald-100 text-emerald-800 text-xs px-3 py-1 rounded-full font-semibold">
                      {selectedApplicant.status || "New"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                <div className="border-b pb-2">
                  <span className="text-gray-400 block text-xs uppercase tracking-wider font-semibold">Date of Birth</span>
                  <span className="font-semibold text-gray-800">{selectedApplicant.date_of_birth ? new Date(selectedApplicant.date_of_birth).toLocaleDateString() : "N/A"}</span>
                </div>
                <div className="border-b pb-2">
                  <span className="text-gray-400 block text-xs uppercase tracking-wider font-semibold">Place of Birth</span>
                  <span className="font-semibold text-gray-800">{selectedApplicant.form_data?.placeOfBirth || "N/A"}</span>
                </div>
                <div className="border-b pb-2">
                  <span className="text-gray-400 block text-xs uppercase tracking-wider font-semibold">Gender</span>
                  <span className="font-semibold text-gray-800">{selectedApplicant.gender}</span>
                </div>
                <div className="border-b pb-2">
                  <span className="text-gray-400 block text-xs uppercase tracking-wider font-semibold">Mobile Phone</span>
                  <span className="font-semibold text-gray-800">{selectedApplicant.mobile}</span>
                </div>
                <div className="border-b pb-2">
                  <span className="text-gray-400 block text-xs uppercase tracking-wider font-semibold">Current Location</span>
                  <span className="font-semibold text-gray-800">{selectedApplicant.form_data?.currentLocation || "N/A"}</span>
                </div>
                <div className="border-b pb-2">
                  <span className="text-gray-400 block text-xs uppercase tracking-wider font-semibold">Education Level</span>
                  <span className="font-semibold text-gray-800">{selectedApplicant.form_data?.education || "N/A"}</span>
                </div>
                <div className="border-b pb-2">
                  <span className="text-gray-400 block text-xs uppercase tracking-wider font-semibold">Religion</span>
                  <span className="font-semibold text-gray-800">{selectedApplicant.form_data?.religion || "N/A"}</span>
                </div>
                <div className="border-b pb-2">
                  <span className="text-gray-400 block text-xs uppercase tracking-wider font-semibold">Marital Status</span>
                  <span className="font-semibold text-gray-800">{selectedApplicant.form_data?.maritalStatus || "N/A"}</span>
                </div>
                <div className="border-b pb-2">
                  <span className="text-gray-400 block text-xs uppercase tracking-wider font-semibold">Height</span>
                  <span className="font-semibold text-gray-800">{selectedApplicant.form_data?.height ? `${selectedApplicant.form_data.height} cm` : "N/A"}</span>
                </div>
                <div className="border-b pb-2">
                  <span className="text-gray-400 block text-xs uppercase tracking-wider font-semibold">Weight</span>
                  <span className="font-semibold text-gray-800">{selectedApplicant.form_data?.weight ? `${selectedApplicant.form_data.weight} kg` : "N/A"}</span>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button onClick={() => setSelectedApplicant(null)} className="bg-gray-200 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors">Close Profile</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}