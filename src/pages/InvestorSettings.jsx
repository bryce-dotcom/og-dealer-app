import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PlaidLinkButton from '../components/PlaidLinkButton';

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
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500"></div>
      </div>
    );
  }

  const tabs = [
    { id: 'profile', label: 'Profile' },
    { id: 'bank', label: 'Bank Account' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'security', label: 'Security' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Settings</h1>
            <p className="text-blue-200">Manage your account and preferences</p>
          </div>
          <button
            onClick={() => navigate('/investor/dashboard')}
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition"
          >
            ← Dashboard
          </button>
        </div>

        {/* Account Summary */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-8">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-white text-3xl font-bold">
              {fullName?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white">{fullName}</h2>
              <p className="text-blue-200">{investor?.email}</p>
              <div className="flex gap-4 mt-2 text-sm">
                <span className="text-slate-400">Member since {new Date(investor?.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  investor?.status === 'active' ? 'text-green-400 bg-green-500/20' : 'text-amber-400 bg-amber-500/20'
                }`}>{investor?.status}</span>
                {investor?.accredited_investor && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold text-blue-400 bg-blue-500/20">Accredited</span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-blue-200">Total Invested</div>
              <div className="text-2xl font-bold text-white">{formatCurrency(investor?.total_invested)}</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-white/20">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 font-semibold transition border-b-2 ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
            <h2 className="text-2xl font-bold text-white mb-6">Personal Information</h2>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-white font-semibold mb-2">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-white font-semibold mb-2">Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-white font-semibold mb-2">Email</label>
                <input
                  type="email"
                  value={investor?.email || ''}
                  disabled
                  className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-400 cursor-not-allowed"
                />
                <p className="text-slate-500 text-xs mt-1">Contact support to change your email address</p>
              </div>

              <div>
                <label className="block text-white font-semibold mb-4">Mailing Address</label>
                <div className="space-y-4">
                  <input
                    type="text"
                    value={address.street}
                    onChange={(e) => setAddress({ ...address, street: e.target.value })}
                    placeholder="Street Address"
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                  />
                  <div className="grid grid-cols-3 gap-4">
                    <input
                      type="text"
                      value={address.city}
                      onChange={(e) => setAddress({ ...address, city: e.target.value })}
                      placeholder="City"
                      className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                    />
                    <input
                      type="text"
                      value={address.state}
                      onChange={(e) => setAddress({ ...address, state: e.target.value })}
                      placeholder="State"
                      className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                    />
                    <input
                      type="text"
                      value={address.zip}
                      onChange={(e) => setAddress({ ...address, zip: e.target.value })}
                      placeholder="ZIP"
                      className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-white font-semibold mb-2">Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                >
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
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded-lg font-semibold transition"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}

        {/* Bank Account Tab */}
        {activeTab === 'bank' && (
          <div className="space-y-6">
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
              <h2 className="text-2xl font-bold text-white mb-6">Linked Bank Account</h2>

              {investor?.linked_bank_account ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-6 bg-slate-800/50 rounded-xl border border-slate-700">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-blue-500/20 rounded-full flex items-center justify-center">
                        <svg className="w-7 h-7 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                          <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-white text-lg font-semibold">
                          {investor.linked_bank_account.name || 'Bank Account'}
                        </div>
                        <div className="text-blue-200">
                          {investor.linked_bank_account.type === 'checking' ? 'Checking' : 'Savings'} ****{investor.linked_bank_account.mask || '0000'}
                        </div>
                        <div className="text-green-400 text-sm mt-1 flex items-center gap-1">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          Connected via Plaid
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-amber-900/30 border border-amber-500/30 rounded-lg p-4">
                    <div className="flex gap-2 text-amber-200 text-sm">
                      <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <div>
                        <strong className="text-white">To change your bank account:</strong> Link a new account below. The new account will replace the current one for all future transfers.
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-white font-semibold mb-3">Link a Different Account</h3>
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
                <div className="text-center py-12">
                  <svg className="w-16 h-16 mx-auto mb-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  <h3 className="text-white text-lg font-semibold mb-2">No Bank Account Linked</h3>
                  <p className="text-slate-400 mb-6">Link a bank account to make deposits and receive withdrawals</p>
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
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
            <h2 className="text-2xl font-bold text-white mb-6">Notification Preferences</h2>
            <p className="text-blue-200 mb-8">Choose which notifications you'd like to receive via email</p>

            <div className="space-y-4">
              {[
                { key: 'email_deposits', label: 'Deposit Confirmations', desc: 'When your deposit is received and processed' },
                { key: 'email_withdrawals', label: 'Withdrawal Updates', desc: 'When your withdrawal is processed or arrives' },
                { key: 'email_distributions', label: 'Profit Distributions', desc: 'When a profit distribution is ready or paid' },
                { key: 'email_vehicle_updates', label: 'Vehicle Updates', desc: 'When a vehicle in your pool is purchased or sold' },
                { key: 'email_reports', label: 'Report Availability', desc: 'When monthly or quarterly reports are generated' },
                { key: 'email_announcements', label: 'Announcements', desc: 'Platform news, new features, and updates' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <div>
                    <div className="text-white font-medium">{label}</div>
                    <div className="text-slate-400 text-sm">{desc}</div>
                  </div>
                  <button
                    onClick={() => setNotifications({ ...notifications, [key]: !notifications[key] })}
                    className={`w-12 h-6 rounded-full transition-colors relative ${
                      notifications[key] ? 'bg-blue-600' : 'bg-slate-600'
                    }`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                      notifications[key] ? 'translate-x-6' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              ))}

              <div className="pt-4 border-t border-white/10">
                <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <div>
                    <div className="text-white font-medium">In-App Notifications</div>
                    <div className="text-slate-400 text-sm">Show all notifications in the investor portal</div>
                  </div>
                  <button
                    onClick={() => setNotifications({ ...notifications, in_app_all: !notifications.in_app_all })}
                    className={`w-12 h-6 rounded-full transition-colors relative ${
                      notifications.in_app_all ? 'bg-blue-600' : 'bg-slate-600'
                    }`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                      notifications.in_app_all ? 'translate-x-6' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              </div>

              <button
                onClick={handleSaveNotifications}
                disabled={saving}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded-lg font-semibold transition"
              >
                {saving ? 'Saving...' : 'Save Preferences'}
              </button>
            </div>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
              <h2 className="text-2xl font-bold text-white mb-6">Change Password</h2>
              <div className="space-y-4 max-w-md">
                <div>
                  <label className="block text-white font-semibold mb-2">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-white font-semibold mb-2">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                  />
                </div>
                <button
                  onClick={handleChangePassword}
                  disabled={changingPassword || !newPassword || !confirmPassword}
                  className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded-lg font-semibold transition"
                >
                  {changingPassword ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
              <h2 className="text-2xl font-bold text-white mb-4">Accreditation Status</h2>
              <div className="flex items-center gap-4 mb-4">
                {investor?.accredited_investor ? (
                  <>
                    <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-white font-semibold">Verified Accredited Investor</div>
                      <div className="text-slate-400 text-sm">
                        Method: {investor.accreditation_method || 'N/A'} | Verified: {investor.accreditation_date ? new Date(investor.accreditation_date).toLocaleDateString() : 'N/A'}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-white font-semibold">Not Yet Verified</div>
                      <div className="text-slate-400 text-sm">Complete accreditation to unlock full investment features</div>
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={() => navigate('/investor/accreditation')}
                className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition"
              >
                {investor?.accredited_investor ? 'View Accreditation' : 'Start Accreditation'}
              </button>
            </div>

            <div className="bg-red-900/20 backdrop-blur-lg rounded-2xl p-8 border border-red-500/30">
              <h2 className="text-xl font-bold text-red-400 mb-4">Account Actions</h2>
              <button
                onClick={handleSignOut}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
