import { useState, useEffect } from 'react';
import { useTheme } from '../components/Layout';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';

export default function LeadsPage() {
  const { theme } = useTheme();
  const { dealerId, inventory, employees } = useStore();
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState([]);
  const [activeView, setActiveView] = useState('pipeline');
  const [showModal, setShowModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [tempFilter, setTempFilter] = useState('all');

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    preferred_contact: 'phone',
    source: 'walk_in',
    source_details: '',
    interested_vehicle_id: '',
    budget_min: '',
    budget_max: '',
    financing_needed: false,
    assigned_to: '',
    notes: '',
    next_follow_up: ''
  });

  const sources = {
    walk_in: { label: 'Walk-In', icon: '🚶', color: '#22c55e' },
    phone_call: { label: 'Phone Call', icon: '📞', color: '#3b82f6' },
    website: { label: 'Website', icon: '🌐', color: '#8b5cf6' },
    facebook: { label: 'Facebook', icon: '📘', color: '#1877f2' },
    ksl: { label: 'KSL', icon: '📰', color: '#00a550' },
    craigslist: { label: 'Craigslist', icon: '📋', color: '#5a3e85' },
    autotrader: { label: 'AutoTrader', icon: '🚗', color: '#ef4444' },
    referral: { label: 'Referral', icon: '🤝', color: '#f59e0b' },
    repeat_customer: { label: 'Repeat', icon: '🔄', color: '#14b8a6' },
    marketplace: { label: 'Marketplace', icon: '🏪', color: '#ec4899' },
    other: { label: 'Other', icon: '📌', color: '#71717a' }
  };

  const statuses = {
    new: { label: 'New', color: '#3b82f6' },
    contacted: { label: 'Contacted', color: '#f59e0b' },
    qualified: { label: 'Qualified', color: '#8b5cf6' },
    negotiating: { label: 'Negotiating', color: '#ec4899' },
    won: { label: 'Won', color: '#22c55e' },
    lost: { label: 'Lost', color: '#ef4444' }
  };

  const temperatures = {
    hot: { label: 'Hot', color: '#ef4444', icon: '🔥' },
    warm: { label: 'Warm', color: '#f59e0b', icon: '☀️' },
    cold: { label: 'Cold', color: '#3b82f6', icon: '❄️' },
    dead: { label: 'Dead', color: '#71717a', icon: '💀' }
  };

  useEffect(() => { if (dealerId) loadLeads(); }, [dealerId]);

  async function loadLeads() {
    setLoading(true);
    const { data } = await supabase.from('leads')
      .select('*')
      .eq('dealer_id', dealerId)
      .order('created_at', { ascending: false });
    setLeads(data || []);
    setLoading(false);
  }

  // Stats
  const pipelineStats = Object.entries(statuses).map(([key, s]) => ({
    ...s, key, count: leads.filter(l => l.status === key).length
  }));
  const totalLeads = leads.length;
  const hotLeads = leads.filter(l => l.temperature === 'hot').length;
  const todayFollowUps = leads.filter(l => l.next_follow_up && new Date(l.next_follow_up).toDateString() === new Date().toDateString()).length;
  const conversionRate = totalLeads > 0 ? Math.round(leads.filter(l => l.status === 'won').length / totalLeads * 100) : 0;

  // Filter
  let filtered = leads.filter(l => l.status !== 'won' && l.status !== 'lost');
  if (sourceFilter !== 'all') filtered = filtered.filter(l => l.source === sourceFilter);
  if (tempFilter !== 'all') filtered = filtered.filter(l => l.temperature === tempFilter);
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(l => `${l.first_name} ${l.last_name || ''}`.toLowerCase().includes(s) || l.email?.toLowerCase().includes(s) || l.phone?.includes(s));
  }

  async function handleSave() {
    try {
      const payload = {
        dealer_id: dealerId,
        first_name: form.first_name,
        last_name: form.last_name || null,
        email: form.email || null,
        phone: form.phone || null,
        preferred_contact: form.preferred_contact,
        source: form.source,
        source_details: form.source_details || null,
        interested_vehicle_id: form.interested_vehicle_id || null,
        budget_min: form.budget_min ? parseFloat(form.budget_min) : null,
        budget_max: form.budget_max ? parseFloat(form.budget_max) : null,
        financing_needed: form.financing_needed,
        assigned_to: form.assigned_to ? parseInt(form.assigned_to) : null,
        assigned_at: form.assigned_to ? new Date().toISOString() : null,
        notes: form.notes || null,
        next_follow_up: form.next_follow_up || null,
        status: 'new',
        temperature: 'warm',
        lead_score: 50
      };

      if (selectedLead) {
        delete payload.status;
        delete payload.temperature;
        delete payload.lead_score;
        await supabase.from('leads').update(payload).eq('id', selectedLead.id);
      } else {
        await supabase.from('leads').insert(payload);
      }

      setShowModal(false);
      setSelectedLead(null);
      resetForm();
      loadLeads();
    } catch (err) {
      alert('Failed to save: ' + err.message);
    }
  }

  async function updateLeadStatus(id, status) {
    const updates = { status, updated_at: new Date().toISOString() };
    if (status === 'contacted') updates.last_contact_at = new Date().toISOString();
    await supabase.from('leads').update(updates).eq('id', id);
    // Recalculate score
    await supabase.rpc('calculate_lead_score', { p_lead_id: id });
    loadLeads();
  }

  async function updateTemperature(id, temperature) {
    await supabase.from('leads').update({ temperature, updated_at: new Date().toISOString() }).eq('id', id);
    loadLeads();
  }

  async function handleDelete(id) {
    if (!confirm('Delete this lead?')) return;
    await supabase.from('leads').delete().eq('id', id);
    loadLeads();
  }

  function openEdit(lead) {
    setSelectedLead(lead);
    setForm({
      first_name: lead.first_name,
      last_name: lead.last_name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      preferred_contact: lead.preferred_contact || 'phone',
      source: lead.source,
      source_details: lead.source_details || '',
      interested_vehicle_id: lead.interested_vehicle_id || '',
      budget_min: lead.budget_min || '',
      budget_max: lead.budget_max || '',
      financing_needed: lead.financing_needed || false,
      assigned_to: lead.assigned_to || '',
      notes: lead.notes || '',
      next_follow_up: lead.next_follow_up || ''
    });
    setShowModal(true);
  }

  function resetForm() {
    setForm({ first_name: '', last_name: '', email: '', phone: '', preferred_contact: 'phone', source: 'walk_in', source_details: '', interested_vehicle_id: '', budget_min: '', budget_max: '', financing_needed: false, assigned_to: '', notes: '', next_follow_up: '' });
  }

  const availableVehicles = (inventory || []).filter(v => v.status === 'In Stock');
  const activeEmployees = (employees || []).filter(e => e.active);

  if (loading) {
    return <div style={{ padding: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div style={{ color: theme.textSecondary }}>Loading leads...</div>
    </div>;
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>Leads</h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', marginTop: '4px' }}>Track, score & convert leads into customers</p>
        </div>
        <button onClick={() => { setSelectedLead(null); resetForm(); setShowModal(true); }} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>+ New Lead</button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total Leads', value: totalLeads, color: theme.text },
          { label: 'Hot Leads', value: hotLeads, color: '#ef4444', icon: '🔥' },
          { label: "Today's Follow-ups", value: todayFollowUps, color: '#f59e0b' },
          { label: 'Conversion Rate', value: `${conversionRate}%`, color: '#22c55e' }
        ].map((k, i) => (
          <div key={i} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>{k.label}</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: k.color }}>{k.icon || ''}{k.value}</div>
          </div>
        ))}
      </div>

      {/* Pipeline */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px', marginBottom: '24px' }}>
        {pipelineStats.map(stage => (
          <div key={stage.key} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: '700', color: stage.color }}>{stage.count}</div>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>{stage.label}</div>
            <div style={{ height: '3px', backgroundColor: stage.color, borderRadius: '2px', marginTop: '8px', opacity: 0.6 }} />
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads..." style={{ flex: 1, minWidth: '200px', padding: '10px 14px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' }} />
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} style={{ padding: '10px 14px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' }}>
          <option value="all">All Sources</option>
          {Object.entries(sources).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
        <select value={tempFilter} onChange={e => setTempFilter(e.target.value)} style={{ padding: '10px 14px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' }}>
          <option value="all">All Temps</option>
          {Object.entries(temperatures).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
      </div>

      {/* Leads List */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted, backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎯</div>
          <p>No active leads. Add your first lead to start tracking.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(lead => {
            const src = sources[lead.source] || sources.other;
            const temp = temperatures[lead.temperature] || temperatures.warm;
            const st = statuses[lead.status] || statuses.new;
            const vehicle = availableVehicles.find(v => v.id === lead.interested_vehicle_id);
            const emp = activeEmployees.find(e => e.id === lead.assigned_to);
            const followUpDate = lead.next_follow_up ? new Date(lead.next_follow_up) : null;
            const isOverdue = followUpDate && followUpDate < new Date();

            return (
              <div key={lead.id} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: '12px', flex: 1 }}>
                    {/* Score Circle */}
                    <div style={{ width: '44px', height: '44px', borderRadius: '50%', border: `3px solid ${temp.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: temp.color }}>{lead.lead_score || 0}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ color: theme.text, fontWeight: '700', fontSize: '15px' }}>{lead.first_name} {lead.last_name || ''}</span>
                        <span style={{ fontSize: '14px' }}>{temp.icon}</span>
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600', backgroundColor: `${st.color}20`, color: st.color }}>{st.label}</span>
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '500', backgroundColor: `${src.color}15`, color: src.color }}>{src.icon} {src.label}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '16px', marginTop: '6px', fontSize: '13px', color: theme.textSecondary, flexWrap: 'wrap' }}>
                        {lead.phone && <span>📞 {lead.phone}</span>}
                        {lead.email && <span>📧 {lead.email}</span>}
                        {vehicle && <span>🚗 {vehicle.year} {vehicle.make} {vehicle.model}</span>}
                        {lead.budget_max && <span>💰 ${parseFloat(lead.budget_max).toLocaleString()}</span>}
                        {emp && <span>👤 {emp.name}</span>}
                      </div>
                      {followUpDate && (
                        <div style={{ marginTop: '6px', fontSize: '12px', color: isOverdue ? '#ef4444' : '#f59e0b', fontWeight: '600' }}>
                          {isOverdue ? '⚠ Overdue: ' : '📅 Follow-up: '}{followUpDate.toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    {/* Status quick-change */}
                    <select value={lead.status} onChange={e => updateLeadStatus(lead.id, e.target.value)} style={{ padding: '4px 8px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.textSecondary, fontSize: '12px' }}>
                      {Object.entries(statuses).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <button onClick={() => openEdit(lead)} style={{ padding: '6px 10px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.textSecondary, cursor: 'pointer', fontSize: '12px' }}>Edit</button>
                    <button onClick={() => handleDelete(lead.id)} style={{ padding: '6px 10px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}>Del</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Won/Lost Section */}
      {leads.filter(l => l.status === 'won' || l.status === 'lost').length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <h3 style={{ color: theme.textMuted, fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', marginBottom: '12px' }}>Closed Leads</h3>
          <div style={{ display: 'grid', gap: '6px' }}>
            {leads.filter(l => l.status === 'won' || l.status === 'lost').slice(0, 10).map(lead => (
              <div key={lead.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: theme.bgCard, borderRadius: '8px', border: `1px solid ${theme.border}`, opacity: 0.7 }}>
                <span style={{ color: theme.textSecondary }}>{lead.first_name} {lead.last_name || ''}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: theme.textMuted }}>{sources[lead.source]?.icon} {new Date(lead.created_at).toLocaleDateString()}</span>
                  <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600', backgroundColor: lead.status === 'won' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: lead.status === 'won' ? '#22c55e' : '#ef4444' }}>
                    {lead.status === 'won' ? '✓ Won' : '✗ Lost'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '600px', maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 style={{ color: theme.text, fontSize: '18px', fontWeight: '700', marginBottom: '20px' }}>{selectedLead ? 'Edit' : 'New'} Lead</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>First Name *</label>
                <input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Last Name</label>
                <input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Phone</label>
                <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="801-555-1234" style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Email</label>
                <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} type="email" style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Source *</label>
                <select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }}>
                  {Object.entries(sources).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Preferred Contact</label>
                <select value={form.preferred_contact} onChange={e => setForm({ ...form, preferred_contact: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }}>
                  {['phone', 'email', 'sms', 'any'].map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Interested Vehicle</label>
                <select value={form.interested_vehicle_id} onChange={e => setForm({ ...form, interested_vehicle_id: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }}>
                  <option value="">None selected</option>
                  {availableVehicles.map(v => <option key={v.id} value={v.id}>{v.year} {v.make} {v.model} {v.trim || ''} - ${v.price?.toLocaleString() || 'N/A'}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Budget Min</label>
                <input type="number" value={form.budget_min} onChange={e => setForm({ ...form, budget_min: e.target.value })} placeholder="$" style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Budget Max</label>
                <input type="number" value={form.budget_max} onChange={e => setForm({ ...form, budget_max: e.target.value })} placeholder="$" style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Assigned To</label>
                <select value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }}>
                  <option value="">Unassigned</option>
                  {activeEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Next Follow-up</label>
                <input type="date" value={form.next_follow_up} onChange={e => setForm({ ...form, next_follow_up: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', gridColumn: '1 / -1' }}>
                <input type="checkbox" checked={form.financing_needed} onChange={e => setForm({ ...form, financing_needed: e.target.checked })} style={{ accentColor: theme.accent }} />
                <label style={{ color: theme.textSecondary, fontSize: '14px' }}>Needs financing</label>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, resize: 'vertical' }} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => { setShowModal(false); setSelectedLead(null); }} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={!form.first_name} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: '600', opacity: form.first_name ? 1 : 0.5 }}>Save Lead</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
