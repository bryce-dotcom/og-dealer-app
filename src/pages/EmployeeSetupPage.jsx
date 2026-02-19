import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { Check } from 'lucide-react';

export default function EmployeeSetupPage() {
  const navigate = useNavigate();
  const { setDealer } = useStore();

  const [loading, setLoading] = useState(true);
  const [settingPassword, setSettingPassword] = useState(false);
  const [error, setError] = useState('');
  const [employeeData, setEmployeeData] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    checkInvitation();
  }, []);

  async function checkInvitation() {
    setLoading(true);
    try {
      // Check if user is authenticated (came from invitation link)
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        setError('Invalid or expired invitation link. Please contact your manager.');
        setLoading(false);
        return;
      }

      // Get employee record linked to this user
      const { data: employee, error: empError } = await supabase
        .from('employees')
        .select('*, dealer_settings!inner(dealer_name, id)')
        .eq('user_id', session.user.id)
        .single();

      if (empError || !employee) {
        console.error('Employee lookup error:', empError);
        setError('Employee record not found. Please contact your manager.');
        setLoading(false);
        return;
      }

      setEmployeeData(employee);
      setLoading(false);
    } catch (err) {
      console.error('Setup error:', err);
      setError('Failed to load invitation. Please try again.');
      setLoading(false);
    }
  }

  async function completeSetup() {
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSettingPassword(true);
    setError('');

    try {
      // Update user password
      const { error: pwError } = await supabase.auth.updateUser({
        password: password
      });

      if (pwError) {
        throw pwError;
      }

      // Set dealer in store for this employee
      if (employeeData?.dealer_settings) {
        setDealer(employeeData.dealer_settings);
      }

      // Redirect to dashboard
      navigate('/dashboard');
    } catch (err) {
      console.error('Password setup error:', err);
      setError(err.message || 'Failed to set password. Please try again.');
      setSettingPassword(false);
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '14px 16px',
    backgroundColor: '#18181b',
    border: '1px solid #27272a',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '15px',
    outline: 'none'
  };

  const buttonStyle = {
    width: '100%',
    padding: '14px',
    backgroundColor: '#f97316',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    opacity: settingPassword ? 0.7 : 1
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ color: '#a1a1aa' }}>Loading your invitation...</div>
      </div>
    );
  }

  if (error && !employeeData) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ width: '100%', maxWidth: '400px', backgroundColor: '#18181b', borderRadius: '16px', padding: '40px', border: '1px solid #27272a', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: '600', margin: '0 0 12px' }}>Invitation Error</h2>
          <p style={{ color: '#a1a1aa', fontSize: '14px', margin: 0 }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '450px', backgroundColor: '#18181b', borderRadius: '16px', padding: '40px', border: '1px solid #27272a' }}>
        {/* Welcome Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ width: '60px', height: '60px', backgroundColor: '#f97316', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '24px', fontWeight: '700', color: '#fff' }}>
            {employeeData?.name?.[0]?.toUpperCase() || '?'}
          </div>
          <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: '700', margin: '0 0 8px' }}>
            Welcome, {employeeData?.name}!
          </h1>
          <p style={{ color: '#71717a', fontSize: '14px', margin: 0 }}>
            You've been invited to join <strong style={{ color: '#f97316' }}>{employeeData?.dealer_settings?.dealer_name}</strong>
          </p>
        </div>

        {/* Employee Info */}
        <div style={{ backgroundColor: '#09090b', borderRadius: '12px', padding: '16px', marginBottom: '24px', border: '1px solid #27272a' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Check size={16} style={{ color: '#22c55e' }} />
            <span style={{ color: '#a1a1aa', fontSize: '13px' }}>Role:</span>
            <span style={{ color: '#fff', fontSize: '13px', fontWeight: '600' }}>{employeeData?.role}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Check size={16} style={{ color: '#22c55e' }} />
            <span style={{ color: '#a1a1aa', fontSize: '13px' }}>Access Level:</span>
            <span style={{ color: '#fff', fontSize: '13px', fontWeight: '600' }}>
              {employeeData?.access_level === 'admin' && 'Admin'}
              {employeeData?.access_level === 'manager' && 'Manager'}
              {employeeData?.access_level === 'employee' && 'Employee'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Check size={16} style={{ color: '#22c55e' }} />
            <span style={{ color: '#a1a1aa', fontSize: '13px' }}>Email:</span>
            <span style={{ color: '#fff', fontSize: '13px' }}>{employeeData?.email}</span>
          </div>
        </div>

        {/* Password Setup Form */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ color: '#fff', fontSize: '16px', fontWeight: '600', margin: '0 0 16px' }}>
            Choose Your Password
          </h3>

          {error && (
            <div style={{ padding: '12px 16px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#ef4444', fontSize: '14px', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: '#a1a1aa', fontSize: '13px', marginBottom: '6px' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password (min 6 characters)"
              style={inputStyle}
              minLength={6}
              required
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', color: '#a1a1aa', fontSize: '13px', marginBottom: '6px' }}>
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              style={inputStyle}
              minLength={6}
              required
            />
          </div>

          <button
            onClick={completeSetup}
            disabled={settingPassword || !password || !confirmPassword}
            style={buttonStyle}
          >
            {settingPassword ? 'Setting up...' : 'Complete Setup & Sign In'}
          </button>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', paddingTop: '24px', borderTop: '1px solid #27272a' }}>
          <p style={{ color: '#52525b', fontSize: '12px', margin: 0 }}>
            Having trouble? Contact your manager for assistance.
          </p>
        </div>
      </div>
    </div>
  );
}
