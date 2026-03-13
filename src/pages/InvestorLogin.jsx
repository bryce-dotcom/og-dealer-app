import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const BRAND = 'OG DiX Motor Club';

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
    if (inviteToken) {
      setMode('invite');
      loadInviteData(inviteToken);
    }
  }, [inviteToken]);

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

      setInviteData({
        investor: foundInvestor, pool: poolData,
        terms: foundInvestor.parsedNotes.custom_terms || {},
        specialNotes: foundInvestor.parsedNotes.special_notes || '',
      });
      setEmail(foundInvestor.email || '');
      setFullName(foundInvestor.full_name || '');
    } catch (err) {
      console.error('Error loading invite:', err);
      setInviteError('Unable to verify your invitation. Please contact your representative.');
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleLogin() {
    if (!email || !password) { setError('Please enter your credentials.'); return; }
    setError('');
    try {
      setLoading(true);
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      const { data: investor } = await supabase.from('investors').select('*').eq('user_id', data.user.id).single();
      if (!investor) {
        setError('No investor account found. If you received an invitation, please create your account first.');
        await supabase.auth.signOut();
        return;
      }
      navigate('/investor/dashboard');
    } catch (err) {
      if (err.message?.includes('Invalid login')) {
        setError('Invalid email or password. If you received an invite, please create your account first using the link in your invitation email.');
      } else { setError(err.message); }
    } finally { setLoading(false); }
  }

  async function handleSignup() {
    if (!email || !password || !fullName) { setError('All fields are required.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (mode === 'invite' && (!agreedTerms || !agreedRisk || !agreedAccredited)) {
      setError('You must accept all agreements to proceed.');
      return;
    }
    setError('');
    try {
      setLoading(true);
      const { data: authData, error: authError } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
      if (authError) throw authError;

      if (mode === 'invite' && inviteData?.investor) {
        await supabase.from('investors').update({ user_id: authData.user.id, full_name: fullName, status: 'active' }).eq('id', inviteData.investor.id);
        if (inviteData.investor.parsedNotes?.pool_id) {
          await supabase.from('investor_pool_shares').insert({
            investor_id: inviteData.investor.id, pool_id: inviteData.investor.parsedNotes.pool_id,
            capital_invested: 0, ownership_percentage: 0, total_profit_earned: 0, total_distributions: 0, current_roi: 0, active: true,
          });
        }
      } else {
        await supabase.from('investors').insert({ user_id: authData.user.id, email, full_name: fullName, status: 'pending' });
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError('Account created. Please check your email to verify before signing in.');
        setMode('login'); setPassword(''); return;
      }
      navigate('/investor/dashboard');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  function fmt(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount || 0);
  }

  function payoutLabel(f) {
    return { monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Annually' }[f] || f || 'N/A';
  }

  function calcReturn(inv, rate, freq) {
    const annual = (Number(inv) || 10000) * ((Number(rate) || 0) / 100);
    if (freq === 'monthly') return { per: annual / 12, label: 'month', annual };
    if (freq === 'quarterly') return { per: annual / 4, label: 'quarter', annual };
    return { per: annual, label: 'year', annual };
  }

  // ─── Shared ──────────────────────────────────────────────

  function PageShell({ children, narrow = false }) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-gray-900 rounded flex items-center justify-center">
                <span className="text-white text-xs font-bold">OG</span>
              </div>
              <div>
                <div className="text-gray-900 text-sm font-semibold">{BRAND}</div>
                <div className="text-gray-400 text-[11px]">Investor Portal</div>
              </div>
            </div>
            <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600 text-xs">
              Main Site
            </button>
          </div>
        </header>
        <div className="flex-1 flex flex-col">
          {children}
        </div>
        {/* Footer */}
        <footer className="border-t border-gray-200 bg-white">
          <div className="max-w-3xl mx-auto px-6 py-6">
            <p className="text-[11px] text-gray-400 leading-relaxed">
              <strong className="text-gray-500">Important Disclosures:</strong> Securities offered pursuant to Rule 506(b) of Regulation D
              under the Securities Act of 1933. Not registered with the SEC or any state securities commission.
              Investment involves risk including loss of principal. Past performance is not indicative of future results.
              Not FDIC insured. Not bank guaranteed. May lose value. For accredited investors only.
            </p>
          </div>
        </footer>
      </div>
    );
  }

  // ─── Loading ─────────────────────────────────────────────

  if (mode === 'invite' && inviteLoading) {
    return (
      <PageShell><div className="flex items-center justify-center py-32">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Verifying your invitation...</p>
        </div>
      </div></PageShell>
    );
  }

  // ─── Invite Error ────────────────────────────────────────

  if (mode === 'invite' && inviteError) {
    return (
      <PageShell narrow>
        <div className="max-w-lg mx-auto px-6 py-16 text-center">
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Invitation Not Found</h2>
          <p className="text-gray-500 text-sm mb-6">{inviteError}</p>
          <button onClick={() => { setMode('login'); setInviteError(''); }} className="text-blue-600 hover:text-blue-700 text-sm font-medium">
            Go to Sign In
          </button>
        </div>
      </PageShell>
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

    return (
      <PageShell>
        <div className="max-w-3xl mx-auto px-6 py-10">

          {/* Intro */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full mb-4">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
              Private Invitation
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 mb-3">
              You've been invited to invest
            </h1>
            <p className="text-gray-500 max-w-xl mx-auto">
              {inviteData.investor.full_name}, you've been personally invited to participate in a private
              automotive investment opportunity with {BRAND}.
            </p>
          </div>

          {/* Investment Terms Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Investment Terms</h2>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                isFixed ? 'bg-emerald-50 text-emerald-700' :
                isMerchant ? 'bg-amber-50 text-amber-700' :
                'bg-violet-50 text-violet-700'
              }`}>{typeLabel}</span>
            </div>
            <div className="p-6">
              {isMerchant && (
                <div className="grid grid-cols-3 gap-6 text-center">
                  <div>
                    <div className="text-3xl font-semibold text-gray-900">{terms.investor_profit_share || 3}%</div>
                    <div className="text-xs text-gray-500 mt-1">Per Transaction</div>
                  </div>
                  <div>
                    <div className="text-3xl font-semibold text-green-600">{fmt((15000 * (terms.investor_profit_share || 3)) / 100)}</div>
                    <div className="text-xs text-gray-500 mt-1">Example on $15k Deal</div>
                  </div>
                  <div>
                    <div className="text-3xl font-semibold text-gray-900">{fmt(terms.min_investment || 10000)}</div>
                    <div className="text-xs text-gray-500 mt-1">Minimum Investment</div>
                  </div>
                </div>
              )}

              {isFixed && (() => {
                const rate = terms.annual_return_rate || inviteData.pool?.annual_return_rate || 0;
                const freq = terms.payout_frequency || inviteData.pool?.payout_frequency || 'quarterly';
                const minInv = terms.min_investment || 10000;
                const ret = calcReturn(minInv, rate, freq);
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
                    <div>
                      <div className="text-3xl font-semibold text-gray-900">{rate}%</div>
                      <div className="text-xs text-gray-500 mt-1">Annual Yield</div>
                    </div>
                    <div>
                      <div className="text-3xl font-semibold text-gray-900">{payoutLabel(freq)}</div>
                      <div className="text-xs text-gray-500 mt-1">Payout Schedule</div>
                    </div>
                    <div>
                      <div className="text-3xl font-semibold text-green-600">{fmt(ret.per)}</div>
                      <div className="text-xs text-gray-500 mt-1">Per {ret.label}</div>
                    </div>
                    <div>
                      <div className="text-3xl font-semibold text-gray-900">{fmt(minInv)}</div>
                      <div className="text-xs text-gray-500 mt-1">Minimum</div>
                    </div>
                  </div>
                );
              })()}

              {isProfit && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
                  <div>
                    <div className="text-3xl font-semibold text-gray-900">{terms.investor_profit_share || 60}%</div>
                    <div className="text-xs text-gray-500 mt-1">Your Share</div>
                  </div>
                  <div>
                    <div className="text-3xl font-semibold text-gray-400">{terms.platform_fee_share || 20}%</div>
                    <div className="text-xs text-gray-500 mt-1">Management Fee</div>
                  </div>
                  <div>
                    <div className="text-3xl font-semibold text-gray-400">{terms.dealer_profit_share || 20}%</div>
                    <div className="text-xs text-gray-500 mt-1">Operator Share</div>
                  </div>
                  <div>
                    <div className="text-3xl font-semibold text-gray-900">{fmt(terms.min_investment || 10000)}</div>
                    <div className="text-xs text-gray-500 mt-1">Minimum</div>
                  </div>
                </div>
              )}

              {inviteData.pool && (
                <div className="mt-6 pt-5 border-t border-gray-100">
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Fund</div>
                  <div className="text-gray-900 font-medium">{inviteData.pool.pool_name}</div>
                  {inviteData.pool.description && <p className="text-gray-500 text-sm mt-1">{inviteData.pool.description}</p>}
                </div>
              )}
            </div>
          </div>

          {/* How It Works */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">How It Works</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {[
                  { n: '1', title: 'Fund Your Account', desc: 'Complete verification and securely transfer your investment via ACH bank transfer.' },
                  { n: '2', title: 'Capital Deployed', desc: 'Your capital is invested into vetted automotive inventory. Every acquisition is tracked transparently.' },
                  { n: '3', title: 'Earn Returns', desc: isMerchant
                    ? 'Earn your percentage on every transaction your capital funds. Real-time tracking in your dashboard.'
                    : isFixed
                    ? `Receive ${payoutLabel(terms.payout_frequency || 'quarterly').toLowerCase()} distributions deposited directly to your bank account.`
                    : 'Profit distributions are calculated per vehicle sale and deposited to your linked bank account.' },
                ].map(step => (
                  <div key={step.n} className="flex gap-3">
                    <div className="w-7 h-7 bg-gray-900 text-white text-xs font-bold rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      {step.n}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900 mb-1">{step.title}</div>
                      <p className="text-xs text-gray-500 leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Risk Disclosure */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div>
                <div className="text-sm font-semibold text-amber-800 mb-1">Risk Disclosure</div>
                <p className="text-xs text-amber-700 leading-relaxed">
                  This investment involves significant risk including the possible loss of your entire investment.
                  These securities are illiquid with no secondary market. Vehicle values fluctuate based on market conditions.
                  {isFixed ? ' While structured as a fixed return, distributions' : ' Distributions'} depend on fund performance and are not guaranteed.
                  Only invest capital you can afford to lose.
                </p>
              </div>
            </div>
          </div>

          {/* Security */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              { label: 'Bank-Grade Security', desc: '256-bit TLS encryption. Plaid-secured transfers.' },
              { label: 'Full Transparency', desc: 'Real-time access to every transaction in your dashboard.' },
              { label: 'Regulatory Compliance', desc: 'Structured under SEC Regulation D, Rule 506(b).' },
            ].map(item => (
              <div key={item.label} className="text-center">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <div className="text-xs font-medium text-gray-900">{item.label}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">{item.desc}</div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="text-center">
            <button
              onClick={() => setInviteStep('signup')}
              className="px-8 py-3 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-lg transition shadow-sm"
            >
              Create Your Account
            </button>
            <p className="text-gray-400 text-xs mt-3">
              Already have an account?{' '}
              <button onClick={() => setMode('login')} className="text-blue-600 hover:text-blue-700 font-medium">Sign in</button>
            </p>
          </div>
        </div>
      </PageShell>
    );
  }

  // ─── Invite Signup with Agreements ──────────────────────

  if (mode === 'invite' && inviteStep === 'signup' && inviteData) {
    const allAgreed = agreedTerms && agreedRisk && agreedAccredited;

    return (
      <PageShell narrow>
        <div className="max-w-lg mx-auto px-6 py-10">
          <div className="text-center mb-8">
            <h1 className="text-xl font-semibold text-gray-900 mb-1">Create Your Investor Account</h1>
            <p className="text-gray-500 text-sm">Review the agreements below and set up your login.</p>
          </div>

          {/* Agreements */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Required Agreements</h2>
            </div>
            <div className="p-5 space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={agreedAccredited} onChange={e => setAgreedAccredited(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900" />
                <div>
                  <div className="text-sm font-medium text-gray-900">Accredited Investor Certification</div>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    I certify that I am an accredited investor as defined in Rule 501(a) of Regulation D,
                    with (i) individual net worth exceeding $1,000,000 (excluding primary residence),
                    or (ii) individual income exceeding $200,000 ($300,000 joint) in each of the past two years.
                  </p>
                </div>
              </label>

              <div className="border-t border-gray-100" />

              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={agreedRisk} onChange={e => setAgreedRisk(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900" />
                <div>
                  <div className="text-sm font-medium text-gray-900">Risk Acknowledgment</div>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    I understand this investment involves significant risk including possible loss of my entire investment.
                    Returns are not guaranteed, securities are illiquid, and I am investing only capital I can afford to lose.
                  </p>
                </div>
              </label>

              <div className="border-t border-gray-100" />

              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={agreedTerms} onChange={e => setAgreedTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900" />
                <div>
                  <div className="text-sm font-medium text-gray-900">Subscription Agreement</div>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    I have reviewed the investment terms and agree to be bound by the subscription agreement.
                    {' '}
                    <button onClick={() => setShowAgreement(!showAgreement)} className="text-blue-600 hover:text-blue-700 font-medium">
                      {showAgreement ? 'Hide terms' : 'View full terms'}
                    </button>
                  </p>
                </div>
              </label>

              {showAgreement && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-600 leading-relaxed max-h-48 overflow-y-auto space-y-2 ml-7">
                  <p><strong>1. SUBSCRIPTION.</strong> By creating an account and funding your investment, you subscribe to purchase a membership interest in the identified investment pool.</p>
                  <p><strong>2. REPRESENTATIONS.</strong> You represent that (a) you are an accredited investor, (b) investing for your own account, (c) you have adequate means for current needs, and (d) you have no need for liquidity.</p>
                  <p><strong>3. DISTRIBUTIONS.</strong> Distributions will be made per pool terms. The Manager may modify the schedule with 30 days notice.</p>
                  <p><strong>4. WITHDRAWAL.</strong> Subject to 30-day notice. Manager may defer if liquidation would harm the fund.</p>
                  <p><strong>5. FEES.</strong> Management fees and carried interest deducted per pool terms before investor distributions.</p>
                  <p><strong>6. TAX.</strong> Each investor is responsible for their own tax reporting. K-1 or 1099 forms provided as applicable.</p>
                  <p><strong>7. CONFIDENTIALITY.</strong> All fund information is strictly confidential.</p>
                  <p><strong>8. GOVERNING LAW.</strong> Governed by the laws of the operating state.</p>
                </div>
              )}
            </div>
          </div>

          {/* Credentials */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Login Credentials</h2>
            </div>
            <div className="p-5">
              <form onSubmit={e => { e.preventDefault(); handleSignup(); }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Legal Name</label>
                  <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                    placeholder="As it appears on your government ID"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none" required />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                    <p className="text-red-700 text-xs">{error}</p>
                  </div>
                )}

                <button type="submit" disabled={loading || !allAgreed}
                  className={`w-full py-3 text-sm font-semibold rounded-lg transition ${
                    allAgreed
                      ? 'bg-gray-900 hover:bg-gray-800 text-white'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}>
                  {loading ? 'Creating Account...' : !allAgreed ? 'Accept All Agreements Above' : 'Create Account'}
                </button>
              </form>
            </div>
          </div>

          <div className="text-center">
            <button onClick={() => setInviteStep('welcome')} className="text-gray-400 hover:text-gray-600 text-xs">
              &larr; Back to investment details
            </button>
          </div>
        </div>
      </PageShell>
    );
  }

  // ─── Standard Login / Register ──────────────────────────

  return (
    <PageShell narrow>
      <div className="max-w-sm mx-auto px-6 py-16 flex-1 flex flex-col justify-center">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-gray-900 rounded-lg flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold">OG</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">{BRAND}</h1>
          <p className="text-gray-500 text-sm mt-1">Investor Portal</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 py-3 text-sm font-medium transition ${mode === 'login' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
              Sign In
            </button>
            <button onClick={() => { setMode('signup'); setError(''); }}
              className={`flex-1 py-3 text-sm font-medium transition ${mode === 'signup' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
              Register
            </button>
          </div>

          <div className="p-5">
            <form onSubmit={e => { e.preventDefault(); mode === 'login' ? handleLogin() : handleSignup(); }}>
              <div className="space-y-4">
                {mode === 'signup' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
                    <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                      placeholder="John Smith"
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none" required />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="investor@example.com"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none" required />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                    <p className="text-red-700 text-xs">{error}</p>
                  </div>
                )}

                <button type="submit" disabled={loading}
                  className="w-full py-3 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white text-sm font-semibold rounded-lg transition">
                  {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
                </button>
              </div>
            </form>

            {mode === 'login' && (
              <div className="mt-3 text-center">
                <button className="text-gray-400 hover:text-gray-600 text-xs">Forgot password?</button>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-gray-400 text-xs mt-6">For accredited investors only</p>
      </div>
    </PageShell>
  );
}
