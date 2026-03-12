import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const BRAND = 'OG DiX Motor Club';
const BRAND_SHORT = 'OGDMC';

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

  // Invite data
  const [inviteData, setInviteData] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteStep, setInviteStep] = useState('welcome');

  // Agreement checkboxes
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

      const { data: investors, error } = await supabase
        .from('investors')
        .select('*')
        .eq('status', 'invited');

      if (error) throw error;

      let foundInvestor = null;
      for (const inv of (investors || [])) {
        try {
          const notes = JSON.parse(inv.notes || '{}');
          if (notes.invite_token === token) {
            foundInvestor = { ...inv, parsedNotes: notes };
            break;
          }
        } catch { /* skip */ }
      }

      if (!foundInvestor) {
        setInviteError('This invitation link is invalid or has expired.');
        return;
      }

      let poolData = null;
      if (foundInvestor.parsedNotes.pool_id) {
        const { data: pool } = await supabase
          .from('investment_pools')
          .select('pool_name, description, status, pool_type, annual_return_rate, payout_frequency, investor_profit_share, platform_fee_share, dealer_profit_share')
          .eq('id', foundInvestor.parsedNotes.pool_id)
          .single();
        poolData = pool;
      }

      setInviteData({
        investor: foundInvestor,
        pool: poolData,
        terms: foundInvestor.parsedNotes.custom_terms || {},
        specialNotes: foundInvestor.parsedNotes.special_notes || '',
      });

      setEmail(foundInvestor.email || '');
      setFullName(foundInvestor.full_name || '');
    } catch (error) {
      console.error('Error loading invite:', error);
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

      const { data: investor } = await supabase
        .from('investors')
        .select('*')
        .eq('user_id', data.user.id)
        .single();

      if (!investor) {
        setError('No investor account is associated with these credentials. Please contact your account manager.');
        await supabase.auth.signOut();
        return;
      }

      navigate('/investor/dashboard');
    } catch (err) {
      console.error('Login error:', err);
      if (err.message?.includes('Invalid login')) {
        setError('Invalid email or password. If you received an invite, please create your account first using the link in your invitation email.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
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

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (authError) throw authError;

      if (mode === 'invite' && inviteData?.investor) {
        const { error: updateError } = await supabase
          .from('investors')
          .update({
            user_id: authData.user.id,
            full_name: fullName,
            status: 'active',
          })
          .eq('id', inviteData.investor.id);
        if (updateError) throw updateError;

        if (inviteData.investor.parsedNotes?.pool_id) {
          await supabase.from('investor_pool_shares').insert({
            investor_id: inviteData.investor.id,
            pool_id: inviteData.investor.parsedNotes.pool_id,
            capital_invested: 0,
            ownership_percentage: 0,
            total_profit_earned: 0,
            total_distributions: 0,
            current_roi: 0,
            active: true,
          });
        }
      } else {
        const { error: investorError } = await supabase.from('investors').insert({
          user_id: authData.user.id,
          email,
          full_name: fullName,
          status: 'pending',
        });
        if (investorError) throw investorError;
      }

      // Auto-login after signup
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        // Email confirmation may be required
        setError('Account created successfully. Please check your email to verify your account before logging in.');
        setMode('login');
        setPassword('');
        return;
      }

      navigate('/investor/dashboard');
    } catch (err) {
      console.error('Signup error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount || 0);
  }

  function getPayoutLabel(freq) {
    return { monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Annually' }[freq] || freq || 'N/A';
  }

  function calcReturn(investment, rate, frequency) {
    const inv = Number(investment) || 10000;
    const r = Number(rate) || 0;
    const annual = inv * (r / 100);
    let per = annual, label = 'year';
    if (frequency === 'monthly') { per = annual / 12; label = 'month'; }
    else if (frequency === 'quarterly') { per = annual / 4; label = 'quarter'; }
    return { annual, per, label };
  }

  // ─── Shared Components ──────────────────────────────────────

  const GoldDivider = () => (
    <div className="flex items-center gap-4 my-8">
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-600/40 to-transparent" />
      <div className="w-1.5 h-1.5 bg-amber-500/60 rotate-45" />
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-600/40 to-transparent" />
    </div>
  );

  const Disclaimer = ({ className = '' }) => (
    <div className={`text-[11px] leading-relaxed text-slate-500 ${className}`}>
      <p className="mb-2">
        <strong className="text-slate-400">IMPORTANT DISCLOSURES:</strong> This is a private offering made pursuant to
        Rule 506(b) of Regulation D under the Securities Act of 1933. These securities have not been registered under
        the Securities Act of 1933 or any state securities laws and may not be offered or sold except pursuant to an
        exemption from, or in a transaction not subject to, the registration requirements of the Securities Act.
      </p>
      <p className="mb-2">
        Investment involves significant risk, including the possible loss of your entire investment.
        Past performance is not indicative of future results. Returns are not guaranteed.
        Investments in motor vehicle inventory are illiquid and speculative in nature.
      </p>
      <p>
        By proceeding, you acknowledge that you are a qualified accredited investor as defined in
        Rule 501(a) of Regulation D and that you have the financial sophistication to evaluate the
        merits and risks of this investment.
      </p>
    </div>
  );

  const Logo = ({ size = 'lg' }) => (
    <div className="flex flex-col items-center">
      <div className={`flex items-center justify-center ${size === 'lg' ? 'w-16 h-16 mb-4' : 'w-10 h-10 mb-2'} border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent`}>
        <span className={`font-serif font-bold tracking-widest text-amber-400 ${size === 'lg' ? 'text-lg' : 'text-xs'}`}>{BRAND_SHORT}</span>
      </div>
      {size === 'lg' && (
        <>
          <h1 className="text-2xl font-serif font-light tracking-[0.2em] text-white uppercase">{BRAND}</h1>
          <div className="flex items-center gap-3 mt-2">
            <div className="w-8 h-px bg-amber-500/40" />
            <span className="text-[10px] tracking-[0.3em] text-amber-500/70 uppercase font-medium">Private Investment Group</span>
            <div className="w-8 h-px bg-amber-500/40" />
          </div>
        </>
      )}
    </div>
  );

  // ─── INVITE: Loading ────────────────────────────────────────

  if (mode === 'invite' && inviteLoading) {
    return (
      <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-amber-500/30 border-t-amber-400 rounded-full animate-spin mx-auto mb-6" />
          <p className="text-slate-400 text-sm tracking-wide">Verifying your invitation...</p>
        </div>
      </div>
    );
  }

  // ─── INVITE: Error ──────────────────────────────────────────

  if (mode === 'invite' && inviteError) {
    return (
      <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <Logo />
          <GoldDivider />
          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-6 mb-6">
            <p className="text-red-300 text-sm">{inviteError}</p>
          </div>
          <button
            onClick={() => { setMode('login'); setInviteError(''); }}
            className="text-amber-400 hover:text-amber-300 text-sm tracking-wide"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  // ─── INVITE: Welcome / Terms ────────────────────────────────

  if (mode === 'invite' && inviteStep === 'welcome' && inviteData) {
    const terms = inviteData.terms;
    const poolType = terms.pool_type || inviteData.pool?.pool_type || 'merchant_rate';
    const isFixedReturn = poolType === 'fixed_return';
    const isMerchantRate = poolType === 'merchant_rate';
    const isProfitShare = poolType === 'profit_share';

    const typeLabels = {
      fixed_return: 'Fixed Income',
      merchant_rate: 'Transaction-Based Return',
      profit_share: 'Profit Participation',
    };

    return (
      <div className="min-h-screen bg-[#0B1120]">
        {/* Top bar */}
        <div className="border-b border-white/5 bg-[#0B1120]/80 backdrop-blur-xl sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
            <Logo size="sm" />
            <span className="text-[10px] tracking-[0.2em] text-slate-500 uppercase">Private Offering Memorandum</span>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-6 py-12">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 border border-amber-500/20 rounded-sm bg-amber-500/5 mb-6">
              <div className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
              <span className="text-[11px] tracking-[0.2em] text-amber-400 uppercase font-medium">Confidential Invitation</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-serif font-light text-white tracking-wide mb-4">
              Investment Opportunity
            </h1>
            <p className="text-slate-400 max-w-xl mx-auto leading-relaxed">
              You have been personally invited to participate in a private automotive investment vehicle
              managed by {BRAND}.
            </p>
          </div>

          {/* Investment Structure Card */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden mb-8">
            <div className="px-8 py-5 border-b border-white/[0.06] flex items-center justify-between">
              <h2 className="font-serif text-lg text-white tracking-wide">Investment Structure</h2>
              <span className={`text-[10px] tracking-[0.15em] uppercase font-semibold px-3 py-1 rounded-sm ${
                isFixedReturn ? 'text-emerald-300 bg-emerald-500/10 border border-emerald-500/20' :
                isMerchantRate ? 'text-amber-300 bg-amber-500/10 border border-amber-500/20' :
                'text-violet-300 bg-violet-500/10 border border-violet-500/20'
              }`}>
                {typeLabels[poolType]}
              </span>
            </div>

            <div className="p-8">
              {isMerchantRate && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="text-center">
                    <div className="text-4xl font-light text-white mb-1 font-serif">{terms.investor_profit_share || 3}<span className="text-amber-400 text-2xl">%</span></div>
                    <div className="text-[11px] tracking-wider text-slate-500 uppercase">Per Transaction</div>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-light text-white mb-1 font-serif">{formatCurrency((15000 * (terms.investor_profit_share || 3)) / 100)}</div>
                    <div className="text-[11px] tracking-wider text-slate-500 uppercase">Example on $15,000 Deal</div>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-light text-white mb-1 font-serif">{formatCurrency(terms.min_investment || 10000)}</div>
                    <div className="text-[11px] tracking-wider text-slate-500 uppercase">Minimum Commitment</div>
                  </div>
                </div>
              )}

              {isFixedReturn && (() => {
                const rate = terms.annual_return_rate || inviteData.pool?.annual_return_rate || 0;
                const freq = terms.payout_frequency || inviteData.pool?.payout_frequency || 'quarterly';
                const minInv = terms.min_investment || 10000;
                const preview = calcReturn(minInv, rate, freq);
                return (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    <div className="text-center">
                      <div className="text-4xl font-light text-white mb-1 font-serif">{rate}<span className="text-emerald-400 text-2xl">%</span></div>
                      <div className="text-[11px] tracking-wider text-slate-500 uppercase">Annual Yield</div>
                    </div>
                    <div className="text-center">
                      <div className="text-4xl font-light text-white mb-1 font-serif">{getPayoutLabel(freq)}</div>
                      <div className="text-[11px] tracking-wider text-slate-500 uppercase">Distribution Schedule</div>
                    </div>
                    <div className="text-center">
                      <div className="text-4xl font-light text-white mb-1 font-serif">{formatCurrency(preview.per)}</div>
                      <div className="text-[11px] tracking-wider text-slate-500 uppercase">Per {preview.label}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-4xl font-light text-white mb-1 font-serif">{formatCurrency(minInv)}</div>
                      <div className="text-[11px] tracking-wider text-slate-500 uppercase">Minimum Commitment</div>
                    </div>
                  </div>
                );
              })()}

              {isProfitShare && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                  <div className="text-center">
                    <div className="text-4xl font-light text-white mb-1 font-serif">{terms.investor_profit_share || 60}<span className="text-violet-400 text-2xl">%</span></div>
                    <div className="text-[11px] tracking-wider text-slate-500 uppercase">Investor Share</div>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-light text-white mb-1 font-serif">{terms.platform_fee_share || 20}<span className="text-slate-500 text-2xl">%</span></div>
                    <div className="text-[11px] tracking-wider text-slate-500 uppercase">Management Fee</div>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-light text-white mb-1 font-serif">{terms.dealer_profit_share || 20}<span className="text-slate-500 text-2xl">%</span></div>
                    <div className="text-[11px] tracking-wider text-slate-500 uppercase">Operator Share</div>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-light text-white mb-1 font-serif">{formatCurrency(terms.min_investment || 10000)}</div>
                    <div className="text-[11px] tracking-wider text-slate-500 uppercase">Minimum Commitment</div>
                  </div>
                </div>
              )}

              {inviteData.pool && (
                <div className="mt-8 pt-6 border-t border-white/[0.06]">
                  <div className="text-[11px] tracking-wider text-slate-500 uppercase mb-1">Fund</div>
                  <div className="text-white font-serif text-lg">{inviteData.pool.pool_name}</div>
                  {inviteData.pool.description && (
                    <p className="text-slate-400 text-sm mt-1">{inviteData.pool.description}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* How It Works */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden mb-8">
            <div className="px-8 py-5 border-b border-white/[0.06]">
              <h2 className="font-serif text-lg text-white tracking-wide">Investment Process</h2>
            </div>
            <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  { step: '01', title: 'Capital Commitment', desc: 'Complete your accredited investor verification and securely fund your account via ACH bank transfer.' },
                  { step: '02', title: 'Capital Deployment', desc: 'Your capital is deployed into carefully vetted automotive inventory. Every acquisition is documented and tracked.' },
                  { step: '03', title: 'Returns & Reporting', desc: isMerchantRate
                    ? 'Earn your percentage on every transaction. Real-time reporting available through your investor dashboard.'
                    : isFixedReturn
                    ? `Receive ${getPayoutLabel(terms.payout_frequency || 'quarterly').toLowerCase()} distributions directly to your linked bank account.`
                    : 'Profit distributions are calculated per vehicle sale and deposited directly to your linked bank account.' },
                ].map(item => (
                  <div key={item.step}>
                    <div className="text-amber-500/50 font-serif text-3xl font-light mb-3">{item.step}</div>
                    <h3 className="text-white font-medium tracking-wide mb-2">{item.title}</h3>
                    <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Security & Compliance */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden mb-8">
            <div className="px-8 py-5 border-b border-white/[0.06]">
              <h2 className="font-serif text-lg text-white tracking-wide">Security & Compliance</h2>
            </div>
            <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { title: 'Bank-Grade Encryption', desc: 'All data transmitted via 256-bit TLS encryption. Funds transferred through Plaid-secured banking infrastructure.' },
                { title: 'Full Transparency', desc: 'Real-time access to every transaction, vehicle acquisition, and profit distribution through your secure dashboard.' },
                { title: 'Regulatory Compliance', desc: 'Structured under Rule 506(b) of Regulation D. All investor qualifications verified per SEC requirements.' },
              ].map(item => (
                <div key={item.title} className="flex gap-3">
                  <div className="w-8 h-8 rounded-sm bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-white text-sm font-medium mb-1">{item.title}</h3>
                    <p className="text-slate-500 text-xs leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Risk Factors */}
          <div className="bg-red-500/[0.03] border border-red-500/10 rounded-lg overflow-hidden mb-8">
            <div className="px-8 py-5 border-b border-red-500/10">
              <h2 className="font-serif text-lg text-red-200/80 tracking-wide">Risk Factors</h2>
            </div>
            <div className="p-8 text-xs text-red-200/50 leading-relaxed space-y-3">
              <p><strong className="text-red-200/70">Loss of Capital:</strong> Investing in motor vehicle inventory involves significant risk. You may lose some or all of your investment. Only invest capital you can afford to lose.</p>
              <p><strong className="text-red-200/70">Illiquidity:</strong> These investments are illiquid. There is no secondary market for these securities. You may not be able to withdraw your capital on demand.</p>
              <p><strong className="text-red-200/70">Market Risk:</strong> Vehicle values fluctuate based on market conditions, seasonal demand, and economic factors beyond the control of the fund manager.</p>
              <p><strong className="text-red-200/70">No Guarantee:</strong> {isFixedReturn ? 'While structured as a fixed return, d' : 'D'}istributions depend on the performance of the underlying vehicle inventory and are not guaranteed by any government agency or insurance program.</p>
            </div>
          </div>

          <GoldDivider />

          {/* CTA */}
          <div className="text-center">
            <button
              onClick={() => setInviteStep('signup')}
              className="px-12 py-4 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-black font-semibold tracking-wide rounded-sm transition-all shadow-lg shadow-amber-500/20 text-sm uppercase"
            >
              Proceed to Account Setup
            </button>
            <p className="text-slate-600 text-xs mt-4">
              Already registered?{' '}
              <button onClick={() => setMode('login')} className="text-amber-500/70 hover:text-amber-400 underline underline-offset-2">
                Sign in to your account
              </button>
            </p>
          </div>

          {/* Disclaimer */}
          <div className="mt-12 pt-8 border-t border-white/[0.04]">
            <Disclaimer />
          </div>
        </div>
      </div>
    );
  }

  // ─── INVITE: Signup with Agreements ─────────────────────────

  if (mode === 'invite' && inviteStep === 'signup' && inviteData) {
    const allAgreed = agreedTerms && agreedRisk && agreedAccredited;

    return (
      <div className="min-h-screen bg-[#0B1120]">
        <div className="border-b border-white/5 bg-[#0B1120]/80 backdrop-blur-xl sticky top-0 z-10">
          <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
            <Logo size="sm" />
            <span className="text-[10px] tracking-[0.2em] text-slate-500 uppercase">Account Registration</span>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-6 py-12">
          <div className="text-center mb-10">
            <h1 className="text-2xl font-serif font-light text-white tracking-wide mb-2">Create Your Investor Account</h1>
            <p className="text-slate-400 text-sm">Please review and accept the agreements below, then set up your credentials.</p>
          </div>

          {/* Agreements Section */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-white/[0.06]">
              <h2 className="font-serif text-base text-white tracking-wide">Required Agreements</h2>
            </div>
            <div className="p-6 space-y-4">
              {/* Accredited Investor */}
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={agreedAccredited}
                  onChange={e => setAgreedAccredited(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded-sm border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500/30"
                />
                <div>
                  <div className="text-white text-sm font-medium group-hover:text-amber-200 transition">Accredited Investor Certification</div>
                  <p className="text-slate-500 text-xs leading-relaxed mt-1">
                    I certify that I am an &ldquo;accredited investor&rdquo; as defined in Rule 501(a) of Regulation D,
                    meaning I have (i) an individual net worth, or joint net worth with my spouse, exceeding $1,000,000
                    (excluding primary residence), or (ii) individual income exceeding $200,000 (or $300,000 joint with spouse)
                    in each of the two most recent years with a reasonable expectation of the same this year.
                  </p>
                </div>
              </label>

              <div className="border-t border-white/[0.04]" />

              {/* Risk Acknowledgment */}
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={agreedRisk}
                  onChange={e => setAgreedRisk(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded-sm border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500/30"
                />
                <div>
                  <div className="text-white text-sm font-medium group-hover:text-amber-200 transition">Risk Acknowledgment</div>
                  <p className="text-slate-500 text-xs leading-relaxed mt-1">
                    I understand that this investment involves significant risk, including the possible loss of my entire
                    investment. I acknowledge that returns are not guaranteed, these securities are illiquid, and I have
                    read the risk factors disclosed in this offering. I am investing only capital I can afford to lose.
                  </p>
                </div>
              </label>

              <div className="border-t border-white/[0.04]" />

              {/* Terms & Conditions */}
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={agreedTerms}
                  onChange={e => setAgreedTerms(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded-sm border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500/30"
                />
                <div>
                  <div className="text-white text-sm font-medium group-hover:text-amber-200 transition">Investment Terms & Subscription Agreement</div>
                  <p className="text-slate-500 text-xs leading-relaxed mt-1">
                    I have reviewed the investment terms presented in this offering memorandum, including the fee structure,
                    distribution schedule, and withdrawal provisions. I agree to be bound by the terms of the subscription
                    agreement and understand that my investment is subject to the terms and conditions therein.
                    {' '}
                    <button onClick={() => setShowAgreement(!showAgreement)} className="text-amber-500/70 hover:text-amber-400 underline underline-offset-2">
                      {showAgreement ? 'Hide full terms' : 'View full terms'}
                    </button>
                  </p>
                </div>
              </label>

              {showAgreement && (
                <div className="ml-7 bg-slate-900/50 border border-white/[0.04] rounded p-4 text-xs text-slate-400 leading-relaxed max-h-60 overflow-y-auto space-y-2">
                  <p><strong className="text-slate-300">1. SUBSCRIPTION.</strong> By creating an account and funding your investment, you hereby subscribe to purchase a membership interest in the investment pool identified in your invitation.</p>
                  <p><strong className="text-slate-300">2. REPRESENTATIONS.</strong> You represent that (a) you are an accredited investor, (b) you are investing for your own account, (c) you have adequate means of providing for your current needs and contingencies, and (d) you have no need for liquidity in this investment.</p>
                  <p><strong className="text-slate-300">3. DISTRIBUTIONS.</strong> Distributions will be made in accordance with the terms of the specific investment pool. The Manager reserves the right to modify the distribution schedule with 30 days written notice.</p>
                  <p><strong className="text-slate-300">4. WITHDRAWAL.</strong> Withdrawal requests are subject to a 30-day notice period. The Manager may, in its sole discretion, defer withdrawals if immediate liquidation would be detrimental to the fund.</p>
                  <p><strong className="text-slate-300">5. FEES.</strong> Management fees and carried interest are deducted as specified in the pool terms before distributions to investors.</p>
                  <p><strong className="text-slate-300">6. TAX CONSIDERATIONS.</strong> Each investor is responsible for their own tax reporting and obligations. The fund will provide K-1 or 1099 forms as applicable.</p>
                  <p><strong className="text-slate-300">7. CONFIDENTIALITY.</strong> All information regarding the fund, its investments, and other investors is strictly confidential.</p>
                  <p><strong className="text-slate-300">8. GOVERNING LAW.</strong> This agreement is governed by the laws of the state in which the dealership operates.</p>
                </div>
              )}
            </div>
          </div>

          {/* Account Credentials */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-white/[0.06]">
              <h2 className="font-serif text-base text-white tracking-wide">Account Credentials</h2>
            </div>
            <div className="p-6">
              <form onSubmit={e => { e.preventDefault(); handleSignup(); }} className="space-y-5">
                <div>
                  <label className="block text-slate-300 text-xs tracking-wide uppercase mb-2">Full Legal Name</label>
                  <input
                    type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                    placeholder="As it appears on your government-issued ID"
                    className="w-full px-4 py-3 bg-[#0B1120] border border-white/10 rounded-sm text-white text-sm placeholder-slate-600 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 outline-none transition"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 text-xs tracking-wide uppercase mb-2">Email Address</label>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full px-4 py-3 bg-[#0B1120] border border-white/10 rounded-sm text-white text-sm placeholder-slate-600 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 outline-none transition"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 text-xs tracking-wide uppercase mb-2">Password</label>
                  <input
                    type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full px-4 py-3 bg-[#0B1120] border border-white/10 rounded-sm text-white text-sm placeholder-slate-600 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 outline-none transition"
                    required
                  />
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-sm px-4 py-3">
                    <p className="text-red-300 text-xs">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !allAgreed}
                  className={`w-full px-6 py-4 font-semibold tracking-wide rounded-sm text-sm uppercase transition-all ${
                    allAgreed
                      ? 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-black shadow-lg shadow-amber-500/20'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  {loading ? 'Creating Account...' : !allAgreed ? 'Please Accept All Agreements Above' : 'Create Investor Account'}
                </button>
              </form>
            </div>
          </div>

          <div className="text-center">
            <button onClick={() => setInviteStep('welcome')} className="text-slate-500 hover:text-slate-400 text-xs tracking-wide">
              &larr; Review Investment Terms
            </button>
          </div>

          <div className="mt-10 pt-6 border-t border-white/[0.04]">
            <Disclaimer />
          </div>
        </div>
      </div>
    );
  }

  // ─── Standard Login / Signup ────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-sm w-full">

          {/* Logo */}
          <div className="text-center mb-10">
            <Logo />
          </div>

          {/* Card */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-white/[0.06]">
              <button
                onClick={() => { setMode('login'); setError(''); }}
                className={`flex-1 px-4 py-3.5 text-xs tracking-[0.15em] uppercase font-medium transition ${
                  mode === 'login'
                    ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-500/5'
                    : 'text-slate-500 hover:text-slate-400'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => { setMode('signup'); setError(''); }}
                className={`flex-1 px-4 py-3.5 text-xs tracking-[0.15em] uppercase font-medium transition ${
                  mode === 'signup'
                    ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-500/5'
                    : 'text-slate-500 hover:text-slate-400'
                }`}
              >
                Register
              </button>
            </div>

            <div className="p-6">
              <form onSubmit={e => { e.preventDefault(); mode === 'login' ? handleLogin() : handleSignup(); }}>
                <div className="space-y-4">
                  {mode === 'signup' && (
                    <div>
                      <label className="block text-slate-400 text-xs tracking-wide uppercase mb-2">Full Name</label>
                      <input
                        type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                        placeholder="John Smith"
                        className="w-full px-4 py-3 bg-[#0B1120] border border-white/10 rounded-sm text-white text-sm placeholder-slate-600 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 outline-none transition"
                        required
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-slate-400 text-xs tracking-wide uppercase mb-2">Email</label>
                    <input
                      type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="investor@example.com"
                      className="w-full px-4 py-3 bg-[#0B1120] border border-white/10 rounded-sm text-white text-sm placeholder-slate-600 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 outline-none transition"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 text-xs tracking-wide uppercase mb-2">Password</label>
                    <input
                      type="password" value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-3 bg-[#0B1120] border border-white/10 rounded-sm text-white text-sm placeholder-slate-600 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 outline-none transition"
                      required
                    />
                  </div>

                  {error && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-sm px-4 py-3">
                      <p className="text-red-300 text-xs">{error}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full px-6 py-3.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:from-slate-700 disabled:to-slate-700 text-black disabled:text-slate-400 rounded-sm font-semibold text-sm tracking-wide uppercase transition-all shadow-lg shadow-amber-500/20 disabled:shadow-none mt-2"
                  >
                    {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
                  </button>
                </div>
              </form>

              {mode === 'login' && (
                <div className="mt-4 text-center">
                  <button className="text-slate-500 hover:text-amber-400/70 text-xs tracking-wide transition">
                    Forgot your password?
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center space-y-3">
            <p className="text-slate-600 text-[10px] tracking-wide uppercase">Accredited Investors Only</p>
            <div className="flex items-center justify-center gap-4 text-slate-600 text-[10px]">
              <span>256-bit SSL</span>
              <span className="w-1 h-1 bg-slate-700 rounded-full" />
              <span>SOC 2 Compliant</span>
              <span className="w-1 h-1 bg-slate-700 rounded-full" />
              <span>Plaid Secured</span>
            </div>
          </div>

          <div className="mt-6 text-center">
            <button onClick={() => navigate('/')} className="text-slate-600 hover:text-slate-500 text-xs tracking-wide transition">
              &larr; Return to main site
            </button>
          </div>
        </div>
      </div>

      {/* Bottom disclaimer */}
      <div className="border-t border-white/[0.04] px-6 py-6">
        <div className="max-w-2xl mx-auto">
          <Disclaimer />
        </div>
      </div>
    </div>
  );
}
