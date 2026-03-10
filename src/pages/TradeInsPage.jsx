import { useState, useEffect } from 'react';
import { useTheme } from '../components/Layout';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';

export default function TradeInsPage() {
  const { theme } = useTheme();
  const { dealerId, customers, employees, deals } = useStore();
  const [loading, setLoading] = useState(true);
  const [tradeIns, setTradeIns] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [form, setForm] = useState({
    deal_id: '', customer_id: '', vin: '', year: '', make: '', model: '', trim: '', color: '',
    mileage: '', condition: 'good', kbb_value: '', nada_value: '', market_value: '', acv: '',
    offered_value: '', has_lien: false, lien_holder: '', payoff_amount: '', payoff_good_through: '',
    disposition: 'pending', appraisal_notes: '', notes: ''
  });

  const conditions = {
    excellent: { label: 'Excellent', color: '#22c55e' },
    good: { label: 'Good', color: '#3b82f6' },
    fair: { label: 'Fair', color: '#f59e0b' },
    poor: { label: 'Poor', color: '#ef4444' },
    salvage: { label: 'Salvage', color: '#71717a' }
  };

  const statusMap = {
    pending: { label: 'Pending', color: '#71717a' },
    appraised: { label: 'Appraised', color: '#3b82f6' },
    offered: { label: 'Offered', color: '#f59e0b' },
    accepted: { label: 'Accepted', color: '#22c55e' },
    declined: { label: 'Declined', color: '#ef4444' },
    completed: { label: 'Completed', color: '#8b5cf6' }
  };

  useEffect(() => { if (dealerId) loadData(); }, [dealerId]);

  async function loadData() {
    setLoading(true);
    const { data } = await supabase.from('trade_ins').select('*').eq('dealer_id', dealerId).order('created_at', { ascending: false });
    setTradeIns(data || []);
    setLoading(false);
  }

  // Stats
  const totalTradeIns = tradeIns.length;
  const pendingAppraisals = tradeIns.filter(t => t.status === 'pending' || t.status === 'appraised').length;
  const acceptedTradeIns = tradeIns.filter(t => t.status === 'accepted' || t.status === 'completed');
  const totalTradeValue = acceptedTradeIns.reduce((sum, t) => sum + parseFloat(t.agreed_value || t.offered_value || 0), 0);
  const avgNegativeEquity = acceptedTradeIns.filter(t => t.negative_equity > 0);
  const totalNegEquity = avgNegativeEquity.reduce((sum, t) => sum + parseFloat(t.negative_equity || 0), 0);
  const withLiens = tradeIns.filter(t => t.has_lien).length;

  let filtered = tradeIns;
  if (statusFilter !== 'all') filtered = filtered.filter(t => t.status === statusFilter);
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(t => `${t.year} ${t.make} ${t.model}`.toLowerCase().includes(s) || t.vin?.toLowerCase().includes(s));
  }

  async function handleSave() {
    try {
      const negEquity = form.has_lien && form.payoff_amount && form.acv
        ? Math.max(0, parseFloat(form.payoff_amount) - parseFloat(form.acv))
        : null;

      const payload = {
        dealer_id: dealerId,
        deal_id: form.deal_id ? parseInt(form.deal_id) : null,
        customer_id: form.customer_id ? parseInt(form.customer_id) : null,
        vin: form.vin || null, year: form.year ? parseInt(form.year) : null,
        make: form.make || null, model: form.model || null, trim: form.trim || null,
        color: form.color || null, mileage: form.mileage ? parseInt(form.mileage) : null,
        condition: form.condition,
        kbb_value: form.kbb_value ? parseFloat(form.kbb_value) : null,
        nada_value: form.nada_value ? parseFloat(form.nada_value) : null,
        market_value: form.market_value ? parseFloat(form.market_value) : null,
        acv: form.acv ? parseFloat(form.acv) : null,
        offered_value: form.offered_value ? parseFloat(form.offered_value) : null,
        has_lien: form.has_lien, lien_holder: form.lien_holder || null,
        payoff_amount: form.payoff_amount ? parseFloat(form.payoff_amount) : null,
        payoff_good_through: form.payoff_good_through || null,
        negative_equity: negEquity, disposition: form.disposition,
        appraisal_notes: form.appraisal_notes || null, notes: form.notes || null,
        status: editing ? undefined : 'pending'
      };
      if (editing) delete payload.status;

      if (editing) {
        await supabase.from('trade_ins').update(payload).eq('id', editing.id);
      } else {
        await supabase.from('trade_ins').insert(payload);
      }
      setShowModal(false);
      setEditing(null);
      resetForm();
      loadData();
    } catch (err) { alert('Failed to save: ' + err.message); }
  }

  async function updateStatus(id, status) {
    const updates = { status, updated_at: new Date().toISOString() };
    if (status === 'appraised') updates.appraised_at = new Date().toISOString();
    await supabase.from('trade_ins').update(updates).eq('id', id);
    loadData();
  }

  async function handleDelete(id) {
    if (!confirm('Delete this trade-in record?')) return;
    await supabase.from('trade_ins').delete().eq('id', id);
    loadData();
  }

  function openEdit(ti) {
    setEditing(ti);
    setForm({
      deal_id: ti.deal_id || '', customer_id: ti.customer_id || '', vin: ti.vin || '',
      year: ti.year || '', make: ti.make || '', model: ti.model || '', trim: ti.trim || '',
      color: ti.color || '', mileage: ti.mileage || '', condition: ti.condition || 'good',
      kbb_value: ti.kbb_value || '', nada_value: ti.nada_value || '', market_value: ti.market_value || '',
      acv: ti.acv || '', offered_value: ti.offered_value || '', has_lien: ti.has_lien || false,
      lien_holder: ti.lien_holder || '', payoff_amount: ti.payoff_amount || '',
      payoff_good_through: ti.payoff_good_through || '', disposition: ti.disposition || 'pending',
      appraisal_notes: ti.appraisal_notes || '', notes: ti.notes || ''
    });
    setShowModal(true);
  }

  function resetForm() {
    setForm({ deal_id: '', customer_id: '', vin: '', year: '', make: '', model: '', trim: '', color: '',
      mileage: '', condition: 'good', kbb_value: '', nada_value: '', market_value: '', acv: '',
      offered_value: '', has_lien: false, lien_holder: '', payoff_amount: '', payoff_good_through: '',
      disposition: 'pending', appraisal_notes: '', notes: '' });
  }

  if (loading) return <div style={{ padding: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}><div style={{ color: theme.textSecondary }}>Loading...</div></div>;

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>Trade-Ins</h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', marginTop: '4px' }}>Appraisals, valuations & payoff tracking</p>
        </div>
        <button onClick={() => { setEditing(null); resetForm(); setShowModal(true); }} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>+ New Trade-In</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total Trade-Ins', value: totalTradeIns, color: theme.text },
          { label: 'Pending Appraisal', value: pendingAppraisals, color: '#f59e0b' },
          { label: 'Accepted', value: acceptedTradeIns.length, color: '#22c55e' },
          { label: 'Trade Value', value: `$${totalTradeValue.toLocaleString()}`, color: '#3b82f6' },
          { label: 'Neg. Equity', value: `$${totalNegEquity.toLocaleString()}`, color: '#ef4444' },
          { label: 'With Liens', value: withLiens, color: '#8b5cf6' }
        ].map((s, i) => (
          <div key={i} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by vehicle or VIN..." style={{ flex: 1, padding: '10px 14px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '10px 14px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' }}>
          <option value="all">All Status</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Trade-In Cards */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted, backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔄</div>
          <p>No trade-ins found. Add your first trade-in appraisal.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(ti => {
            const cust = (customers || []).find(c => c.id === ti.customer_id);
            const st = statusMap[ti.status] || statusMap.pending;
            const cond = conditions[ti.condition] || conditions.good;
            return (
              <div key={ti.id} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ color: theme.text, fontWeight: '700', fontSize: '16px' }}>
                        {[ti.year, ti.make, ti.model, ti.trim].filter(Boolean).join(' ') || 'Unknown Vehicle'}
                      </span>
                      <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600', backgroundColor: `${st.color}20`, color: st.color }}>{st.label}</span>
                      <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '500', backgroundColor: `${cond.color}15`, color: cond.color }}>{cond.label}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '13px', color: theme.textSecondary, flexWrap: 'wrap' }}>
                      {ti.vin && <span>VIN: {ti.vin}</span>}
                      {ti.mileage && <span>{ti.mileage.toLocaleString()} mi</span>}
                      {ti.color && <span>{ti.color}</span>}
                      {cust && <span>Customer: {cust.first_name} {cust.last_name || ''}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <select value={ti.status} onChange={e => updateStatus(ti.id, e.target.value)} style={{ padding: '4px 8px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.textSecondary, fontSize: '12px' }}>
                      {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <button onClick={() => openEdit(ti)} style={{ padding: '6px 10px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.textSecondary, cursor: 'pointer', fontSize: '12px' }}>Edit</button>
                    <button onClick={() => handleDelete(ti.id)} style={{ padding: '6px 10px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}>Del</button>
                  </div>
                </div>

                {/* Valuation Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px', marginTop: '14px' }}>
                  {[
                    { label: 'KBB', value: ti.kbb_value },
                    { label: 'NADA', value: ti.nada_value },
                    { label: 'Market', value: ti.market_value },
                    { label: 'ACV', value: ti.acv, highlight: true },
                    { label: 'Offered', value: ti.offered_value },
                    { label: 'Agreed', value: ti.agreed_value, accent: true }
                  ].map((val, i) => (
                    <div key={i} style={{ padding: '8px', backgroundColor: theme.bg, borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: theme.textMuted }}>{val.label}</div>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: val.accent ? theme.accent : val.highlight ? '#22c55e' : theme.text }}>
                        {val.value ? `$${parseFloat(val.value).toLocaleString()}` : '—'}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Lien Info */}
                {ti.has_lien && (
                  <div style={{ marginTop: '10px', padding: '10px', backgroundColor: 'rgba(239,68,68,0.06)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.15)' }}>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '13px' }}>
                      <span style={{ color: '#ef4444', fontWeight: '600' }}>Lien: {ti.lien_holder || 'Unknown'}</span>
                      {ti.payoff_amount && <span style={{ color: theme.textSecondary }}>Payoff: ${parseFloat(ti.payoff_amount).toLocaleString()}</span>}
                      {ti.negative_equity > 0 && <span style={{ color: '#ef4444', fontWeight: '600' }}>Neg. Equity: ${parseFloat(ti.negative_equity).toLocaleString()}</span>}
                      {ti.payoff_good_through && <span style={{ color: theme.textMuted }}>Good thru: {new Date(ti.payoff_good_through).toLocaleDateString()}</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '640px', maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 style={{ color: theme.text, fontSize: '18px', fontWeight: '700', marginBottom: '20px' }}>{editing ? 'Edit' : 'New'} Trade-In</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Customer</label>
                <select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }}>
                  <option value="">Select...</option>
                  {(customers || []).map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name || ''}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Linked Deal</label>
                <select value={form.deal_id} onChange={e => setForm({ ...form, deal_id: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }}>
                  <option value="">None</option>
                  {(deals || []).map(d => <option key={d.id} value={d.id}>Deal #{d.id} - {d.customer_name || ''}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>VIN</label>
                <input value={form.vin} onChange={e => setForm({ ...form, vin: e.target.value })} placeholder="17-character VIN" style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
              </div>
              {[
                { key: 'year', label: 'Year', type: 'number' },
                { key: 'make', label: 'Make' },
                { key: 'model', label: 'Model' },
                { key: 'trim', label: 'Trim' },
                { key: 'color', label: 'Color' },
                { key: 'mileage', label: 'Mileage', type: 'number' }
              ].map(f => (
                <div key={f.key}>
                  <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>{f.label}</label>
                  <input type={f.type || 'text'} value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
                </div>
              ))}
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Condition</label>
                <select value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }}>
                  {Object.entries(conditions).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Disposition</label>
                <select value={form.disposition} onChange={e => setForm({ ...form, disposition: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }}>
                  {['pending', 'retail', 'wholesale', 'auction', 'parts'].map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                </select>
              </div>
              {/* Valuations */}
              <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${theme.border}`, paddingTop: '12px', marginTop: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: theme.textSecondary }}>Valuations</span>
              </div>
              {[
                { key: 'kbb_value', label: 'KBB Value' },
                { key: 'nada_value', label: 'NADA Value' },
                { key: 'market_value', label: 'Market Value' },
                { key: 'acv', label: 'ACV (Your Assessment)' },
                { key: 'offered_value', label: 'Offered to Customer' }
              ].map(f => (
                <div key={f.key}>
                  <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>{f.label}</label>
                  <input type="number" value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} placeholder="$" style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
                </div>
              ))}
              {/* Lien */}
              <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${theme.border}`, paddingTop: '12px', marginTop: '4px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={form.has_lien} onChange={e => setForm({ ...form, has_lien: e.target.checked })} style={{ accentColor: theme.accent }} />
                  <span style={{ fontSize: '13px', fontWeight: '600', color: theme.textSecondary }}>Has existing lien/payoff</span>
                </label>
              </div>
              {form.has_lien && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Lien Holder</label>
                    <input value={form.lien_holder} onChange={e => setForm({ ...form, lien_holder: e.target.value })} placeholder="Bank/Credit Union" style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Payoff Amount</label>
                    <input type="number" value={form.payoff_amount} onChange={e => setForm({ ...form, payoff_amount: e.target.value })} placeholder="$" style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Good Through</label>
                    <input type="date" value={form.payoff_good_through} onChange={e => setForm({ ...form, payoff_good_through: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
                  </div>
                  {form.payoff_amount && form.acv && (
                    <div style={{ display: 'flex', alignItems: 'center', padding: '10px', backgroundColor: parseFloat(form.payoff_amount) > parseFloat(form.acv) ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', borderRadius: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: parseFloat(form.payoff_amount) > parseFloat(form.acv) ? '#ef4444' : '#22c55e' }}>
                        {parseFloat(form.payoff_amount) > parseFloat(form.acv) ? `Neg. Equity: $${(parseFloat(form.payoff_amount) - parseFloat(form.acv)).toLocaleString()}` : `Equity: $${(parseFloat(form.acv) - parseFloat(form.payoff_amount)).toLocaleString()}`}
                      </span>
                    </div>
                  )}
                </>
              )}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Appraisal Notes</label>
                <textarea value={form.appraisal_notes} onChange={e => setForm({ ...form, appraisal_notes: e.target.value })} rows={3} placeholder="Body damage, mechanical issues, interior condition..." style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => { setShowModal(false); setEditing(null); }} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={!form.make} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: '600', opacity: form.make ? 1 : 0.5 }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
