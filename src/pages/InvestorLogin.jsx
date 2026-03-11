import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function InvestorLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');

  const [mode, setMode] = useState('login'); // 'login', 'signup', or 'invite'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);

  // Invite data
  const [inviteData, setInviteData] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteStep, setInviteStep] = useState('welcome'); // 'welcome' or 'signup'

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

      // Find investor with this invite token in their notes
      const { data: investors, error } = await supabase
        .from('investors')
        .select('*')
        .eq('status', 'invited');

      if (error) throw error;

      // Search through investors to find the one with matching token
      let foundInvestor = null;
      for (const inv of (investors || [])) {
        try {
          const notes = JSON.parse(inv.notes || '{}');
          if (notes.invite_token === token) {
            foundInvestor = { ...inv, parsedNotes: notes };
            break;
          }
        } catch {
          // notes is not JSON, skip
        }
      }

      if (!foundInvestor) {
        setInviteError('This invite link is invalid or has already been used.');
        return;
      }

      // If there's a pool, load it with pool_type info
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

      // Pre-fill email and name
      setEmail(foundInvestor.email || '');
      setFullName(foundInvestor.full_name || '');
    } catch (error) {
      console.error('Error loading invite:', error);
      setInviteError('Something went wrong loading your invite. Please try again.');
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleLogin() {
    if (!email || !password) {
      alert('Please enter email and password');
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      const { data: investor } = await supabase
        .from('investors')
        .select('*')
        .eq('user_id', data.user.id)
        .single();

      if (!investor) {
        alert('Investor account not found. Please contact support.');
        await supabase.auth.signOut();
        return;
      }

      navigate('/investor/dashboard');

    } catch (error) {
      console.error('Login error:', error);
      alert('Login failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup() {
    if (!email || !password || !fullName) {
      alert('Please fill in all fields');
      return;
    }

    if (password.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }

    try {
      setLoading(true);

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;

      if (mode === 'invite' && inviteData?.investor) {
        // Update the existing investor record instead of creating a new one
        const { error: updateError } = await supabase
          .from('investors')
          .update({
            user_id: authData.user.id,
            full_name: fullName,
            status: 'active',
          })
          .eq('id', inviteData.investor.id);

        if (updateError) throw updateError;

        // If there's a pool, create the pool share record
        if (inviteData.investor.parsedNotes?.pool_id) {
          const { error: shareError } = await supabase
            .from('investor_pool_shares')
            .insert({
              investor_id: inviteData.investor.id,
              pool_id: inviteData.investor.parsedNotes.pool_id,
              capital_invested: 0,
              ownership_percentage: 0,
              total_profit_earned: 0,
              total_distributions: 0,
              current_roi: 0,
              active: true,
            });

          if (shareError) {
            console.error('Error creating pool share:', shareError);
            // Non-fatal - they can still use the account
          }
        }

        alert('Account created! You can now log in.');
        // Switch to login mode with pre-filled email
        setMode('login');
        setPassword('');
      } else {
        // Standard signup - create new investor record
        const { error: investorError } = await supabase
          .from('investors')
          .insert({
            user_id: authData.user.id,
            email: email,
            full_name: fullName,
            status: 'pending',
          });

        if (investorError) throw investorError;

        alert('Account created! Please check your email to verify your account.');
        setMode('login');
      }

    } catch (error) {
      console.error('Signup error:', error);
      alert('Signup failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount || 0);
  }

  function getPayoutLabel(freq) {
    switch (freq) {
      case 'monthly': return 'Monthly';
      case 'quarterly': return 'Quarterly';
      case 'annually': return 'Annually';
      default: return freq || 'N/A';
    }
  }

  function calcFixedReturnPreview(investment, rate, frequency) {
    const inv = Number(investment) || 10000;
    const r = Number(rate) || 0;
    const annual = inv * (r / 100);
    let per = annual;
    let label = 'year';
    if (frequency === 'monthly') { per = annual / 12; label = 'month'; }
    else if (frequency === 'quarterly') { per = annual / 4; label = 'quarter'; }
    return { annual, per, label };
  }

  // Invite onboarding flow
  if (mode === 'invite') {
    if (inviteLoading) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-500 mx-auto mb-4"></div>
            <p className="text-blue-200">Loading your invite...</p>
          </div>
        </div>
      );
    }

    if (inviteError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-3">Invite Not Found</h1>
            <p className="text-blue-200 mb-6">{inviteError}</p>
            <button
              onClick={() => { setMode('login'); setInviteError(''); }}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition"
            >
              Go to Login
            </button>
          </div>
        </div>
      );
    }

    if (inviteStep === 'welcome' && inviteData) {
      const terms = inviteData.terms;
      const poolType = terms.pool_type || inviteData.pool?.pool_type || 'merchant_rate';
      const isFixedReturn = poolType === 'fixed_return';
      const isMerchantRate = poolType === 'merchant_rate';

      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900/80 to-slate-900">
          {/* Hero */}
          <div className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-blue-600/10 to-transparent"></div>
            <div className="max-w-3xl mx-auto px-6 pt-16 pb-12 text-center relative">
              <div className="inline-block px-4 py-1.5 bg-blue-500/20 border border-blue-500/30 rounded-full text-blue-300 text-sm font-semibold mb-6 tracking-wide">
                YOU'VE BEEN INVITED
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">
                Invest with<br />OG DiX Motor Club
              </h1>
              <p className="text-xl text-blue-200 max-w-xl mx-auto leading-relaxed">
                {isFixedReturn
                  ? 'Earn a guaranteed fixed return on your investment, paid out on a regular schedule.'
                  : isMerchantRate
                  ? 'You fund the account, and every time we use your money for a transaction, you automatically earn a percentage. Like a merchant, but you get paid.'
                  : 'Think of it like opening a joint bank account. You fund it, we buy and sell vehicles, you earn profit.'}
              </p>
            </div>
          </div>

          {/* How It Works */}
          <div className="max-w-3xl mx-auto px-6 pb-12">
            <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8 mb-8">
              <h2 className="text-xl font-bold text-white mb-6 text-center">How It Works</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/30">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-white font-bold text-lg mb-2">Fund</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Securely link your bank account and transfer your investment. Minimum {formatCurrency(terms.min_investment || 10000)}.
                  </p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/30">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3 className="text-white font-bold text-lg mb-2">We Work</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Our team sources, buys, and sells vehicles for profit. Every deal is tracked transparently.
                  </p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-500/30">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                  <h3 className="text-white font-bold text-lg mb-2">You Earn</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    {isFixedReturn
                      ? `You earn ${terms.annual_return_rate || inviteData.pool?.annual_return_rate || 0}% annually, paid out ${getPayoutLabel(terms.payout_frequency || inviteData.pool?.payout_frequency).toLowerCase()}. Track returns in real-time on your dashboard.`
                      : isMerchantRate
                      ? `You automatically earn ${terms.investor_profit_share || 3}% every time your capital is used in a transaction. No waiting for profit splits - you get paid per deal.`
                      : `You receive ${terms.investor_profit_share || 60}% of every vehicle transaction profit. Track returns in real-time on your dashboard.`}
                  </p>
                </div>
              </div>
            </div>

            {/* Terms Card */}
            <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8 mb-8">
              <div className="flex items-center justify-center gap-3 mb-6">
                <h2 className="text-xl font-bold text-white">Your Investment Terms</h2>
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                  isFixedReturn
                    ? 'text-emerald-400 bg-emerald-500/20'
                    : isMerchantRate
                    ? 'text-orange-400 bg-orange-500/20'
                    : 'text-violet-400 bg-violet-500/20'
                }`}>
                  {isFixedReturn ? 'Fixed Return' : isMerchantRate ? 'Merchant Rate' : 'Profit Share'}
                </span>
              </div>

              {isMerchantRate ? (
                <div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-orange-400 mb-1">{terms.investor_profit_share || 3}%</div>
                      <div className="text-slate-400 text-sm">Per Transaction</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-400 mb-1">${((15000 * (terms.investor_profit_share || 3)) / 100).toLocaleString()}</div>
                      <div className="text-slate-400 text-sm">Example on $15k</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-white mb-1">{formatCurrency(terms.min_investment || 10000)}</div>
                      <div className="text-slate-400 text-sm">Min. Investment</div>
                    </div>
                  </div>
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4 text-center">
                    <p className="text-slate-300 text-sm">
                      Every time we use your capital for a transaction, you earn <span className="text-orange-400 font-bold">{terms.investor_profit_share || 3}%</span> automatically. The more transactions, the more you earn.
                    </p>
                  </div>
                </div>
              ) : isFixedReturn ? (
                <>
                  {(() => {
                    const rate = terms.annual_return_rate || inviteData.pool?.annual_return_rate || 0;
                    const freq = terms.payout_frequency || inviteData.pool?.payout_frequency || 'quarterly';
                    const minInv = terms.min_investment || 10000;
                    const preview = calcFixedReturnPreview(minInv, rate, freq);
                    return (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                          <div className="text-center">
                            <div className="text-3xl font-bold text-emerald-400 mb-1">{rate}%</div>
                            <div className="text-slate-400 text-sm">Annual Return</div>
                          </div>
                          <div className="text-center">
                            <div className="text-3xl font-bold text-blue-400 mb-1">{getPayoutLabel(freq)}</div>
                            <div className="text-slate-400 text-sm">Payout Schedule</div>
                          </div>
                          <div className="text-center">
                            <div className="text-3xl font-bold text-green-400 mb-1">{formatCurrency(preview.per)}</div>
                            <div className="text-slate-400 text-sm">Per {preview.label}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-3xl font-bold text-white mb-1">{formatCurrency(minInv)}</div>
                            <div className="text-slate-400 text-sm">Minimum Investment</div>
                          </div>
                        </div>
                        <div className="mt-6 pt-4 border-t border-white/10 text-center">
                          <p className="text-slate-300 text-sm">
                            {formatCurrency(minInv)} invested = {formatCurrency(preview.annual)}/year = {formatCurrency(preview.per)}/{preview.label}
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-400 mb-1">{terms.investor_profit_share || 60}%</div>
                    <div className="text-slate-400 text-sm">Your Profit Share</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-amber-400 mb-1">{terms.platform_fee_share || 20}%</div>
                    <div className="text-slate-400 text-sm">Platform Fee</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-400 mb-1">{terms.dealer_profit_share || 20}%</div>
                    <div className="text-slate-400 text-sm">Dealer Share</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-white mb-1">{formatCurrency(terms.min_investment || 10000)}</div>
                    <div className="text-slate-400 text-sm">Minimum Investment</div>
                  </div>
                </div>
              )}

              {inviteData.pool && (
                <div className="mt-6 pt-6 border-t border-white/10 text-center">
                  <div className="text-slate-400 text-sm">Investment Pool</div>
                  <div className="text-white font-semibold text-lg">{inviteData.pool.pool_name}</div>
                  {inviteData.pool.description && (
                    <div className="text-slate-400 text-sm mt-1">{inviteData.pool.description}</div>
                  )}
                </div>
              )}
            </div>

            {/* Trust Signals */}
            <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8 mb-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-white font-semibold text-sm">Bank-Level Security</div>
                    <div className="text-slate-400 text-xs">All funds secured via Plaid. 256-bit encryption.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-white font-semibold text-sm">Full Transparency</div>
                    <div className="text-slate-400 text-xs">See every deal, every dollar, in real time.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-white font-semibold text-sm">24/7 Dashboard</div>
                    <div className="text-slate-400 text-xs">Track your investment anytime, from any device.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="text-center">
              <button
                onClick={() => setInviteStep('signup')}
                className="px-10 py-5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white rounded-2xl font-bold text-xl transition shadow-lg shadow-blue-600/30"
              >
                Create Your Account
              </button>
              <p className="text-slate-500 text-sm mt-4">
                Already have an account?{' '}
                <button onClick={() => { setMode('login'); }} className="text-blue-400 hover:text-blue-300 underline">
                  Log in here
                </button>
              </p>
            </div>

            {/* Back to main site */}
            <div className="mt-12 text-center">
              <button
                onClick={() => navigate('/')}
                className="text-blue-400 hover:text-blue-300 text-sm"
              >
                &larr; Back to OG Dealer
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (inviteStep === 'signup' && inviteData) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-6">
          <div className="max-w-md w-full">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-white mb-2">Create Your Account</h1>
              <p className="text-blue-200">Just a few details to get started</p>
            </div>

            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
              <form onSubmit={(e) => { e.preventDefault(); handleSignup(); }}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-white font-semibold mb-2">Full Name</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="John Smith"
                      className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-white font-semibold mb-2">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="investor@example.com"
                      className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-white font-semibold mb-2">Create Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-bold text-lg transition mt-4"
                  >
                    {loading ? 'Creating Account...' : 'Create Account'}
                  </button>
                </div>
              </form>

              <div className="mt-4 text-center">
                <button
                  onClick={() => setInviteStep('welcome')}
                  className="text-blue-400 hover:text-blue-300 text-sm"
                >
                  &larr; Back to invite details
                </button>
              </div>
            </div>

            <div className="mt-6 text-center text-blue-200 text-xs">
              <p>By creating an account, you agree to the investment terms shown on the previous page.</p>
            </div>
          </div>
        </div>
      );
    }
  }

  // Standard login/signup
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full">

        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">OG Dealer</h1>
          <p className="text-blue-200">Investor Portal</p>
        </div>

        {/* Login/Signup Card */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">

          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 px-4 py-3 rounded-lg font-semibold transition ${
                mode === 'login'
                  ? 'bg-blue-600 text-white'
                  : 'bg-transparent text-blue-200 hover:bg-white/5'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 px-4 py-3 rounded-lg font-semibold transition ${
                mode === 'signup'
                  ? 'bg-blue-600 text-white'
                  : 'bg-transparent text-blue-200 hover:bg-white/5'
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); mode === 'login' ? handleLogin() : handleSignup(); }}>
            <div className="space-y-4">

              {mode === 'signup' && (
                <div>
                  <label className="block text-white font-semibold mb-2">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Smith"
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-white font-semibold mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="investor@example.com"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-white font-semibold mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="--------"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-bold text-lg transition mt-6"
              >
                {loading ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create Account'}
              </button>
            </div>
          </form>

          {mode === 'login' && (
            <div className="mt-4 text-center">
              <a href="#" className="text-blue-400 hover:text-blue-300 text-sm">
                Forgot password?
              </a>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="mt-6 text-center text-blue-200 text-sm">
          <p>Accredited investors only</p>
          <p className="mt-2 text-xs text-blue-300">
            By signing up, you agree to verify your accreditation status
          </p>
        </div>

        {/* Back to Main Site */}
        <div className="mt-8 text-center">
          <button
            onClick={() => navigate('/')}
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            &larr; Back to OG Dealer
          </button>
        </div>

      </div>
    </div>
  );
}
