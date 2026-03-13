import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import InvestorLayout from '../components/InvestorLayout';

const cardStyle = { backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', marginBottom: 24, overflow: 'hidden' };

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

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('File size must be under 10MB');
      return;
    }

    try {
      setUploading(true);

      const filePath = `${investor.id}/${documentType}_${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('investor-documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('investor-documents')
        .getPublicUrl(filePath);

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
      case 'approved': return { color: '#059669', backgroundColor: '#ecfdf5' };
      case 'rejected': return { color: '#dc2626', backgroundColor: '#fef2f2' };
      default: return { color: '#d97706', backgroundColor: '#fffbeb' };
    }
  }

  if (loading) {
    return (
      <InvestorLayout title="Investor Accreditation">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 0' }}>
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500"></div>
        </div>
      </InvestorLayout>
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
    <InvestorLayout title="Investor Accreditation" subtitle="Verify your accredited investor status">

      {/* Status Banner */}
      {isVerified && (
        <div style={{ backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 12, padding: 24, marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 52, height: 52, backgroundColor: '#d1fae5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg style={{ width: 28, height: 28, color: '#059669' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#059669', margin: 0 }}>Accreditation Verified</h2>
              <p style={{ color: '#047857', margin: '4px 0 0' }}>
                Method: {accreditationMethods.find(m => m.id === investor.accreditation_method)?.label} |
                Verified: {investor.accreditation_date ? new Date(investor.accreditation_date).toLocaleDateString() : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      )}

      {isPending && !isVerified && (
        <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: 24, marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 52, height: 52, backgroundColor: '#fef3c7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg className="animate-pulse" style={{ width: 28, height: 28, color: '#d97706' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#d97706', margin: 0 }}>Verification Pending</h2>
              <p style={{ color: '#92400e', margin: '4px 0 0' }}>Your documents are under review. This typically takes 2-3 business days.</p>
            </div>
          </div>
        </div>
      )}

      {/* Step 1: Choose Method */}
      {!isVerified && (
        <div style={{ ...cardStyle, padding: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>Step 1: Select Accreditation Method</h2>
          <p style={{ color: '#6b7280', marginBottom: 24, fontSize: 14 }}>Choose how you qualify as an accredited investor under SEC regulations</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {accreditationMethods.map(method => {
              const isSelected = selectedMethod === method.id;
              return (
                <button
                  key={method.id}
                  onClick={() => setSelectedMethod(method.id)}
                  style={{
                    padding: 24, borderRadius: 12, textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s',
                    border: isSelected ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                    backgroundColor: isSelected ? '#eff6ff' : '#fff',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      backgroundColor: isSelected ? '#dbeafe' : '#f3f4f6',
                    }}>
                      <svg style={{ width: 20, height: 20, color: isSelected ? '#3b82f6' : '#6b7280' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={method.icon} />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: isSelected ? '#3b82f6' : '#111827' }}>
                        {method.label}
                      </div>
                      <div style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>{method.desc}</div>
                    </div>
                  </div>
                  {isSelected && (
                    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, color: '#3b82f6', fontSize: 14 }}>
                      <svg style={{ width: 16, height: 16 }} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Selected
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 2: Upload Documents */}
      {selectedMethod && !isVerified && (
        <div style={{ ...cardStyle, padding: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>Step 2: Upload Required Documents</h2>
          <p style={{ color: '#6b7280', marginBottom: 24, fontSize: 14 }}>Upload the following documents to verify your accreditation</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {getRequiredDocs(selectedMethod).map(doc => {
              const uploaded = documents.find(d => d.document_type === doc.type);
              const statusColor = uploaded ? getDocStatusColor(uploaded.status) : {};
              return (
                <div key={doc.type} style={{ padding: 24, backgroundColor: '#f9fafb', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ color: '#111827', fontWeight: 600 }}>{doc.label}</div>
                      <div style={{ color: '#6b7280', fontSize: 14 }}>{doc.desc}</div>
                    </div>
                    {uploaded && (
                      <span style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, ...statusColor }}>
                        {uploaded.status}
                      </span>
                    )}
                  </div>

                  {uploaded ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, padding: 12, backgroundColor: '#fff', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <svg style={{ width: 20, height: 20, color: '#3b82f6' }} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                        </svg>
                        <div>
                          <div style={{ color: '#111827', fontSize: 14 }}>{uploaded.file_name}</div>
                          <div style={{ color: '#9ca3af', fontSize: 12 }}>
                            Uploaded {new Date(uploaded.uploaded_at).toLocaleDateString()}
                            {uploaded.file_size ? ` | ${(uploaded.file_size / 1024).toFixed(0)} KB` : ''}
                          </div>
                        </div>
                      </div>
                      <label style={{ padding: '6px 12px', backgroundColor: '#f3f4f6', color: '#111827', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid #e5e7eb' }}>
                        Replace
                        <input
                          type="file"
                          style={{ display: 'none' }}
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => handleUploadDocument(doc.type, e.target.files[0])}
                        />
                      </label>
                    </div>
                  ) : (
                    <label style={{
                      marginTop: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24,
                      border: '2px dashed #d1d5db', borderRadius: 8, cursor: 'pointer', backgroundColor: '#fff',
                      opacity: uploading ? 0.5 : 1, pointerEvents: uploading ? 'none' : 'auto',
                    }}>
                      <svg style={{ width: 32, height: 32, color: '#9ca3af', marginBottom: 8 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span style={{ color: '#6b7280', fontSize: 14 }}>
                        {uploading ? 'Uploading...' : 'Click to upload (PDF, JPG, PNG - max 10MB)'}
                      </span>
                      <input
                        type="file"
                        style={{ display: 'none' }}
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => handleUploadDocument(doc.type, e.target.files[0])}
                      />
                    </label>
                  )}

                  {uploaded?.review_notes && (
                    <div style={{ marginTop: 8, padding: 8, backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, color: '#991b1b', fontSize: 14 }}>
                      Reviewer note: {uploaded.review_notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ID Verification */}
          <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid #e5e7eb' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 16 }}>Identity Verification (Required)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {[
                { type: 'id_front', label: 'Government ID (Front)' },
                { type: 'id_back', label: 'Government ID (Back)' },
              ].map(doc => {
                const uploaded = documents.find(d => d.document_type === doc.type);
                return (
                  <div key={doc.type} style={{ padding: 16, backgroundColor: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                    <div style={{ color: '#111827', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>{doc.label}</div>
                    {uploaded ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <svg style={{ width: 16, height: 16, color: '#059669' }} fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          <span style={{ color: '#059669', fontSize: 14 }}>Uploaded</span>
                        </div>
                        <label style={{ color: '#3b82f6', fontSize: 12, cursor: 'pointer' }}>
                          Replace
                          <input type="file" style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => handleUploadDocument(doc.type, e.target.files[0])} />
                        </label>
                      </div>
                    ) : (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', fontSize: 14, cursor: 'pointer' }}>
                        <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Upload
                        <input type="file" style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => handleUploadDocument(doc.type, e.target.files[0])} />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Submit */}
          <div style={{ marginTop: 32 }}>
            <button
              onClick={handleSubmitAccreditation}
              disabled={submitting || !selectedMethod}
              style={{
                width: '100%', padding: '16px 32px', fontSize: 16, fontWeight: 700, borderRadius: 8, border: 'none', cursor: (submitting || !selectedMethod) ? 'not-allowed' : 'pointer',
                backgroundColor: (submitting || !selectedMethod) ? '#e5e7eb' : '#111827',
                color: (submitting || !selectedMethod) ? '#9ca3af' : '#fff',
              }}
            >
              {submitting ? 'Submitting...' : 'Submit for Verification'}
            </button>
            <p style={{ color: '#6b7280', fontSize: 14, textAlign: 'center', marginTop: 12 }}>
              Review typically takes 2-3 business days. You'll be notified of the result.
            </p>
          </div>
        </div>
      )}

      {/* Uploaded Documents */}
      {documents.length > 0 && (
        <div style={{ ...cardStyle, padding: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 16px' }}>All Uploaded Documents</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {documents.map(doc => {
              const statusColor = getDocStatusColor(doc.status);
              return (
                <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <svg style={{ width: 20, height: 20, color: '#3b82f6' }} fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <div style={{ color: '#111827', fontSize: 14, fontWeight: 500 }}>{doc.file_name}</div>
                      <div style={{ color: '#9ca3af', fontSize: 12 }}>
                        {doc.document_type.replace(/_/g, ' ')} | {new Date(doc.uploaded_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <span style={{ padding: '4px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600, ...statusColor }}>
                    {doc.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </InvestorLayout>
  );
}
