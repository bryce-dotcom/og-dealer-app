import { useState, useEffect } from 'react';
import { useTheme } from '../components/Layout';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';

export default function CustomerPortalPage() {
  const { theme } = useTheme();
  const { dealerId, customers } = useStore();
  const [loading, setLoading] = useState(true);
  const [portalAccess, setPortalAccess] = useState([]);
  const [portalPayments, setPortalPayments] = useState([]);
  const [activeTab, setActiveTab] = useState('access');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const [inviteForm, setInviteForm] = useState({
    customer_id: '',
    email: '',
    can_view_payments: true,
    can_make_payments: true,
    can_view_documents: true,
    can_view_appointments: true,
    can_schedule_appointments: false,
    can_message_dealer: true
  });

  useEffect(() => { if (dealerId) loadData(); }, [dealerId]);

  async function loadData() {
    setLoading(true);
    const [{ data: access }, { data: payments }] = await Promise.all([
      supabase.from('customer_portal_access').select('*').eq('dealer_id', dealerId).order('created_at', { ascending: false }),
      supabase.from('customer_portal_payments').select('*').eq('dealer_id', dealerId).order('created_at', { ascending: false }).limit(50)
    ]);
    setPortalAccess(access || []);
    setPortalPayments(payments || []);
    setLoading(false);
  }

  const customersWithAccess = portalAccess.map(pa => {
    const cust = (customers || []).find(c => c.id === pa.customer_id);
    return { ...pa, customer: cust };
  });

  const customersWithoutAccess = (customers || []).filter(c =>
    !portalAccess.some(pa => pa.customer_id === c.id)
  );

  // Stats
  const totalPortalUsers = portalAccess.length;
  const activeUsers = portalAccess.filter(p => p.active).length;
  const recentLogins = portalAccess.filter(p => p.last_login_at && new Date(p.last_login_at) > new Date(Date.now() - 30 * 86400000)).length;
  const totalPayments = portalPayments.length;
  const completedPayments = portalPayments.filter(p => p.status === 'completed');
  const totalPaymentAmount = completedPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

  async function handleInvite() {
    try {
      if (!inviteForm.customer_id || !inviteForm.email) {
        alert('Please select a customer and enter their email.');
        return;
      }

      const { error } = await supabase.from('customer_portal_access').insert({
        dealer_id: dealerId,
        customer_id: parseInt(inviteForm.customer_id),
        email: inviteForm.email,
        active: true,
        can_view_payments: inviteForm.can_view_payments,
        can_make_payments: inviteForm.can_make_payments,
        can_view_documents: inviteForm.can_view_documents,
        can_view_appointments: inviteForm.can_view_appointments,
        can_schedule_appointments: inviteForm.can_schedule_appointments,
        can_message_dealer: inviteForm.can_message_dealer
      });
      if (error) throw error;

      setShowInviteModal(false);
      setInviteForm({ customer_id: '', email: '', can_view_payments: true, can_make_payments: true, can_view_documents: true, can_view_appointments: true, can_schedule_appointments: false, can_message_dealer: true });
      loadData();
    } catch (err) {
      alert('Failed to create portal access: ' + err.message);
    }
  }

  async function toggleAccess(id, active) {
    await supabase.from('customer_portal_access').update({ active: !active }).eq('id', id);
    loadData();
  }

  async function updatePermissions(id, perms) {
    await supabase.from('customer_portal_access').update(perms).eq('id', id);
    loadData();
  }

  async function handleRevokeAccess(id) {
    if (!confirm('Revoke this customer\'s portal access?')) return;
    await supabase.from('customer_portal_access').delete().eq('id', id);
    loadData();
  }

  // Filter
  let filteredAccess = customersWithAccess;
  if (search) {
    const s = search.toLowerCase();
    filteredAccess = filteredAccess.filter(a =>
      a.email?.toLowerCase().includes(s) ||
      a.customer?.first_name?.toLowerCase().includes(s) ||
      a.customer?.last_name?.toLowerCase().includes(s)
    );
  }

  if (loading) {
    return <div style={{ padding: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div style={{ color: theme.textSecondary }}>Loading portal data...</div>
    </div>;
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>Customer Portal</h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', marginTop: '4px' }}>Self-service portal for customer payments & documents</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowSettingsModal(true)} style={{ padding: '10px 16px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer', fontSize: '13px' }}>Portal Settings</button>
          <button onClick={() => setShowInviteModal(true)} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>+ Invite Customer</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Portal Users', value: totalPortalUsers, color: theme.text },
          { label: 'Active', value: activeUsers, color: '#22c55e' },
          { label: 'Logged In (30d)', value: recentLogins, color: '#3b82f6' },
          { label: 'Total Payments', value: totalPayments, color: '#8b5cf6' },
          { label: 'Payment Volume', value: `$${totalPaymentAmount.toLocaleString()}`, color: '#22c55e' },
          { label: 'Eligible', value: customersWithoutAccess.length, color: theme.accent }
        ].map((s, i) => (
          <div key={i} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: `1px solid ${theme.border}` }}>
        {[
          { id: 'access', label: `Portal Access (${portalAccess.length})` },
          { id: 'payments', label: `Payments (${portalPayments.length})` }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '10px 20px', backgroundColor: activeTab === tab.id ? theme.accentBg : 'transparent', border: 'none', borderBottom: activeTab === tab.id ? `2px solid ${theme.accent}` : '2px solid transparent', color: activeTab === tab.id ? theme.accent : theme.textSecondary, cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>{tab.label}</button>
        ))}
      </div>

      {/* Access Tab */}
      {activeTab === 'access' && (
        <>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customers..." style={{ width: '100%', padding: '10px 14px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', marginBottom: '16px' }} />

          {filteredAccess.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted, backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔑</div>
              <p>No customers have portal access yet. Invite your first customer.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredAccess.map(access => (
                <div key={access.id} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: theme.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.accent, fontWeight: '700', fontSize: '16px' }}>
                        {(access.customer?.first_name || access.email || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ color: theme.text, fontWeight: '600', fontSize: '15px' }}>
                          {access.customer ? `${access.customer.first_name} ${access.customer.last_name || ''}` : 'Unknown Customer'}
                        </div>
                        <div style={{ color: theme.textMuted, fontSize: '13px' }}>{access.email}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', color: theme.textMuted }}>
                          {access.login_count || 0} logins
                        </div>
                        <div style={{ fontSize: '12px', color: theme.textMuted }}>
                          Last: {access.last_login_at ? new Date(access.last_login_at).toLocaleDateString() : 'Never'}
                        </div>
                      </div>
                      <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', backgroundColor: access.active ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: access.active ? '#22c55e' : '#ef4444' }}>
                        {access.active ? 'Active' : 'Disabled'}
                      </span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => toggleAccess(access.id, access.active)} style={{ padding: '6px 10px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: access.active ? '#f59e0b' : '#22c55e', cursor: 'pointer', fontSize: '12px' }}>
                          {access.active ? 'Disable' : 'Enable'}
                        </button>
                        <button onClick={() => { setSelectedCustomer(access); setShowSettingsModal(true); }} style={{ padding: '6px 10px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.textSecondary, cursor: 'pointer', fontSize: '12px' }}>Perms</button>
                        <button onClick={() => handleRevokeAccess(access.id)} style={{ padding: '6px 10px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}>Revoke</button>
                      </div>
                    </div>
                  </div>

                  {/* Permissions badges */}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                    {[
                      { key: 'can_view_payments', label: 'View Payments' },
                      { key: 'can_make_payments', label: 'Make Payments' },
                      { key: 'can_view_documents', label: 'Documents' },
                      { key: 'can_view_appointments', label: 'Appointments' },
                      { key: 'can_schedule_appointments', label: 'Schedule' },
                      { key: 'can_message_dealer', label: 'Messages' }
                    ].map(perm => (
                      <span key={perm.key} style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '500', backgroundColor: access[perm.key] ? 'rgba(34,197,94,0.1)' : 'rgba(113,113,122,0.1)', color: access[perm.key] ? '#22c55e' : '#71717a' }}>
                        {access[perm.key] ? '✓' : '✗'} {perm.label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Payments Tab */}
      {activeTab === 'payments' && (
        <>
          {portalPayments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted, backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>💳</div>
              <p>No portal payments yet.</p>
            </div>
          ) : (
            <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                    {['Customer', 'Amount', 'Method', 'Status', 'Date'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {portalPayments.map(payment => {
                    const cust = (customers || []).find(c => c.id === payment.customer_id);
                    const statusColors = { pending: '#f59e0b', processing: '#3b82f6', completed: '#22c55e', failed: '#ef4444', refunded: '#8b5cf6' };
                    return (
                      <tr key={payment.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                        <td style={{ padding: '12px 14px', color: theme.text }}>{cust ? `${cust.first_name} ${cust.last_name || ''}` : `ID: ${payment.customer_id}`}</td>
                        <td style={{ padding: '12px 14px', color: theme.text, fontWeight: '700' }}>${parseFloat(payment.amount).toLocaleString()}</td>
                        <td style={{ padding: '12px 14px', color: theme.textSecondary, fontSize: '13px', textTransform: 'uppercase' }}>{payment.payment_method}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', backgroundColor: `${statusColors[payment.status] || '#71717a'}20`, color: statusColors[payment.status] || '#71717a' }}>{payment.status}</span>
                        </td>
                        <td style={{ padding: '12px 14px', color: theme.textMuted, fontSize: '13px' }}>{new Date(payment.created_at).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '500px' }}>
            <h2 style={{ color: theme.text, fontSize: '18px', fontWeight: '700', marginBottom: '20px' }}>Invite Customer to Portal</h2>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Customer *</label>
              <select value={inviteForm.customer_id} onChange={e => {
                const cust = customersWithoutAccess.find(c => c.id === parseInt(e.target.value));
                setInviteForm({ ...inviteForm, customer_id: e.target.value, email: cust?.email || '' });
              }} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }}>
                <option value="">Select customer...</option>
                {customersWithoutAccess.map(c => (
                  <option key={c.id} value={c.id}>{c.first_name} {c.last_name || ''} {c.email ? `(${c.email})` : ''}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Email *</label>
              <input value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="customer@example.com" style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '8px' }}>Permissions</label>
              {[
                { key: 'can_view_payments', label: 'View payment history' },
                { key: 'can_make_payments', label: 'Make payments online' },
                { key: 'can_view_documents', label: 'View documents' },
                { key: 'can_view_appointments', label: 'View appointments' },
                { key: 'can_schedule_appointments', label: 'Schedule appointments' },
                { key: 'can_message_dealer', label: 'Send messages to dealer' }
              ].map(perm => (
                <label key={perm.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' }}>
                  <input type="checkbox" checked={inviteForm[perm.key]} onChange={e => setInviteForm({ ...inviteForm, [perm.key]: e.target.checked })} style={{ accentColor: theme.accent }} />
                  <span style={{ color: theme.textSecondary, fontSize: '14px' }}>{perm.label}</span>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setShowInviteModal(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleInvite} disabled={!inviteForm.customer_id || !inviteForm.email} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: '600', opacity: inviteForm.customer_id && inviteForm.email ? 1 : 0.5 }}>Send Invite</button>
            </div>
          </div>
        </div>
      )}

      {/* Settings/Permissions Modal */}
      {showSettingsModal && selectedCustomer && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '450px' }}>
            <h2 style={{ color: theme.text, fontSize: '18px', fontWeight: '700', marginBottom: '20px' }}>
              Permissions: {selectedCustomer.customer?.first_name || selectedCustomer.email}
            </h2>
            {[
              { key: 'can_view_payments', label: 'View payment history' },
              { key: 'can_make_payments', label: 'Make payments online' },
              { key: 'can_view_documents', label: 'View documents' },
              { key: 'can_view_appointments', label: 'View appointments' },
              { key: 'can_schedule_appointments', label: 'Schedule appointments' },
              { key: 'can_message_dealer', label: 'Send messages to dealer' }
            ].map(perm => (
              <label key={perm.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' }}>
                <input type="checkbox" checked={selectedCustomer[perm.key]} onChange={e => {
                  updatePermissions(selectedCustomer.id, { [perm.key]: e.target.checked });
                  setSelectedCustomer({ ...selectedCustomer, [perm.key]: e.target.checked });
                }} style={{ accentColor: theme.accent }} />
                <span style={{ color: theme.textSecondary, fontSize: '14px' }}>{perm.label}</span>
              </label>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => { setShowSettingsModal(false); setSelectedCustomer(null); }} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: '600' }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {showSettingsModal && !selectedCustomer && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '500px' }}>
            <h2 style={{ color: theme.text, fontSize: '18px', fontWeight: '700', marginBottom: '20px' }}>Portal Settings</h2>
            <div style={{ backgroundColor: theme.bg, borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
              <h3 style={{ color: theme.text, fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Portal URL</h3>
              <div style={{ padding: '10px', backgroundColor: theme.bgCard, borderRadius: '6px', border: `1px solid ${theme.border}`, color: theme.accent, fontSize: '13px', wordBreak: 'break-all' }}>
                {window.location.origin}/portal/{dealerId}
              </div>
              <p style={{ color: theme.textMuted, fontSize: '12px', marginTop: '8px' }}>Share this link with customers to access their portal.</p>
            </div>
            <div style={{ backgroundColor: theme.bg, borderRadius: '8px', padding: '16px' }}>
              <h3 style={{ color: theme.text, fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Payment Methods</h3>
              <p style={{ color: theme.textMuted, fontSize: '13px' }}>Stripe integration required for online payments. Configure in Settings.</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setShowSettingsModal(false)} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: '600' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
