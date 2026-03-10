import { useState, useEffect } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useTheme } from '../components/Layout';

export default function ESignaturePage() {
  const { dealerId, deals } = useStore();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [settings, setSettings] = useState(null);
  const [activeTab, setActiveTab] = useState('requests');
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [form, setForm] = useState({
    deal_id: '', document_name: '', signers: [{ name: '', email: '', role: 'buyer' }],
    notes: '',
  });
  const [settingsForm, setSettingsForm] = useState({
    api_key: '', api_secret: '', webhook_url: '', is_active: false,
  });

  useEffect(() => {
    if (dealerId) {
      loadRequests();
      loadSettings();
    }
  }, [dealerId]);

  async function loadRequests() {
    try {
      setLoading(true);
      const { data } = await supabase
        .from('esignature_requests')
        .select('*')
        .eq('dealer_id', dealerId)
        .order('created_at', { ascending: false });
      setRequests(data || []);
    } catch (error) {
      console.error('Error loading e-signature requests:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadSettings() {
    const { data } = await supabase
      .from('esignature_settings')
      .select('*')
      .eq('dealer_id', dealerId)
      .maybeSingle();
    if (data) {
      setSettings(data);
      setSettingsForm({
        api_key: data.api_key || '',
        api_secret: data.api_secret || '',
        webhook_url: data.webhook_url || '',
        is_active: data.is_active || false,
      });
    }
  }

  async function handleCreateRequest() {
    if (!form.document_name || form.signers.some(s => !s.name || !s.email)) {
      alert('Please fill in document name and all signer details');
      return;
    }

    try {
      const { error } = await supabase.from('esignature_requests').insert({
        dealer_id: dealerId,
        deal_id: form.deal_id || null,
        document_name: form.document_name,
        signers: form.signers,
        status: 'draft',
      });

      if (error) throw error;

      alert('E-signature request created');
      setShowNewRequest(false);
      setForm({ deal_id: '', document_name: '', signers: [{ name: '', email: '', role: 'buyer' }], notes: '' });
      loadRequests();
    } catch (error) {
      alert('Failed: ' + error.message);
    }
  }

  async function handleSendForSigning(id) {
    if (!settings?.is_active) {
      alert('Please configure DocuSeal API settings first');
      setShowSettings(true);
      return;
    }

    try {
      await supabase.from('esignature_requests').update({
        status: 'sent',
        sent_at: new Date().toISOString(),
      }).eq('id', id);

      // Create notification
      await supabase.rpc('create_dealer_notification', {
        p_dealer_id: dealerId,
        p_type: 'deal_document_ready',
        p_title: 'Documents sent for signing',
        p_message: 'E-signature request has been sent to all signers.',
        p_related_id: id,
        p_related_type: 'esignature',
      });

      alert('Sent for signing!');
      loadRequests();
    } catch (error) {
      alert('Failed: ' + error.message);
    }
  }

  async function handleVoid(id) {
    if (!confirm('Void this signature request? This cannot be undone.')) return;
    await supabase.from('esignature_requests').update({ status: 'voided' }).eq('id', id);
    loadRequests();
  }

  async function saveSettings() {
    try {
      if (settings?.id) {
        await supabase.from('esignature_settings').update(settingsForm).eq('id', settings.id);
      } else {
        await supabase.from('esignature_settings').insert({ dealer_id: dealerId, provider: 'docuseal', ...settingsForm });
      }
      alert('Settings saved');
      setShowSettings(false);
      loadSettings();
    } catch (error) {
      alert('Failed: ' + error.message);
    }
  }

  function addSigner() {
    setForm(f => ({ ...f, signers: [...f.signers, { name: '', email: '', role: 'witness' }] }));
  }

  function removeSigner(index) {
    setForm(f => ({ ...f, signers: f.signers.filter((_, i) => i !== index) }));
  }

  function updateSigner(index, field, value) {
    setForm(f => ({
      ...f,
      signers: f.signers.map((s, i) => i === index ? { ...s, [field]: value } : s),
    }));
  }

  const statusStyles = {
    draft: { bg: '#71717a20', color: '#71717a', label: 'Draft' },
    sent: { bg: '#3b82f620', color: '#3b82f6', label: 'Sent' },
    partially_signed: { bg: '#f9731620', color: '#f97316', label: 'Partially Signed' },
    completed: { bg: '#22c55e20', color: '#22c55e', label: 'Completed' },
    declined: { bg: '#ef444420', color: '#ef4444', label: 'Declined' },
    expired: { bg: '#71717a20', color: '#71717a', label: 'Expired' },
    voided: { bg: '#ef444420', color: '#ef4444', label: 'Voided' },
  };

  const stats = {
    total: requests.length,
    pending: requests.filter(r => ['sent', 'partially_signed'].includes(r.status)).length,
    completed: requests.filter(r => r.status === 'completed').length,
    draft: requests.filter(r => r.status === 'draft').length,
  };

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>E-Signatures</h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', margin: '4px 0 0' }}>
            Send documents for electronic signing via DocuSeal
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowSettings(true)} style={{ padding: '8px 16px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', cursor: 'pointer' }}>
            Settings
          </button>
          <button onClick={() => setShowNewRequest(true)} style={{ padding: '8px 16px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
            + New Request
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total Requests', value: stats.total, color: theme.text },
          { label: 'Drafts', value: stats.draft, color: '#71717a' },
          { label: 'Awaiting Signature', value: stats.pending, color: '#f97316' },
          { label: 'Completed', value: stats.completed, color: '#22c55e' },
        ].map((s, i) => (
          <div key={i} style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '16px' }}>
            <div style={{ color: theme.textMuted, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Connection Status */}
      <div style={{
        marginBottom: '20px', padding: '12px 16px', borderRadius: '8px',
        backgroundColor: settings?.is_active ? '#22c55e10' : '#f9731610',
        border: `1px solid ${settings?.is_active ? '#22c55e30' : '#f9731630'}`,
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: settings?.is_active ? '#22c55e' : '#f97316' }} />
        <span style={{ fontSize: '13px', color: settings?.is_active ? '#22c55e' : '#f97316', fontWeight: '600' }}>
          {settings?.is_active ? 'DocuSeal connected' : 'DocuSeal not configured - documents saved as drafts'}
        </span>
      </div>

      {/* Requests List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {requests.map(req => {
          const ss = statusStyles[req.status] || statusStyles.draft;
          const signerCount = req.signers?.length || 0;
          const signedCount = req.signers?.filter(s => s.status === 'signed').length || 0;

          return (
            <div key={req.id} style={{
              backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: theme.textMuted }}>
                    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span style={{ fontWeight: '600', fontSize: '15px' }}>{req.document_name}</span>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', backgroundColor: ss.bg, color: ss.color }}>{ss.label}</span>
                </div>
                <div style={{ color: theme.textSecondary, fontSize: '13px' }}>
                  {signerCount} signer{signerCount !== 1 ? 's' : ''}
                  {req.status !== 'draft' && ` | ${signedCount}/${signerCount} signed`}
                  {req.deal_id && ` | Deal #${req.deal_id}`}
                  {' | '}Created {new Date(req.created_at).toLocaleDateString()}
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  {req.signers?.map((signer, i) => (
                    <span key={i} style={{
                      padding: '2px 8px', borderRadius: '4px', fontSize: '11px',
                      backgroundColor: signer.status === 'signed' ? '#22c55e20' : '#71717a20',
                      color: signer.status === 'signed' ? '#22c55e' : theme.textMuted,
                    }}>
                      {signer.name} ({signer.role})
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {req.status === 'draft' && (
                  <button onClick={() => handleSendForSigning(req.id)} style={{ padding: '8px 14px', backgroundColor: '#3b82f620', color: '#3b82f6', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                    Send for Signing
                  </button>
                )}
                {req.signed_document_url && (
                  <a href={req.signed_document_url} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 14px', backgroundColor: '#22c55e20', color: '#22c55e', borderRadius: '6px', fontSize: '13px', fontWeight: '600', textDecoration: 'none' }}>
                    Download
                  </a>
                )}
                {['draft', 'sent', 'partially_signed'].includes(req.status) && (
                  <button onClick={() => handleVoid(req.id)} style={{ padding: '8px 14px', backgroundColor: '#ef444420', color: '#ef4444', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                    Void
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {requests.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted }}>
            <p style={{ fontSize: '16px' }}>No e-signature requests yet</p>
            <p style={{ fontSize: '13px' }}>Create one to send documents for electronic signing</p>
          </div>
        )}
      </div>

      {/* New Request Modal */}
      {showNewRequest && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowNewRequest(false)}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, padding: '32px', width: '550px', maxHeight: '80vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px' }}>New E-Signature Request</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '4px', color: theme.textSecondary }}>Document Name</label>
                <input type="text" value={form.document_name} onChange={(e) => setForm({ ...form, document_name: e.target.value })}
                  placeholder="e.g., Bill of Sale - 2024 Toyota Camry"
                  style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '4px', color: theme.textSecondary }}>Related Deal (optional)</label>
                <select value={form.deal_id} onChange={(e) => setForm({ ...form, deal_id: e.target.value })}
                  style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' }}>
                  <option value="">None</option>
                  {(deals || []).slice(0, 20).map(d => (
                    <option key={d.id} value={d.id}>#{d.id} - {d.customer_name || 'Unknown'} - {d.vehicle_year} {d.vehicle_make} {d.vehicle_model}</option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600', color: theme.textSecondary }}>Signers</label>
                  <button onClick={addSigner} style={{ padding: '4px 10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '12px', cursor: 'pointer' }}>+ Add Signer</button>
                </div>
                {form.signers.map((signer, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: '8px', marginBottom: '8px' }}>
                    <input type="text" value={signer.name} onChange={(e) => updateSigner(i, 'name', e.target.value)}
                      placeholder="Full name" style={{ padding: '8px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '13px' }} />
                    <input type="email" value={signer.email} onChange={(e) => updateSigner(i, 'email', e.target.value)}
                      placeholder="Email" style={{ padding: '8px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '13px' }} />
                    <select value={signer.role} onChange={(e) => updateSigner(i, 'role', e.target.value)}
                      style={{ padding: '8px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '13px' }}>
                      <option value="buyer">Buyer</option>
                      <option value="co_buyer">Co-Buyer</option>
                      <option value="seller">Seller</option>
                      <option value="witness">Witness</option>
                    </select>
                    {form.signers.length > 1 && (
                      <button onClick={() => removeSigner(i)} style={{ padding: '8px', backgroundColor: '#ef444420', color: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>x</button>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button onClick={() => setShowNewRequest(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleCreateRequest} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', fontWeight: '600', cursor: 'pointer' }}>Create Request</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowSettings(false)}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, padding: '32px', width: '500px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px' }}>DocuSeal Settings</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '4px', color: theme.textSecondary }}>API Key</label>
                <input type="text" value={settingsForm.api_key} onChange={(e) => setSettingsForm({ ...settingsForm, api_key: e.target.value })}
                  style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '4px', color: theme.textSecondary }}>Webhook URL</label>
                <input type="text" value={settingsForm.webhook_url} onChange={(e) => setSettingsForm({ ...settingsForm, webhook_url: e.target.value })}
                  placeholder="https://..." style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', fontWeight: '500' }}>Enable E-Signatures</span>
                <button onClick={() => setSettingsForm({ ...settingsForm, is_active: !settingsForm.is_active })}
                  style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer', backgroundColor: settingsForm.is_active ? '#22c55e' : theme.border, position: 'relative' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#fff', position: 'absolute', top: '2px', transition: 'left 0.2s', left: settingsForm.is_active ? '22px' : '2px' }} />
                </button>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button onClick={() => setShowSettings(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, cursor: 'pointer' }}>Cancel</button>
                <button onClick={saveSettings} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', fontWeight: '600', cursor: 'pointer' }}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
