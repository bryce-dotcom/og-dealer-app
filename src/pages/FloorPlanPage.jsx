import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';

export default function FloorPlanPage() {
  const { theme } = useTheme();
  const { dealerId, inventory } = useStore();
  // Today's LOCAL date as YYYY-MM-DD (toISOString gives the UTC date)
  const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  const [activeTab, setActiveTab] = useState('vehicles');
  const [lenders, setLenders] = useState([]);
  const [floorPlans, setFloorPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLenderModal, setShowLenderModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLender, setEditingLender] = useState(null);
  const [lenderForm, setLenderForm] = useState({ lender_name: '', contact_name: '', contact_phone: '', contact_email: '', account_number: '', interest_rate: '', max_days: '90', credit_line: '' });
  const [addForm, setAddForm] = useState({ vehicle_id: '', lender_id: '', advance_amount: '', interest_rate: '', funded_date: localToday() });
  const [filterLender, setFilterLender] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active');

  useEffect(() => { if (dealerId) loadData(); }, [dealerId]);

  const loadData = async () => {
    setLoading(true);
    const [lRes, fpRes] = await Promise.all([
      supabase.from('floor_plan_lenders').select('*').eq('dealer_id', dealerId).order('lender_name'),
      supabase.from('floor_plan_vehicles').select('*').eq('dealer_id', dealerId).order('funded_date', { ascending: false }),
    ]);
    setLenders(lRes.data || []);
    setFloorPlans(fpRes.data || []);
    setLoading(false);
  };

  const formatCurrency = (amt) => amt == null ? '-' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amt);
  // Date-only values (YYYY-MM-DD) are parsed as LOCAL dates so they don't show as the day before
  const formatDate = (d) => d ? new Date(typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T00:00:00' : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';

  const getVehicleTitle = (vid) => {
    const v = inventory?.find(i => i.id === vid);
    return v ? [v.year, v.make, v.model].filter(Boolean).join(' ') + (v.stock_number ? ` #${v.stock_number}` : '') : vid;
  };

  const getDaysOnPlan = (fundedDate) => {
    if (!fundedDate) return 0;
    return Math.floor((new Date() - new Date(fundedDate)) / 86400000);
  };

  const calcInterest = (amount, rate, fundedDate) => {
    if (!amount || !rate || !fundedDate) return 0;
    const days = getDaysOnPlan(fundedDate);
    return Math.round(amount * (rate / 100 / 365) * days * 100) / 100;
  };

  const handleSaveLender = async () => {
    if (!lenderForm.lender_name) { alert('Lender Name is required.'); return; }
    const payload = {
      dealer_id: dealerId,
      lender_name: lenderForm.lender_name,
      contact_name: lenderForm.contact_name || null,
      contact_phone: lenderForm.contact_phone || null,
      contact_email: lenderForm.contact_email || null,
      account_number: lenderForm.account_number || null,
      interest_rate: lenderForm.interest_rate ? parseFloat(lenderForm.interest_rate) : null,
      max_days: parseInt(lenderForm.max_days) || 90,
      credit_line: lenderForm.credit_line ? parseFloat(lenderForm.credit_line) : null,
    };
    const { error } = editingLender
      ? await supabase.from('floor_plan_lenders').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingLender.id).eq('dealer_id', dealerId)
      : await supabase.from('floor_plan_lenders').insert(payload);
    if (error) { alert('Failed to save lender: ' + error.message); return; }
    setShowLenderModal(false);
    setEditingLender(null);
    setLenderForm({ lender_name: '', contact_name: '', contact_phone: '', contact_email: '', account_number: '', interest_rate: '', max_days: '90', credit_line: '' });
    loadData();
  };

  const handleAddFloorPlan = async () => {
    const missing = [];
    if (!addForm.vehicle_id) missing.push('Vehicle');
    if (!addForm.lender_id) missing.push('Lender');
    if (!addForm.advance_amount) missing.push('Advance Amount');
    if (!addForm.funded_date) missing.push('Funded Date');
    if (missing.length) { alert('Please fill in: ' + missing.join(', ')); return; }
    const lender = lenders.find(l => l.id === addForm.lender_id);
    const { error } = await supabase.from('floor_plan_vehicles').insert({
      dealer_id: dealerId,
      vehicle_id: addForm.vehicle_id,
      lender_id: addForm.lender_id,
      advance_amount: parseFloat(addForm.advance_amount),
      interest_rate: addForm.interest_rate ? parseFloat(addForm.interest_rate) : (lender?.interest_rate || null),
      funded_date: addForm.funded_date,
      status: 'active',
    });
    if (error) { alert('Failed to add floor plan vehicle: ' + error.message); return; }
    setShowAddModal(false);
    setAddForm({ vehicle_id: '', lender_id: '', advance_amount: '', interest_rate: '', funded_date: localToday() });
    loadData();
  };

  const handlePayoff = async (fp) => {
    const payoffAmount = parseFloat(fp.advance_amount) + calcInterest(fp.advance_amount, fp.interest_rate, fp.funded_date);
    if (!confirm(`Mark ${getVehicleTitle(fp.vehicle_id)} as paid off for ${formatCurrency(payoffAmount)}?\n\nThis only updates your records in OG Dealer. It does not send any payment to the lender.`)) return;
    const { error } = await supabase.from('floor_plan_vehicles').update({
      paid_off: true,
      paid_off_date: localToday(),
      paid_off_amount: payoffAmount,
      status: 'paid_off',
      updated_at: new Date().toISOString(),
    }).eq('id', fp.id).eq('dealer_id', dealerId);
    if (error) { alert('Failed to mark paid off: ' + error.message); return; }
    loadData();
  };

  const filtered = floorPlans.filter(fp => {
    if (filterLender !== 'all' && fp.lender_id !== filterLender) return false;
    if (filterStatus !== 'all' && fp.status !== filterStatus) return false;
    return true;
  });

  const activeFloorPlans = floorPlans.filter(fp => fp.status === 'active');
  const totalAdvanced = activeFloorPlans.reduce((s, fp) => s + (parseFloat(fp.advance_amount) || 0), 0);
  const totalInterest = activeFloorPlans.reduce((s, fp) => s + calcInterest(fp.advance_amount, fp.interest_rate, fp.funded_date), 0);
  const totalCreditLine = lenders.filter(l => l.active).reduce((s, l) => s + (parseFloat(l.credit_line) || 0), 0);

  const card = { backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '20px' };
  const inputStyle = { width: '100%', padding: '10px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box' };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>Loading...</div>;

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ color: theme.text, fontSize: '24px', fontWeight: '700', margin: 0 }}>Floor Plan Management</h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', margin: '4px 0 0' }}>A floor plan is a loan from a lender used to buy inventory. Track which cars are on it, how long, and the interest building up.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => { setEditingLender(null); setLenderForm({ lender_name: '', contact_name: '', contact_phone: '', contact_email: '', account_number: '', interest_rate: '', max_days: '90', credit_line: '' }); setShowLenderModal(true); }} style={{ padding: '10px 16px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer', fontSize: '13px' }}>
            + Lender
          </button>
          <button onClick={() => setShowAddModal(true)} style={{ padding: '10px 16px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
            + Floor Plan Vehicle
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Active Vehicles', val: activeFloorPlans.length, color: theme.text },
          { label: 'Total Advanced', val: formatCurrency(totalAdvanced), color: theme.accent, tip: 'Advance: the amount the lender paid out for each car' },
          { label: 'Accrued Interest', val: formatCurrency(totalInterest), color: '#ef4444', tip: 'Estimated interest built up so far (advance x rate x days on plan)' },
          { label: 'Total Exposure', val: formatCurrency(totalAdvanced + totalInterest), color: '#eab308', tip: 'What you would owe if you paid everything off today' },
          { label: 'Credit Available', val: formatCurrency(Math.max(0, totalCreditLine - totalAdvanced)), color: '#22c55e', tip: 'Credit line minus what is currently advanced' },
        ].map((s, i) => (
          <div key={i} title={s.tip} style={{ ...card, textAlign: 'center' }}>
            <div style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ color: s.color, fontSize: '20px', fontWeight: '700' }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: `1px solid ${theme.border}` }}>
        {['vehicles', 'lenders'].map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '500', textTransform: 'capitalize',
            color: activeTab === t ? theme.accent : theme.textSecondary,
            borderBottom: activeTab === t ? `2px solid ${theme.accent}` : '2px solid transparent',
            marginBottom: '-1px',
          }}>{t}</button>
        ))}
      </div>

      {activeTab === 'vehicles' && (
        <>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <select value={filterLender} onChange={e => setFilterLender(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="all">All Lenders</option>
              {lenders.map(l => <option key={l.id} value={l.id}>{l.lender_name}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="paid_off">Paid Off</option>
              <option value="curtailed">Curtailed</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '40px', color: theme.textMuted }}>
              {floorPlans.length === 0
                ? (lenders.length === 0 ? 'No floor plan vehicles yet. First click "+ Lender" to add your floor plan lender, then "+ Floor Plan Vehicle" to add each car it paid for.' : 'No floor plan vehicles yet. Click "+ Floor Plan Vehicle" to add a car your lender paid for.')
                : 'No floor plan vehicles match these filters.'}
            </div>
          ) : (
            <div style={card}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                    {['Vehicle', 'Lender', 'Funded', 'Days', 'Advanced', 'Rate', 'Interest', 'Total Owed', 'Status', ''].map(h => (
                      <th key={h} title={h === 'Days' ? 'Days on plan. Turns red once past the lender\'s Max Days' : h === 'Advanced' ? 'Advance: the amount the lender paid out for this car' : undefined} style={{ padding: '10px 8px', textAlign: 'left', color: theme.textMuted, fontSize: '12px', fontWeight: '600' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(fp => {
                    const days = getDaysOnPlan(fp.funded_date);
                    const interest = calcInterest(fp.advance_amount, fp.interest_rate, fp.funded_date);
                    const lender = lenders.find(l => l.id === fp.lender_id);
                    const maxDays = lender?.max_days || 90;
                    const overdue = days > maxDays;
                    return (
                      <tr key={fp.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                        <td style={{ padding: '10px 8px', color: theme.text, fontSize: '13px', fontWeight: '500' }}>{getVehicleTitle(fp.vehicle_id)}</td>
                        <td style={{ padding: '10px 8px', color: theme.textSecondary, fontSize: '13px' }}>{lender?.lender_name || '-'}</td>
                        <td style={{ padding: '10px 8px', color: theme.textSecondary, fontSize: '13px' }}>{formatDate(fp.funded_date)}</td>
                        <td style={{ padding: '10px 8px', fontSize: '13px', fontWeight: '600', color: overdue ? '#ef4444' : days > 60 ? '#eab308' : theme.text }}>{days}</td>
                        <td style={{ padding: '10px 8px', color: theme.text, fontSize: '13px', fontWeight: '500' }}>{formatCurrency(fp.advance_amount)}</td>
                        <td style={{ padding: '10px 8px', color: theme.textSecondary, fontSize: '13px' }}>{fp.interest_rate}%</td>
                        <td style={{ padding: '10px 8px', color: '#ef4444', fontSize: '13px', fontWeight: '500' }}>{formatCurrency(interest)}</td>
                        <td style={{ padding: '10px 8px', color: theme.accent, fontSize: '13px', fontWeight: '600' }}>{formatCurrency(parseFloat(fp.advance_amount) + interest)}</td>
                        <td style={{ padding: '10px 8px' }}>
                          <span style={{
                            padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                            backgroundColor: fp.status === 'active' ? 'rgba(34,197,94,0.15)' : fp.status === 'paid_off' ? 'rgba(59,130,246,0.15)' : 'rgba(239,68,68,0.15)',
                            color: fp.status === 'active' ? '#22c55e' : fp.status === 'paid_off' ? '#3b82f6' : '#ef4444',
                          }}>{fp.status}</span>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          {fp.status === 'active' && (
                            <button onClick={() => handlePayoff(fp)} title="Record that this car's floor plan loan was paid off (does not send money)" style={{ padding: '4px 10px', backgroundColor: 'rgba(34,197,94,0.15)', border: 'none', borderRadius: '4px', color: '#22c55e', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>Pay Off</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {activeTab === 'lenders' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {lenders.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '40px', color: theme.textMuted, gridColumn: '1 / -1' }}>No lenders yet. Click "+ Lender" to add the bank or company that finances your inventory.</div>
          ) : lenders.map(l => {
            const lenderVehicles = floorPlans.filter(fp => fp.lender_id === l.id && fp.status === 'active');
            const lenderBalance = lenderVehicles.reduce((s, fp) => s + (parseFloat(fp.advance_amount) || 0), 0);
            const utilization = l.credit_line ? Math.round((lenderBalance / parseFloat(l.credit_line)) * 100) : 0;
            return (
              <div key={l.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                  <div>
                    <div style={{ color: theme.text, fontSize: '16px', fontWeight: '600' }}>{l.lender_name}</div>
                    <div style={{ color: theme.textMuted, fontSize: '12px' }}>Acct: {l.account_number || 'N/A'}</div>
                  </div>
                  <button onClick={() => { setEditingLender(l); setLenderForm({ lender_name: l.lender_name, contact_name: l.contact_name || '', contact_phone: l.contact_phone || '', contact_email: l.contact_email || '', account_number: l.account_number || '', interest_rate: l.interest_rate?.toString() || '', max_days: l.max_days?.toString() || '90', credit_line: l.credit_line?.toString() || '' }); setShowLenderModal(true); }} style={{ padding: '4px 10px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '4px', color: theme.textSecondary, cursor: 'pointer', fontSize: '11px' }}>Edit</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div><div style={{ color: theme.textMuted, fontSize: '11px' }}>Rate</div><div style={{ color: theme.text, fontSize: '14px', fontWeight: '600' }}>{l.interest_rate || 0}%</div></div>
                  <div title="Max days: how long a car can stay on the plan before the lender wants it paid off"><div style={{ color: theme.textMuted, fontSize: '11px' }}>Max Days</div><div style={{ color: theme.text, fontSize: '14px', fontWeight: '600' }}>{l.max_days || 90}</div></div>
                  <div><div style={{ color: theme.textMuted, fontSize: '11px' }}>Credit Line</div><div style={{ color: theme.text, fontSize: '14px', fontWeight: '600' }}>{formatCurrency(l.credit_line)}</div></div>
                  <div><div style={{ color: theme.textMuted, fontSize: '11px' }}>Vehicles</div><div style={{ color: theme.text, fontSize: '14px', fontWeight: '600' }}>{lenderVehicles.length}</div></div>
                </div>
                {l.credit_line && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ color: theme.textMuted, fontSize: '11px' }}>Utilization</span>
                      <span style={{ color: utilization > 80 ? '#ef4444' : theme.text, fontSize: '11px', fontWeight: '600' }}>{utilization}%</span>
                    </div>
                    <div style={{ height: '6px', backgroundColor: theme.border, borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, utilization)}%`, backgroundColor: utilization > 80 ? '#ef4444' : utilization > 60 ? '#eab308' : '#22c55e', borderRadius: '3px' }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Lender Modal */}
      {showLenderModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowLenderModal(false)}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '480px', maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: theme.text, fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>{editingLender ? 'Edit Lender' : 'Add Lender'}</h3>
            {[
              { key: 'lender_name', label: 'Lender Name *', type: 'text' },
              { key: 'account_number', label: 'Account Number', type: 'text' },
              { key: 'contact_name', label: 'Contact Name', type: 'text' },
              { key: 'contact_phone', label: 'Contact Phone', type: 'text' },
              { key: 'contact_email', label: 'Contact Email', type: 'email' },
              { key: 'interest_rate', label: 'Interest Rate (%)', type: 'number', help: 'Yearly interest rate the lender charges' },
              { key: 'max_days', label: 'Max Days', type: 'number', help: 'How long a car can stay on the plan before it must be paid off' },
              { key: 'credit_line', label: 'Credit Line ($)', type: 'number', help: 'The most the lender will lend you in total' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>{f.label}</label>
                <input type={f.type} value={lenderForm[f.key]} onChange={e => setLenderForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
                {f.help && <div style={{ color: theme.textMuted, fontSize: '11px', marginTop: '3px' }}>{f.help}</div>}
              </div>
            ))}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setShowLenderModal(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleSaveLender} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Floor Plan Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowAddModal(false)}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '480px', maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: theme.text, fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Add Vehicle to Floor Plan</h3>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Vehicle *</label>
              <select value={addForm.vehicle_id} onChange={e => setAddForm(p => ({ ...p, vehicle_id: e.target.value }))} style={inputStyle}>
                <option value="">Select vehicle...</option>
                {(inventory || []).filter(v => ['In Stock', 'For Sale'].includes(v.status)).map(v => (
                  <option key={v.id} value={v.id}>{v.year} {v.make} {v.model}{v.stock_number ? ` - #${v.stock_number}` : ''}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Lender *</label>
              <select value={addForm.lender_id} onChange={e => { const l = lenders.find(x => x.id === e.target.value); setAddForm(p => ({ ...p, lender_id: e.target.value, interest_rate: l?.interest_rate?.toString() || p.interest_rate })); }} style={inputStyle}>
                <option value="">Select lender...</option>
                {lenders.filter(l => l.active).map(l => <option key={l.id} value={l.id}>{l.lender_name}</option>)}
              </select>
              {lenders.filter(l => l.active).length === 0 && <div style={{ color: theme.textMuted, fontSize: '11px', marginTop: '3px' }}>No lenders yet. Close this and click "+ Lender" first.</div>}
            </div>
            {[
              { key: 'advance_amount', label: 'Advance Amount ($) *', type: 'number', help: 'The amount the lender paid out for this car' },
              { key: 'interest_rate', label: 'Interest Rate (%)', type: 'number', help: 'Defaults to the lender\'s rate' },
              { key: 'funded_date', label: 'Funded Date *', type: 'date', help: 'The day the lender paid for the car. Interest counts from here.' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>{f.label}</label>
                <input type={f.type} value={addForm[f.key]} onChange={e => setAddForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
                {f.help && <div style={{ color: theme.textMuted, fontSize: '11px', marginTop: '3px' }}>{f.help}</div>}
              </div>
            ))}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setShowAddModal(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleAddFloorPlan} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
