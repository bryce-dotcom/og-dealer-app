import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';

export default function TitleTrackingPage() {
  const { theme } = useTheme();
  const { dealer, inventory, employees } = useStore();
  const dealerId = dealer?.id;

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterReg, setFilterReg] = useState('all');
  const [form, setForm] = useState({
    vehicle_id: '', title_number: '', title_state: '', title_status: 'pending',
    title_received_date: '', sent_to_dmv_date: '', new_title_issued_date: '',
    lien_holder: '', lien_release_received: false, lien_release_date: '',
    registration_status: 'pending', registration_expiry: '', plate_number: '', plate_type: '',
    temp_tag_number: '', temp_tag_issued: '', temp_tag_expiry: '',
    title_fee: '', registration_fee: '', plate_fee: '', sales_tax: '',
    assigned_to: '', notes: '', problem_description: '',
  });

  const titleStatuses = [
    { value: 'pending', label: 'Pending', color: '#eab308' },
    { value: 'received', label: 'Received', color: '#3b82f6' },
    { value: 'at_dmv', label: 'At DMV', color: '#8b5cf6' },
    { value: 'processing', label: 'Processing', color: '#f97316' },
    { value: 'issued', label: 'Issued', color: '#22c55e' },
    { value: 'mailed', label: 'Mailed', color: '#06b6d4' },
    { value: 'delivered', label: 'Delivered', color: '#22c55e' },
    { value: 'held', label: 'Held', color: '#eab308' },
    { value: 'problem', label: 'Problem', color: '#ef4444' },
  ];

  const regStatuses = [
    { value: 'pending', label: 'Pending' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'processing', label: 'Processing' },
    { value: 'completed', label: 'Completed' },
    { value: 'expired', label: 'Expired' },
  ];

  useEffect(() => { if (dealerId) loadData(); }, [dealerId]);

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase.from('title_tracking').select('*').eq('dealer_id', dealerId).order('created_at', { ascending: false });
    setRecords(data || []);
    setLoading(false);
  };

  const formatCurrency = (amt) => amt == null ? '-' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amt);
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';

  const getVehicleTitle = (vid) => {
    const v = inventory?.find(i => i.id === vid);
    return v ? `${v.year} ${v.make} ${v.model}` : vid;
  };

  const handleSave = async () => {
    if (!form.vehicle_id) return;
    const totalFees = (parseFloat(form.title_fee) || 0) + (parseFloat(form.registration_fee) || 0) + (parseFloat(form.plate_fee) || 0) + (parseFloat(form.sales_tax) || 0);
    const payload = {
      dealer_id: dealerId,
      vehicle_id: form.vehicle_id,
      title_number: form.title_number || null,
      title_state: form.title_state || null,
      title_status: form.title_status,
      title_received_date: form.title_received_date || null,
      sent_to_dmv_date: form.sent_to_dmv_date || null,
      new_title_issued_date: form.new_title_issued_date || null,
      lien_holder: form.lien_holder || null,
      lien_release_received: form.lien_release_received,
      lien_release_date: form.lien_release_date || null,
      registration_status: form.registration_status,
      registration_expiry: form.registration_expiry || null,
      plate_number: form.plate_number || null,
      plate_type: form.plate_type || null,
      temp_tag_number: form.temp_tag_number || null,
      temp_tag_issued: form.temp_tag_issued || null,
      temp_tag_expiry: form.temp_tag_expiry || null,
      title_fee: form.title_fee ? parseFloat(form.title_fee) : null,
      registration_fee: form.registration_fee ? parseFloat(form.registration_fee) : null,
      plate_fee: form.plate_fee ? parseFloat(form.plate_fee) : null,
      sales_tax: form.sales_tax ? parseFloat(form.sales_tax) : null,
      total_fees: totalFees || null,
      assigned_to: form.assigned_to ? parseInt(form.assigned_to) : null,
      notes: form.notes || null,
      problem_description: form.problem_description || null,
    };
    if (editing) {
      await supabase.from('title_tracking').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('title_tracking').insert(payload);
    }
    setShowModal(false);
    setEditing(null);
    resetForm();
    loadData();
  };

  const resetForm = () => setForm({
    vehicle_id: '', title_number: '', title_state: '', title_status: 'pending',
    title_received_date: '', sent_to_dmv_date: '', new_title_issued_date: '',
    lien_holder: '', lien_release_received: false, lien_release_date: '',
    registration_status: 'pending', registration_expiry: '', plate_number: '', plate_type: '',
    temp_tag_number: '', temp_tag_issued: '', temp_tag_expiry: '',
    title_fee: '', registration_fee: '', plate_fee: '', sales_tax: '',
    assigned_to: '', notes: '', problem_description: '',
  });

  const handleEdit = (r) => {
    setEditing(r);
    setForm({
      vehicle_id: r.vehicle_id,
      title_number: r.title_number || '',
      title_state: r.title_state || '',
      title_status: r.title_status || 'pending',
      title_received_date: r.title_received_date || '',
      sent_to_dmv_date: r.sent_to_dmv_date || '',
      new_title_issued_date: r.new_title_issued_date || '',
      lien_holder: r.lien_holder || '',
      lien_release_received: r.lien_release_received || false,
      lien_release_date: r.lien_release_date || '',
      registration_status: r.registration_status || 'pending',
      registration_expiry: r.registration_expiry || '',
      plate_number: r.plate_number || '',
      plate_type: r.plate_type || '',
      temp_tag_number: r.temp_tag_number || '',
      temp_tag_issued: r.temp_tag_issued || '',
      temp_tag_expiry: r.temp_tag_expiry || '',
      title_fee: r.title_fee?.toString() || '',
      registration_fee: r.registration_fee?.toString() || '',
      plate_fee: r.plate_fee?.toString() || '',
      sales_tax: r.sales_tax?.toString() || '',
      assigned_to: r.assigned_to?.toString() || '',
      notes: r.notes || '',
      problem_description: r.problem_description || '',
    });
    setShowModal(true);
  };

  const handleUpdateStatus = async (id, newStatus) => {
    const updates = { title_status: newStatus };
    if (newStatus === 'received') updates.title_received_date = new Date().toISOString().split('T')[0];
    if (newStatus === 'at_dmv') updates.sent_to_dmv_date = new Date().toISOString().split('T')[0];
    if (newStatus === 'issued') updates.new_title_issued_date = new Date().toISOString().split('T')[0];
    await supabase.from('title_tracking').update(updates).eq('id', id);
    loadData();
  };

  const filtered = records.filter(r => {
    if (filterStatus !== 'all' && r.title_status !== filterStatus) return false;
    if (filterReg !== 'all' && r.registration_status !== filterReg) return false;
    return true;
  });

  // Check for expiring temp tags
  const today = new Date();
  const expiringTags = records.filter(r => r.temp_tag_expiry && new Date(r.temp_tag_expiry) <= new Date(today.getTime() + 7 * 86400000) && new Date(r.temp_tag_expiry) >= today);
  const expiredTags = records.filter(r => r.temp_tag_expiry && new Date(r.temp_tag_expiry) < today);
  const problems = records.filter(r => r.title_status === 'problem');
  const pendingCount = records.filter(r => r.title_status === 'pending').length;
  const completedCount = records.filter(r => r.title_status === 'delivered' || r.title_status === 'issued').length;

  const card = { backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '20px' };
  const inputStyle = { width: '100%', padding: '10px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box' };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>Loading...</div>;

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ color: theme.text, fontSize: '24px', fontWeight: '700', margin: 0 }}>Title & Registration</h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', margin: '4px 0 0' }}>Track title status, temp tags, plates, and DMV paperwork</p>
        </div>
        <button onClick={() => { setEditing(null); resetForm(); setShowModal(true); }} style={{ padding: '10px 16px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
          + Track Vehicle
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total Tracked', val: records.length, color: theme.text },
          { label: 'Pending', val: pendingCount, color: '#eab308' },
          { label: 'Completed', val: completedCount, color: '#22c55e' },
          { label: 'Problems', val: problems.length, color: problems.length > 0 ? '#ef4444' : '#22c55e' },
          { label: 'Expiring Tags', val: expiringTags.length + expiredTags.length, color: (expiringTags.length + expiredTags.length) > 0 ? '#ef4444' : '#22c55e' },
        ].map((s, i) => (
          <div key={i} style={{ ...card, textAlign: 'center' }}>
            <div style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ color: s.color, fontSize: '20px', fontWeight: '700' }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {(expiredTags.length > 0 || expiringTags.length > 0 || problems.length > 0) && (
        <div style={{ ...card, marginBottom: '20px', borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.05)' }}>
          {expiredTags.length > 0 && (
            <div style={{ color: '#ef4444', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>
              {expiredTags.length} EXPIRED temp tag{expiredTags.length > 1 ? 's' : ''}: {expiredTags.map(r => getVehicleTitle(r.vehicle_id)).join(', ')}
            </div>
          )}
          {expiringTags.length > 0 && (
            <div style={{ color: '#eab308', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>
              {expiringTags.length} temp tag{expiringTags.length > 1 ? 's' : ''} expiring within 7 days
            </div>
          )}
          {problems.length > 0 && (
            <div style={{ color: '#ef4444', fontSize: '13px', fontWeight: '600' }}>
              {problems.length} title{problems.length > 1 ? 's' : ''} with problems
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value="all">All Title Status</option>
          {titleStatuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={filterReg} onChange={e => setFilterReg(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value="all">All Registration</option>
          {regStatuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* Records Table */}
      {filtered.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '40px', color: theme.textMuted }}>No title records found</div>
      ) : (
        <div style={card}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                {['Vehicle', 'Title Status', 'Title #', 'Lien', 'Temp Tag', 'Tag Expiry', 'Plate', 'Registration', 'Fees', ''].map(h => (
                  <th key={h} style={{ padding: '10px 8px', textAlign: 'left', color: theme.textMuted, fontSize: '12px', fontWeight: '600' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const statusInfo = titleStatuses.find(s => s.value === r.title_status);
                const tagExpired = r.temp_tag_expiry && new Date(r.temp_tag_expiry) < today;
                const tagExpiring = r.temp_tag_expiry && !tagExpired && new Date(r.temp_tag_expiry) <= new Date(today.getTime() + 7 * 86400000);
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '10px 8px', color: theme.text, fontSize: '13px', fontWeight: '500' }}>{getVehicleTitle(r.vehicle_id)}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <select value={r.title_status} onChange={e => handleUpdateStatus(r.id, e.target.value)} style={{ padding: '4px 8px', backgroundColor: `${statusInfo?.color || theme.textMuted}22`, border: 'none', borderRadius: '4px', color: statusInfo?.color || theme.textMuted, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                        {titleStatuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '10px 8px', color: theme.textSecondary, fontSize: '13px' }}>{r.title_number || '-'}</td>
                    <td style={{ padding: '10px 8px', color: theme.textSecondary, fontSize: '13px' }}>
                      {r.lien_holder ? (
                        <span style={{ color: r.lien_release_received ? '#22c55e' : '#eab308' }}>
                          {r.lien_release_received ? 'Released' : r.lien_holder}
                        </span>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '10px 8px', color: theme.textSecondary, fontSize: '13px' }}>{r.temp_tag_number || '-'}</td>
                    <td style={{ padding: '10px 8px', fontSize: '13px', fontWeight: tagExpired || tagExpiring ? '600' : '400', color: tagExpired ? '#ef4444' : tagExpiring ? '#eab308' : theme.textSecondary }}>
                      {r.temp_tag_expiry ? formatDate(r.temp_tag_expiry) : '-'}
                      {tagExpired && ' (EXPIRED)'}
                    </td>
                    <td style={{ padding: '10px 8px', color: theme.textSecondary, fontSize: '13px' }}>{r.plate_number || '-'}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                        backgroundColor: r.registration_status === 'completed' ? 'rgba(34,197,94,0.15)' : r.registration_status === 'expired' ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)',
                        color: r.registration_status === 'completed' ? '#22c55e' : r.registration_status === 'expired' ? '#ef4444' : '#eab308',
                      }}>{r.registration_status}</span>
                    </td>
                    <td style={{ padding: '10px 8px', color: theme.text, fontSize: '13px', fontWeight: '500' }}>{formatCurrency(r.total_fees)}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <button onClick={() => handleEdit(r)} style={{ padding: '4px 10px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '4px', color: theme.textSecondary, cursor: 'pointer', fontSize: '11px' }}>Edit</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowModal(false)}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '600px', maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: theme.text, fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>{editing ? 'Edit Title Record' : 'Track New Vehicle'}</h3>

            {/* Vehicle */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Vehicle *</label>
              <select value={form.vehicle_id} onChange={e => setForm(p => ({ ...p, vehicle_id: e.target.value }))} style={inputStyle} disabled={!!editing}>
                <option value="">Select vehicle...</option>
                {(inventory || []).map(v => (
                  <option key={v.id} value={v.id}>{v.year} {v.make} {v.model} - #{v.unit_id}</option>
                ))}
              </select>
            </div>

            {/* Title Info */}
            <div style={{ color: theme.accent, fontSize: '13px', fontWeight: '600', marginBottom: '12px', marginTop: '16px' }}>TITLE</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Title #</label>
                <input type="text" value={form.title_number} onChange={e => setForm(p => ({ ...p, title_number: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Title State</label>
                <input type="text" value={form.title_state} onChange={e => setForm(p => ({ ...p, title_state: e.target.value }))} style={inputStyle} placeholder="UT" />
              </div>
              <div>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Status</label>
                <select value={form.title_status} onChange={e => setForm(p => ({ ...p, title_status: e.target.value }))} style={inputStyle}>
                  {titleStatuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Assigned To</label>
                <select value={form.assigned_to} onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))} style={inputStyle}>
                  <option value="">Unassigned</option>
                  {(employees || []).filter(e => e.active).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              {[
                { key: 'title_received_date', label: 'Received' },
                { key: 'sent_to_dmv_date', label: 'Sent to DMV' },
                { key: 'new_title_issued_date', label: 'New Title Issued' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>{f.label}</label>
                  <input type="date" value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
                </div>
              ))}
            </div>

            {/* Lien */}
            <div style={{ color: theme.accent, fontSize: '13px', fontWeight: '600', marginBottom: '12px', marginTop: '16px' }}>LIEN</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Lien Holder</label>
                <input type="text" value={form.lien_holder} onChange={e => setForm(p => ({ ...p, lien_holder: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Lien Release Date</label>
                <input type="date" value={form.lien_release_date} onChange={e => setForm(p => ({ ...p, lien_release_date: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: theme.textSecondary, fontSize: '13px', marginBottom: '16px', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.lien_release_received} onChange={e => setForm(p => ({ ...p, lien_release_received: e.target.checked }))} />
              Lien release received
            </label>

            {/* Temp Tag */}
            <div style={{ color: theme.accent, fontSize: '13px', fontWeight: '600', marginBottom: '12px' }}>TEMP TAG</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              {[
                { key: 'temp_tag_number', label: 'Tag #', type: 'text' },
                { key: 'temp_tag_issued', label: 'Issued', type: 'date' },
                { key: 'temp_tag_expiry', label: 'Expires', type: 'date' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>{f.label}</label>
                  <input type={f.type} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
                </div>
              ))}
            </div>

            {/* Registration */}
            <div style={{ color: theme.accent, fontSize: '13px', fontWeight: '600', marginBottom: '12px' }}>REGISTRATION</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Status</label>
                <select value={form.registration_status} onChange={e => setForm(p => ({ ...p, registration_status: e.target.value }))} style={inputStyle}>
                  {regStatuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Plate #</label>
                <input type="text" value={form.plate_number} onChange={e => setForm(p => ({ ...p, plate_number: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Reg Expiry</label>
                <input type="date" value={form.registration_expiry} onChange={e => setForm(p => ({ ...p, registration_expiry: e.target.value }))} style={inputStyle} />
              </div>
            </div>

            {/* Fees */}
            <div style={{ color: theme.accent, fontSize: '13px', fontWeight: '600', marginBottom: '12px' }}>FEES</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              {[
                { key: 'title_fee', label: 'Title Fee' },
                { key: 'registration_fee', label: 'Reg Fee' },
                { key: 'plate_fee', label: 'Plate Fee' },
                { key: 'sales_tax', label: 'Sales Tax' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>{f.label}</label>
                  <input type="number" value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} placeholder="$" />
                </div>
              ))}
            </div>

            {/* Notes */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            {form.title_status === 'problem' && (
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', color: '#ef4444', fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Problem Description</label>
                <textarea value={form.problem_description} onChange={e => setForm(p => ({ ...p, problem_description: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical', borderColor: '#ef4444' }} />
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => { setShowModal(false); setEditing(null); }} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleSave} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
