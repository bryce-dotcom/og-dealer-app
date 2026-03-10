import { useState, useEffect } from 'react';
import { useTheme } from '../components/Layout';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';

export default function ComplianceDashboard() {
  const { theme } = useTheme();
  const { dealerId, inventory } = useStore();
  const [loading, setLoading] = useState(true);
  const [tracking, setTracking] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [filter, setFilter] = useState('all');

  const [form, setForm] = useState({
    compliance_type: 'dealer_license',
    name: '',
    description: '',
    effective_date: '',
    expiration_date: '',
    renewal_date: '',
    reminder_days: 30,
    document_number: '',
    issuing_authority: '',
    cost: '',
    auto_renew: false,
    notes: ''
  });

  const [checkForm, setCheckForm] = useState({
    category: 'licensing',
    requirement: '',
    description: '',
    state_code: 'UT',
    due_date: '',
    recurring: 'once'
  });

  useEffect(() => { if (dealerId) loadData(); }, [dealerId]);

  async function loadData() {
    setLoading(true);
    try {
      const [{ data: trackData }, { data: checkData }] = await Promise.all([
        supabase.from('compliance_tracking').select('*').eq('dealer_id', dealerId).order('expiration_date'),
        supabase.from('compliance_checklist_items').select('*').eq('dealer_id', dealerId).order('category').order('created_at')
      ]);
      setTracking(trackData || []);
      setChecklist(checkData || []);

      // Check expirations
      await supabase.rpc('check_compliance_expirations', { p_dealer_id: dealerId });
    } catch (err) {
      console.error('Failed to load compliance data:', err);
    }
    setLoading(false);
  }

  // Title compliance from inventory
  const titleItems = (inventory || []).filter(v => v.status === 'In Stock' && v.date_acquired).map(v => {
    const days = Math.floor((new Date() - new Date(v.date_acquired)) / (1000 * 60 * 60 * 24));
    return { ...v, daysOwned: days, titleStatus: days > 45 ? 'overdue' : days > 30 ? 'urgent' : 'ok' };
  });
  const overdueTitles = titleItems.filter(v => v.titleStatus === 'overdue');
  const urgentTitles = titleItems.filter(v => v.titleStatus === 'urgent');
  const okTitles = titleItems.filter(v => v.titleStatus === 'ok');

  // Compliance stats
  const expired = tracking.filter(t => t.status === 'expired');
  const expiringSoon = tracking.filter(t => t.status === 'expiring_soon');
  const active = tracking.filter(t => t.status === 'active');
  const checklistComplete = checklist.filter(c => c.completed).length;
  const checklistTotal = checklist.length;

  const complianceTypes = {
    dealer_license: { label: 'Dealer License', icon: '🏪', color: '#3b82f6' },
    business_license: { label: 'Business License', icon: '📋', color: '#6366f1' },
    surety_bond: { label: 'Surety Bond', icon: '🔒', color: '#8b5cf6' },
    garage_liability: { label: 'Garage Liability', icon: '🏗️', color: '#ec4899' },
    general_liability: { label: 'General Liability', icon: '🛡️', color: '#14b8a6' },
    workers_comp: { label: "Workers' Comp", icon: '👷', color: '#f59e0b' },
    dmv_title: { label: 'DMV Title', icon: '📄', color: '#ef4444' },
    temp_tag: { label: 'Temp Tag', icon: '🏷️', color: '#f97316' },
    emissions_inspection: { label: 'Emissions', icon: '💨', color: '#84cc16' },
    sales_tax_filing: { label: 'Sales Tax', icon: '💰', color: '#06b6d4' },
    annual_report: { label: 'Annual Report', icon: '📊', color: '#a855f7' },
    custom: { label: 'Custom', icon: '⚙️', color: '#71717a' }
  };

  const checklistCategories = {
    licensing: 'Licensing', insurance: 'Insurance', bonding: 'Bonding',
    facility: 'Facility', record_keeping: 'Record Keeping', advertising: 'Advertising',
    title_registration: 'Title & Registration', tax: 'Tax', employee: 'Employee',
    safety: 'Safety', environmental: 'Environmental'
  };

  async function handleSaveTracking() {
    try {
      const payload = {
        dealer_id: dealerId,
        ...form,
        cost: form.cost ? parseFloat(form.cost) : null,
        reminder_days: parseInt(form.reminder_days),
        status: form.expiration_date && new Date(form.expiration_date) <= new Date() ? 'expired' :
          form.expiration_date && new Date(form.expiration_date) <= new Date(Date.now() + 30 * 86400000) ? 'expiring_soon' : 'active'
      };
      if (!payload.effective_date) delete payload.effective_date;
      if (!payload.expiration_date) delete payload.expiration_date;
      if (!payload.renewal_date) delete payload.renewal_date;

      if (selectedItem) {
        await supabase.from('compliance_tracking').update(payload).eq('id', selectedItem.id);
      } else {
        await supabase.from('compliance_tracking').insert(payload);
      }
      setShowAddModal(false);
      setSelectedItem(null);
      setForm({ compliance_type: 'dealer_license', name: '', description: '', effective_date: '', expiration_date: '', renewal_date: '', reminder_days: 30, document_number: '', issuing_authority: '', cost: '', auto_renew: false, notes: '' });
      loadData();
    } catch (err) {
      alert('Failed to save: ' + err.message);
    }
  }

  async function handleDeleteTracking(id) {
    if (!confirm('Delete this compliance item?')) return;
    await supabase.from('compliance_tracking').delete().eq('id', id);
    loadData();
  }

  async function handleSaveChecklist() {
    try {
      const payload = { dealer_id: dealerId, ...checkForm };
      if (!payload.due_date) delete payload.due_date;
      await supabase.from('compliance_checklist_items').insert(payload);
      setShowChecklistModal(false);
      setCheckForm({ category: 'licensing', requirement: '', description: '', state_code: 'UT', due_date: '', recurring: 'once' });
      loadData();
    } catch (err) {
      alert('Failed to save: ' + err.message);
    }
  }

  async function toggleChecklistItem(item) {
    await supabase.from('compliance_checklist_items').update({
      completed: !item.completed,
      completed_at: !item.completed ? new Date().toISOString() : null
    }).eq('id', item.id);
    loadData();
  }

  async function handleDeleteChecklist(id) {
    await supabase.from('compliance_checklist_items').delete().eq('id', id);
    loadData();
  }

  function openEdit(item) {
    setSelectedItem(item);
    setForm({
      compliance_type: item.compliance_type,
      name: item.name,
      description: item.description || '',
      effective_date: item.effective_date || '',
      expiration_date: item.expiration_date || '',
      renewal_date: item.renewal_date || '',
      reminder_days: item.reminder_days || 30,
      document_number: item.document_number || '',
      issuing_authority: item.issuing_authority || '',
      cost: item.cost || '',
      auto_renew: item.auto_renew || false,
      notes: item.notes || ''
    });
    setShowAddModal(true);
  }

  function getDaysUntil(date) {
    if (!date) return null;
    return Math.ceil((new Date(date) - new Date()) / 86400000);
  }

  function getStatusBadge(status) {
    const styles = {
      active: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e', label: 'Active' },
      expiring_soon: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: 'Expiring Soon' },
      expired: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: 'Expired' },
      pending_renewal: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6', label: 'Pending Renewal' },
      not_applicable: { bg: 'rgba(113,113,122,0.15)', color: '#71717a', label: 'N/A' }
    };
    const s = styles[status] || styles.active;
    return <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', backgroundColor: s.bg, color: s.color }}>{s.label}</span>;
  }

  const filteredTracking = filter === 'all' ? tracking :
    filter === 'expiring' ? [...expired, ...expiringSoon] :
    tracking.filter(t => t.status === filter);

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'tracking', label: `Tracking (${tracking.length})` },
    { id: 'titles', label: `Titles (${titleItems.length})` },
    { id: 'checklist', label: `Checklist (${checklistComplete}/${checklistTotal})` }
  ];

  if (loading) {
    return (
      <div style={{ padding: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div style={{ color: theme.textSecondary }}>Loading compliance data...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>Compliance Dashboard</h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', marginTop: '4px' }}>Track licensing, insurance, bonds & regulatory deadlines</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowChecklistModal(true)} style={{ padding: '10px 16px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, cursor: 'pointer', fontSize: '14px' }}>
            + Checklist Item
          </button>
          <button onClick={() => { setSelectedItem(null); setForm({ compliance_type: 'dealer_license', name: '', description: '', effective_date: '', expiration_date: '', renewal_date: '', reminder_days: 30, document_number: '', issuing_authority: '', cost: '', auto_renew: false, notes: '' }); setShowAddModal(true); }} style={{ padding: '10px 16px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
            + Track Item
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '0' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '10px 20px', backgroundColor: activeTab === tab.id ? theme.accentBg : 'transparent', border: 'none', borderBottom: activeTab === tab.id ? `2px solid ${theme.accent}` : '2px solid transparent', color: activeTab === tab.id ? theme.accent : theme.textSecondary, cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {[
              { label: 'Active Items', value: active.length, color: '#22c55e', icon: '✓' },
              { label: 'Expiring Soon', value: expiringSoon.length, color: '#f59e0b', icon: '⚠' },
              { label: 'Expired', value: expired.length, color: '#ef4444', icon: '✗' },
              { label: 'Overdue Titles', value: overdueTitles.length, color: '#ef4444', icon: '📄' },
              { label: 'Urgent Titles', value: urgentTitles.length, color: '#f59e0b', icon: '⏰' },
              { label: 'Checklist Done', value: `${checklistComplete}/${checklistTotal}`, color: '#3b82f6', icon: '☑' }
            ].map((kpi, i) => (
              <div key={i} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: theme.textMuted }}>{kpi.label}</span>
                  <span style={{ fontSize: '20px' }}>{kpi.icon}</span>
                </div>
                <div style={{ fontSize: '28px', fontWeight: '700', color: kpi.color }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* Urgent Items */}
          {(expired.length > 0 || expiringSoon.length > 0 || overdueTitles.length > 0) && (
            <div style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
              <h3 style={{ color: '#ef4444', fontSize: '16px', fontWeight: '700', marginBottom: '12px' }}>Action Required</h3>
              {expired.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid rgba(239,68,68,0.1)` }}>
                  <div>
                    <span style={{ marginRight: '8px' }}>{complianceTypes[item.compliance_type]?.icon}</span>
                    <span style={{ color: theme.text, fontWeight: '600' }}>{item.name}</span>
                    <span style={{ color: '#ef4444', fontSize: '13px', marginLeft: '8px' }}>Expired {item.expiration_date}</span>
                  </div>
                  <button onClick={() => openEdit(item)} style={{ padding: '4px 12px', backgroundColor: 'rgba(239,68,68,0.15)', border: 'none', borderRadius: '6px', color: '#ef4444', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Renew</button>
                </div>
              ))}
              {expiringSoon.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid rgba(239,68,68,0.1)` }}>
                  <div>
                    <span style={{ marginRight: '8px' }}>{complianceTypes[item.compliance_type]?.icon}</span>
                    <span style={{ color: theme.text, fontWeight: '600' }}>{item.name}</span>
                    <span style={{ color: '#f59e0b', fontSize: '13px', marginLeft: '8px' }}>Expires in {getDaysUntil(item.expiration_date)} days</span>
                  </div>
                  <button onClick={() => openEdit(item)} style={{ padding: '4px 12px', backgroundColor: 'rgba(245,158,11,0.15)', border: 'none', borderRadius: '6px', color: '#f59e0b', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Review</button>
                </div>
              ))}
              {overdueTitles.map(v => (
                <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid rgba(239,68,68,0.1)` }}>
                  <div>
                    <span style={{ marginRight: '8px' }}>📄</span>
                    <span style={{ color: theme.text, fontWeight: '600' }}>{v.year} {v.make} {v.model}</span>
                    <span style={{ color: '#ef4444', fontSize: '13px', marginLeft: '8px' }}>{v.daysOwned} days - Title overdue!</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Compliance by Category */}
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '20px' }}>
            <h3 style={{ color: theme.text, fontSize: '16px', fontWeight: '700', marginBottom: '16px' }}>Compliance by Category</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
              {Object.entries(complianceTypes).map(([key, { label, icon, color }]) => {
                const items = tracking.filter(t => t.compliance_type === key);
                if (items.length === 0) return null;
                return (
                  <div key={key} style={{ padding: '16px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '18px' }}>{icon}</span>
                      <span style={{ color: theme.text, fontWeight: '600', fontSize: '14px' }}>{label}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '12px', color: theme.textMuted }}>{items.length}</span>
                    </div>
                    {items.map(item => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                        <span style={{ fontSize: '13px', color: theme.textSecondary }}>{item.name}</span>
                        {getStatusBadge(item.status)}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Tracking Tab */}
      {activeTab === 'tracking' && (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            {['all', 'active', 'expiring', 'expired'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 14px', borderRadius: '6px', border: `1px solid ${filter === f ? theme.accent : theme.border}`, backgroundColor: filter === f ? theme.accentBg : 'transparent', color: filter === f ? theme.accent : theme.textSecondary, cursor: 'pointer', fontSize: '13px', fontWeight: '500', textTransform: 'capitalize' }}>
                {f === 'expiring' ? 'Expiring/Expired' : f}
              </button>
            ))}
          </div>

          {filteredTracking.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🛡️</div>
              <p>No compliance items tracked yet. Add your first item above.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredTracking.map(item => {
                const ct = complianceTypes[item.compliance_type] || complianceTypes.custom;
                const daysUntil = getDaysUntil(item.expiration_date);
                return (
                  <div key={item.id} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                      <span style={{ fontSize: '24px' }}>{ct.icon}</span>
                      <div>
                        <div style={{ color: theme.text, fontWeight: '600', fontSize: '15px' }}>{item.name}</div>
                        <div style={{ color: theme.textMuted, fontSize: '13px' }}>
                          {ct.label} {item.document_number && `• #${item.document_number}`} {item.issuing_authority && `• ${item.issuing_authority}`}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      {item.expiration_date && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '13px', color: theme.textMuted }}>Expires</div>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: daysUntil !== null && daysUntil < 0 ? '#ef4444' : daysUntil < 30 ? '#f59e0b' : theme.text }}>
                            {new Date(item.expiration_date).toLocaleDateString()}
                            {daysUntil !== null && <span style={{ fontSize: '12px', marginLeft: '4px' }}>({daysUntil < 0 ? `${Math.abs(daysUntil)}d ago` : `${daysUntil}d`})</span>}
                          </div>
                        </div>
                      )}
                      {item.cost && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '13px', color: theme.textMuted }}>Cost</div>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>${parseFloat(item.cost).toLocaleString()}</div>
                        </div>
                      )}
                      {getStatusBadge(item.status)}
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => openEdit(item)} style={{ padding: '6px 10px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.textSecondary, cursor: 'pointer', fontSize: '12px' }}>Edit</button>
                        <button onClick={() => handleDeleteTracking(item.id)} style={{ padding: '6px 10px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}>Del</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Titles Tab */}
      {activeTab === 'titles' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#ef4444' }}>{overdueTitles.length}</div>
              <div style={{ color: theme.textSecondary, fontSize: '14px' }}>Overdue (45+ days)</div>
            </div>
            <div style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#f59e0b' }}>{urgentTitles.length}</div>
              <div style={{ color: theme.textSecondary, fontSize: '14px' }}>Approaching (31-45 days)</div>
            </div>
            <div style={{ backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#22c55e' }}>{okTitles.length}</div>
              <div style={{ color: theme.textSecondary, fontSize: '14px' }}>Compliant (0-30 days)</div>
            </div>
          </div>

          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  {['Vehicle', 'Stock #', 'Acquired', 'Days Owned', 'Status'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...overdueTitles, ...urgentTitles, ...okTitles].map(v => (
                  <tr key={v.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '12px 16px', color: theme.text, fontWeight: '500' }}>{v.year} {v.make} {v.model}</td>
                    <td style={{ padding: '12px 16px', color: theme.textSecondary, fontSize: '13px' }}>{v.stock_number || '—'}</td>
                    <td style={{ padding: '12px 16px', color: theme.textSecondary, fontSize: '13px' }}>{v.date_acquired ? new Date(v.date_acquired).toLocaleDateString() : '—'}</td>
                    <td style={{ padding: '12px 16px', fontWeight: '600', color: v.titleStatus === 'overdue' ? '#ef4444' : v.titleStatus === 'urgent' ? '#f59e0b' : '#22c55e' }}>{v.daysOwned}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', backgroundColor: v.titleStatus === 'overdue' ? 'rgba(239,68,68,0.15)' : v.titleStatus === 'urgent' ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)', color: v.titleStatus === 'overdue' ? '#ef4444' : v.titleStatus === 'urgent' ? '#f59e0b' : '#22c55e' }}>
                        {v.titleStatus === 'overdue' ? 'Overdue' : v.titleStatus === 'urgent' ? 'Urgent' : 'OK'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Checklist Tab */}
      {activeTab === 'checklist' && (
        <>
          {/* Progress */}
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: theme.text, fontWeight: '600' }}>Compliance Progress</span>
              <span style={{ color: theme.accent, fontWeight: '700' }}>{checklistTotal > 0 ? Math.round(checklistComplete / checklistTotal * 100) : 0}%</span>
            </div>
            <div style={{ height: '8px', backgroundColor: theme.bg, borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${checklistTotal > 0 ? (checklistComplete / checklistTotal * 100) : 0}%`, backgroundColor: theme.accent, borderRadius: '4px', transition: 'width 0.3s' }} />
            </div>
          </div>

          {Object.entries(checklistCategories).map(([catKey, catLabel]) => {
            const items = checklist.filter(c => c.category === catKey);
            if (items.length === 0) return null;
            return (
              <div key={catKey} style={{ marginBottom: '16px' }}>
                <h3 style={{ color: theme.textMuted, fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>{catLabel}</h3>
                {items.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', marginBottom: '4px' }}>
                    <input type="checkbox" checked={item.completed} onChange={() => toggleChecklistItem(item)} style={{ width: '18px', height: '18px', accentColor: theme.accent, cursor: 'pointer' }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ color: item.completed ? theme.textMuted : theme.text, textDecoration: item.completed ? 'line-through' : 'none', fontSize: '14px' }}>{item.requirement}</span>
                      {item.description && <div style={{ color: theme.textMuted, fontSize: '12px', marginTop: '2px' }}>{item.description}</div>}
                    </div>
                    {item.due_date && (
                      <span style={{ fontSize: '12px', color: new Date(item.due_date) < new Date() && !item.completed ? '#ef4444' : theme.textMuted }}>
                        Due: {new Date(item.due_date).toLocaleDateString()}
                      </span>
                    )}
                    {item.recurring && item.recurring !== 'once' && (
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', backgroundColor: theme.accentBg, color: theme.accent }}>{item.recurring}</span>
                    )}
                    <button onClick={() => handleDeleteChecklist(item.id)} style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '16px' }}>×</button>
                  </div>
                ))}
              </div>
            );
          })}

          {checklist.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>☑️</div>
              <p>No checklist items yet. Add requirements to track compliance.</p>
            </div>
          )}
        </>
      )}

      {/* Add/Edit Tracking Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '560px', maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 style={{ color: theme.text, fontSize: '18px', fontWeight: '700', marginBottom: '20px' }}>{selectedItem ? 'Edit' : 'Add'} Compliance Item</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Type</label>
                <select value={form.compliance_type} onChange={e => setForm({ ...form, compliance_type: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' }}>
                  {Object.entries(complianceTypes).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., Utah Dealer License 2026" style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' }} />
              </div>
              {[
                { key: 'document_number', label: 'Document/Policy #' },
                { key: 'issuing_authority', label: 'Issuing Authority' },
                { key: 'effective_date', label: 'Effective Date', type: 'date' },
                { key: 'expiration_date', label: 'Expiration Date', type: 'date' },
                { key: 'renewal_date', label: 'Renewal Date', type: 'date' },
                { key: 'reminder_days', label: 'Reminder (days before)', type: 'number' },
                { key: 'cost', label: 'Cost ($)', type: 'number' },
              ].map(field => (
                <div key={field.key}>
                  <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>{field.label}</label>
                  <input type={field.type || 'text'} value={form[field.key]} onChange={e => setForm({ ...form, [field.key]: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' }} />
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" checked={form.auto_renew} onChange={e => setForm({ ...form, auto_renew: e.target.checked })} style={{ accentColor: theme.accent }} />
                <label style={{ color: theme.textSecondary, fontSize: '14px' }}>Auto-renew</label>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', resize: 'vertical' }} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => { setShowAddModal(false); setSelectedItem(null); }} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSaveTracking} disabled={!form.name} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: '600', opacity: form.name ? 1 : 0.5 }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Checklist Modal */}
      {showChecklistModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '480px' }}>
            <h2 style={{ color: theme.text, fontSize: '18px', fontWeight: '700', marginBottom: '20px' }}>Add Checklist Item</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Category</label>
                <select value={checkForm.category} onChange={e => setCheckForm({ ...checkForm, category: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }}>
                  {Object.entries(checklistCategories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Requirement *</label>
                <input value={checkForm.requirement} onChange={e => setCheckForm({ ...checkForm, requirement: e.target.value })} placeholder="e.g., Maintain surety bond of $75,000" style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Description</label>
                <textarea value={checkForm.description} onChange={e => setCheckForm({ ...checkForm, description: e.target.value })} rows={2} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Due Date</label>
                  <input type="date" value={checkForm.due_date} onChange={e => setCheckForm({ ...checkForm, due_date: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Recurring</label>
                  <select value={checkForm.recurring} onChange={e => setCheckForm({ ...checkForm, recurring: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }}>
                    {['once', 'monthly', 'quarterly', 'annually', 'biannually'].map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setShowChecklistModal(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSaveChecklist} disabled={!checkForm.requirement} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: '600', opacity: checkForm.requirement ? 1 : 0.5 }}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
