import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';

export default function Login() {
  const navigate = useNavigate();
  const { setDealer } = useStore();
  
  const [mode, setMode] = useState('login'); // 'login', 'signup', or 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dealerName, setDealerName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Check if already logged in
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await loadDealerForUser(session.user.id);
      }
    };
    checkSession();
  }, []);

  // Load dealer for authenticated user
  const loadDealerForUser = async (userId) => {
    // Check if user is a dealer owner
    const { data: dealer } = await supabase
      .from('dealer_settings')
      .select('*')
      .eq('owner_user_id', userId)
      .maybeSingle();

    if (dealer) {
      setDealer(dealer);
      navigate('/dashboard');
      return;
    }

    // Check if user is an employee
    const { data: employeeData } = await supabase
      .from('employees')
      .select('dealer_id')
      .eq('user_id', userId)
      .eq('active', true)
      .maybeSingle();

    if (employeeData) {
      // Load dealer settings for this employee
      const { data: empDealerData } = await supabase
        .from('dealer_settings')
        .select('*')
        .eq('id', employeeData.dealer_id)
        .single();

      if (empDealerData) {
        setDealer(empDealerData);
        navigate('/dashboard');
      }
    }
  };

  // Handle Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Check if user is a dealer owner
    const { data: dealer } = await supabase
      .from('dealer_settings')
      .select('*')
      .eq('owner_user_id', data.user.id)
      .maybeSingle();

    if (dealer) {
      setDealer(dealer);
      navigate('/dashboard');
      setLoading(false);
      return;
    }

    // Check if user is an employee
    const { data: employeeData } = await supabase
      .from('employees')
      .select('dealer_id')
      .eq('user_id', data.user.id)
      .eq('active', true)
      .maybeSingle();

    if (employeeData) {
      // Load dealer settings for this employee
      const { data: empDealerData } = await supabase
        .from('dealer_settings')
        .select('*')
        .eq('id', employeeData.dealer_id)
        .single();

      if (empDealerData) {
        setDealer(empDealerData);
        navigate('/dashboard');
        setLoading(false);
        return;
      }
    }

    // Not a dealer owner or employee
    setError('No dealership found for this account. Please sign up.');
    await supabase.auth.signOut();
    setLoading(false);
  };

  // Handle Password Reset
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`
    });

    if (resetError) {
      setError(resetError.message);
      setLoading(false);
      return;
    }

    setMessage('Check your email for a password reset link.');
    setLoading(false);
  };

  // Handle Signup
  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!dealerName.trim()) {
      setError('Please enter your dealership name');
      setLoading(false);
      return;
    }

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (!authData.user) {
      setError('Signup failed. Please try again.');
      setLoading(false);
      return;
    }

    // Create dealer record
    const { data: dealer, error: dealerError } = await supabase
      .from('dealer_settings')
      .insert({
        dealer_name: dealerName.trim(),
        owner_user_id: authData.user.id,
        email: email,
        subscription_status: 'trial',
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
      })
      .select()
      .single();

    if (dealerError) {
      setError('Failed to create dealership: ' + dealerError.message);
      setLoading(false);
      return;
    }

    // Check if email confirmation is required
    if (authData.user.identities?.length === 0) {
      setMessage('Check your email to confirm your account, then log in.');
      setMode('login');
      setLoading(false);
      return;
    }

    setDealer(dealer);
    navigate('/dashboard');
  };

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
    opacity: loading ? 0.7 : 1
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#09090b',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        backgroundColor: '#18181b',
        borderRadius: '16px',
        padding: '40px',
        border: '1px solid #27272a'
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '60px',
            height: '60px',
            backgroundColor: '#f97316',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: '24px',
            fontWeight: '700',
            color: '#fff'
          }}>
            OG
          </div>
          <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: '700', margin: '0 0 4px' }}>
            OG Dealer App
          </h1>
          <p style={{ color: '#71717a', fontSize: '14px', margin: 0 }}>
            {mode === 'login' && 'Sign in to your dealership'}
            {mode === 'signup' && 'Start your 14-day free trial'}
            {mode === 'forgot' && 'Reset your password'}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            padding: '12px 16px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#ef4444',
            fontSize: '14px',
            marginBottom: '20px'
          }}>
            {error}
          </div>
        )}

        {/* Success Message */}
        {message && (
          <div style={{
            padding: '12px 16px',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '8px',
            color: '#22c55e',
            fontSize: '14px',
            marginBottom: '20px'
          }}>
            {message}
          </div>
        )}

        {/* Form */}
        <form onSubmit={mode === 'login' ? handleLogin : mode === 'signup' ? handleSignup : handleForgotPassword}>
          {mode === 'signup' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: '#a1a1aa', fontSize: '13px', marginBottom: '6px' }}>
                Dealership Name
              </label>
              <input
                type="text"
                value={dealerName}
                onChange={(e) => setDealerName(e.target.value)}
                placeholder="Your Dealership Name"
                style={inputStyle}
                required
              />
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: '#a1a1aa', fontSize: '13px', marginBottom: '6px' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@dealership.com"
              style={inputStyle}
              required
            />
          </div>

          {mode !== 'forgot' && (
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', color: '#a1a1aa', fontSize: '13px', marginBottom: '6px' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={inputStyle}
                required
                minLength={6}
              />
            </div>
          )}

          {mode === 'login' && (
            <div style={{ textAlign: 'right', marginBottom: '16px' }}>
              <button
                type="button"
                onClick={() => { setMode('forgot'); setError(''); setMessage(''); }}
                style={{ color: '#71717a', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}
              >
                Forgot password?
              </button>
            </div>
          )}

          {mode === 'forgot' && <div style={{ marginBottom: '24px' }} />}

          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? 'Please wait...' : (
              mode === 'login' ? 'Sign In' :
              mode === 'signup' ? 'Start Free Trial' :
              'Send Reset Link'
            )}
          </button>
        </form>

        {/* Toggle Mode */}
        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          {mode === 'login' && (
            <p style={{ color: '#71717a', fontSize: '14px', margin: 0 }}>
              Don't have an account?{' '}
              <button
                onClick={() => { setMode('signup'); setError(''); setMessage(''); }}
                style={{ color: '#f97316', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
              >
                Sign up free
              </button>
            </p>
          )}
          {mode === 'signup' && (
            <p style={{ color: '#71717a', fontSize: '14px', margin: 0 }}>
              Already have an account?{' '}
              <button
                onClick={() => { setMode('login'); setError(''); setMessage(''); }}
                style={{ color: '#f97316', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
              >
                Sign in
              </button>
            </p>
          )}
          {mode === 'forgot' && (
            <p style={{ color: '#71717a', fontSize: '14px', margin: 0 }}>
              Remember your password?{' '}
              <button
                onClick={() => { setMode('login'); setError(''); setMessage(''); }}
                style={{ color: '#f97316', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
              >
                Back to sign in
              </button>
            </p>
          )}
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #27272a' }}>
          <p style={{ color: '#52525b', fontSize: '12px', margin: 0 }}>
            By signing up, you agree to our Terms of Service
          </p>
        </div>
      </div>
    </div>
  );
}