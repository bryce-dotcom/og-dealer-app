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
  const [checking, setChecking] = useState(false);
  const [depositDeclared, setDepositDeclared] = useState(false);
  const [dealerBank, setDealerBank] = useState(null);

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
      // Fetch dealer bank info for deposit instructions
      const { data: dealerData } = await supabase.from('dealer_settings').select('investor_bank_name, investor_bank_account_name, investor_bank_routing, investor_bank_account, investor_bank_type, dealer_name').limit(1).single();
      if (dealerData && dealerData.investor_bank_routing) {
        setDealerBank({
          name: dealerData.investor_bank_account_name || dealerData.dealer_name || 'Dealer',
          bank: dealerData.investor_bank_name || 'Bank',
          routing: dealerData.investor_bank_routing,
          account: dealerData.investor_bank_account || '',
          type: dealerData.investor_bank_type || 'Checking',
        });
      }
    } catch (error) { console.error('Error loading capital data:', error); }
    finally { setLoading(false); }
  }

  async function handleDeclareDeposit() {
    if (!amount || parseFloat(amount) <= 0) { alert('Please enter a valid amount'); return; }
    const depositAmount = parseFloat(amount);
    if (depositAmount < 10000) { alert('Minimum deposit is $10,000'); return; }
    if (!investor?.linked_bank_account) { alert('Please link your bank account first so we can detect your transfer.'); return; }
    if (!dealerBank) { alert('Deposit bank details are not configured yet. Please contact your fund manager.'); return; }

    if (!confirm(
      `You are declaring a deposit of $${depositAmount.toLocaleString()}.\n\n` +
      `Please send this exact amount from your linked bank to:\n\n` +
      `Bank: ${dealerBank.bank}\n` +
      `Routing: ${dealerBank.routing}\n` +
      `Account: ${dealerBank.account}\n` +
      `Name: ${dealerBank.name}\n\n` +
      `Once we detect the outgoing transfer from your bank, your deposit will be automatically confirmed.`
    )) return;

    try {
      setSubmitting(true);

      const depositId = crypto.randomUUID();

      // Create a pending capital record
      const { data: capitalRecord, error: capitalError } = await supabase
        .from('investor_capital')
        .insert({
          investor_id: investor.id,
          transaction_type: 'deposit',
          amount: depositAmount,
          status: 'pending',
          payment_method: 'bank_transfer',
          description: 'Bank-to-bank deposit (awaiting confirmation)',
          metadata: {
            deposit_id: depositId,
            declared_at: new Date().toISOString(),
            target_bank: dealerBank.bank,
            target_routing: dealerBank.routing,
            match_type: 'plaid_auto',
          }
        })
        .select()
        .single();

      if (capitalError) throw capitalError;

      // Add to investor's pending_deposits array
      const currentPending = investor.pending_deposits || [];
      const newPending = [
        ...currentPending,
        {
          id: depositId,
          capital_record_id: capitalRecord.id,
          amount: depositAmount,
          declared_at: new Date().toISOString(),
          status: 'pending',
        }
      ];

      const { error: updateError } = await supabase
        .from('investors')
        .update({ pending_deposits: newPending })
        .eq('id', investor.id);

      if (updateError) throw updateError;

      setDepositDeclared(true);
      setAmount('');
      loadCapitalData();
    } catch (error) {
      alert('Failed to declare deposit: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCheckForTransfer() {
    try {
      setChecking(true);
      const { data, error } = await supabase.functions.invoke('sync-investor-transactions', {
        body: { investor_id: investor.id }
      });

      if (error) throw error;

      if (data?.deposits_matched > 0) {
        alert(`${data.deposits_matched} deposit(s) confirmed! Your capital has been credited.`);
        setDepositDeclared(false);
        loadCapitalData();
      } else {
        alert(
          'No matching transfer detected yet.\n\n' +
          'This is normal — bank transfers can take 1-3 business days to appear.\n\n' +
          "We'll automatically notify you when your deposit is confirmed."
        );
      }
    } catch (error) {
      console.error('Error checking transfers:', error);
      alert('Error checking for transfer: ' + error.message);
    } finally {
      setChecking(false);
    }
  }

  async function handleWithdrawal() {
    if (!amount || parseFloat(amount) <= 0) { alert('Please enter a valid amount'); return; }
    const withdrawAmount = parseFloat(amount);
    if (withdrawAmount > (investor?.available_balance || 0)) { alert(`Insufficient balance. Available: ${fmt(investor?.available_balance)}`); return; }
    if (!investor?.linked_bank_account) { alert('Please link a bank account first.'); return; }
    if (!confirm(`Withdraw $${withdrawAmount.toLocaleString()} to:\n${investor.linked_bank_account.name} ****${investor.linked_bank_account.mask}\n\nA team member will process this within 1-2 business days.`)) return;
    try {
      setSubmitting(true);
      const { error } = await supabase.from('investor_capital').insert({
        investor_id: investor.id,
        transaction_type: 'withdrawal',
        amount: withdrawAmount,
        status: 'pending',
        payment_method: 'bank_transfer',
        description: 'Withdrawal request — pending admin approval',
      });
      if (error) throw error;
      alert(`Withdrawal of $${withdrawAmount.toLocaleString()} requested. You'll be notified when it's processed.`);
      setAmount('');
      loadCapitalData();
    } catch (error) { alert('Failed to request withdrawal: ' + error.message); }
    finally { setSubmitting(false); }
  }

  function fmt(v) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v || 0); }

  function statusStyle(s) {
    const m = { completed: { bg: '#ecfdf5', color: '#047857' }, confirmed: { bg: '#ecfdf5', color: '#047857' }, processing: { bg: '#eff6ff', color: '#1d4ed8' }, pending: { bg: '#fffbeb', color: '#b45309' }, failed: { bg: '#fef2f2', color: '#b91c1c' } };
    return m[s] || { bg: '#f3f4f6', color: '#6b7280' };
  }

  const card = { backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginBottom: 24, overflow: 'hidden' };
  const cardHeader = { padding: '14px 24px', borderBottom: '1px solid #f1f5f9' };
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

  const pendingDeposits = (investor?.pending_deposits || []).filter(d => d.status === 'pending');
  const allActivity = [
    ...transactions.map(t => ({ ...t, activityType: 'capital', date: t.initiated_at || t.created_at })),
    ...distributions.map(d => ({ ...d, activityType: 'distribution', date: d.created_at })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <InvestorLayout title="Capital Management" subtitle="Manage your investment capital and track every transaction">

      {/* How It Works — Bank-to-Bank */}
      <div style={card}>
        <div style={cardHeader}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: 0 }}>How Deposits Work — Direct Bank Transfer</h2>
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
            {[
              { step: '1', title: 'Declare Amount', desc: 'Tell us how much you\'re sending. This creates a pending record we\'ll match against.', icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z' },
              { step: '2', title: 'Send via Your Bank', desc: 'Log into your bank and send the exact amount to OG DiX\'s account using the routing & account numbers below.', icon: 'M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18' },
              { step: '3', title: 'We Detect It', desc: 'Plaid monitors your linked bank for the outgoing transfer. Once detected, your deposit is automatically confirmed.', icon: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z' },
              { step: '4', title: 'Capital Deployed', desc: 'Your funds are used to purchase vetted inventory. Every vehicle is tracked in your portfolio with real-time P&L.', icon: 'M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 00-.879-2.121l-3.498-3.498A2.999 2.999 0 0014.024 7.5H9.75' },
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

      {/* Pending Deposits Alert */}
      {pendingDeposits.length > 0 && (
        <div style={{ ...card, border: '1px solid #fde68a', backgroundColor: '#fffbeb' }}>
          <div style={{ padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg style={{ width: 20, height: 20, color: '#d97706' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#92400e' }}>
                  {pendingDeposits.length} Pending Deposit{pendingDeposits.length > 1 ? 's' : ''} — Awaiting Bank Transfer
                </div>
                <div style={{ fontSize: 13, color: '#b45309', marginTop: 2 }}>
                  {pendingDeposits.map(d => fmt(d.amount)).join(', ')} declared · Send from your linked bank to OG DiX's account
                </div>
              </div>
            </div>
            <button
              onClick={handleCheckForTransfer}
              disabled={checking}
              style={{
                padding: '10px 20px', backgroundColor: checking ? '#e5e7eb' : '#111827', color: checking ? '#9ca3af' : '#fff',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: checking ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
              }}
            >
              {checking ? (
                <>
                  <div style={{ width: 14, height: 14, border: '2px solid #9ca3af', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  Checking...
                </>
              ) : (
                <>
                  <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  Check Now
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Bank Account */}
      <div style={card}>
        <div style={{ ...cardHeader, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: 0 }}>Linked Bank Account</h2>
          {investor?.linked_bank_account && (
            <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#16a34a', display: 'inline-block' }} />
              Connected via Plaid
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
                  <div style={{ fontSize: 13, color: '#6b7280' }}>****{investor.linked_bank_account.mask || '0000'} · Used for deposit detection & withdrawals</div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 16 }}>Link your bank account so we can automatically detect your deposits</p>
              <PlaidLinkButton investorId={investor?.id} onSuccess={() => { window.location.reload(); }} />
            </div>
          )}
        </div>
      </div>

      {/* Deposit / Withdraw Tabs */}
      <div style={card}>
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
          {['deposit', 'withdraw'].map(tab => (
            <button key={tab} onClick={() => { setActiveTab(tab); setAmount(''); setDepositDeclared(false); }}
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
              {depositDeclared ? (
                /* Post-declaration instructions */
                <div>
                  <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                      <svg style={{ width: 32, height: 32, color: '#16a34a' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h3 style={{ fontSize: 20, fontWeight: 600, color: '#111827', margin: '0 0 8px 0' }}>Deposit Declared!</h3>
                    <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>Now send the funds from your bank. Here's where to send it:</p>
                  </div>

                  {/* Bank details card */}
                  <div style={{ backgroundColor: '#f8fafc', border: '2px dashed #cbd5e1', borderRadius: 12, padding: 24, marginBottom: 24 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 16px 0' }}>Send To</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      {[
                        { label: 'Account Name', value: dealerBank.name },
                        { label: 'Bank', value: dealerBank.bank },
                        { label: 'Routing Number', value: dealerBank.routing },
                        { label: 'Account Number', value: dealerBank.account },
                      ].map(f => (
                        <div key={f.label}>
                          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{f.label}</div>
                          <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', fontFamily: 'monospace' }}>{f.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <button onClick={handleCheckForTransfer} disabled={checking}
                      style={{ flex: 1, padding: 14, backgroundColor: checking ? '#e5e7eb' : '#111827', color: checking ? '#9ca3af' : '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: checking ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      {checking ? 'Checking...' : "I Sent It — Check Now"}
                    </button>
                    <button onClick={() => setDepositDeclared(false)}
                      style={{ padding: '14px 24px', backgroundColor: '#fff', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                      Back
                    </button>
                  </div>

                  <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 16, marginTop: 16, display: 'flex', gap: 12 }}>
                    <svg style={{ width: 20, height: 20, color: '#2563eb', flexShrink: 0, marginTop: 2 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                    </svg>
                    <div style={{ fontSize: 13, color: '#1e40af', lineHeight: 1.5 }}>
                      <strong>Don't worry if it's not detected right away.</strong> ACH transfers take 1-3 business days. Plaid will automatically
                      detect the outgoing transfer and confirm your deposit. You'll receive a notification when it's confirmed.
                    </div>
                  </div>
                </div>
              ) : (
                /* Pre-declaration form */
                <>
                  <div style={{ marginBottom: 8 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: '0 0 4px 0' }}>Deposit Capital</h3>
                    <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Minimum deposit: $10,000 · Direct bank-to-bank transfer · No fees</p>
                  </div>

                  {/* OG DiX Bank Details — always visible */}
                  <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: 20, margin: '20px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                      <svg style={{ width: 18, height: 18, color: '#16a34a' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18" />
                      </svg>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#166534' }}>OG DiX Motor Club — Receiving Account</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {[
                        { label: 'Account Name', value: dealerBank.name },
                        { label: 'Bank', value: dealerBank.bank },
                        { label: 'Routing Number', value: dealerBank.routing },
                        { label: 'Account Number', value: dealerBank.account },
                      ].map(f => (
                        <div key={f.label}>
                          <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 500, marginBottom: 2 }}>{f.label}</div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: '#14532d', fontFamily: 'monospace' }}>{f.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: 20 }}>
                    <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>How much are you sending?</label>
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
                  <button onClick={handleDeclareDeposit} disabled={submitting || !amount}
                    style={{ width: '100%', padding: 14, backgroundColor: submitting || !amount ? '#e5e7eb' : '#111827', color: submitting || !amount ? '#9ca3af' : '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: submitting || !amount ? 'not-allowed' : 'pointer' }}>
                    {submitting ? 'Declaring...' : "I'm Sending This Amount"}
                  </button>

                  <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 16, marginTop: 16, display: 'flex', gap: 12 }}>
                    <svg style={{ width: 20, height: 20, color: '#2563eb', flexShrink: 0, marginTop: 2 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                    <div style={{ fontSize: 13, color: '#1e40af', lineHeight: 1.5 }}>
                      <strong style={{ color: '#1e3a8a' }}>Zero fees.</strong> You send money directly from your bank to ours — no middleman, no processing fees.
                      Plaid securely monitors your linked account to automatically confirm the transfer. Your bank info never leaves Plaid's servers.
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            /* Withdraw tab */
            <>
              <div style={{ marginBottom: 8 }}>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: '0 0 4px 0' }}>Withdraw Returns</h3>
                <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Available: {fmt(investor?.available_balance)} · Processed within 1-2 business days</p>
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
                  Withdrawals are reviewed and sent via bank transfer within 1-2 business days.
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
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>
                        {label}
                        {tx.payment_method ? ` · ${tx.payment_method === 'bank_transfer' ? 'Bank Transfer' : tx.payment_method.toUpperCase()}` : ''}
                      </div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>
                        {new Date(tx.date).toLocaleDateString()} at {new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </InvestorLayout>
  );
}
