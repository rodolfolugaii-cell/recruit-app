"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ApplicantForm() {
  const [loading, setLoading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhotoFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const fullName = formData.get("fullName") as string;
    let photoUrl = "";

    try {
      if (photoFile) {
        const fileExt = photoFile.name.split(".").pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `photos/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("applicant-photos")
          .upload(filePath, photoFile);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from("applicant-photos").getPublicUrl(filePath);
        photoUrl = data.publicUrl;
      }

      const { error: insertError } = await supabase.from("applicants").insert([
        {
          full_name: fullName,
          date_of_birth: formData.get("dob") || null,
          nationality: formData.get("nationality") || null,
          gender: formData.get("gender") || null,
          mobile: formData.get("mobile") || null,
          photo_url: photoUrl || null,
          form_data: {
            placeOfBirth: formData.get("placeOfBirth"),
            currentLocation: formData.get("currentLocation"),
            height: formData.get("height"),
            weight: formData.get("weight"),
            maritalStatus: formData.get("maritalStatus"),
            education: formData.get("education"),
            religion: formData.get("religion"),
          }
        }
      ]);

      if (insertError) throw insertError;

      alert("Application submitted successfully!");
      setPhotoFile(null);
      setPreviewUrl(null);
      (e.target as HTMLFormElement).reset();

    } catch (error: any) {
      alert("Error submitting application: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 text-gray-900">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        
        <div className="bg-gray-100 px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">Personal Information</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Photo *</label>
            <div className="flex items-center space-x-6">
              <div className="flex-shrink-0 h-24 w-32 border-2 border-dashed border-gray-300 rounded-md flex items-center justify-center bg-gray-50 overflow-hidden relative">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="Preview" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-gray-400 text-xs text-center p-2">Click to upload</span>
                )}
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handlePhotoChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  required
                />
              </div>
              <p className="text-xs text-gray-500">Upload a professional headshot. JPEG or PNG accepted.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Name *</label>
              <input name="fullName" required type="text" className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none text-gray-900 bg-white" placeholder="Please enter..." />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Date of Birth *</label>
              <input name="dob" required type="date" className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none text-gray-900 bg-white" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Place of Birth</label>
              <input name="placeOfBirth" type="text" className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none text-gray-900 bg-white" placeholder="Please enter..." />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Nationality *</label>
              <select name="nationality" required className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none text-gray-900 bg-white">
                <option value="">Please select..</option>
                <option value="Filipino">Filipino</option>
                <option value="Indonesian">Indonesian</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Gender *</label>
              <select name="gender" required className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none text-gray-900 bg-white">
                <option value="">Please select..</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Mobile *</label>
              <input name="mobile" required type="tel" className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none text-gray-900 bg-white" placeholder="Please enter..." />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Current Location *</label>
              <select name="currentLocation" required className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none text-gray-900 bg-white">
                <option value="">Please select..</option>
                <option value="Hong Kong">Hong Kong</option>
                <option value="Philippines">Philippines</option>
                <option value="Indonesia">Indonesia</option>
                <option value="Others">Others</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Height (cm)</label>
              <input name="height" type="number" className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none text-gray-900 bg-white" placeholder="cm" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Weight (kg)</label>
              <input name="weight" type="number" className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none text-gray-900 bg-white" placeholder="kg" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Marital Status</label>
              <select name="maritalStatus" className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none text-gray-900 bg-white">
                <option value="">Please select..</option>
                <option value="Single">Single</option>
                <option value="Married">Married</option>
                <option value="Separated">Separated</option>
                <option value="Divorced">Divorced</option>
                <option value="Widowed">Widowed</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Education</label>
              <select name="education" className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none text-gray-900 bg-white">
                <option value="">Please select..</option>
                <option value="Elementary">Elementary</option>
                <option value="Junior High">Junior High</option>
                <option value="Senior High">Senior High</option>
                <option value="College">College</option>
                <option value="University">University</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Religion</label>
              <select name="religion" className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none text-gray-900 bg-white">
                <option value="">Please select..</option>
                <option value="Moslem">Moslem</option>
                <option value="Christian">Christian</option>
                <option value="Catholic">Catholic</option>
                <option value="Buddhist">Buddhist</option>
                <option value="Hindu">Hindu</option>
                <option value="Islam">Islam</option>
                <option value="Others">Others</option>
              </select>
            </div>

          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-md font-medium text-sm hover:bg-blue-700 transition-colors focus:outline-none disabled:bg-gray-400"
            >
              {loading ? "Submitting Application..." : "Submit Application"}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}