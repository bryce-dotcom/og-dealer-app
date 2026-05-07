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

  // True when we landed here from an email confirmation / magic link.
  // Supabase processes the URL hash asynchronously; show a confirming state
  // instead of the login form so users don't think they need to log in again.
  const [confirming, setConfirming] = useState(() => {
    if (typeof window === 'undefined') return false;
    const hash = window.location.hash || '';
    return /access_token=|type=signup|type=recovery|type=magiclink/.test(hash);
  });

  // Two paths to a session here:
  //  1. Already-logged-in user navigates to /login → getSession returns it immediately
  //  2. User just clicked a confirmation/magic link → Supabase processes the URL hash
  //     asynchronously and fires SIGNED_IN later. We need to listen, not just poll once.
  useEffect(() => {
    let mounted = true;

    const handleSession = async (session) => {
      if (!mounted || !session?.user) return;
      await loadDealerForUser(session.user.id);
      // If loadDealerForUser navigated, fine. Otherwise clear the confirming spinner
      // so the user falls back to the login form rather than a frozen screen.
      if (mounted) setConfirming(false);
    };

    // Path 1: existing session
    supabase.auth.getSession().then(({ data: { session } }) => handleSession(session));

    // Path 2: future SIGNED_IN events (covers email confirmation + magic-link flows)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
        handleSession(session);
      }
    });

    // Safety: if neither path produces a session within a few seconds, drop the
    // confirming state so the user isn't stuck on a spinner.
    const safety = setTimeout(() => mounted && setConfirming(false), 5000);

    return () => {
      mounted = false;
      subscription?.unsubscribe?.();
      clearTimeout(safety);
    };
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
      // Supabase returns "Email not confirmed" when the user skipped the confirmation link.
      // Surface an actionable message with a resend option instead of the raw string.
      if (/email not confirmed|not confirmed/i.test(authError.message)) {
        setError('Your email has not been confirmed yet. Check your inbox (and spam) for the confirmation link, or click "Forgot password?" to get a new link.');
      } else {
        setError(authError.message);
      }
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

    // Check if user is an investor - redirect to investor portal
    const { data: investorData } = await supabase
      .from('investors')
      .select('id')
      .eq('user_id', data.user.id)
      .maybeSingle();

    if (investorData) {
      navigate('/investor/dashboard');
      setLoading(false);
      return;
    }

    // Not a dealer owner, employee, or investor
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
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`
      }
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

    // Supabase returns an empty `identities` array when the email is already
    // registered. Catch this BEFORE creating a dealer record for the existing user.
    if (authData.user.identities && authData.user.identities.length === 0) {
      setError('An account with this email already exists. Try signing in or resetting your password.');
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

    // If the Supabase project requires email confirmation, `session` will be null
    // after signUp. Don't try to navigate to /dashboard — there's no session yet.
    if (!authData.session) {
      setMessage(`Account created for ${dealerName.trim()}. Check your email (including spam) for a confirmation link, then sign in.`);
      setMode('login');
      setPassword('');
      setDealerName('');
      setLoading(false);
      return;
    }

    // Confirmation disabled: we have a session, go straight to the dashboard.
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

  // Confirming state — user just clicked a magic/confirmation link, Supabase is
  // processing the URL hash. Show a spinner until SIGNED_IN fires (or the safety
  // timeout drops us back to the form).
  if (confirming) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '60px', height: '60px', backgroundColor: '#f97316', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '24px', fontWeight: '700', color: '#fff' }}>OG</div>
          <div style={{ color: '#fff', fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>Confirming your account…</div>
          <div style={{ color: '#71717a', fontSize: '13px' }}>One sec, signing you in.</div>
        </div>
      </div>
    );
  }

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