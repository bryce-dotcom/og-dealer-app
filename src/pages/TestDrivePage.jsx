import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';

export default function TestDrivePage() {
  const { theme } = useTheme();
  const { dealer, inventory, customers, employees } = useStore();
  const dealerId = dealer?.id;

  const [drives, setDrives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [form, setForm] = useState({
    vehicle_id: '', customer_id: '', customer_name: '', customer_phone: '', customer_email: '',
    license_number: '', license_state: '', license_expiry: '', license_verified: false,
    insurance_company: '', insurance_policy: '', insurance_verified: false,
    salesperson_id: '', salesperson_name: '', mileage_out: '', route_notes: '',
    status: 'active',
  });

  useEffect(() => { if (dealerId) loadData(); }, [dealerId]);

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase.from('test_drives').select('*').eq('dealer_id', dealerId).order('started_at', { ascending: false });
    setDrives(data || []);
    setLoading(false);
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
  const formatTime = (d) => d ? new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '-';

  const getVehicleTitle = (vid) => {
    const v = inventory?.find(i => i.id === vid);
    return v ? `${v.year} ${v.make} ${v.model}` : vid;
  };

  const handleStart = async () => {
    if (!form.vehicle_id || !form.customer_name) return;
    const emp = employees?.find(e => e.id === parseInt(form.salesperson_id));
    await supabase.from('test_drives').insert({
      dealer_id: dealerId, vehicle_id: form.vehicle_id,
      customer_id: form.customer_id ? parseInt(form.customer_id) : null,
      customer_name: form.customer_name, customer_phone: form.customer_phone || null,
      customer_email: form.customer_email || null,
      license_number: form.license_number || null, license_state: form.license_state || null,
      license_expiry: form.license_expiry || null, license_verified: form.license_verified,
      insurance_company: form.insurance_company || null, insurance_policy: form.insurance_policy || null,
      insurance_verified: form.insurance_verified,
      salesperson_id: form.salesperson_id ? parseInt(form.salesperson_id) : null,
      salesperson_name: emp?.name || null,
      mileage_out: form.mileage_out ? parseInt(form.mileage_out) : null,
      route_notes: form.route_notes || null,
      status: 'active', started_at: new Date().toISOString(),
    });
    setShowModal(false);
    resetForm();
    loadData();
  };

  const handleEnd = async (drive) => {
    const duration = Math.round((new Date() - new Date(drive.started_at)) / 60000);
    await supabase.from('test_drives').update({
      ended_at: new Date().toISOString(), duration_minutes: duration, status: 'completed',
    }).eq('id', drive.id);
    loadData();
  };

  const handleOutcome = async (drive, outcome) => {
    await supabase.from('test_drives').update({ outcome }).eq('id', drive.id);
    loadData();
  };

  const resetForm = () => setForm({
    vehicle_id: '', customer_id: '', customer_name: '', customer_phone: '', customer_email: '',
    license_number: '', license_state: '', license_expiry: '', license_verified: false,
    insurance_company: '', insurance_policy: '', insurance_verified: false,
    salesperson_id: '', salesperson_name: '', mileage_out: '', route_notes: '', status: 'active',
  });

  const filtered = filterStatus === 'all' ? drives : drives.filter(d => d.status === filterStatus);
  const activeDrives = drives.filter(d => d.status === 'active');
  const todayDrives = drives.filter(d => new Date(d.started_at).toDateString() === new Date().toDateString());
  const interested = drives.filter(d => d.outcome === 'interested' || d.outcome === 'sold');

  const outcomeColors = { pending: theme.textMuted, interested: '#22c55e', not_interested: '#ef4444', follow_up: '#eab308', sold: '#3b82f6', no_show: '#71717a' };

  const card = { backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '20px' };
  const inputStyle = { width: '100%', padding: '10px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box' };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>Loading...</div>;

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ color: theme.text, fontSize: '24px', fontWeight: '700', margin: 0 }}>Test Drive Log</h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', margin: '4px 0 0' }}>Track test drives, verify licenses, and log outcomes</p>
        </div>
        <button onClick={() => { resetForm(); setShowModal(true); }} style={{ padding: '10px 16px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>+ Start Test Drive</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Active Now', val: activeDrives.length, color: activeDrives.length > 0 ? '#22c55e' : theme.text },
          { label: 'Today', val: todayDrives.length, color: '#3b82f6' },
          { label: 'Total Drives', val: drives.length, color: theme.text },
          { label: 'Interested', val: interested.length, color: '#22c55e' },
        ].map((s, i) => (
          <div key={i} style={{ ...card, textAlign: 'center' }}>
            <div style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ color: s.color, fontSize: '20px', fontWeight: '700' }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Active drives alert */}
      {activeDrives.length > 0 && (
        <div style={{ ...card, marginBottom: '20px', borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.05)' }}>
          <div style={{ color: '#22c55e', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Active Test Drives</div>
          {activeDrives.map(d => {
            const mins = Math.round((new Date() - new Date(d.started_at)) / 60000);
            return (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                <div>
                  <span style={{ color: theme.text, fontWeight: '500', fontSize: '13px' }}>{d.customer_name}</span>
                  <span style={{ color: theme.textMuted, fontSize: '12px', marginLeft: '8px' }}>{getVehicleTitle(d.vehicle_id)}</span>
                  <span style={{ color: theme.textMuted, fontSize: '12px', marginLeft: '8px' }}>{mins} min</span>
                </div>
                <button onClick={() => handleEnd(d)} style={{ padding: '4px 12px', backgroundColor: 'rgba(34,197,94,0.15)', border: 'none', borderRadius: '4px', color: '#22c55e', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>End Drive</button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="scheduled">Scheduled</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '40px', color: theme.textMuted }}>No test drives found</div>
      ) : (
        <div style={card}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                {['Date/Time', 'Customer', 'Vehicle', 'Salesperson', 'License', 'Insurance', 'Duration', 'Outcome', ''].map(h => (
                  <th key={h} style={{ padding: '10px 8px', textAlign: 'left', color: theme.textMuted, fontSize: '12px', fontWeight: '600' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '10px 8px' }}>
                    <div style={{ color: theme.text, fontSize: '13px' }}>{formatDate(d.started_at)}</div>
                    <div style={{ color: theme.textMuted, fontSize: '11px' }}>{formatTime(d.started_at)}</div>
                  </td>
                  <td style={{ padding: '10px 8px' }}>
                    <div style={{ color: theme.text, fontSize: '13px', fontWeight: '500' }}>{d.customer_name}</div>
                    {d.customer_phone && <div style={{ color: theme.textMuted, fontSize: '11px' }}>{d.customer_phone}</div>}
                  </td>
                  <td style={{ padding: '10px 8px', color: theme.text, fontSize: '13px' }}>{getVehicleTitle(d.vehicle_id)}</td>
                  <td style={{ padding: '10px 8px', color: theme.textSecondary, fontSize: '13px' }}>{d.salesperson_name || '-'}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <span style={{ padding: '2px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: '600', backgroundColor: d.license_verified ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: d.license_verified ? '#22c55e' : '#ef4444' }}>
                      {d.license_verified ? 'Verified' : 'Unverified'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 8px' }}>
                    <span style={{ padding: '2px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: '600', backgroundColor: d.insurance_verified ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: d.insurance_verified ? '#22c55e' : '#ef4444' }}>
                      {d.insurance_verified ? 'Verified' : 'Unverified'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 8px', color: theme.textSecondary, fontSize: '13px' }}>{d.duration_minutes ? `${d.duration_minutes} min` : d.status === 'active' ? 'In progress' : '-'}</td>
                  <td style={{ padding: '10px 8px' }}>
                    {d.status === 'completed' ? (
                      <select value={d.outcome || 'pending'} onChange={e => handleOutcome(d, e.target.value)} style={{ padding: '4px 8px', backgroundColor: `${outcomeColors[d.outcome] || theme.textMuted}22`, border: 'none', borderRadius: '4px', color: outcomeColors[d.outcome] || theme.textMuted, fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                        <option value="pending">Pending</option>
                        <option value="interested">Interested</option>
                        <option value="not_interested">Not Interested</option>
                        <option value="follow_up">Follow Up</option>
                        <option value="sold">Sold</option>
                      </select>
                    ) : (
                      <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', backgroundColor: d.status === 'active' ? 'rgba(34,197,94,0.15)' : 'rgba(161,161,170,0.15)', color: d.status === 'active' ? '#22c55e' : theme.textMuted }}>{d.status}</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 8px' }}>
                    {d.status === 'active' && (
                      <button onClick={() => handleEnd(d)} style={{ padding: '4px 10px', backgroundColor: 'rgba(34,197,94,0.15)', border: 'none', borderRadius: '4px', color: '#22c55e', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>End</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowModal(false)}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '560px', maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: theme.text, fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Start Test Drive</h3>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Vehicle *</label>
              <select value={form.vehicle_id} onChange={e => setForm(p => ({ ...p, vehicle_id: e.target.value }))} style={inputStyle}>
                <option value="">Select vehicle...</option>
                {(inventory || []).filter(v => v.status === 'In Stock').map(v => <option key={v.id} value={v.id}>{v.year} {v.make} {v.model} - #{v.unit_id}</option>)}
              </select>
            </div>
            <div style={{ color: theme.accent, fontSize: '13px', fontWeight: '600', marginBottom: '12px' }}>CUSTOMER</div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Existing Customer</label>
              <select value={form.customer_id} onChange={e => { const c = customers?.find(x => x.id === parseInt(e.target.value)); setForm(p => ({ ...p, customer_id: e.target.value, customer_name: c?.name || p.customer_name, customer_phone: c?.phone || p.customer_phone, customer_email: c?.email || p.customer_email })); }} style={inputStyle}>
                <option value="">Walk-in / New</option>
                {(customers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {[{ key: 'customer_name', label: 'Name *' }, { key: 'customer_phone', label: 'Phone' }, { key: 'customer_email', label: 'Email' }].map(f => (
              <div key={f.key} style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>{f.label}</label>
                <input type="text" value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
            <div style={{ color: theme.accent, fontSize: '13px', fontWeight: '600', marginBottom: '12px', marginTop: '16px' }}>LICENSE</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              {[{ key: 'license_number', label: 'License #' }, { key: 'license_state', label: 'State' }, { key: 'license_expiry', label: 'Expiry', type: 'date' }].map(f => (
                <div key={f.key}>
                  <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>{f.label}</label>
                  <input type={f.type || 'text'} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
                </div>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: theme.textSecondary, fontSize: '13px', marginBottom: '16px', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.license_verified} onChange={e => setForm(p => ({ ...p, license_verified: e.target.checked }))} /> License verified
            </label>
            <div style={{ color: theme.accent, fontSize: '13px', fontWeight: '600', marginBottom: '12px' }}>INSURANCE</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              {[{ key: 'insurance_company', label: 'Company' }, { key: 'insurance_policy', label: 'Policy #' }].map(f => (
                <div key={f.key}>
                  <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>{f.label}</label>
                  <input type="text" value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
                </div>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: theme.textSecondary, fontSize: '13px', marginBottom: '16px', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.insurance_verified} onChange={e => setForm(p => ({ ...p, insurance_verified: e.target.checked }))} /> Insurance verified
            </label>
            <div style={{ color: theme.accent, fontSize: '13px', fontWeight: '600', marginBottom: '12px' }}>DETAILS</div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Salesperson</label>
              <select value={form.salesperson_id} onChange={e => setForm(p => ({ ...p, salesperson_id: e.target.value }))} style={inputStyle}>
                <option value="">Select...</option>
                {(employees || []).filter(e => e.active).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Mileage Out</label>
              <input type="number" value={form.mileage_out} onChange={e => setForm(p => ({ ...p, mileage_out: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleStart} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Start Drive</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
