import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PlaidLinkButton from '../components/PlaidLinkButton';
import InvestorLayout from '../components/InvestorLayout';

const cardStyle = { backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', marginBottom: 24, overflow: 'hidden' };
const inputStyle = { width: '100%', padding: '10px 16px', backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: 8, color: '#111827', fontSize: 14, outline: 'none', boxSizing: 'border-box' };

export default function InvestorSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [investor, setInvestor] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [changingPassword, setChangingPassword] = useState(false);

  // Form state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState({ street: '', city: '', state: '', zip: '' });
  const [timezone, setTimezone] = useState('America/Denver');
  const [notifications, setNotifications] = useState({
    email_deposits: true,
    email_withdrawals: true,
    email_distributions: true,
    email_vehicle_updates: true,
    email_reports: true,
    email_announcements: true,
    in_app_all: true,
  });

  // Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/investor/login'); return; }

      const { data: investorData, error } = await supabase
        .from('investors')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      setInvestor(investorData);
      setFullName(investorData.full_name || '');
      setPhone(investorData.phone || '');
      setAddress(investorData.address || { street: '', city: '', state: '', zip: '' });
      setTimezone(investorData.timezone || 'America/Denver');
      setNotifications(investorData.notification_preferences || notifications);
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProfile() {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('investors')
        .update({
          full_name: fullName,
          phone,
          address,
          timezone,
        })
        .eq('id', investor.id);

      if (error) throw error;
      alert('Profile updated successfully');
    } catch (error) {
      alert('Failed to save: ' + error.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveNotifications() {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('investors')
        .update({ notification_preferences: notifications })
        .eq('id', investor.id);

      if (error) throw error;
      alert('Notification preferences saved');
    } catch (error) {
      alert('Failed to save: ' + error.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      alert('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      alert('Password must be at least 8 characters');
      return;
    }

    try {
      setChangingPassword(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      alert('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      alert('Failed to change password: ' + error.message);
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate('/investor/login');
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount || 0);
  }

  if (loading) {
    return (
      <InvestorLayout title="Settings">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 0' }}>
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500"></div>
        </div>
      </InvestorLayout>
    );
  }

  const tabs = [
    { id: 'profile', label: 'Profile' },
    { id: 'bank', label: 'Bank Account' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'security', label: 'Security' },
  ];

  return (
    <InvestorLayout title="Settings" subtitle="Manage your account and preferences">

      {/* Account Summary */}
      <div style={{ ...cardStyle, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ width: 72, height: 72, backgroundColor: '#111827', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 28, fontWeight: 700, flexShrink: 0 }}>
            {fullName?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>{fullName}</h2>
            <p style={{ color: '#6b7280', margin: '4px 0 0' }}>{investor?.email}</p>
            <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 14 }}>
              <span style={{ color: '#9ca3af' }}>Member since {new Date(investor?.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
              <span style={{
                padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                color: investor?.status === 'active' ? '#059669' : '#d97706',
                backgroundColor: investor?.status === 'active' ? '#ecfdf5' : '#fffbeb',
              }}>{investor?.status}</span>
              {investor?.accredited_investor && (
                <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600, color: '#3b82f6', backgroundColor: '#eff6ff' }}>Accredited</span>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, color: '#6b7280' }}>Total Invested</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>{formatCurrency(investor?.total_invested)}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e5e7eb', marginBottom: 24 }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 24px', fontWeight: 600, fontSize: 14, border: 'none', background: 'none', cursor: 'pointer',
              borderBottom: activeTab === tab.id ? '2px solid #111827' : '2px solid transparent',
              color: activeTab === tab.id ? '#111827' : '#9ca3af',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div style={{ ...cardStyle, padding: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 24px' }}>Personal Information</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div>
                <label style={{ display: 'block', color: '#111827', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Full Name</label>
                <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', color: '#111827', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Phone</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" style={inputStyle} />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', color: '#111827', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Email</label>
              <input type="email" value={investor?.email || ''} disabled style={{ ...inputStyle, backgroundColor: '#f9fafb', color: '#9ca3af', cursor: 'not-allowed' }} />
              <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>Contact support to change your email address</p>
            </div>

            <div>
              <label style={{ display: 'block', color: '#111827', fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Mailing Address</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input type="text" value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} placeholder="Street Address" style={inputStyle} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <input type="text" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} placeholder="City" style={inputStyle} />
                  <input type="text" value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value })} placeholder="State" style={inputStyle} />
                  <input type="text" value={address.zip} onChange={(e) => setAddress({ ...address, zip: e.target.value })} placeholder="ZIP" style={inputStyle} />
                </div>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', color: '#111827', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Timezone</label>
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)} style={inputStyle}>
                <option value="America/New_York">Eastern Time</option>
                <option value="America/Chicago">Central Time</option>
                <option value="America/Denver">Mountain Time</option>
                <option value="America/Los_Angeles">Pacific Time</option>
                <option value="America/Anchorage">Alaska Time</option>
                <option value="Pacific/Honolulu">Hawaii Time</option>
              </select>
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={saving}
              style={{
                padding: '12px 32px', backgroundColor: saving ? '#e5e7eb' : '#111827', color: saving ? '#9ca3af' : '#fff',
                borderRadius: 8, fontWeight: 600, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14, alignSelf: 'flex-start',
              }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Bank Account Tab */}
      {activeTab === 'bank' && (
        <div style={{ ...cardStyle, padding: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 24px' }}>Linked Bank Account</h2>

          {investor?.linked_bank_account ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 24, backgroundColor: '#f9fafb', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 52, height: 52, backgroundColor: '#eff6ff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg style={{ width: 24, height: 24, color: '#3b82f6' }} fill="currentColor" viewBox="0 0 20 20">
                      <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                      <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ color: '#111827', fontSize: 16, fontWeight: 600 }}>
                      {investor.linked_bank_account.name || 'Bank Account'}
                    </div>
                    <div style={{ color: '#6b7280', fontSize: 14 }}>
                      {investor.linked_bank_account.type === 'checking' ? 'Checking' : 'Savings'} ****{investor.linked_bank_account.mask || '0000'}
                    </div>
                    <div style={{ color: '#059669', fontSize: 14, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <svg style={{ width: 16, height: 16 }} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Connected via Plaid
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 16 }}>
                <div style={{ display: 'flex', gap: 8, color: '#92400e', fontSize: 14 }}>
                  <svg style={{ width: 20, height: 20, color: '#d97706', flexShrink: 0, marginTop: 2 }} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <strong style={{ color: '#111827' }}>To change your bank account:</strong> Link a new account below. The new account will replace the current one for all future transfers.
                  </div>
                </div>
              </div>

              <div>
                <h3 style={{ color: '#111827', fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Link a Different Account</h3>
                <PlaidLinkButton
                  investorId={investor.id}
                  buttonText="Link New Bank Account"
                  onSuccess={() => {
                    alert('Bank account updated!');
                    loadSettings();
                  }}
                />
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 48 }}>
              <svg style={{ width: 64, height: 64, margin: '0 auto 16px', color: '#9ca3af' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <h3 style={{ color: '#111827', fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No Bank Account Linked</h3>
              <p style={{ color: '#6b7280', marginBottom: 24 }}>Link a bank account to make deposits and receive withdrawals</p>
              <PlaidLinkButton
                investorId={investor.id}
                onSuccess={() => {
                  alert('Bank account linked!');
                  loadSettings();
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div style={{ ...cardStyle, padding: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>Notification Preferences</h2>
          <p style={{ color: '#6b7280', marginBottom: 32, fontSize: 14 }}>Choose which notifications you'd like to receive via email</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { key: 'email_deposits', label: 'Deposit Confirmations', desc: 'When your deposit is received and processed' },
              { key: 'email_withdrawals', label: 'Withdrawal Updates', desc: 'When your withdrawal is processed or arrives' },
              { key: 'email_distributions', label: 'Profit Distributions', desc: 'When a profit distribution is ready or paid' },
              { key: 'email_vehicle_updates', label: 'Vehicle Updates', desc: 'When a vehicle in your pool is purchased or sold' },
              { key: 'email_reports', label: 'Report Availability', desc: 'When monthly or quarterly reports are generated' },
              { key: 'email_announcements', label: 'Announcements', desc: 'Platform news, new features, and updates' },
            ].map(({ key, label, desc }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                <div>
                  <div style={{ color: '#111827', fontWeight: 500 }}>{label}</div>
                  <div style={{ color: '#6b7280', fontSize: 14 }}>{desc}</div>
                </div>
                <button
                  onClick={() => setNotifications({ ...notifications, [key]: !notifications[key] })}
                  style={{
                    width: 48, height: 24, borderRadius: 999, position: 'relative', border: 'none', cursor: 'pointer', transition: 'background-color 0.2s',
                    backgroundColor: notifications[key] ? '#111827' : '#d1d5db',
                  }}
                >
                  <div style={{
                    width: 20, height: 20, backgroundColor: '#fff', borderRadius: '50%', position: 'absolute', top: 2, transition: 'left 0.2s',
                    left: notifications[key] ? 26 : 2,
                  }} />
                </button>
              </div>
            ))}

            <div style={{ paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                <div>
                  <div style={{ color: '#111827', fontWeight: 500 }}>In-App Notifications</div>
                  <div style={{ color: '#6b7280', fontSize: 14 }}>Show all notifications in the investor portal</div>
                </div>
                <button
                  onClick={() => setNotifications({ ...notifications, in_app_all: !notifications.in_app_all })}
                  style={{
                    width: 48, height: 24, borderRadius: 999, position: 'relative', border: 'none', cursor: 'pointer', transition: 'background-color 0.2s',
                    backgroundColor: notifications.in_app_all ? '#111827' : '#d1d5db',
                  }}
                >
                  <div style={{
                    width: 20, height: 20, backgroundColor: '#fff', borderRadius: '50%', position: 'absolute', top: 2, transition: 'left 0.2s',
                    left: notifications.in_app_all ? 26 : 2,
                  }} />
                </button>
              </div>
            </div>

            <button
              onClick={handleSaveNotifications}
              disabled={saving}
              style={{
                padding: '12px 32px', backgroundColor: saving ? '#e5e7eb' : '#111827', color: saving ? '#9ca3af' : '#fff',
                borderRadius: 8, fontWeight: 600, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14, alignSelf: 'flex-start', marginTop: 8,
              }}
            >
              {saving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ ...cardStyle, padding: 32, marginBottom: 0 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 24px' }}>Change Password</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 400 }}>
              <div>
                <label style={{ display: 'block', color: '#111827', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>New Password</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 characters" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', color: '#111827', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Confirm New Password</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter new password" style={inputStyle} />
              </div>
              <button
                onClick={handleChangePassword}
                disabled={changingPassword || !newPassword || !confirmPassword}
                style={{
                  padding: '12px 32px', backgroundColor: (changingPassword || !newPassword || !confirmPassword) ? '#e5e7eb' : '#111827',
                  color: (changingPassword || !newPassword || !confirmPassword) ? '#9ca3af' : '#fff',
                  borderRadius: 8, fontWeight: 600, border: 'none', cursor: (changingPassword || !newPassword || !confirmPassword) ? 'not-allowed' : 'pointer', fontSize: 14, alignSelf: 'flex-start',
                }}
              >
                {changingPassword ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </div>

          <div style={{ ...cardStyle, padding: 32, marginBottom: 0 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 16px' }}>Accreditation Status</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              {investor?.accredited_investor ? (
                <>
                  <div style={{ width: 48, height: 48, backgroundColor: '#ecfdf5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg style={{ width: 24, height: 24, color: '#059669' }} fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ color: '#111827', fontWeight: 600 }}>Verified Accredited Investor</div>
                    <div style={{ color: '#6b7280', fontSize: 14 }}>
                      Method: {investor.accreditation_method || 'N/A'} | Verified: {investor.accreditation_date ? new Date(investor.accreditation_date).toLocaleDateString() : 'N/A'}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ width: 48, height: 48, backgroundColor: '#fffbeb', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg style={{ width: 24, height: 24, color: '#d97706' }} fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ color: '#111827', fontWeight: 600 }}>Not Yet Verified</div>
                    <div style={{ color: '#6b7280', fontSize: 14 }}>Complete accreditation to unlock full investment features</div>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => navigate('/investor/accreditation')}
              style={{ padding: '12px 24px', backgroundColor: '#f3f4f6', color: '#111827', borderRadius: 8, fontWeight: 600, border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: 14 }}
            >
              {investor?.accredited_investor ? 'View Accreditation' : 'Start Accreditation'}
            </button>
          </div>

          <div style={{ backgroundColor: '#fef2f2', borderRadius: 12, border: '1px solid #fecaca', padding: 32 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#dc2626', margin: '0 0 16px' }}>Account Actions</h2>
            <button
              onClick={handleSignOut}
              style={{ padding: '12px 24px', backgroundColor: '#dc2626', color: '#fff', borderRadius: 8, fontWeight: 600, border: 'none', cursor: 'pointer', fontSize: 14 }}
            >
              Sign Out
            </button>
          </div>
        </div>
      )}

    </InvestorLayout>
  );
}
