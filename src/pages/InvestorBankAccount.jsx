import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import InvestorLayout from '../components/InvestorLayout';
import PlaidLinkButton from '../components/PlaidLinkButton';

export default function InvestorBankAccount() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [investor, setInvestor] = useState(null);
  const [capitalHistory, setCapitalHistory] = useState([]);
  const [distributions, setDistributions] = useState([]);

  useEffect(() => { loadBankData(); }, []);

  async function loadBankData() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/investor/login'); return; }

      const { data: investorData } = await supabase
        .from('investors')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (!investorData) { navigate('/investor/login'); return; }
      setInvestor(investorData);

      // Load capital transactions (deposits & withdrawals)
      const { data: capitalData } = await supabase
        .from('investor_capital')
        .select('*')
        .eq('investor_id', investorData.id)
        .order('initiated_at', { ascending: false })
        .limit(20);
      setCapitalHistory(capitalData || []);

      // Load distributions received
      const { data: distData } = await supabase
        .from('investor_distributions')
        .select('*')
        .eq('investor_id', investorData.id)
        .order('created_at', { ascending: false })
        .limit(20);
      setDistributions(distData || []);

    } catch (error) {
      console.error('Error loading bank data:', error);
    } finally {
      setLoading(false);
    }
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(Math.abs(amount || 0));
  }

  function fmtDate(d) {
    if (!d) return '--';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const bankInfo = investor?.linked_bank_account;
  const allTransactions = [
    ...(capitalHistory || []).map(t => ({ ...t, _type: 'capital', _date: t.initiated_at || t.created_at })),
    ...(distributions || []).map(t => ({ ...t, _type: 'distribution', _date: t.created_at })),
  ].sort((a, b) => new Date(b._date) - new Date(a._date));

  if (loading) {
    return (
      <InvestorLayout title="Bank Account">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 0' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 32, height: 32, border: '2px solid #d1d5db', borderTopColor: '#111827', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
            <p style={{ color: '#6b7280', fontSize: 14 }}>Loading...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      </InvestorLayout>
    );
  }

  return (
    <InvestorLayout title="Bank Account" subtitle="Manage your linked bank account and view transfer history">

      {/* Bank Account Status */}
      {bankInfo ? (
        /* Linked bank account */
        <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', marginBottom: 24, overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: 0 }}>Linked Bank Account</h2>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', backgroundColor: '#f0fdf4', color: '#15803d', fontSize: 12, fontWeight: 600, borderRadius: 20 }}>
              <span style={{ width: 6, height: 6, backgroundColor: '#22c55e', borderRadius: '50%' }} />
              Connected
            </span>
          </div>
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
              <div style={{ width: 56, height: 56, backgroundColor: '#f3f4f6', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg style={{ width: 28, height: 28, color: '#111827' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 7.5h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#111827' }}>{bankInfo.name || 'Bank Account'}</div>
                <div style={{ color: '#6b7280', fontSize: 14 }}>
                  {bankInfo.subtype ? bankInfo.subtype.charAt(0).toUpperCase() + bankInfo.subtype.slice(1) : 'Account'} ending in ****{bankInfo.mask || '----'}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <div style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Total Deposited</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>
                  {formatCurrency(investor?.total_invested)}
                </div>
              </div>
              <div style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Total Returned</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>
                  {formatCurrency(investor?.total_returned)}
                </div>
              </div>
              <div style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Available Balance</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#d97706' }}>
                  {formatCurrency(investor?.available_balance)}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #f3f4f6', display: 'flex', gap: 12 }}>
              <button
                onClick={() => navigate('/investor/capital')}
                style={{ padding: '10px 20px', backgroundColor: '#111827', color: '#fff', fontSize: 14, fontWeight: 500, borderRadius: 8, border: 'none', cursor: 'pointer' }}
              >
                Deposit / Withdraw
              </button>
              <PlaidLinkButton
                investorId={investor?.id}
                buttonText="Link Different Account"
                onSuccess={() => window.location.reload()}
                style={{ backgroundColor: '#f3f4f6', color: '#374151' }}
              />
            </div>
          </div>
        </div>
      ) : (
        /* No bank linked */
        <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '2px dashed #d1d5db', marginBottom: 24, padding: 48, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, backgroundColor: '#f3f4f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg style={{ width: 32, height: 32, color: '#6b7280' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 7.5h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
            </svg>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Link Your Bank Account</h2>
          <p style={{ color: '#6b7280', fontSize: 14, maxWidth: 400, margin: '0 auto 24px', lineHeight: 1.6 }}>
            Securely connect your bank account to deposit funds and receive distributions.
            We use Plaid for bank-level encryption — we never see your login credentials.
          </p>
          <PlaidLinkButton
            investorId={investor?.id}
            buttonText="Connect Bank Account"
            onSuccess={() => window.location.reload()}
          />
          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6b7280', fontSize: 12 }}>
              <svg style={{ width: 14, height: 14, color: '#22c55e' }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              256-bit encryption
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6b7280', fontSize: 12 }}>
              <svg style={{ width: 14, height: 14, color: '#22c55e' }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Read-only access
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6b7280', fontSize: 12 }}>
              <svg style={{ width: 14, height: 14, color: '#22c55e' }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              11,000+ banks supported
            </div>
          </div>
        </div>
      )}

      {/* How ACH Transfers Work */}
      <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', marginBottom: 24, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: 0 }}>How ACH Transfers Work</h2>
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {[
              { step: '1', title: 'You Deposit', desc: 'Funds are pulled from your bank via ACH', color: '#3b82f6' },
              { step: '2', title: 'Processing', desc: 'ACH settlement takes 1-3 business days', color: '#f59e0b' },
              { step: '3', title: 'Capital Deployed', desc: 'OG DiX uses funds to buy vehicles', color: '#8b5cf6' },
              { step: '4', title: 'Profits Returned', desc: 'Distributions are sent back to your bank', color: '#16a34a' },
            ].map(s => (
              <div key={s.step} style={{ textAlign: 'center' }}>
                <div style={{ width: 36, height: 36, backgroundColor: s.color + '15', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                  <span style={{ color: s.color, fontWeight: 700, fontSize: 14 }}>{s.step}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 4 }}>{s.title}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Transfer History */}
      <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: 0 }}>Transfer History</h2>
        </div>

        {allTransactions.length > 0 ? (
          <div>
            {allTransactions.map((tx, i) => {
              const isDistribution = tx._type === 'distribution';
              const isDeposit = tx._type === 'capital' && tx.transaction_type === 'deposit';
              const positive = isDeposit || isDistribution;

              return (
                <div key={tx.id || i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderBottom: i < allTransactions.length - 1 ? '1px solid #fafafa' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backgroundColor: positive ? '#f0fdf4' : '#fef2f2',
                    }}>
                      <svg style={{ width: 16, height: 16, color: positive ? '#16a34a' : '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        {positive
                          ? <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                          : <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        }
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>
                        {isDistribution
                          ? (tx.distribution_type || 'distribution').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                          : isDeposit ? 'Deposit' : 'Withdrawal'}
                      </div>
                      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                        {fmtDate(tx._date)} &middot; {tx.payment_method?.toUpperCase() || 'ACH'}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: positive ? '#16a34a' : '#ef4444' }}>
                      {positive ? '+' : '-'}{formatCurrency(tx.amount)}
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 10,
                      backgroundColor: tx.status === 'completed' ? '#f0fdf4' : tx.status === 'pending' ? '#fffbeb' : tx.status === 'processing' ? '#eff6ff' : '#f3f4f6',
                      color: tx.status === 'completed' ? '#15803d' : tx.status === 'pending' ? '#b45309' : tx.status === 'processing' ? '#1d4ed8' : '#6b7280',
                    }}>
                      {tx.status?.charAt(0).toUpperCase() + tx.status?.slice(1)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <svg style={{ width: 48, height: 48, margin: '0 auto 16px', color: '#d1d5db' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
            <p style={{ color: '#6b7280', fontSize: 14 }}>No transfers yet</p>
            <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>
              {bankInfo ? 'Make your first deposit to get started.' : 'Link your bank account to begin.'}
            </p>
          </div>
        )}
      </div>

    </InvestorLayout>
  );
}
