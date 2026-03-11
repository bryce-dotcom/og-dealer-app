import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';

export default function WarrantyClaimsPage() {
  const { theme } = useTheme();
  const { dealer } = useStore();
  const dealerId = dealer?.id;

  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingClaim, setEditingClaim] = useState(null);
  const [filter, setFilter] = useState('all');
  const [vehicles, setVehicles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [employees, setEmployees] = useState([]);

  const [form, setForm] = useState({
    vehicle_id: '', customer_id: '', deal_id: '',
    claim_number: '', claim_type: 'warranty', provider: '', provider_claim_number: '',
    mileage_at_claim: '', complaint: '', cause: '', correction: '',
    parts_cost: '0', labor_cost: '0', deductible: '0',
    approved_amount: '', paid_amount: '', dealer_responsibility: '0',
    status: 'draft', denial_reason: '', appeal_notes: '',
    assigned_to: '', notes: ''
  });

  useEffect(() => { if (dealerId) { fetchClaims(); fetchRelated(); } }, [dealerId]);

  const fetchClaims = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('warranty_claims')
      .select('*')
      .eq('dealer_id', dealerId)
      .order('created_at', { ascending: false });
    setClaims(data || []);
    setLoading(false);
  };

  const fetchRelated = async () => {
    const [v, c, e] = await Promise.all([
      supabase.from('inventory').select('id, year, make, model, stock_number').eq('dealer_id', dealerId),
      supabase.from('customers').select('id, first_name, last_name').eq('dealer_id', dealerId),
      supabase.from('employees').select('id, name').eq('dealer_id', dealerId).eq('active', true)
    ]);
    setVehicles(v.data || []);
    setCustomers(c.data || []);
    setEmployees(e.data || []);
  };

  const handleSave = async () => {
    const totalCost = parseFloat(form.parts_cost || 0) + parseFloat(form.labor_cost || 0);
    const payload = {
      dealer_id: dealerId,
      vehicle_id: form.vehicle_id || null,
      customer_id: form.customer_id ? parseInt(form.customer_id) : null,
      deal_id: form.deal_id ? parseInt(form.deal_id) : null,
      claim_number: form.claim_number || null,
      claim_type: form.claim_type,
      provider: form.provider || null,
      provider_claim_number: form.provider_claim_number || null,
      mileage_at_claim: form.mileage_at_claim ? parseInt(form.mileage_at_claim) : null,
      complaint: form.complaint,
      cause: form.cause || null,
      correction: form.correction || null,
      parts_cost: parseFloat(form.parts_cost || 0),
      labor_cost: parseFloat(form.labor_cost || 0),
      total_cost: totalCost,
      deductible: parseFloat(form.deductible || 0),
      approved_amount: form.approved_amount ? parseFloat(form.approved_amount) : null,
      paid_amount: form.paid_amount ? parseFloat(form.paid_amount) : null,
      dealer_responsibility: parseFloat(form.dealer_responsibility || 0),
      status: form.status,
      denial_reason: form.denial_reason || null,
      appeal_notes: form.appeal_notes || null,
      assigned_to: form.assigned_to ? parseInt(form.assigned_to) : null,
      notes: form.notes || null
    };

    if (editingClaim) {
      await supabase.from('warranty_claims').update(payload).eq('id', editingClaim.id);
    } else {
      await supabase.from('warranty_claims').insert(payload);
    }
    setShowModal(false);
    setEditingClaim(null);
    resetForm();
    fetchClaims();
  };

  const resetForm = () => setForm({
    vehicle_id: '', customer_id: '', deal_id: '',
    claim_number: '', claim_type: 'warranty', provider: '', provider_claim_number: '',
    mileage_at_claim: '', complaint: '', cause: '', correction: '',
    parts_cost: '0', labor_cost: '0', deductible: '0',
    approved_amount: '', paid_amount: '', dealer_responsibility: '0',
    status: 'draft', denial_reason: '', appeal_notes: '',
    assigned_to: '', notes: ''
  });

  const openEdit = (claim) => {
    setEditingClaim(claim);
    setForm({
      vehicle_id: claim.vehicle_id || '',
      customer_id: claim.customer_id?.toString() || '',
      deal_id: claim.deal_id?.toString() || '',
      claim_number: claim.claim_number || '',
      claim_type: claim.claim_type || 'warranty',
      provider: claim.provider || '',
      provider_claim_number: claim.provider_claim_number || '',
      mileage_at_claim: claim.mileage_at_claim?.toString() || '',
      complaint: claim.complaint || '',
      cause: claim.cause || '',
      correction: claim.correction || '',
      parts_cost: claim.parts_cost?.toString() || '0',
      labor_cost: claim.labor_cost?.toString() || '0',
      deductible: claim.deductible?.toString() || '0',
      approved_amount: claim.approved_amount?.toString() || '',
      paid_amount: claim.paid_amount?.toString() || '',
      dealer_responsibility: claim.dealer_responsibility?.toString() || '0',
      status: claim.status || 'draft',
      denial_reason: claim.denial_reason || '',
      appeal_notes: claim.appeal_notes || '',
      assigned_to: claim.assigned_to?.toString() || '',
      notes: claim.notes || ''
    });
    setShowModal(true);
  };

  const updateStatus = async (id, status) => {
    const updates = { status };
    if (status === 'submitted') updates.submitted_at = new Date().toISOString();
    if (status === 'approved') updates.approved_at = new Date().toISOString();
    if (status === 'denied') updates.denied_at = new Date().toISOString();
    if (status === 'paid') updates.paid_at = new Date().toISOString();
    if (status === 'completed') updates.completed_at = new Date().toISOString();
    await supabase.from('warranty_claims').update(updates).eq('id', id);
    fetchClaims();
  };

  const deleteClaim = async (id) => {
    if (!confirm('Delete this claim?')) return;
    await supabase.from('warranty_claims').delete().eq('id', id);
    fetchClaims();
  };

  const statusColors = {
    draft: '#71717a', submitted: '#3b82f6', under_review: '#f59e0b',
    approved: '#22c55e', denied: '#ef4444', paid: '#06b6d4',
    completed: '#8b5cf6', appealed: '#f97316'
  };

  const claimTypes = {
    warranty: 'Warranty', goodwill: 'Goodwill', recall: 'Recall',
    service_contract: 'Service Contract', gap: 'GAP'
  };

  const filtered = filter === 'all' ? claims : claims.filter(c => c.status === filter);
  const getVehicle = (id) => vehicles.find(v => v.id === id);
  const getCustomer = (id) => customers.find(c => c.id === id);

  const stats = {
    total: claims.length,
    open: claims.filter(c => !['completed', 'denied', 'paid'].includes(c.status)).length,
    totalCost: claims.reduce((s, c) => s + parseFloat(c.total_cost || 0), 0),
    totalPaid: claims.reduce((s, c) => s + parseFloat(c.paid_amount || 0), 0),
    dealerResp: claims.reduce((s, c) => s + parseFloat(c.dealer_responsibility || 0), 0)
  };

  const inputStyle = {
    width: '100%', padding: '8px 12px', backgroundColor: theme.bg,
    border: `1px solid ${theme.border}`, borderRadius: '8px',
    color: theme.text, fontSize: '14px'
  };
  const labelStyle = { display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '4px' };

  const statusPipeline = ['draft', 'submitted', 'under_review', 'approved', 'denied', 'paid', 'completed', 'appealed'];

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>Warranty Claims</h1>
          <p style={{ color: theme.textSecondary, fontSize: '14px', margin: '4px 0 0' }}>Track warranty claims, approvals, and payments</p>
        </div>
        <button onClick={() => { resetForm(); setEditingClaim(null); setShowModal(true); }} style={{
          padding: '10px 20px', backgroundColor: theme.accent, color: '#fff',
          border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px'
        }}>+ New Claim</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total Claims', value: stats.total, color: theme.accent },
          { label: 'Open Claims', value: stats.open, color: '#3b82f6' },
          { label: 'Total Cost', value: `$${stats.totalCost.toLocaleString()}`, color: '#ef4444' },
          { label: 'Total Paid', value: `$${stats.totalPaid.toLocaleString()}`, color: '#22c55e' },
          { label: 'Dealer Cost', value: `$${stats.dealerResp.toLocaleString()}`, color: '#f59e0b' }
        ].map((s, i) => (
          <div key={i} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: theme.textSecondary }}>{s.label}</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Status Pipeline */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
        <button onClick={() => setFilter('all')} style={{
          padding: '6px 14px', borderRadius: '20px', border: `1px solid ${filter === 'all' ? theme.accent : theme.border}`,
          backgroundColor: filter === 'all' ? theme.accentBg : 'transparent', color: filter === 'all' ? theme.accent : theme.textSecondary,
          cursor: 'pointer', fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap'
        }}>All ({claims.length})</button>
        {statusPipeline.map(s => {
          const count = claims.filter(c => c.status === s).length;
          return (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: '6px 14px', borderRadius: '20px', border: `1px solid ${filter === s ? statusColors[s] : theme.border}`,
              backgroundColor: filter === s ? statusColors[s] + '22' : 'transparent',
              color: filter === s ? statusColors[s] : theme.textSecondary,
              cursor: 'pointer', fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap'
            }}>{s.replace(/_/g, ' ')} ({count})</button>
          );
        })}
      </div>

      {/* Claims Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: theme.textSecondary }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted, backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
          No claims found
        </div>
      ) : (
        <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                {['Claim #', 'Vehicle', 'Customer', 'Type', 'Complaint', 'Cost', 'Paid', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px', textAlign: 'left', color: theme.textSecondary, fontWeight: '600', fontSize: '12px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(claim => {
                const veh = getVehicle(claim.vehicle_id);
                const cust = getCustomer(claim.customer_id);
                return (
                  <tr key={claim.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: theme.text }}>{claim.claim_number || '-'}</td>
                    <td style={{ padding: '12px', color: theme.text }}>
                      {veh ? `${veh.year} ${veh.make} ${veh.model}` : claim.vehicle_id?.substring(0, 8) || '-'}
                    </td>
                    <td style={{ padding: '12px', color: theme.textSecondary }}>
                      {cust ? `${cust.first_name} ${cust.last_name}` : '-'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '12px', backgroundColor: theme.accentBg, color: theme.accent }}>
                        {claimTypes[claim.claim_type] || claim.claim_type}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: theme.textSecondary, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {claim.complaint}
                    </td>
                    <td style={{ padding: '12px', color: theme.text, fontWeight: '500' }}>${parseFloat(claim.total_cost || 0).toLocaleString()}</td>
                    <td style={{ padding: '12px', color: '#22c55e', fontWeight: '500' }}>
                      {claim.paid_amount ? `$${parseFloat(claim.paid_amount).toLocaleString()}` : '-'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <select
                        value={claim.status}
                        onChange={(e) => updateStatus(claim.id, e.target.value)}
                        style={{
                          padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                          backgroundColor: (statusColors[claim.status] || '#71717a') + '22',
                          color: statusColors[claim.status] || '#71717a',
                          border: `1px solid ${statusColors[claim.status] || '#71717a'}44`, cursor: 'pointer'
                        }}
                      >
                        {statusPipeline.map(s => (
                          <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => openEdit(claim)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '13px' }}>Edit</button>
                        <button onClick={() => deleteClaim(claim.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '13px' }}>Del</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, width: '100%', maxWidth: '700px', maxHeight: '85vh', overflow: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: theme.text, margin: 0 }}>
                {editingClaim ? 'Edit Claim' : 'New Warranty Claim'}
              </h2>
              <button onClick={() => { setShowModal(false); setEditingClaim(null); }} style={{ background: 'none', border: 'none', color: theme.textSecondary, cursor: 'pointer', fontSize: '20px' }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Vehicle *</label>
                <select value={form.vehicle_id} onChange={e => setForm({ ...form, vehicle_id: e.target.value })} style={inputStyle}>
                  <option value="">Select vehicle</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.stock_number} - {v.year} {v.make} {v.model}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Customer</label>
                <select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} style={inputStyle}>
                  <option value="">Select customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Claim Number</label>
                <input value={form.claim_number} onChange={e => setForm({ ...form, claim_number: e.target.value })} style={inputStyle} placeholder="CLM-001" />
              </div>
              <div>
                <label style={labelStyle}>Claim Type</label>
                <select value={form.claim_type} onChange={e => setForm({ ...form, claim_type: e.target.value })} style={inputStyle}>
                  {Object.entries(claimTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Provider</label>
                <input value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} style={inputStyle} placeholder="Warranty provider" />
              </div>
              <div>
                <label style={labelStyle}>Provider Claim #</label>
                <input value={form.provider_claim_number} onChange={e => setForm({ ...form, provider_claim_number: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Mileage at Claim</label>
                <input type="number" value={form.mileage_at_claim} onChange={e => setForm({ ...form, mileage_at_claim: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Assigned To</label>
                <select value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} style={inputStyle}>
                  <option value="">Unassigned</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Complaint *</label>
                <textarea value={form.complaint} onChange={e => setForm({ ...form, complaint: e.target.value })} style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} placeholder="Describe the issue" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Cause</label>
                <textarea value={form.cause} onChange={e => setForm({ ...form, cause: e.target.value })} style={{ ...inputStyle, minHeight: '50px', resize: 'vertical' }} placeholder="Root cause" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Correction</label>
                <textarea value={form.correction} onChange={e => setForm({ ...form, correction: e.target.value })} style={{ ...inputStyle, minHeight: '50px', resize: 'vertical' }} placeholder="What was done to fix it" />
              </div>

              <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${theme.border}`, paddingTop: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>Costs & Payment</h3>
              </div>
              <div>
                <label style={labelStyle}>Parts Cost</label>
                <input type="number" step="0.01" value={form.parts_cost} onChange={e => setForm({ ...form, parts_cost: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Labor Cost</label>
                <input type="number" step="0.01" value={form.labor_cost} onChange={e => setForm({ ...form, labor_cost: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Deductible</label>
                <input type="number" step="0.01" value={form.deductible} onChange={e => setForm({ ...form, deductible: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Approved Amount</label>
                <input type="number" step="0.01" value={form.approved_amount} onChange={e => setForm({ ...form, approved_amount: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Paid Amount</label>
                <input type="number" step="0.01" value={form.paid_amount} onChange={e => setForm({ ...form, paid_amount: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Dealer Responsibility</label>
                <input type="number" step="0.01" value={form.dealer_responsibility} onChange={e => setForm({ ...form, dealer_responsibility: e.target.value })} style={inputStyle} />
              </div>

              {editingClaim && (
                <>
                  <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${theme.border}`, paddingTop: '16px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>Status & Resolution</h3>
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={inputStyle}>
                      {statusPipeline.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Denial Reason</label>
                    <textarea value={form.denial_reason} onChange={e => setForm({ ...form, denial_reason: e.target.value })} style={{ ...inputStyle, minHeight: '50px', resize: 'vertical' }} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Appeal Notes</label>
                    <textarea value={form.appeal_notes} onChange={e => setForm({ ...form, appeal_notes: e.target.value })} style={{ ...inputStyle, minHeight: '50px', resize: 'vertical' }} />
                  </div>
                </>
              )}

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...inputStyle, minHeight: '50px', resize: 'vertical' }} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <button onClick={() => { setShowModal(false); setEditingClaim(null); }} style={{
                padding: '10px 20px', backgroundColor: 'transparent', color: theme.textSecondary,
                border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer', fontSize: '14px'
              }}>Cancel</button>
              <button onClick={handleSave} disabled={!form.vehicle_id || !form.complaint} style={{
                padding: '10px 20px', backgroundColor: theme.accent, color: '#fff',
                border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px',
                opacity: (!form.vehicle_id || !form.complaint) ? 0.5 : 1
              }}>{editingClaim ? 'Update' : 'Create'} Claim</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}