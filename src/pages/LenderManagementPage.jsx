import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';

export default function LenderManagementPage() {
  const { theme } = useTheme();
  const { dealer } = useStore();
  const dealerId = dealer?.id;

  const [tab, setTab] = useState('lenders');
  const [lenders, setLenders] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingLender, setEditingLender] = useState(null);
  const [showSubModal, setShowSubModal] = useState(false);
  const [deals, setDeals] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [employees, setEmployees] = useState([]);

  const [form, setForm] = useState({
    name: '', contact_name: '', phone: '', email: '', fax: '', website: '',
    address: '', city: '', state: '', zip: '',
    lender_type: 'bank', min_credit_score: '', max_ltv: '', min_amount: '', max_amount: '',
    flat_fee: '', reserve_flat: '', reserve_percent: '',
    base_rate: '', max_rate: '', max_term_new: '', max_term_used: '',
    max_vehicle_age: '', max_vehicle_miles: '',
    dealer_number: '', portal_url: '', submission_method: '',
    active: true, notes: ''
  });

  const [subForm, setSubForm] = useState({
    lender_id: '', deal_id: '', customer_id: '', vehicle_id: '',
    amount_requested: '', term_requested: '', rate_requested: '',
    status: 'pending', approved_amount: '', approved_rate: '', approved_term: '',
    buy_rate: '', reserve_amount: '', conditions: '', decline_reason: '', notes: ''
  });

  const lenderTypes = { bank: 'Bank', credit_union: 'Credit Union', captive: 'Captive', subprime: 'Subprime', bhph: 'BHPH', online: 'Online', other: 'Other' };
  const subStatuses = ['pending', 'approved', 'conditional', 'countered', 'declined', 'expired', 'funded'];
  const subStatusColors = {
    pending: '#f59e0b', approved: '#22c55e', conditional: '#3b82f6', countered: '#8b5cf6',
    declined: '#ef4444', expired: '#71717a', funded: '#06b6d4'
  };

  useEffect(() => { if (dealerId) { fetchAll(); } }, [dealerId]);

  const fetchAll = async () => {
    setLoading(true);
    const [l, s, d, c, v, e] = await Promise.all([
      supabase.from('lenders').select('*').eq('dealer_id', dealerId).order('name'),
      supabase.from('lender_submissions').select('*').eq('dealer_id', dealerId).order('created_at', { ascending: false }),
      supabase.from('deals').select('id, customer_name, vehicle_description').eq('dealer_id', dealerId).order('created_at', { ascending: false }).limit(50),
      supabase.from('customers').select('id, first_name, last_name').eq('dealer_id', dealerId),
      supabase.from('inventory').select('id, year, make, model, stock_number').eq('dealer_id', dealerId),
      supabase.from('employees').select('id, name').eq('dealer_id', dealerId).eq('active', true)
    ]);
    setLenders(l.data || []);
    setSubmissions(s.data || []);
    setDeals(d.data || []);
    setCustomers(c.data || []);
    setVehicles(v.data || []);
    setEmployees(e.data || []);
    setLoading(false);
  };

  const handleSaveLender = async () => {
    const payload = {
      dealer_id: dealerId,
      name: form.name, contact_name: form.contact_name || null,
      phone: form.phone || null, email: form.email || null, fax: form.fax || null,
      website: form.website || null, address: form.address || null,
      city: form.city || null, state: form.state || null, zip: form.zip || null,
      lender_type: form.lender_type,
      min_credit_score: form.min_credit_score ? parseInt(form.min_credit_score) : null,
      max_ltv: form.max_ltv ? parseFloat(form.max_ltv) : null,
      min_amount: form.min_amount ? parseFloat(form.min_amount) : null,
      max_amount: form.max_amount ? parseFloat(form.max_amount) : null,
      flat_fee: form.flat_fee ? parseFloat(form.flat_fee) : null,
      reserve_flat: form.reserve_flat ? parseFloat(form.reserve_flat) : null,
      reserve_percent: form.reserve_percent ? parseFloat(form.reserve_percent) : null,
      base_rate: form.base_rate ? parseFloat(form.base_rate) : null,
      max_rate: form.max_rate ? parseFloat(form.max_rate) : null,
      max_term_new: form.max_term_new ? parseInt(form.max_term_new) : null,
      max_term_used: form.max_term_used ? parseInt(form.max_term_used) : null,
      max_vehicle_age: form.max_vehicle_age ? parseInt(form.max_vehicle_age) : null,
      max_vehicle_miles: form.max_vehicle_miles ? parseInt(form.max_vehicle_miles) : null,
      dealer_number: form.dealer_number || null, portal_url: form.portal_url || null,
      submission_method: form.submission_method || null,
      active: form.active, notes: form.notes || null
    };
    if (editingLender) {
      await supabase.from('lenders').update(payload).eq('id', editingLender.id);
    } else {
      await supabase.from('lenders').insert(payload);
    }
    setShowModal(false);
    setEditingLender(null);
    resetForm();
    fetchAll();
  };

  const resetForm = () => setForm({
    name: '', contact_name: '', phone: '', email: '', fax: '', website: '',
    address: '', city: '', state: '', zip: '',
    lender_type: 'bank', min_credit_score: '', max_ltv: '', min_amount: '', max_amount: '',
    flat_fee: '', reserve_flat: '', reserve_percent: '',
    base_rate: '', max_rate: '', max_term_new: '', max_term_used: '',
    max_vehicle_age: '', max_vehicle_miles: '',
    dealer_number: '', portal_url: '', submission_method: '',
    active: true, notes: ''
  });

  const openEditLender = (l) => {
    setEditingLender(l);
    setForm({
      name: l.name || '', contact_name: l.contact_name || '', phone: l.phone || '',
      email: l.email || '', fax: l.fax || '', website: l.website || '',
      address: l.address || '', city: l.city || '', state: l.state || '', zip: l.zip || '',
      lender_type: l.lender_type || 'bank',
      min_credit_score: l.min_credit_score?.toString() || '', max_ltv: l.max_ltv?.toString() || '',
      min_amount: l.min_amount?.toString() || '', max_amount: l.max_amount?.toString() || '',
      flat_fee: l.flat_fee?.toString() || '', reserve_flat: l.reserve_flat?.toString() || '',
      reserve_percent: l.reserve_percent?.toString() || '',
      base_rate: l.base_rate?.toString() || '', max_rate: l.max_rate?.toString() || '',
      max_term_new: l.max_term_new?.toString() || '', max_term_used: l.max_term_used?.toString() || '',
      max_vehicle_age: l.max_vehicle_age?.toString() || '', max_vehicle_miles: l.max_vehicle_miles?.toString() || '',
      dealer_number: l.dealer_number || '', portal_url: l.portal_url || '',
      submission_method: l.submission_method || '',
      active: l.active !== false, notes: l.notes || ''
    });
    setShowModal(true);
  };

  const deleteLender = async (id) => {
    if (!confirm('Delete this lender?')) return;
    await supabase.from('lenders').delete().eq('id', id);
    fetchAll();
  };

  const handleSubmitDeal = async () => {
    await supabase.from('lender_submissions').insert({
      dealer_id: dealerId,
      lender_id: subForm.lender_id,
      deal_id: subForm.deal_id ? parseInt(subForm.deal_id) : null,
      customer_id: subForm.customer_id ? parseInt(subForm.customer_id) : null,
      vehicle_id: subForm.vehicle_id || null,
      amount_requested: subForm.amount_requested ? parseFloat(subForm.amount_requested) : null,
      term_requested: subForm.term_requested ? parseInt(subForm.term_requested) : null,
      rate_requested: subForm.rate_requested ? parseFloat(subForm.rate_requested) : null,
      status: 'pending', notes: subForm.notes || null
    });
    setShowSubModal(false);
    setSubForm({ lender_id: '', deal_id: '', customer_id: '', vehicle_id: '', amount_requested: '', term_requested: '', rate_requested: '', status: 'pending', approved_amount: '', approved_rate: '', approved_term: '', buy_rate: '', reserve_amount: '', conditions: '', decline_reason: '', notes: '' });
    fetchAll();
  };

  const updateSubStatus = async (id, status) => {
    const updates = { status, response_at: new Date().toISOString() };
    if (status === 'funded') updates.funded_at = new Date().toISOString();
    await supabase.from('lender_submissions').update(updates).eq('id', id);
    fetchAll();
  };

  const getLender = (id) => lenders.find(l => l.id === id);

  const stats = {
    totalLenders: lenders.filter(l => l.active).length,
    pendingSubs: submissions.filter(s => s.status === 'pending').length,
    approvedSubs: submissions.filter(s => ['approved', 'conditional', 'countered'].includes(s.status)).length,
    totalFunded: submissions.filter(s => s.status === 'funded').reduce((sum, s) => sum + parseFloat(s.funded_amount || s.approved_amount || 0), 0)
  };

  const inputStyle = { width: '100%', padding: '8px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' };
  const labelStyle = { display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '4px' };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>Lender Management</h1>
          <p style={{ color: theme.textSecondary, fontSize: '14px', margin: '4px 0 0' }}>Manage lending partners and deal submissions</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowSubModal(true)} style={{
            padding: '10px 20px', backgroundColor: 'transparent', color: theme.accent,
            border: `1px solid ${theme.accent}`, borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px'
          }}>Submit Deal</button>
          <button onClick={() => { resetForm(); setEditingLender(null); setShowModal(true); }} style={{
            padding: '10px 20px', backgroundColor: theme.accent, color: '#fff',
            border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px'
          }}>+ Add Lender</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Active Lenders', value: stats.totalLenders, color: theme.accent },
          { label: 'Pending', value: stats.pendingSubs, color: '#f59e0b' },
          { label: 'Approved', value: stats.approvedSubs, color: '#22c55e' },
          { label: 'Total Funded', value: `$${stats.totalFunded.toLocaleString()}`, color: '#06b6d4' }
        ].map((s, i) => (
          <div key={i} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: theme.textSecondary }}>{s.label}</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '4px' }}>
        {['lenders', 'submissions'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 20px', border: 'none', borderBottom: tab === t ? `2px solid ${theme.accent}` : '2px solid transparent',
            backgroundColor: 'transparent', color: tab === t ? theme.accent : theme.textSecondary,
            cursor: 'pointer', fontSize: '14px', fontWeight: '600', textTransform: 'capitalize'
          }}>{t}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: theme.textSecondary }}>Loading...</div>
      ) : tab === 'lenders' ? (
        /* Lender Cards */
        lenders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted, backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>No lenders added yet</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {lenders.map(l => (
              <div key={l.id} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '16px', opacity: l.active ? 1 : 0.6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontWeight: '700', color: theme.text, fontSize: '15px' }}>{l.name}</div>
                    <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', backgroundColor: theme.accentBg, color: theme.accent }}>{lenderTypes[l.lender_type] || l.lender_type}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => openEditLender(l)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '12px' }}>Edit</button>
                    <button onClick={() => deleteLender(l.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}>Del</button>
                  </div>
                </div>
                {l.contact_name && <div style={{ fontSize: '13px', color: theme.textSecondary }}>{l.contact_name}</div>}
                {l.phone && <div style={{ fontSize: '13px', color: theme.textSecondary }}>{l.phone}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px', borderTop: `1px solid ${theme.border}`, paddingTop: '12px' }}>
                  {l.base_rate && <div><div style={{ fontSize: '10px', color: theme.textMuted }}>Base Rate</div><div style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>{l.base_rate}%</div></div>}
                  {l.max_rate && <div><div style={{ fontSize: '10px', color: theme.textMuted }}>Max Rate</div><div style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>{l.max_rate}%</div></div>}
                  {l.min_credit_score && <div><div style={{ fontSize: '10px', color: theme.textMuted }}>Min Score</div><div style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>{l.min_credit_score}</div></div>}
                  {l.max_amount && <div><div style={{ fontSize: '10px', color: theme.textMuted }}>Max Amount</div><div style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>${parseFloat(l.max_amount).toLocaleString()}</div></div>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', paddingTop: '8px', borderTop: `1px solid ${theme.border}`, fontSize: '12px', color: theme.textMuted }}>
                  <span>Funded: {l.total_funded || 0}</span>
                  <span>{l.submission_method || 'manual'}</span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Submissions Table */
        submissions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted, backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>No submissions yet</div>
        ) : (
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  {['Lender', 'Deal', 'Requested', 'Approved', 'Rate', 'Reserve', 'Status'].map(h => (
                    <th key={h} style={{ padding: '12px', textAlign: 'left', color: theme.textSecondary, fontWeight: '600', fontSize: '12px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {submissions.map(sub => {
                  const lender = getLender(sub.lender_id);
                  return (
                    <tr key={sub.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <td style={{ padding: '12px', fontWeight: '600', color: theme.text }}>{lender?.name || '-'}</td>
                      <td style={{ padding: '12px', color: theme.textSecondary }}>#{sub.deal_id || '-'}</td>
                      <td style={{ padding: '12px', color: theme.text }}>{sub.amount_requested ? `$${parseFloat(sub.amount_requested).toLocaleString()}` : '-'}</td>
                      <td style={{ padding: '12px', color: '#22c55e', fontWeight: '600' }}>{sub.approved_amount ? `$${parseFloat(sub.approved_amount).toLocaleString()}` : '-'}</td>
                      <td style={{ padding: '12px', color: theme.text }}>{sub.approved_rate ? `${sub.approved_rate}%` : sub.rate_requested ? `${sub.rate_requested}% req` : '-'}</td>
                      <td style={{ padding: '12px', color: '#06b6d4' }}>{sub.reserve_amount ? `$${parseFloat(sub.reserve_amount).toLocaleString()}` : '-'}</td>
                      <td style={{ padding: '12px' }}>
                        <select value={sub.status} onChange={e => updateSubStatus(sub.id, e.target.value)} style={{
                          padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                          backgroundColor: (subStatusColors[sub.status] || '#71717a') + '22',
                          color: subStatusColors[sub.status] || '#71717a',
                          border: `1px solid ${subStatusColors[sub.status] || '#71717a'}44`, cursor: 'pointer'
                        }}>
                          {subStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Lender Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, width: '100%', maxWidth: '700px', maxHeight: '85vh', overflow: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: theme.text, margin: 0 }}>{editingLender ? 'Edit Lender' : 'Add Lender'}</h2>
              <button onClick={() => { setShowModal(false); setEditingLender(null); }} style={{ background: 'none', border: 'none', color: theme.textSecondary, cursor: 'pointer', fontSize: '20px' }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div><label style={labelStyle}>Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Type</label><select value={form.lender_type} onChange={e => setForm({ ...form, lender_type: e.target.value })} style={inputStyle}>{Object.entries(lenderTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div><label style={labelStyle}>Contact</label><input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Phone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Email</label><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Dealer #</label><input value={form.dealer_number} onChange={e => setForm({ ...form, dealer_number: e.target.value })} style={inputStyle} /></div>

              <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${theme.border}`, paddingTop: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Rate & Terms</h3>
              </div>
              <div><label style={labelStyle}>Base Rate %</label><input type="number" step="0.01" value={form.base_rate} onChange={e => setForm({ ...form, base_rate: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Max Rate %</label><input type="number" step="0.01" value={form.max_rate} onChange={e => setForm({ ...form, max_rate: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Min Credit Score</label><input type="number" value={form.min_credit_score} onChange={e => setForm({ ...form, min_credit_score: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Max LTV %</label><input type="number" step="0.01" value={form.max_ltv} onChange={e => setForm({ ...form, max_ltv: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Max Term New (mo)</label><input type="number" value={form.max_term_new} onChange={e => setForm({ ...form, max_term_new: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Max Term Used (mo)</label><input type="number" value={form.max_term_used} onChange={e => setForm({ ...form, max_term_used: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Reserve Flat $</label><input type="number" step="0.01" value={form.reserve_flat} onChange={e => setForm({ ...form, reserve_flat: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Reserve %</label><input type="number" step="0.01" value={form.reserve_percent} onChange={e => setForm({ ...form, reserve_percent: e.target.value })} style={inputStyle} /></div>

              <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${theme.border}`, paddingTop: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Submission</h3>
              </div>
              <div><label style={labelStyle}>Submission Method</label><select value={form.submission_method} onChange={e => setForm({ ...form, submission_method: e.target.value })} style={inputStyle}>
                <option value="">Select</option>
                {['dealertrack', 'routeone', 'cudl', 'manual', 'portal', 'email', 'fax'].map(m => <option key={m} value={m}>{m}</option>)}
              </select></div>
              <div><label style={labelStyle}>Portal URL</label><input value={form.portal_url} onChange={e => setForm({ ...form, portal_url: e.target.value })} style={inputStyle} /></div>

              <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...inputStyle, minHeight: '50px', resize: 'vertical' }} /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <button onClick={() => { setShowModal(false); setEditingLender(null); }} style={{ padding: '10px 20px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSaveLender} disabled={!form.name} style={{ padding: '10px 20px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', opacity: !form.name ? 0.5 : 1 }}>{editingLender ? 'Update' : 'Add'} Lender</button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Deal Modal */}
      {showSubModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, width: '100%', maxWidth: '500px', maxHeight: '85vh', overflow: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: theme.text, margin: 0 }}>Submit Deal to Lender</h2>
              <button onClick={() => setShowSubModal(false)} style={{ background: 'none', border: 'none', color: theme.textSecondary, cursor: 'pointer', fontSize: '20px' }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: '16px' }}>
              <div><label style={labelStyle}>Lender *</label><select value={subForm.lender_id} onChange={e => setSubForm({ ...subForm, lender_id: e.target.value })} style={inputStyle}>
                <option value="">Select lender</option>{lenders.filter(l => l.active).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select></div>
              <div><label style={labelStyle}>Deal</label><select value={subForm.deal_id} onChange={e => setSubForm({ ...subForm, deal_id: e.target.value })} style={inputStyle}>
                <option value="">Select deal</option>{deals.map(d => <option key={d.id} value={d.id}>#{d.id} - {d.customer_name}</option>)}
              </select></div>
              <div><label style={labelStyle}>Vehicle</label><select value={subForm.vehicle_id} onChange={e => setSubForm({ ...subForm, vehicle_id: e.target.value })} style={inputStyle}>
                <option value="">Select vehicle</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.stock_number} - {v.year} {v.make} {v.model}</option>)}
              </select></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div><label style={labelStyle}>Amount</label><input type="number" value={subForm.amount_requested} onChange={e => setSubForm({ ...subForm, amount_requested: e.target.value })} style={inputStyle} /></div>
                <div><label style={labelStyle}>Term (mo)</label><input type="number" value={subForm.term_requested} onChange={e => setSubForm({ ...subForm, term_requested: e.target.value })} style={inputStyle} /></div>
                <div><label style={labelStyle}>Rate %</label><input type="number" step="0.01" value={subForm.rate_requested} onChange={e => setSubForm({ ...subForm, rate_requested: e.target.value })} style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>Notes</label><textarea value={subForm.notes} onChange={e => setSubForm({ ...subForm, notes: e.target.value })} style={{ ...inputStyle, minHeight: '50px', resize: 'vertical' }} /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <button onClick={() => setShowSubModal(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSubmitDeal} disabled={!subForm.lender_id} style={{ padding: '10px 20px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', opacity: !subForm.lender_id ? 0.5 : 1 }}>Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}