import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';

export default function DealJacketPage() {
  const { theme } = useTheme();
  const { dealer } = useStore();
  const dealerId = dealer?.id;

  const [jackets, setJackets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState('');
  const [activeJacket, setActiveJacket] = useState(null);
  const [docs, setDocs] = useState([]);
  const [showDocModal, setShowDocModal] = useState(false);
  const [filter, setFilter] = useState('all');

  const [docForm, setDocForm] = useState({
    document_name: '', document_type: 'other', required: false, notes: ''
  });

  const docTypes = {
    buyers_guide: "Buyer's Guide", bill_of_sale: 'Bill of Sale', title: 'Title',
    registration: 'Registration', insurance: 'Insurance', credit_app: 'Credit App',
    contract: 'Contract', addendum: 'Addendum', disclosure: 'Disclosure',
    warranty: 'Warranty', trade_title: 'Trade Title', payoff_letter: 'Payoff Letter',
    stip: 'Stipulation', id_copy: 'ID Copy', proof_income: 'Proof of Income',
    proof_residence: 'Proof of Residence', power_of_attorney: 'POA',
    odometer: 'Odometer Statement', lien_release: 'Lien Release', other: 'Other'
  };

  useEffect(() => { if (dealerId) { fetchAll(); } }, [dealerId]);

  const fetchAll = async () => {
    setLoading(true);
    const [j, d, e] = await Promise.all([
      supabase.from('deal_jackets').select('*').eq('dealer_id', dealerId).order('created_at', { ascending: false }),
      supabase.from('deals').select('id, customer_name, vehicle_description, status, created_at').eq('dealer_id', dealerId).order('created_at', { ascending: false }).limit(100),
      supabase.from('employees').select('id, name').eq('dealer_id', dealerId).eq('active', true)
    ]);
    setJackets(j.data || []);
    setDeals(d.data || []);
    setEmployees(e.data || []);
    setLoading(false);
  };

  const fetchDocs = async (jacketId) => {
    const { data } = await supabase
      .from('deal_jacket_documents')
      .select('*')
      .eq('deal_jacket_id', jacketId)
      .eq('dealer_id', dealerId)
      .order('sort_order');
    setDocs(data || []);
  };

  const createJacket = async () => {
    if (!selectedDealId) return;
    const { data } = await supabase.from('deal_jackets').insert({
      dealer_id: dealerId,
      deal_id: parseInt(selectedDealId),
      status: 'incomplete'
    }).select().single();
    if (data) {
      // Auto-create common required docs
      const commonDocs = [
        { document_name: "Buyer's Guide", document_type: 'buyers_guide', required: true },
        { document_name: 'Bill of Sale', document_type: 'bill_of_sale', required: true },
        { document_name: 'Title', document_type: 'title', required: true },
        { document_name: 'Odometer Disclosure', document_type: 'odometer', required: true },
        { document_name: 'ID Copy', document_type: 'id_copy', required: true },
        { document_name: 'Insurance', document_type: 'insurance', required: true },
        { document_name: 'Contract', document_type: 'contract', required: true }
      ];
      await supabase.from('deal_jacket_documents').insert(
        commonDocs.map((d, i) => ({ ...d, deal_jacket_id: data.id, dealer_id: dealerId, sort_order: i }))
      );
    }
    setShowCreateModal(false);
    setSelectedDealId('');
    fetchAll();
  };

  const openJacket = (jacket) => {
    setActiveJacket(jacket);
    fetchDocs(jacket.id);
  };

  const toggleReceived = async (docId, current) => {
    await supabase.from('deal_jacket_documents').update({
      received: !current,
      received_at: !current ? new Date().toISOString() : null
    }).eq('id', docId);
    fetchDocs(activeJacket.id);
    updateCompletion(activeJacket.id);
  };

  const toggleVerified = async (docId, current) => {
    await supabase.from('deal_jacket_documents').update({
      verified: !current,
      verified_at: !current ? new Date().toISOString() : null
    }).eq('id', docId);
    fetchDocs(activeJacket.id);
  };

  const updateCompletion = async (jacketId) => {
    const { data: allDocs } = await supabase.from('deal_jacket_documents').select('required, received').eq('deal_jacket_id', jacketId);
    if (!allDocs || allDocs.length === 0) return;
    const required = allDocs.filter(d => d.required);
    const received = required.filter(d => d.received);
    const pct = required.length > 0 ? Math.round((received.length / required.length) * 100) : 100;
    const status = pct === 100 ? 'complete' : 'incomplete';
    await supabase.from('deal_jackets').update({ completion_percent: pct, status }).eq('id', jacketId);
    fetchAll();
  };

  const addDoc = async () => {
    await supabase.from('deal_jacket_documents').insert({
      deal_jacket_id: activeJacket.id,
      dealer_id: dealerId,
      document_name: docForm.document_name,
      document_type: docForm.document_type,
      required: docForm.required,
      notes: docForm.notes || null,
      sort_order: docs.length
    });
    setShowDocModal(false);
    setDocForm({ document_name: '', document_type: 'other', required: false, notes: '' });
    fetchDocs(activeJacket.id);
  };

  const deleteDoc = async (docId) => {
    await supabase.from('deal_jacket_documents').delete().eq('id', docId);
    fetchDocs(activeJacket.id);
    updateCompletion(activeJacket.id);
  };

  const deleteJacket = async (id) => {
    if (!confirm('Delete this deal jacket and all documents?')) return;
    await supabase.from('deal_jackets').delete().eq('id', id);
    if (activeJacket?.id === id) { setActiveJacket(null); setDocs([]); }
    fetchAll();
  };

  const getDeal = (id) => deals.find(d => d.id === id);
  const filtered = filter === 'all' ? jackets : jackets.filter(j => j.status === filter);

  const stats = {
    total: jackets.length,
    complete: jackets.filter(j => j.status === 'complete').length,
    incomplete: jackets.filter(j => j.status === 'incomplete').length,
    avgCompletion: jackets.length > 0 ? Math.round(jackets.reduce((s, j) => s + parseFloat(j.completion_percent || 0), 0) / jackets.length) : 0
  };

  const inputStyle = { width: '100%', padding: '8px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' };
  const labelStyle = { display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '4px' };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>Deal Jackets</h1>
          <p style={{ color: theme.textSecondary, fontSize: '14px', margin: '4px 0 0' }}>Digital deal document management</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} style={{
          padding: '10px 20px', backgroundColor: theme.accent, color: '#fff',
          border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px'
        }}>+ New Jacket</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total Jackets', value: stats.total, color: theme.accent },
          { label: 'Complete', value: stats.complete, color: '#22c55e' },
          { label: 'Incomplete', value: stats.incomplete, color: '#f59e0b' },
          { label: 'Avg Completion', value: `${stats.avgCompletion}%`, color: '#3b82f6' }
        ].map((s, i) => (
          <div key={i} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: theme.textSecondary }}>{s.label}</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '16px' }}>
        {/* Jackets List */}
        <div style={{ width: activeJacket ? '40%' : '100%', minWidth: '300px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            {['all', 'incomplete', 'complete'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '6px 14px', borderRadius: '20px', border: `1px solid ${filter === f ? theme.accent : theme.border}`,
                backgroundColor: filter === f ? theme.accentBg : 'transparent', color: filter === f ? theme.accent : theme.textSecondary,
                cursor: 'pointer', fontSize: '13px', fontWeight: '500', textTransform: 'capitalize'
              }}>{f}</button>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: theme.textSecondary }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted, backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>No deal jackets</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filtered.map(jacket => {
                const deal = getDeal(jacket.deal_id);
                const pct = parseFloat(jacket.completion_percent || 0);
                const isActive = activeJacket?.id === jacket.id;
                return (
                  <div key={jacket.id} onClick={() => openJacket(jacket)} style={{
                    backgroundColor: theme.bgCard, border: `1px solid ${isActive ? theme.accent : theme.border}`,
                    borderRadius: '12px', padding: '14px', cursor: 'pointer'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <div>
                        <div style={{ fontWeight: '600', color: theme.text, fontSize: '14px' }}>Deal #{jacket.deal_id}</div>
                        <div style={{ fontSize: '12px', color: theme.textSecondary }}>{deal?.customer_name || '-'}</div>
                        {deal?.vehicle_description && <div style={{ fontSize: '12px', color: theme.textMuted }}>{deal.vehicle_description}</div>}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); deleteJacket(jacket.id); }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}>Del</button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ flex: 1, height: '6px', backgroundColor: theme.bg, borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: pct === 100 ? '#22c55e' : '#f59e0b', borderRadius: '3px', transition: 'width 0.3s' }} />
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: pct === 100 ? '#22c55e' : '#f59e0b' }}>{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Document Checklist */}
        {activeJacket && (
          <div style={{ flex: 1, backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, margin: 0 }}>Deal #{activeJacket.deal_id} Documents</h2>
                <div style={{ fontSize: '13px', color: theme.textSecondary }}>{getDeal(activeJacket.deal_id)?.customer_name}</div>
              </div>
              <button onClick={() => setShowDocModal(true)} style={{
                padding: '6px 14px', backgroundColor: theme.accentBg, color: theme.accent,
                border: `1px solid ${theme.accent}44`, borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600'
              }}>+ Add Doc</button>
            </div>

            {docs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: theme.textMuted }}>No documents</div>
            ) : (
              <div>
                {docs.map(doc => (
                  <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: `1px solid ${theme.border}` }}>
                    <input type="checkbox" checked={doc.received} onChange={() => toggleReceived(doc.id, doc.received)} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px', color: doc.received ? theme.textMuted : theme.text, fontWeight: '500', textDecoration: doc.received ? 'line-through' : 'none' }}>{doc.document_name}</span>
                        {doc.required && <span style={{ fontSize: '10px', padding: '1px 4px', borderRadius: '3px', backgroundColor: '#ef444422', color: '#ef4444', fontWeight: '600' }}>REQ</span>}
                        <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', backgroundColor: theme.accentBg, color: theme.accent }}>{docTypes[doc.document_type] || doc.document_type}</span>
                      </div>
                      {doc.received_at && <div style={{ fontSize: '11px', color: theme.textMuted }}>Received {new Date(doc.received_at).toLocaleDateString()}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {doc.received && (
                        <button onClick={() => toggleVerified(doc.id, doc.verified)} style={{
                          padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer',
                          backgroundColor: doc.verified ? '#22c55e22' : 'transparent',
                          color: doc.verified ? '#22c55e' : theme.textMuted,
                          border: `1px solid ${doc.verified ? '#22c55e' : theme.border}`
                        }}>{doc.verified ? 'Verified' : 'Verify'}</button>
                      )}
                      <button onClick={() => deleteDoc(doc.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px' }}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Jacket Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, width: '100%', maxWidth: '400px', padding: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: theme.text, margin: '0 0 16px' }}>Create Deal Jacket</h2>
            <div><label style={labelStyle}>Select Deal *</label><select value={selectedDealId} onChange={e => setSelectedDealId(e.target.value)} style={inputStyle}>
              <option value="">Choose a deal</option>
              {deals.filter(d => !jackets.some(j => j.deal_id === d.id)).map(d => (
                <option key={d.id} value={d.id}>#{d.id} - {d.customer_name} {d.vehicle_description ? `(${d.vehicle_description})` : ''}</option>
              ))}
            </select></div>
            <p style={{ fontSize: '12px', color: theme.textMuted, marginTop: '8px' }}>7 common required documents will be auto-created.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <button onClick={() => setShowCreateModal(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={createJacket} disabled={!selectedDealId} style={{ padding: '10px 20px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', opacity: !selectedDealId ? 0.5 : 1 }}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Doc Modal */}
      {showDocModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, width: '100%', maxWidth: '400px', padding: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: theme.text, margin: '0 0 16px' }}>Add Document</h2>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div><label style={labelStyle}>Name *</label><input value={docForm.document_name} onChange={e => setDocForm({ ...docForm, document_name: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Type</label><select value={docForm.document_type} onChange={e => setDocForm({ ...docForm, document_type: e.target.value })} style={inputStyle}>
                {Object.entries(docTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" checked={docForm.required} onChange={e => setDocForm({ ...docForm, required: e.target.checked })} />
                <label style={{ fontSize: '13px', color: theme.text }}>Required document</label>
              </div>
              <div><label style={labelStyle}>Notes</label><textarea value={docForm.notes} onChange={e => setDocForm({ ...docForm, notes: e.target.value })} style={{ ...inputStyle, minHeight: '50px', resize: 'vertical' }} /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <button onClick={() => setShowDocModal(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={addDoc} disabled={!docForm.document_name} style={{ padding: '10px 20px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', opacity: !docForm.document_name ? 0.5 : 1 }}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}