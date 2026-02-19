import { useState, useEffect } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useTheme } from '../components/Layout';
import { Mail, Phone, UserPlus, Send, Check, Clock, X } from 'lucide-react';

export default function EmployeesPage() {
  const { dealerId } = useStore();
  const themeContext = useTheme();
  const theme = themeContext?.theme || {
    bg: '#09090b', bgCard: '#18181b', border: '#27272a',
    text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a',
    accent: '#f97316', accentBg: 'rgba(249,115,22,0.15)'
  };

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviting, setInviting] = useState(false);

  const [inviteForm, setInviteForm] = useState({
    name: '',
    email: '',
    role: 'Sales',
    access_level: 'employee',
    pay_type: 'hourly',
    hourly_rate: ''
  });

  useEffect(() => {
    if (dealerId) fetchEmployees();
  }, [dealerId]);

  async function fetchEmployees() {
    setLoading(true);
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('dealer_id', dealerId)
      .order('created_at', { ascending: false });

    if (data) setEmployees(data);
    setLoading(false);
  }

  async function sendInvitation() {
    if (!inviteForm.name || !inviteForm.email) {
      alert('Please enter employee name and email');
      return;
    }

    setInviting(true);

    try {
      // Call edge function to send invitation
      const { data, error } = await supabase.functions.invoke('invite-employee', {
        body: {
          dealer_id: dealerId,
          name: inviteForm.name,
          email: inviteForm.email,
          role: inviteForm.role,
          access_level: inviteForm.access_level,
          pay_type: inviteForm.pay_type,
          hourly_rate: inviteForm.hourly_rate ? parseFloat(inviteForm.hourly_rate) : null
        }
      });

      if (error) throw error;

      alert(`Invitation sent to ${inviteForm.email}!`);
      setShowInviteModal(false);
      setInviteForm({ name: '', email: '', role: 'Sales', access_level: 'employee', pay_type: 'hourly', hourly_rate: '' });
      fetchEmployees();
    } catch (err) {
      console.error('Invitation error:', err);
      alert(`Failed to send invitation: ${err.message || 'Please try again'}`);
    } finally {
      setInviting(false);
    }
  }

  async function resendInvitation(employeeId, email) {
    if (!confirm(`Resend invitation to ${email}?`)) return;

    try {
      const { error } = await supabase.functions.invoke('invite-employee', {
        body: { employee_id: employeeId, resend: true }
      });

      if (error) throw error;
      alert(`Invitation resent to ${email}!`);
    } catch (err) {
      console.error('Resend error:', err);
      alert('Failed to resend invitation');
    }
  }

  const getEmployeeStatus = (employee) => {
    if (employee.user_id) return { label: 'Active', color: '#22c55e', icon: Check };
    if (employee.invited_at) return { label: 'Invited', color: '#f97316', icon: Clock };
    return { label: 'Pending', color: '#71717a', icon: Clock };
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    color: theme.text,
    fontSize: '14px',
    outline: 'none'
  };

  const buttonStyle = {
    padding: '10px 20px',
    backgroundColor: theme.accent,
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', backgroundColor: theme.bg, minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', backgroundColor: theme.bg, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: theme.text, margin: 0 }}>Team</h1>
          <p style={{ color: theme.textMuted, margin: '4px 0 0', fontSize: '14px' }}>
            {employees.length} team members
          </p>
        </div>
        <button onClick={() => setShowInviteModal(true)} style={buttonStyle}>
          <UserPlus size={18} />
          Invite Employee
        </button>
      </div>

      {/* Employees Grid */}
      {employees.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
          <h3 style={{ fontSize: '20px', fontWeight: '600', color: theme.text, margin: '0 0 8px' }}>No team members yet</h3>
          <p style={{ color: theme.textMuted, fontSize: '14px', margin: '0 0 24px' }}>
            Invite your first employee to get started
          </p>
          <button onClick={() => setShowInviteModal(true)} style={buttonStyle}>
            <UserPlus size={18} />
            Invite Employee
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {employees.map(employee => {
            const status = getEmployeeStatus(employee);
            const StatusIcon = status.icon;

            return (
              <div key={employee.id} style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '20px', border: `1px solid ${theme.border}` }}>
                <div style={{ display: 'flex', alignItems: 'start', gap: '16px', marginBottom: '16px' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '12px', backgroundColor: theme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '24px', fontWeight: '700', flexShrink: 0 }}>
                    {employee.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: 0 }}>{employee.name}</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '6px', backgroundColor: `${status.color}20`, color: status.color, fontSize: '12px', fontWeight: '600', flexShrink: 0 }}>
                        <StatusIcon size={12} />
                        {status.label}
                      </div>
                    </div>
                    <p style={{ fontSize: '14px', color: theme.accent, margin: '0 0 4px', fontWeight: '500' }}>{employee.role}</p>
                    <p style={{ fontSize: '12px', color: theme.textMuted, margin: 0 }}>
                      {employee.access_level === 'admin' && '🔐 Admin Access'}
                      {employee.access_level === 'manager' && '📊 Manager Access'}
                      {employee.access_level === 'employee' && '👤 Employee Access'}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', paddingTop: '16px', borderTop: `1px solid ${theme.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: theme.textSecondary }}>
                    <Mail size={16} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{employee.email}</span>
                  </div>
                  {employee.phone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: theme.textSecondary }}>
                      <Phone size={16} />
                      {employee.phone}
                    </div>
                  )}
                </div>

                {employee.hourly_rate && (
                  <div style={{ padding: '12px', backgroundColor: theme.bg, borderRadius: '8px', fontSize: '14px' }}>
                    <span style={{ color: theme.textMuted }}>Pay Rate: </span>
                    <span style={{ color: theme.text, fontWeight: '600' }}>${employee.hourly_rate}/hr</span>
                  </div>
                )}

                {!employee.user_id && employee.invited_at && (
                  <button
                    onClick={() => resendInvitation(employee.id, employee.email)}
                    style={{ marginTop: '12px', width: '100%', padding: '8px', backgroundColor: theme.bg, color: theme.accent, border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <Send size={14} />
                    Resend Invitation
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Invite Employee Modal */}
      {showInviteModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} onClick={() => !inviting && setShowInviteModal(false)}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '500px', border: `1px solid ${theme.border}` }} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: theme.text, margin: '0 0 8px', fontSize: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserPlus size={24} />
              Invite New Employee
            </h2>
            <p style={{ color: theme.textMuted, fontSize: '14px', margin: '0 0 24px' }}>
              Send an invitation email to onboard a new team member
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="John Smith"
                  style={inputStyle}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>
                  Email Address *
                </label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="john@example.com"
                  style={inputStyle}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>
                    Role
                  </label>
                  <select value={inviteForm.role} onChange={(e) => setInviteForm(prev => ({ ...prev, role: e.target.value }))} style={inputStyle}>
                    <option value="Sales">Sales</option>
                    <option value="Finance">Finance</option>
                    <option value="Manager">Manager</option>
                    <option value="Mechanic">Mechanic</option>
                    <option value="Admin">Admin</option>
                    <option value="Lot">Lot</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>
                    Access Level
                  </label>
                  <select value={inviteForm.access_level} onChange={(e) => setInviteForm(prev => ({ ...prev, access_level: e.target.value }))} style={inputStyle}>
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              <div style={{ padding: '12px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                <p style={{ fontSize: '12px', color: theme.textMuted, margin: 0, lineHeight: '1.5' }}>
                  <strong style={{ color: theme.textSecondary }}>Access Levels:</strong><br />
                  • Employee: Basic access to assigned features<br />
                  • Manager: View reports and team data<br />
                  • Admin: Full access to payroll and financials
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>
                    Pay Type
                  </label>
                  <select value={inviteForm.pay_type} onChange={(e) => setInviteForm(prev => ({ ...prev, pay_type: e.target.value }))} style={inputStyle}>
                    <option value="hourly">Hourly</option>
                    <option value="salary">Salary</option>
                    <option value="commission">Commission</option>
                  </select>
                </div>

                {inviteForm.pay_type === 'hourly' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>
                      Hourly Rate
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={inviteForm.hourly_rate}
                      onChange={(e) => setInviteForm(prev => ({ ...prev, hourly_rate: e.target.value }))}
                      placeholder="15.00"
                      style={inputStyle}
                    />
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button
                onClick={() => setShowInviteModal(false)}
                disabled={inviting}
                style={{ flex: 1, padding: '12px', backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: '8px', fontWeight: '600', cursor: inviting ? 'not-allowed' : 'pointer', opacity: inviting ? 0.5 : 1 }}
              >
                Cancel
              </button>
              <button
                onClick={sendInvitation}
                disabled={inviting || !inviteForm.name || !inviteForm.email}
                style={{ flex: 1, padding: '12px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: (inviting || !inviteForm.name || !inviteForm.email) ? 'not-allowed' : 'pointer', opacity: (inviting || !inviteForm.name || !inviteForm.email) ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <Send size={16} />
                {inviting ? 'Sending...' : 'Send Invitation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
