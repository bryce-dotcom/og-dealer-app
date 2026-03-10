import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function InvestorAccreditation() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [investor, setInvestor] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadAccreditation();
  }, []);

  async function loadAccreditation() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/investor/login'); return; }

      const { data: investorData } = await supabase
        .from('investors')
        .select('*')
        .eq('user_id', user.id)
        .single();

      setInvestor(investorData);
      setSelectedMethod(investorData.accreditation_method || '');

      const { data: docsData } = await supabase
        .from('investor_documents')
        .select('*')
        .eq('investor_id', investorData.id)
        .order('uploaded_at', { ascending: false });

      setDocuments(docsData || []);
    } catch (error) {
      console.error('Error loading accreditation:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadDocument(documentType, file) {
    if (!file) return;

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      alert('File size must be under 10MB');
      return;
    }

    try {
      setUploading(true);

      // Upload to storage
      const filePath = `${investor.id}/${documentType}_${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('investor-documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get URL
      const { data: { publicUrl } } = supabase.storage
        .from('investor-documents')
        .getPublicUrl(filePath);

      // Create document record
      const { error: dbError } = await supabase
        .from('investor_documents')
        .insert({
          investor_id: investor.id,
          document_type: documentType,
          file_name: file.name,
          file_url: publicUrl,
          file_size: file.size,
          mime_type: file.type,
        });

      if (dbError) throw dbError;

      alert('Document uploaded successfully');
      loadAccreditation();
    } catch (error) {
      console.error('Error uploading document:', error);
      alert('Failed to upload: ' + error.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmitAccreditation() {
    if (!selectedMethod) {
      alert('Please select an accreditation method');
      return;
    }

    const requiredDocs = getRequiredDocs(selectedMethod);
    const uploadedTypes = documents.map(d => d.document_type);
    const missing = requiredDocs.filter(d => !uploadedTypes.includes(d.type));

    if (missing.length > 0) {
      alert(`Please upload the following documents:\n${missing.map(d => '- ' + d.label).join('\n')}`);
      return;
    }

    if (!confirm('Submit your accreditation for review?\n\nOur team will review your documents and verify your accreditation status within 2-3 business days.')) {
      return;
    }

    try {
      setSubmitting(true);

      const { error } = await supabase
        .from('investors')
        .update({
          accreditation_method: selectedMethod,
          accreditation_verified: false,
          verification_documents: documents.map(d => ({ id: d.id, type: d.document_type, url: d.file_url })),
        })
        .eq('id', investor.id);

      if (error) throw error;

      alert('Accreditation submitted for review!\n\nYou will be notified once the review is complete.');
      loadAccreditation();
    } catch (error) {
      alert('Failed to submit: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  }

  function getRequiredDocs(method) {
    switch (method) {
      case 'income':
        return [
          { type: 'tax_return', label: 'Tax Returns (last 2 years)', desc: 'IRS Form 1040 showing income > $200k ($300k joint)' },
          { type: 'w2', label: 'W-2 or 1099 Forms', desc: 'Most recent year income verification' },
        ];
      case 'net_worth':
        return [
          { type: 'bank_statement', label: 'Bank Statements', desc: 'Recent statements showing liquid assets' },
          { type: 'brokerage_statement', label: 'Brokerage/Investment Statements', desc: 'Showing investment account balances' },
        ];
      case 'entity':
        return [
          { type: 'entity_docs', label: 'Entity Formation Documents', desc: 'LLC operating agreement, trust documents, etc.' },
          { type: 'bank_statement', label: 'Entity Bank Statements', desc: 'Showing entity assets > $5M' },
        ];
      case 'professional':
        return [
          { type: 'professional_cert', label: 'Professional Certification', desc: 'Series 7, 65, or 82 license, CFA, etc.' },
        ];
      default:
        return [];
    }
  }

  function getDocStatusColor(status) {
    switch (status) {
      case 'approved': return 'text-green-400 bg-green-500/20';
      case 'rejected': return 'text-red-400 bg-red-500/20';
      default: return 'text-amber-400 bg-amber-500/20';
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500"></div>
      </div>
    );
  }

  const accreditationMethods = [
    {
      id: 'income',
      label: 'Income Verification',
      desc: 'Annual income > $200,000 (or $300,000 joint) for the last 2 years',
      icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    },
    {
      id: 'net_worth',
      label: 'Net Worth',
      desc: 'Individual or joint net worth > $1,000,000 (excluding primary residence)',
      icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    },
    {
      id: 'entity',
      label: 'Entity / Trust',
      desc: 'Entity with assets > $5,000,000 or all equity owners are accredited',
      icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
    },
    {
      id: 'professional',
      label: 'Professional Certification',
      desc: 'FINRA Series 7, 65, or 82 license holders; CFA charterholder',
      icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z',
    },
  ];

  const isVerified = investor?.accredited_investor && investor?.accreditation_verified;
  const isPending = investor?.accreditation_method && !investor?.accreditation_verified;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Investor Accreditation</h1>
            <p className="text-blue-200">Verify your accredited investor status</p>
          </div>
          <button
            onClick={() => navigate('/investor/settings')}
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition"
          >
            ← Settings
          </button>
        </div>

        {/* Status Banner */}
        {isVerified && (
          <div className="bg-green-900/30 border border-green-500/50 rounded-2xl p-6 mb-8">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-green-500/20 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-green-400">Accreditation Verified</h2>
                <p className="text-green-200">
                  Method: {accreditationMethods.find(m => m.id === investor.accreditation_method)?.label} |
                  Verified: {investor.accreditation_date ? new Date(investor.accreditation_date).toLocaleDateString() : 'N/A'}
                </p>
              </div>
            </div>
          </div>
        )}

        {isPending && !isVerified && (
          <div className="bg-amber-900/30 border border-amber-500/50 rounded-2xl p-6 mb-8">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-amber-500/20 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-amber-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-amber-400">Verification Pending</h2>
                <p className="text-amber-200">Your documents are under review. This typically takes 2-3 business days.</p>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Choose Method */}
        {!isVerified && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Step 1: Select Accreditation Method</h2>
            <p className="text-blue-200 mb-6">Choose how you qualify as an accredited investor under SEC regulations</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {accreditationMethods.map(method => (
                <button
                  key={method.id}
                  onClick={() => setSelectedMethod(method.id)}
                  className={`p-6 rounded-xl border-2 text-left transition ${
                    selectedMethod === method.id
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      selectedMethod === method.id ? 'bg-blue-500/20' : 'bg-slate-700'
                    }`}>
                      <svg className={`w-5 h-5 ${selectedMethod === method.id ? 'text-blue-400' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={method.icon} />
                      </svg>
                    </div>
                    <div>
                      <div className={`font-semibold ${selectedMethod === method.id ? 'text-blue-400' : 'text-white'}`}>
                        {method.label}
                      </div>
                      <div className="text-slate-400 text-sm mt-1">{method.desc}</div>
                    </div>
                  </div>
                  {selectedMethod === method.id && (
                    <div className="mt-3 flex items-center gap-2 text-blue-400 text-sm">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Selected
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Upload Documents */}
        {selectedMethod && !isVerified && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Step 2: Upload Required Documents</h2>
            <p className="text-blue-200 mb-6">Upload the following documents to verify your accreditation</p>

            <div className="space-y-4">
              {getRequiredDocs(selectedMethod).map(doc => {
                const uploaded = documents.find(d => d.document_type === doc.type);
                return (
                  <div key={doc.type} className="p-6 bg-slate-800/50 rounded-xl border border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="text-white font-semibold">{doc.label}</div>
                        <div className="text-slate-400 text-sm">{doc.desc}</div>
                      </div>
                      {uploaded && (
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getDocStatusColor(uploaded.status)}`}>
                          {uploaded.status}
                        </span>
                      )}
                    </div>

                    {uploaded ? (
                      <div className="flex items-center justify-between mt-3 p-3 bg-slate-700/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                          </svg>
                          <div>
                            <div className="text-white text-sm">{uploaded.file_name}</div>
                            <div className="text-slate-400 text-xs">
                              Uploaded {new Date(uploaded.uploaded_at).toLocaleDateString()}
                              {uploaded.file_size ? ` | ${(uploaded.file_size / 1024).toFixed(0)} KB` : ''}
                            </div>
                          </div>
                        </div>
                        <label className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-xs font-semibold transition cursor-pointer">
                          Replace
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => handleUploadDocument(doc.type, e.target.files[0])}
                          />
                        </label>
                      </div>
                    ) : (
                      <label className={`mt-3 flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-600 rounded-lg cursor-pointer hover:border-blue-500 transition ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                        <svg className="w-8 h-8 text-slate-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <span className="text-slate-400 text-sm">
                          {uploading ? 'Uploading...' : 'Click to upload (PDF, JPG, PNG - max 10MB)'}
                        </span>
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => handleUploadDocument(doc.type, e.target.files[0])}
                        />
                      </label>
                    )}

                    {uploaded?.review_notes && (
                      <div className="mt-2 p-2 bg-red-900/30 border border-red-500/30 rounded text-red-300 text-sm">
                        Reviewer note: {uploaded.review_notes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ID Verification */}
            <div className="mt-8 pt-6 border-t border-white/10">
              <h3 className="text-lg font-bold text-white mb-4">Identity Verification (Required)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { type: 'id_front', label: 'Government ID (Front)' },
                  { type: 'id_back', label: 'Government ID (Back)' },
                ].map(doc => {
                  const uploaded = documents.find(d => d.document_type === doc.type);
                  return (
                    <div key={doc.type} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="text-white text-sm font-medium mb-2">{doc.label}</div>
                      {uploaded ? (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span className="text-green-400 text-sm">Uploaded</span>
                          </div>
                          <label className="text-blue-400 text-xs cursor-pointer hover:underline">
                            Replace
                            <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                              onChange={(e) => handleUploadDocument(doc.type, e.target.files[0])} />
                          </label>
                        </div>
                      ) : (
                        <label className="flex items-center gap-2 text-slate-400 text-sm cursor-pointer hover:text-blue-400 transition">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Upload
                          <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => handleUploadDocument(doc.type, e.target.files[0])} />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Submit */}
            <div className="mt-8">
              <button
                onClick={handleSubmitAccreditation}
                disabled={submitting || !selectedMethod}
                className="w-full px-8 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded-lg font-bold text-lg transition"
              >
                {submitting ? 'Submitting...' : 'Submit for Verification'}
              </button>
              <p className="text-slate-400 text-sm text-center mt-3">
                Review typically takes 2-3 business days. You'll be notified of the result.
              </p>
            </div>
          </div>
        )}

        {/* Uploaded Documents */}
        {documents.length > 0 && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h2 className="text-xl font-bold text-white mb-4">All Uploaded Documents</h2>
            <div className="space-y-2">
              {documents.map(doc => (
                <div key={doc.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <div className="text-white text-sm font-medium">{doc.file_name}</div>
                      <div className="text-slate-400 text-xs">
                        {doc.document_type.replace(/_/g, ' ')} | {new Date(doc.uploaded_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getDocStatusColor(doc.status)}`}>
                    {doc.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
