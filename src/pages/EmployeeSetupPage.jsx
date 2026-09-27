import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Landing page for invite and password-reset emails. The link carries a
// one-time token in the query string. On submit we send token + password to
// the complete-account-setup edge function (which verifies the token and sets
// the password server-side), then sign in with email + password like normal.
// Nothing here depends on the browser holding a session between page load and
// submit — that handoff is what failed on iPhone Safari.
export default function EmployeeSetupPage() {
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const tokenHash = params.get('token_hash');
  const type = params.get('type') === 'recovery' ? 'recovery' : 'invite';
  const email = params.get('email') || '';
  const firstName = params.get('name') || '';
  const dealerName = params.get('dealer') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [linkDead, setLinkDead] = useState(!tokenHash);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirm) { setError("The two passwords don't match."); return; }

    setBusy(true);
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/complete-account-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ token_hash: tokenHash, type, password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (j.code === 'link_expired' || j.code === 'link_invalid') { setLinkDead(true); return; }
        throw new Error(j.error || 'Something went wrong. Please try again.');
      }

      const loginEmail = j.email || email;
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
      if (signInError) {
        throw new Error(`Your password is saved. Sign in on the next screen with ${loginEmail}.`);
      }
      // /login knows how to route owners and employees to their dealership.
      navigate('/login?signed_in=1', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const page = { minHeight: '100vh', backgroundColor: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' };
  const card = { width: '100%', maxWidth: '440px', backgroundColor: '#18181b', borderRadius: '16px', padding: '32px 24px', border: '1px solid #27272a' };
  const input = { width: '100%', padding: '14px 16px', backgroundColor: '#09090b', border: '1px solid #3f3f46', borderRadius: '10px', color: '#fff', fontSize: '16px', outline: 'none', boxSizing: 'border-box' };
  const label = { display: 'block', color: '#d4d4d8', fontSize: '14px', marginBottom: '6px' };

  if (linkDead) {
    return (
      <div style={page}>
        <div style={{ ...card, textAlign: 'center' }}>
          <h1 style={{ color: '#fff', fontSize: '22px', margin: '0 0 12px' }}>This link has expired</h1>
          <p style={{ color: '#a1a1aa', fontSize: '15px', lineHeight: 1.55, margin: '0 0 8px' }}>
            Setup links work once and expire after 24 hours. If you got more than one email, only the newest link works.
          </p>
          <p style={{ color: '#a1a1aa', fontSize: '15px', lineHeight: 1.55, margin: '0 0 24px' }}>
            Ask your manager to send you a new invite, or reset your password yourself:
          </p>
          <button
            onClick={() => navigate('/login?forgot=1' + (email ? `&email=${encodeURIComponent(email)}` : ''))}
            style={{ width: '100%', padding: '14px', backgroundColor: '#f97316', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: 600, cursor: 'pointer' }}
          >
            Email me a new link
          </button>
        </div>
      </div>
    );
  }

  const heading = type === 'invite'
    ? `Welcome${firstName ? `, ${firstName}` : ''}!`
    : 'Choose your password';
  const sub = type === 'invite'
    ? `Choose a password to finish joining ${dealerName || 'your dealership'}.`
    : `Pick a password for your ${dealerName || 'OG DiX'} account.`;

  return (
    <div style={page}>
      <form onSubmit={handleSubmit} style={card}>
        <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 700, margin: '0 0 8px', textAlign: 'center' }}>{heading}</h1>
        <p style={{ color: '#a1a1aa', fontSize: '15px', margin: '0 0 24px', textAlign: 'center', lineHeight: 1.5 }}>{sub}</p>

        {email && (
          <div style={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '10px', padding: '12px 14px', marginBottom: '20px' }}>
            <div style={{ color: '#71717a', fontSize: '12px', marginBottom: '2px' }}>You'll sign in with</div>
            <div style={{ color: '#fff', fontSize: '15px', wordBreak: 'break-all' }}>{email}</div>
          </div>
        )}

        <div style={{ marginBottom: '16px' }}>
          <label style={label} htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            style={input}
          />
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={label} htmlFor="confirm-password">Type it again</label>
          <input
            id="confirm-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            style={input}
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a1a1aa', fontSize: '14px', marginBottom: '20px', cursor: 'pointer' }}>
          <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
          Show password
        </label>

        {error && (
          <div style={{ padding: '12px 14px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', color: '#fca5a5', fontSize: '14px', marginBottom: '16px', lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{ width: '100%', padding: '15px', backgroundColor: '#f97316', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}
        >
          {busy ? 'Saving…' : 'Save password & sign in'}
        </button>
      </form>
    </div>
  );
}
