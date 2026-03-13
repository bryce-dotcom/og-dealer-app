import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import InvestorLayout from '../components/InvestorLayout';
import PlaidLinkButton from '../components/PlaidLinkButton';

export default function InvestorCapital() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [investor, setInvestor] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [distributions, setDistributions] = useState([]);
  const [activeTab, setActiveTab] = useState('deposit');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { loadCapitalData(); }, []);

  async function loadCapitalData() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/investor/login'); return; }
      const { data: investorData } = await supabase.from('investors').select('*').eq('user_id', user.id).single();
      setInvestor(investorData);
      const { data: txData } = await supabase.from('investor_capital').select('*').eq('investor_id', investorData.id).order('initiated_at', { ascending: false });
      setTransactions(txData || []);
      const { data: distData } = await supabase.from('investor_distributions').select('*').eq('investor_id', investorData.id).order('created_at', { ascending: false });
      setDistributions(distData || []);
    } catch (error) { console.error('Error loading capital data:', error); }
    finally { setLoading(false); }
  }

  async function handleDeposit() {
    if (!amount || parseFloat(amount) <= 0) { alert('Please enter a valid amount'); return; }
    const depositAmount = parseFloat(amount);
    if (depositAmount < 10000) { alert('Minimum deposit is $10,000'); return; }
    if (!investor?.linked_bank_account) { alert('Please link a bank account first.'); return; }
    if (!confirm(`Deposit $${depositAmount.toLocaleString()}?\n\nACH transfer from:\n${investor.linked_bank_account.name} ****${investor.linked_bank_account.mask}\n\nEstimated settlement: 3-5 business days`)) return;
    try {
      setSubmitting(true);
      const { data, error } = await supabase.functions.invoke('plaid-initiate-transfer', {
        body: { investor_id: investor.id, amount: depositAmount, transfer_type: 'deposit', description: 'Investment capital deposit' }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to initiate transfer');
      alert(`Deposit of $${depositAmount.toLocaleString()} initiated. You'll be notified when it settles.`);
      setAmount('');
      loadCapitalData();
    } catch (error) { alert('Failed to process deposit: ' + error.message); }
    finally { setSubmitting(false); }
  }

  async function handleWithdrawal() {
    if (!amount || parseFloat(amount) <= 0) { alert('Please enter a valid amount'); return; }
    const withdrawAmount = parseFloat(amount);
    if (withdrawAmount > (investor?.available_balance || 0)) { alert(`Insufficient balance. Available: ${fmt(investor?.available_balance)}`); return; }
    if (!investor?.linked_bank_account) { alert('Please link a bank account first.'); return; }
    if (!confirm(`Withdraw $${withdrawAmount.toLocaleString()} to:\n${investor.linked_bank_account.name} ****${investor.linked_bank_account.mask}\n\nEstimated arrival: 2-3 business days`)) return;
    try {
      setSubmitting(true);
      const { data, error } = await supabase.functions.invoke('plaid-initiate-transfer', {
        body: { investor_id: investor.id, amount: withdrawAmount, transfer_type: 'withdrawal', description: 'Investment withdrawal' }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to initiate transfer');
      alert(`Withdrawal of $${withdrawAmount.toLocaleString()} initiated. You'll be notified when it arrives.`);
      setAmount('');
      loadCapitalData();
    } catch (error) { alert('Failed to process withdrawal: ' + error.message); }
    finally { setSubmitting(false); }
  }

  function fmt(v) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v || 0); }

  function statusStyle(s) {
    const m = { completed: { bg: '#ecfdf5', color: '#047857' }, processing: { bg: '#eff6ff', color: '#1d4ed8' }, pending: { bg: '#fffbeb', color: '#b45309' }, failed: { bg: '#fef2f2', color: '#b91c1c' } };
    return m[s] || { bg: '#f3f4f6', color: '#6b7280' };
  }

  const card = { backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', marginBottom: 24, overflow: 'hidden' };
  const cardHeader = { padding: '16px 24px', borderBottom: '1px solid #f3f4f6' };
  const cardBody = { padding: 24 };

  if (loading) {
    return (
      <InvestorLayout title="Capital Management">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
          <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#111827', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
      </InvestorLayout>
    );
  }

  const allActivity = [
    ...transactions.map(t => ({ ...t, activityType: 'capital', date: t.initiated_at })),
    ...distributions.map(d => ({ ...d, activityType: 'distribution', date: d.created_at })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <InvestorLayout title="Capital Management" subtitle="Manage your investment capital and track every transaction">

      {/* How Your Money Works */}
      <div style={card}>
        <div style={cardHeader}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: 0 }}>How Your Money Works</h2>
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
            {[
              { step: '1', title: 'You Deposit', desc: 'ACH transfer pulls funds from your linked bank account. Settlement takes 3-5 business days.', icon: 'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
              { step: '2', title: 'Capital Deployed', desc: 'Your funds are used to purchase vetted automotive inventory. Every vehicle acquisition is tracked in your portfolio.', icon: 'M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 00-.879-2.121l-3.498-3.498A2.999 2.999 0 0014.024 7.5H9.75' },
              { step: '3', title: 'Vehicles Sell', desc: 'When vehicles sell at a profit, your share is calculated based on your pool terms and ownership percentage.', icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z' },
              { step: '4', title: 'Profits Distributed', desc: 'Returns are deposited directly to your linked bank account via ACH. Every distribution is logged and trackable.', icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
            ].map(s => (
              <div key={s.step} style={{ textAlign: 'center' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', position: 'relative' }}>
                  <svg style={{ width: 24, height: 24, color: '#374151' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
                  </svg>
                  <span style={{ position: 'absolute', top: -4, right: -4, width: 20, height: 20, backgroundColor: '#111827', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.step}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 4 }}>{s.title}</div>
                <p style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5, margin: 0 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Balance Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Invested', value: fmt(investor?.total_invested), color: '#111827' },
          { label: 'Total Returned', value: fmt(investor?.total_returned), color: '#16a34a' },
          { label: 'Available to Withdraw', value: fmt(investor?.available_balance), color: '#d97706' },
        ].map(s => (
          <div key={s.label} style={{ ...card, marginBottom: 0, padding: 24 }}>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 600, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Bank Account */}
      <div style={card}>
        <div style={{ ...cardHeader, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: 0 }}>Linked Bank Account</h2>
          {investor?.linked_bank_account && (
            <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#16a34a', display: 'inline-block' }} />
              Connected
            </span>
          )}
        </div>
        <div style={cardBody}>
          {investor?.linked_bank_account ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, backgroundColor: '#eff6ff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg style={{ width: 20, height: 20, color: '#2563eb' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>{investor.linked_bank_account.name || 'Bank Account'}</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>****{investor.linked_bank_account.mask || '0000'}</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>All transfers secured with 256-bit encryption via Plaid</div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 16 }}>Link your bank account to start depositing and withdrawing funds</p>
              <PlaidLinkButton investorId={investor?.id} onSuccess={() => { window.location.reload(); }} />
            </div>
          )}
        </div>
      </div>

      {/* Deposit / Withdraw */}
      <div style={card}>
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
          {['deposit', 'withdraw'].map(tab => (
            <button key={tab} onClick={() => { setActiveTab(tab); setAmount(''); }}
              style={{ flex: 1, padding: '14px 0', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                backgroundColor: activeTab === tab ? '#111827' : '#fff',
                color: activeTab === tab ? '#fff' : '#6b7280',
              }}>
              {tab === 'deposit' ? 'Deposit Funds' : 'Withdraw Funds'}
            </button>
          ))}
        </div>
        <div style={{ padding: 24 }}>
          {activeTab === 'deposit' ? (
            <>
              <div style={{ marginBottom: 8 }}>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: '0 0 4px 0' }}>Add Capital</h3>
                <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Minimum deposit: $10,000 &middot; Settlement: 3-5 business days</p>
              </div>
              <div style={{ marginTop: 20 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Amount</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 16 }}>$</span>
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="10,000"
                    style={{ width: '100%', padding: '12px 14px 12px 32px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 16, color: '#111827', outline: 'none', boxSizing: 'border-box', backgroundColor: '#fff' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, margin: '12px 0 20px' }}>
                {[10000, 25000, 50000].map(v => (
                  <button key={v} onClick={() => setAmount(v.toString())}
                    style={{ padding: '10px 0', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#374151', backgroundColor: '#f9fafb', cursor: 'pointer' }}>
                    ${v / 1000}k
                  </button>
                ))}
              </div>
              <button onClick={handleDeposit} disabled={submitting || !amount}
                style={{ width: '100%', padding: 14, backgroundColor: submitting || !amount ? '#e5e7eb' : '#111827', color: submitting || !amount ? '#9ca3af' : '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: submitting || !amount ? 'not-allowed' : 'pointer' }}>
                {submitting ? 'Processing...' : 'Deposit via ACH'}
              </button>
              <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 16, marginTop: 16, display: 'flex', gap: 12 }}>
                <svg style={{ width: 20, height: 20, color: '#2563eb', flexShrink: 0, marginTop: 2 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                <div style={{ fontSize: 13, color: '#1e40af', lineHeight: 1.5 }}>
                  <strong style={{ color: '#1e3a8a' }}>How deposits work:</strong> Funds are securely pulled from your linked bank via ACH.
                  Once settled, your capital is deployed into vetted automotive inventory. Every vehicle purchase is visible in your Portfolio.
                  You'll receive a notification at each stage of the process.
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 8 }}>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: '0 0 4px 0' }}>Withdraw Returns</h3>
                <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Available: {fmt(investor?.available_balance)} &middot; Settlement: 2-3 business days</p>
              </div>
              <div style={{ marginTop: 20 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Amount</label>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" max={investor?.available_balance}
                  style={{ width: '100%', padding: '12px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 16, color: '#111827', outline: 'none', boxSizing: 'border-box', backgroundColor: '#fff' }} />
              </div>
              <button onClick={() => setAmount((investor?.available_balance || 0).toString())}
                style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 8, padding: 0 }}>
                Withdraw all available balance
              </button>
              <button onClick={handleWithdrawal} disabled={submitting || !amount || parseFloat(amount) > (investor?.available_balance || 0)}
                style={{ display: 'block', width: '100%', padding: 14, marginTop: 16, backgroundColor: (submitting || !amount) ? '#e5e7eb' : '#16a34a', color: (submitting || !amount) ? '#9ca3af' : '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: (submitting || !amount) ? 'not-allowed' : 'pointer' }}>
                {submitting ? 'Processing...' : 'Request Withdrawal'}
              </button>
              <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 16, marginTop: 16, display: 'flex', gap: 12 }}>
                <svg style={{ width: 20, height: 20, color: '#d97706', flexShrink: 0, marginTop: 2 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <div style={{ fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>
                  <strong style={{ color: '#78350f' }}>About withdrawals:</strong> You can only withdraw distributed profits.
                  Capital actively deployed in vehicles cannot be withdrawn until those vehicles are sold.
                  When a vehicle sells, your profit share is calculated and added to your available balance automatically.
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Transaction History */}
      <div style={card}>
        <div style={cardHeader}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: 0 }}>Transaction History</h2>
        </div>
        <div style={{ padding: 0 }}>
          {allActivity.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: '#9ca3af' }}>
              <svg style={{ width: 40, height: 40, margin: '0 auto 12px', color: '#d1d5db' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
              <p style={{ fontSize: 14 }}>No transactions yet. Make your first deposit to get started.</p>
            </div>
          ) : (
            allActivity.map((tx, i) => {
              const isDist = tx.activityType === 'distribution';
              const isDeposit = !isDist && tx.transaction_type === 'deposit';
              const label = isDist ? 'Distribution' : isDeposit ? 'Deposit' : 'Withdrawal';
              const color = isDist ? '#16a34a' : isDeposit ? '#2563eb' : '#d97706';
              const bg = isDist ? '#f0fdf4' : isDeposit ? '#eff6ff' : '#fffbeb';
              const sign = isDist ? '+' : isDeposit ? '+' : '-';
              const st = statusStyle(tx.status);
              return (
                <div key={tx.id} style={{ padding: '16px 24px', borderBottom: i < allActivity.length - 1 ? '1px solid #f3f4f6' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg style={{ width: 18, height: 18, color }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        {isDeposit || isDist
                          ? <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                          : <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                        }
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>{label} {!isDist && tx.payment_method ? `\u00B7 ${tx.payment_method.toUpperCase()}` : ''}</div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>
                        {new Date(tx.date).toLocaleDateString()} at {new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {tx.plaid_transfer_id && ` \u00B7 ID: ${tx.plaid_transfer_id.substring(0, 12)}...`}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color }}>{sign}{fmt(tx.amount)}</div>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, backgroundColor: st.bg, color: st.color }}>{tx.status}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

    </InvestorLayout>
  );
}
