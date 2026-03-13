import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const BRAND = 'OG DiX Motor Club';

// All layout uses inline styles to avoid global CSS / Tailwind conflicts
const S = {
  page: { minHeight: '100vh', backgroundColor: '#f9fafb', color: '#111827', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", display: 'flex', flexDirection: 'column' },
  header: { backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb', width: '100%' },
  headerInner: { maxWidth: '72rem', margin: '0 auto', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logo: { display: 'flex', alignItems: 'center', gap: '0.625rem' },
  logoBox: { width: 32, height: 32, backgroundColor: '#111827', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#fff', fontSize: 11, fontWeight: 700 },
  brandName: { color: '#111827', fontSize: 14, fontWeight: 600 },
  brandSub: { color: '#9ca3af', fontSize: 11 },
  mainSite: { color: '#9ca3af', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer' },
  body: { flex: 1, display: 'flex', flexDirection: 'column', width: '100%' },
  footer: { borderTop: '1px solid #e5e7eb', backgroundColor: '#fff', width: '100%' },
  footerInner: { maxWidth: '48rem', margin: '0 auto', padding: '1.5rem' },
  footerText: { fontSize: 11, color: '#9ca3af', lineHeight: 1.6 },
  footerStrong: { color: '#6b7280', fontWeight: 600 },
  // Content containers
  containerWide: { maxWidth: '48rem', margin: '0 auto', padding: '2.5rem 1.5rem', width: '100%', boxSizing: 'border-box' },
  containerNarrow: { maxWidth: '32rem', margin: '0 auto', padding: '2.5rem 1.5rem', width: '100%', boxSizing: 'border-box' },
  containerLogin: { maxWidth: '24rem', margin: '0 auto', padding: '4rem 1.5rem', width: '100%', boxSizing: 'border-box', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' },
  // Cards
  card: { backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', marginBottom: 24, overflow: 'hidden' },
  cardHeader: { padding: '1rem 1.5rem', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardBody: { padding: '1.5rem' },
  cardTitle: { fontSize: 14, fontWeight: 600, color: '#111827', margin: 0 },
  // Typography
  heading1: { fontSize: 28, fontWeight: 600, color: '#111827', margin: '0 0 12px 0' },
  subtitle: { color: '#6b7280', maxWidth: '36rem', margin: '0 auto', fontSize: 15, lineHeight: 1.6 },
  textCenter: { textAlign: 'center' },
  // Grid
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', textAlign: 'center' },
  grid4: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem', textAlign: 'center' },
  // Stats
  statValue: { fontSize: 28, fontWeight: 600, color: '#111827', margin: 0 },
  statValueGreen: { fontSize: 28, fontWeight: 600, color: '#16a34a', margin: 0 },
  statLabel: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  // Buttons
  btnPrimary: { padding: '12px 32px', backgroundColor: '#111827', color: '#fff', fontSize: 14, fontWeight: 600, border: 'none', borderRadius: 8, cursor: 'pointer' },
  btnDisabled: { padding: '12px 32px', backgroundColor: '#f3f4f6', color: '#9ca3af', fontSize: 14, fontWeight: 600, border: 'none', borderRadius: 8, cursor: 'not-allowed' },
  btnLink: { background: 'none', border: 'none', color: '#2563eb', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  btnGhost: { background: 'none', border: 'none', color: '#9ca3af', fontSize: 12, cursor: 'pointer' },
  // Forms
  input: { width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, color: '#111827', outline: 'none', boxSizing: 'border-box', backgroundColor: '#fff' },
  label: { display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 },
  formGroup: { marginBottom: 16 },
  // Misc
  badge: (bg, color) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', backgroundColor: bg, color: color, fontSize: 12, fontWeight: 500, borderRadius: 99 }),
  errorBox: { backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 16px', marginBottom: 16 },
  errorText: { color: '#b91c1c', fontSize: 12, margin: 0 },
  riskBox: { backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: 20, marginBottom: 24, display: 'flex', gap: 12 },
  checkbox: { marginTop: 2, width: 16, height: 16, flexShrink: 0, accentColor: '#111827' },
  agreementRow: { display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' },
  divider: { borderTop: '1px solid #f3f4f6', margin: '16px 0' },
  stepCircle: { width: 28, height: 28, backgroundColor: '#111827', color: '#fff', fontSize: 12, fontWeight: 700, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  securityIcon: { width: 40, height: 40, backgroundColor: '#f3f4f6', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' },
  tabs: { display: 'flex', borderBottom: '1px solid #e5e7eb' },
  tab: (active) => ({ flex: 1, padding: '12px 0', fontSize: 14, fontWeight: 500, background: 'none', border: 'none', borderBottom: active ? '2px solid #111827' : '2px solid transparent', color: active ? '#111827' : '#9ca3af', cursor: 'pointer' }),
};

export default function InvestorLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');

  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [inviteData, setInviteData] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteStep, setInviteStep] = useState('welcome');

  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedRisk, setAgreedRisk] = useState(false);
  const [agreedAccredited, setAgreedAccredited] = useState(false);
  const [showAgreement, setShowAgreement] = useState(false);

  useEffect(() => {
    const prev = { bg: document.body.style.backgroundColor, color: document.body.style.color };
    document.body.style.backgroundColor = '#f9fafb';
    document.body.style.color = '#111827';
    return () => { document.body.style.backgroundColor = prev.bg; document.body.style.color = prev.color; };
  }, []);

  useEffect(() => { if (inviteToken) { setMode('invite'); loadInviteData(inviteToken); } }, [inviteToken]);

  async function loadInviteData(token) {
    try {
      setInviteLoading(true);
      setInviteError('');
      const { data: investors, error } = await supabase.from('investors').select('*').eq('status', 'invited');
      if (error) throw error;
      let foundInvestor = null;
      for (const inv of (investors || [])) {
        try {
          const notes = JSON.parse(inv.notes || '{}');
          if (notes.invite_token === token) { foundInvestor = { ...inv, parsedNotes: notes }; break; }
        } catch { /* skip */ }
      }
      if (!foundInvestor) { setInviteError('This invitation link is invalid or has expired.'); return; }
      let poolData = null;
      if (foundInvestor.parsedNotes.pool_id) {
        const { data: pool } = await supabase.from('investment_pools')
          .select('pool_name, description, status, pool_type, annual_return_rate, payout_frequency, investor_profit_share, platform_fee_share, dealer_profit_share')
          .eq('id', foundInvestor.parsedNotes.pool_id).single();
        poolData = pool;
      }
      setInviteData({ investor: foundInvestor, pool: poolData, terms: foundInvestor.parsedNotes.custom_terms || {}, specialNotes: foundInvestor.parsedNotes.special_notes || '' });
      setEmail(foundInvestor.email || '');
      setFullName(foundInvestor.full_name || '');
    } catch (err) {
      console.error('Error loading invite:', err);
      setInviteError('Unable to verify your invitation. Please contact your representative.');
    } finally { setInviteLoading(false); }
  }

  async function handleLogin() {
    if (!email || !password) { setError('Please enter your credentials.'); return; }
    setError('');
    try {
      setLoading(true);
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      const { data: investor } = await supabase.from('investors').select('*').eq('user_id', data.user.id).single();
      if (!investor) { setError('No investor account found. If you received an invitation, please create your account first.'); await supabase.auth.signOut(); return; }
      navigate('/investor/dashboard');
    } catch (err) {
      if (err.message?.includes('Invalid login')) { setError('Invalid email or password. If you received an invite, please create your account first using the link in your invitation email.'); }
      else { setError(err.message); }
    } finally { setLoading(false); }
  }

  async function handleSignup() {
    if (!email || !password || !fullName) { setError('All fields are required.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (mode === 'invite' && (!agreedTerms || !agreedRisk || !agreedAccredited)) { setError('You must accept all agreements to proceed.'); return; }
    setError('');
    try {
      setLoading(true);
      const { data: authData, error: authError } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin + '/investor/login' } });
      if (authError) throw authError;
      if (mode === 'invite' && inviteData?.investor) {
        await supabase.from('investors').update({ user_id: authData.user.id, full_name: fullName, status: 'active' }).eq('id', inviteData.investor.id);
        if (inviteData.investor.parsedNotes?.pool_id) {
          await supabase.from('investor_pool_shares').insert({ investor_id: inviteData.investor.id, pool_id: inviteData.investor.parsedNotes.pool_id, capital_invested: 0, ownership_percentage: 0, total_profit_earned: 0, total_distributions: 0, current_roi: 0, active: true });
        }
      } else {
        await supabase.from('investors').insert({ user_id: authData.user.id, email, full_name: fullName, status: 'pending' });
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) { setError('Account created. Please check your email to verify before signing in.'); setMode('login'); setPassword(''); return; }
      navigate('/investor/dashboard');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  function fmt(amount) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount || 0); }
  function payoutLabel(f) { return { monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Annually' }[f] || f || 'N/A'; }
  function calcReturn(inv, rate, freq) {
    const annual = (Number(inv) || 10000) * ((Number(rate) || 0) / 100);
    if (freq === 'monthly') return { per: annual / 12, label: 'month', annual };
    if (freq === 'quarterly') return { per: annual / 4, label: 'quarter', annual };
    return { per: annual, label: 'year', annual };
  }

  function Shell({ children }) {
    return (
      <div style={S.page}>
        <header style={S.header}>
          <div style={S.headerInner}>
            <div style={S.logo}>
              <div style={S.logoBox}><span style={S.logoText}>OG</span></div>
              <div>
                <div style={S.brandName}>{BRAND}</div>
                <div style={S.brandSub}>Investor Portal</div>
              </div>
            </div>
            <button style={S.mainSite} onClick={() => navigate('/')}>Main Site</button>
          </div>
        </header>
        <div style={S.body}>{children}</div>
        <footer style={S.footer}>
          <div style={S.footerInner}>
            <p style={S.footerText}>
              <strong style={S.footerStrong}>Important Disclosures: </strong>
              Securities offered pursuant to Rule 506(b) of Regulation D under the Securities Act of 1933.
              Not registered with the SEC or any state securities commission. Investment involves risk including loss of principal.
              Past performance is not indicative of future results. Not FDIC insured. Not bank guaranteed. May lose value.
              For accredited investors only.
            </p>
          </div>
        </footer>
      </div>
    );
  }

  // ─── Loading ─────────────────────────────────────────────
  if (mode === 'invite' && inviteLoading) {
    return (
      <Shell>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8rem 1.5rem' }}>
          <div style={S.textCenter}>
            <div style={{ width: 32, height: 32, border: '2px solid #d1d5db', borderTopColor: '#111827', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
            <p style={{ color: '#6b7280', fontSize: 14 }}>Verifying your invitation...</p>
          </div>
        </div>
      </Shell>
    );
  }

  // ─── Invite Error ────────────────────────────────────────
  if (mode === 'invite' && inviteError) {
    return (
      <Shell>
        <div style={{ ...S.containerNarrow, textAlign: 'center', paddingTop: '4rem' }}>
          <div style={{ width: 48, height: 48, backgroundColor: '#fef2f2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg style={{ width: 24, height: 24, color: '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Invitation Not Found</h2>
          <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>{inviteError}</p>
          <button style={S.btnLink} onClick={() => { setMode('login'); setInviteError(''); }}>Go to Sign In</button>
        </div>
      </Shell>
    );
  }

  // ─── Invite Welcome ─────────────────────────────────────
  if (mode === 'invite' && inviteStep === 'welcome' && inviteData) {
    const terms = inviteData.terms;
    const poolType = terms.pool_type || inviteData.pool?.pool_type || 'merchant_rate';
    const isFixed = poolType === 'fixed_return';
    const isMerchant = poolType === 'merchant_rate';
    const isProfit = poolType === 'profit_share';
    const typeLabel = isFixed ? 'Fixed Income' : isMerchant ? 'Transaction-Based' : 'Profit Share';
    const typeBadge = isFixed ? S.badge('#ecfdf5', '#047857') : isMerchant ? S.badge('#fffbeb', '#b45309') : S.badge('#f5f3ff', '#6d28d9');

    return (
      <Shell>
        <div style={S.containerWide}>

          {/* Intro */}
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ marginBottom: 16 }}>
              <span style={S.badge('#eff6ff', '#1d4ed8')}>
                <svg style={{ width: 14, height: 14 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                Private Invitation
              </span>
            </div>
            <h1 style={S.heading1}>You've been invited to invest</h1>
            <p style={S.subtitle}>
              {inviteData.investor.full_name}, you've been personally invited to participate in a private
              automotive investment opportunity with {BRAND}.
            </p>
          </div>

          {/* Investment Terms Card */}
          <div style={S.card}>
            <div style={S.cardHeader}>
              <h2 style={S.cardTitle}>Investment Terms</h2>
              <span style={typeBadge}>{typeLabel}</span>
            </div>
            <div style={S.cardBody}>
              {isMerchant && (
                <div style={S.grid3}>
                  <div>
                    <div style={S.statValue}>{terms.investor_profit_share || 3}%</div>
                    <div style={S.statLabel}>Per Transaction</div>
                  </div>
                  <div>
                    <div style={S.statValueGreen}>{fmt((15000 * (terms.investor_profit_share || 3)) / 100)}</div>
                    <div style={S.statLabel}>Example on $15k Deal</div>
                  </div>
                  <div>
                    <div style={S.statValue}>{fmt(terms.min_investment || 10000)}</div>
                    <div style={S.statLabel}>Minimum Investment</div>
                  </div>
                </div>
              )}

              {isFixed && (() => {
                const rate = terms.annual_return_rate || inviteData.pool?.annual_return_rate || 0;
                const freq = terms.payout_frequency || inviteData.pool?.payout_frequency || 'quarterly';
                const minInv = terms.min_investment || 10000;
                const ret = calcReturn(minInv, rate, freq);
                return (
                  <div style={S.grid4}>
                    <div><div style={S.statValue}>{rate}%</div><div style={S.statLabel}>Annual Yield</div></div>
                    <div><div style={S.statValue}>{payoutLabel(freq)}</div><div style={S.statLabel}>Payout Schedule</div></div>
                    <div><div style={S.statValueGreen}>{fmt(ret.per)}</div><div style={S.statLabel}>Per {ret.label}</div></div>
                    <div><div style={S.statValue}>{fmt(minInv)}</div><div style={S.statLabel}>Minimum</div></div>
                  </div>
                );
              })()}

              {isProfit && (
                <div style={S.grid4}>
                  <div><div style={S.statValue}>{terms.investor_profit_share || 60}%</div><div style={S.statLabel}>Your Share</div></div>
                  <div><div style={{ ...S.statValue, color: '#9ca3af' }}>{terms.platform_fee_share || 20}%</div><div style={S.statLabel}>Management Fee</div></div>
                  <div><div style={{ ...S.statValue, color: '#9ca3af' }}>{terms.dealer_profit_share || 20}%</div><div style={S.statLabel}>Operator Share</div></div>
                  <div><div style={S.statValue}>{fmt(terms.min_investment || 10000)}</div><div style={S.statLabel}>Minimum</div></div>
                </div>
              )}

              {inviteData.pool && (
                <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #f3f4f6' }}>
                  <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Fund</div>
                  <div style={{ color: '#111827', fontWeight: 500 }}>{inviteData.pool.pool_name}</div>
                  {inviteData.pool.description && <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>{inviteData.pool.description}</p>}
                </div>
              )}
            </div>
          </div>

          {/* How It Works */}
          <div style={S.card}>
            <div style={{ ...S.cardHeader, justifyContent: 'flex-start' }}>
              <h2 style={S.cardTitle}>How It Works</h2>
            </div>
            <div style={S.cardBody}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                {[
                  { n: '1', title: 'Fund Your Account', desc: 'Complete verification and securely transfer your investment via ACH bank transfer.' },
                  { n: '2', title: 'Capital Deployed', desc: 'Your capital is invested into vetted automotive inventory. Every acquisition is tracked transparently.' },
                  { n: '3', title: 'Earn Returns', desc: isMerchant
                    ? 'Earn your percentage on every transaction your capital funds. Real-time tracking in your dashboard.'
                    : isFixed
                    ? `Receive ${payoutLabel(terms.payout_frequency || 'quarterly').toLowerCase()} distributions deposited directly to your bank account.`
                    : 'Profit distributions are calculated per vehicle sale and deposited to your linked bank account.' },
                ].map(step => (
                  <div key={step.n} style={{ display: 'flex', gap: 12 }}>
                    <div style={S.stepCircle}>{step.n}</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#111827', marginBottom: 4 }}>{step.title}</div>
                      <p style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6, margin: 0 }}>{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Risk Disclosure */}
          <div style={S.riskBox}>
            <svg style={{ width: 20, height: 20, color: '#d97706', flexShrink: 0, marginTop: 2 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>Risk Disclosure</div>
              <p style={{ fontSize: 12, color: '#b45309', lineHeight: 1.6, margin: 0 }}>
                This investment involves significant risk including the possible loss of your entire investment.
                These securities are illiquid with no secondary market. Vehicle values fluctuate based on market conditions.
                {isFixed ? ' While structured as a fixed return, distributions' : ' Distributions'} depend on fund performance and are not guaranteed.
                Only invest capital you can afford to lose.
              </p>
            </div>
          </div>

          {/* Security */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: 32 }}>
            {[
              { label: 'Bank-Grade Security', desc: '256-bit TLS encryption. Plaid-secured transfers.' },
              { label: 'Full Transparency', desc: 'Real-time access to every transaction in your dashboard.' },
              { label: 'Regulatory Compliance', desc: 'Structured under SEC Regulation D, Rule 506(b).' },
            ].map(item => (
              <div key={item.label} style={{ textAlign: 'center' }}>
                <div style={S.securityIcon}>
                  <svg style={{ width: 20, height: 20, color: '#4b5563' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#111827' }}>{item.label}</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{item.desc}</div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div style={S.textCenter}>
            <button style={S.btnPrimary} onClick={() => setInviteStep('signup')}>Create Your Account</button>
            <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 12 }}>
              Already have an account?{' '}
              <button style={S.btnLink} onClick={() => setMode('login')}>Sign in</button>
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  // ─── Invite Signup with Agreements ──────────────────────
  if (mode === 'invite' && inviteStep === 'signup' && inviteData) {
    const allAgreed = agreedTerms && agreedRisk && agreedAccredited;

    return (
      <Shell>
        <div style={S.containerNarrow}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, color: '#111827', marginBottom: 4 }}>Create Your Investor Account</h1>
            <p style={{ color: '#6b7280', fontSize: 14 }}>Review the agreements below and set up your login.</p>
          </div>

          {/* Agreements */}
          <div style={S.card}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #f3f4f6' }}>
              <h2 style={S.cardTitle}>Required Agreements</h2>
            </div>
            <div style={{ padding: 20 }}>
              <label style={S.agreementRow}>
                <input type="checkbox" checked={agreedAccredited} onChange={e => setAgreedAccredited(e.target.checked)} style={S.checkbox} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>Accredited Investor Certification</div>
                  <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4, lineHeight: 1.6 }}>
                    I certify that I am an accredited investor as defined in Rule 501(a) of Regulation D,
                    with (i) individual net worth exceeding $1,000,000 (excluding primary residence),
                    or (ii) individual income exceeding $200,000 ($300,000 joint) in each of the past two years.
                  </p>
                </div>
              </label>

              <div style={S.divider} />

              <label style={S.agreementRow}>
                <input type="checkbox" checked={agreedRisk} onChange={e => setAgreedRisk(e.target.checked)} style={S.checkbox} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>Risk Acknowledgment</div>
                  <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4, lineHeight: 1.6 }}>
                    I understand this investment involves significant risk including possible loss of my entire investment.
                    Returns are not guaranteed, securities are illiquid, and I am investing only capital I can afford to lose.
                  </p>
                </div>
              </label>

              <div style={S.divider} />

              <label style={S.agreementRow}>
                <input type="checkbox" checked={agreedTerms} onChange={e => setAgreedTerms(e.target.checked)} style={S.checkbox} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>Subscription Agreement</div>
                  <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4, lineHeight: 1.6 }}>
                    I have reviewed the investment terms and agree to be bound by the subscription agreement.
                    {' '}
                    <button style={S.btnLink} onClick={() => setShowAgreement(!showAgreement)}>
                      {showAgreement ? 'Hide terms' : 'View full terms'}
                    </button>
                  </p>
                </div>
              </label>

              {showAgreement && (
                <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, fontSize: 12, color: '#4b5563', lineHeight: 1.6, maxHeight: 192, overflowY: 'auto', marginTop: 12, marginLeft: 28 }}>
                  <p style={{ marginBottom: 8 }}><strong>1. SUBSCRIPTION.</strong> By creating an account and funding your investment, you subscribe to purchase a membership interest in the identified investment pool.</p>
                  <p style={{ marginBottom: 8 }}><strong>2. REPRESENTATIONS.</strong> You represent that (a) you are an accredited investor, (b) investing for your own account, (c) you have adequate means for current needs, and (d) you have no need for liquidity.</p>
                  <p style={{ marginBottom: 8 }}><strong>3. DISTRIBUTIONS.</strong> Distributions will be made per pool terms. The Manager may modify the schedule with 30 days notice.</p>
                  <p style={{ marginBottom: 8 }}><strong>4. WITHDRAWAL.</strong> Subject to 30-day notice. Manager may defer if liquidation would harm the fund.</p>
                  <p style={{ marginBottom: 8 }}><strong>5. FEES.</strong> Management fees and carried interest deducted per pool terms before investor distributions.</p>
                  <p style={{ marginBottom: 8 }}><strong>6. TAX.</strong> Each investor is responsible for their own tax reporting. K-1 or 1099 forms provided as applicable.</p>
                  <p style={{ marginBottom: 8 }}><strong>7. CONFIDENTIALITY.</strong> All fund information is strictly confidential.</p>
                  <p style={{ margin: 0 }}><strong>8. GOVERNING LAW.</strong> Governed by the laws of the operating state.</p>
                </div>
              )}
            </div>
          </div>

          {/* Credentials */}
          <div style={S.card}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #f3f4f6' }}>
              <h2 style={S.cardTitle}>Login Credentials</h2>
            </div>
            <div style={{ padding: 20 }}>
              <form onSubmit={e => { e.preventDefault(); handleSignup(); }}>
                <div style={S.formGroup}>
                  <label style={S.label}>Full Legal Name</label>
                  <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="As it appears on your government ID" style={S.input} required />
                </div>
                <div style={S.formGroup}>
                  <label style={S.label}>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={S.input} required />
                </div>
                <div style={S.formGroup}>
                  <label style={S.label}>Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Minimum 8 characters" style={S.input} required />
                </div>
                {error && <div style={S.errorBox}><p style={S.errorText}>{error}</p></div>}
                <button type="submit" disabled={loading || !allAgreed} style={allAgreed ? { ...S.btnPrimary, width: '100%' } : { ...S.btnDisabled, width: '100%' }}>
                  {loading ? 'Creating Account...' : !allAgreed ? 'Accept All Agreements Above' : 'Create Account'}
                </button>
              </form>
            </div>
          </div>

          <div style={S.textCenter}>
            <button style={S.btnGhost} onClick={() => setInviteStep('welcome')}>&larr; Back to investment details</button>
          </div>
        </div>
      </Shell>
    );
  }

  // ─── Standard Login / Register ──────────────────────────
  return (
    <Shell>
      <div style={S.containerLogin}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ ...S.logoBox, width: 48, height: 48, borderRadius: 10, margin: '0 auto 16px' }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>OG</span>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#111827', margin: 0 }}>{BRAND}</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>Investor Portal</p>
        </div>

        {/* Card */}
        <div style={S.card}>
          {/* Tabs */}
          <div style={S.tabs}>
            <button style={S.tab(mode === 'login')} onClick={() => { setMode('login'); setError(''); }}>Sign In</button>
            <button style={S.tab(mode === 'signup')} onClick={() => { setMode('signup'); setError(''); }}>Register</button>
          </div>
          <div style={{ padding: 20 }}>
            <form onSubmit={e => { e.preventDefault(); mode === 'login' ? handleLogin() : handleSignup(); }}>
              {mode === 'signup' && (
                <div style={S.formGroup}>
                  <label style={S.label}>Full Name</label>
                  <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="John Smith" style={S.input} required />
                </div>
              )}
              <div style={S.formGroup}>
                <label style={S.label}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="investor@example.com" style={S.input} required />
              </div>
              <div style={S.formGroup}>
                <label style={S.label}>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" style={S.input} required />
              </div>
              {error && <div style={S.errorBox}><p style={S.errorText}>{error}</p></div>}
              <button type="submit" disabled={loading} style={{ ...S.btnPrimary, width: '100%', opacity: loading ? 0.6 : 1 }}>
                {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>
            {mode === 'login' && (
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <button style={S.btnGhost}>Forgot password?</button>
              </div>
            )}
          </div>
        </div>

        <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, marginTop: 24 }}>For accredited investors only</p>
      </div>
    </Shell>
  );
}
