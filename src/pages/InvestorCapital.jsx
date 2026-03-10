import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PlaidLinkButton from '../components/PlaidLinkButton';

export default function InvestorCapital() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [investor, setInvestor] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [activeTab, setActiveTab] = useState('deposit'); // 'deposit' or 'withdraw'

  // Form state
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadCapitalData();
  }, []);

  async function loadCapitalData() {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/investor/login');
        return;
      }

      const { data: investorData } = await supabase
        .from('investors')
        .select('*')
        .eq('user_id', user.id)
        .single();

      setInvestor(investorData);

      // Load transaction history
      const { data: txData } = await supabase
        .from('investor_capital')
        .select('*')
        .eq('investor_id', investorData.id)
        .order('initiated_at', { ascending: false });

      setTransactions(txData || []);

    } catch (error) {
      console.error('Error loading capital data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeposit() {
    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    const depositAmount = parseFloat(amount);

    if (depositAmount < 10000) {
      alert('Minimum deposit is $10,000');
      return;
    }

    // Check if bank account is linked
    if (!investor?.linked_bank_account) {
      alert('Please link a bank account first before making deposits.');
      return;
    }

    if (!confirm(`Deposit $${depositAmount.toLocaleString()}?\n\nThis will initiate an ACH transfer from your linked bank account.\n\nFunds will be pulled from:\n${investor.linked_bank_account.name} ****${investor.linked_bank_account.mask}\n\nEstimated settlement: 3-5 business days`)) {
      return;
    }

    try {
      setSubmitting(true);

      // Initiate Plaid ACH transfer
      const { data, error } = await supabase.functions.invoke('plaid-initiate-transfer', {
        body: {
          investor_id: investor.id,
          amount: depositAmount,
          transfer_type: 'deposit',
          description: 'Investment capital deposit via investor portal'
        }
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Failed to initiate transfer');
      }

      const estimatedDate = new Date(data.transfer.estimated_settlement).toLocaleDateString();

      alert(`✅ Deposit initiated successfully!\n\n💰 Amount: $${depositAmount.toLocaleString()}\n📅 Estimated settlement: ${estimatedDate}\n🏦 From: ${investor.linked_bank_account.name}\n\nYou'll receive a notification when the transfer completes.`);
      setAmount('');
      loadCapitalData();

    } catch (error) {
      console.error('Error processing deposit:', error);
      alert('❌ Failed to process deposit\n\n' + error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWithdrawal() {
    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    const withdrawAmount = parseFloat(amount);

    if (withdrawAmount > investor.available_balance) {
      alert(`❌ Insufficient balance\n\nRequested: $${withdrawAmount.toLocaleString()}\nAvailable: $${investor.available_balance.toLocaleString()}`);
      return;
    }

    // Check if bank account is linked
    if (!investor?.linked_bank_account) {
      alert('Please link a bank account first before making withdrawals.');
      return;
    }

    if (!confirm(`Withdraw $${withdrawAmount.toLocaleString()}?\n\nFunds will be transferred to:\n${investor.linked_bank_account.name} ****${investor.linked_bank_account.mask}\n\nEstimated arrival: 2-3 business days`)) {
      return;
    }

    try {
      setSubmitting(true);

      // Initiate Plaid ACH transfer
      const { data, error } = await supabase.functions.invoke('plaid-initiate-transfer', {
        body: {
          investor_id: investor.id,
          amount: withdrawAmount,
          transfer_type: 'withdrawal',
          description: 'Investment withdrawal via investor portal'
        }
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Failed to initiate transfer');
      }

      const estimatedDate = new Date(data.transfer.estimated_settlement).toLocaleDateString();

      alert(`✅ Withdrawal initiated successfully!\n\n💰 Amount: $${withdrawAmount.toLocaleString()}\n📅 Estimated arrival: ${estimatedDate}\n🏦 To: ${investor.linked_bank_account.name}\n\nYou'll receive a notification when the transfer completes.`);
      setAmount('');
      loadCapitalData();

    } catch (error) {
      console.error('Error processing withdrawal:', error);
      alert('❌ Failed to process withdrawal\n\n' + error.message);
    } finally {
      setSubmitting(false);
    }
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount || 0);
  }

  function getStatusColor(status) {
    switch (status) {
      case 'completed': return 'text-green-400 bg-green-500/20';
      case 'processing': return 'text-blue-400 bg-blue-500/20';
      case 'pending': return 'text-amber-400 bg-amber-500/20';
      case 'failed': return 'text-red-400 bg-red-500/20';
      default: return 'text-slate-400 bg-slate-500/20';
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Capital Management</h1>
            <p className="text-blue-200">Deposit funds or withdraw returns</p>
          </div>
          <button
            onClick={() => navigate('/investor/dashboard')}
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition"
          >
            ← Dashboard
          </button>
        </div>

        {/* Balance Card */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-blue-200 text-sm mb-2">Total Invested</div>
              <div className="text-3xl font-bold text-white">{formatCurrency(investor?.total_invested)}</div>
            </div>
            <div>
              <div className="text-blue-200 text-sm mb-2">Total Returned</div>
              <div className="text-3xl font-bold text-green-400">{formatCurrency(investor?.total_returned)}</div>
            </div>
            <div>
              <div className="text-blue-200 text-sm mb-2">Available to Withdraw</div>
              <div className="text-3xl font-bold text-amber-400">{formatCurrency(investor?.available_balance)}</div>
            </div>
          </div>
        </div>

        {/* Bank Account Info */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-8">
          <h2 className="text-xl font-bold text-white mb-4">Linked Bank Account</h2>
          {investor?.linked_bank_account ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                    <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <div className="text-white font-semibold">
                    {investor.linked_bank_account.name || 'Bank Account'}
                  </div>
                  <div className="text-blue-200 text-sm">
                    ****{investor.linked_bank_account.mask || '0000'}
                  </div>
                </div>
              </div>
              <button className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition">
                Change Account
              </button>
            </div>
          ) : (
            <div className="text-center py-6">
              <div className="text-blue-200 mb-4">No bank account linked</div>
              <PlaidLinkButton
                investorId={investor?.id}
                onSuccess={() => {
                  alert('Bank account linked! Reloading...');
                  window.location.reload();
                }}
              />
            </div>
          )}
        </div>

        {/* Deposit/Withdraw Form */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 mb-8 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-white/20">
            <button
              onClick={() => setActiveTab('deposit')}
              className={`flex-1 px-6 py-4 font-semibold transition ${
                activeTab === 'deposit'
                  ? 'bg-blue-600 text-white'
                  : 'bg-transparent text-blue-200 hover:bg-white/5'
              }`}
            >
              Deposit Funds
            </button>
            <button
              onClick={() => setActiveTab('withdraw')}
              className={`flex-1 px-6 py-4 font-semibold transition ${
                activeTab === 'withdraw'
                  ? 'bg-blue-600 text-white'
                  : 'bg-transparent text-blue-200 hover:bg-white/5'
              }`}
            >
              Withdraw Funds
            </button>
          </div>

          <div className="p-8">
            {activeTab === 'deposit' ? (
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">Add Capital</h3>
                <p className="text-blue-200 mb-6">
                  Minimum deposit: $10,000 • Processing time: 3-5 business days
                </p>

                <div className="space-y-6">
                  <div>
                    <label className="block text-white font-semibold mb-2">Amount</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg">$</span>
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="10,000"
                        className="w-full pl-10 pr-4 py-4 bg-slate-800 border border-slate-700 rounded-lg text-white text-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {[10000, 25000, 50000].map(amt => (
                      <button
                        key={amt}
                        onClick={() => setAmount(amt.toString())}
                        className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition"
                      >
                        ${(amt / 1000)}k
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handleDeposit}
                    disabled={submitting || !amount}
                    className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-bold text-lg transition"
                  >
                    {submitting ? 'Processing...' : 'Deposit via ACH'}
                  </button>

                  <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-4">
                    <div className="flex gap-2 text-blue-200 text-sm">
                      <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      <div>
                        <strong className="text-white">How it works:</strong> Funds are pulled from your linked bank account via ACH transfer. Your capital will be deployed to purchase vehicles within 1-2 weeks.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">Withdraw Returns</h3>
                <p className="text-blue-200 mb-6">
                  Available balance: {formatCurrency(investor?.available_balance)} • Processing time: 2-3 business days
                </p>

                <div className="space-y-6">
                  <div>
                    <label className="block text-white font-semibold mb-2">Amount</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg">$</span>
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0"
                        max={investor?.available_balance}
                        className="w-full pl-10 pr-4 py-4 bg-slate-800 border border-slate-700 rounded-lg text-white text-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => setAmount((investor?.available_balance || 0).toString())}
                    className="text-blue-400 hover:text-blue-300 text-sm font-semibold"
                  >
                    Withdraw all available balance
                  </button>

                  <button
                    onClick={handleWithdrawal}
                    disabled={submitting || !amount || parseFloat(amount) > (investor?.available_balance || 0)}
                    className="w-full px-6 py-4 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-bold text-lg transition"
                  >
                    {submitting ? 'Processing...' : 'Request Withdrawal'}
                  </button>

                  <div className="bg-amber-900/30 border border-amber-500/30 rounded-lg p-4">
                    <div className="flex gap-2 text-amber-200 text-sm">
                      <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <div>
                        <strong className="text-white">Note:</strong> You can only withdraw profit that has been distributed. Capital deployed in active vehicles is not available until those vehicles sell.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Transaction History */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
          <h2 className="text-2xl font-bold text-white mb-6">Transaction History</h2>

          <div className="space-y-3">
            {transactions.map((tx) => (
              <div key={tx.id} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      tx.transaction_type === 'deposit' ? 'bg-blue-500/20' : 'bg-green-500/20'
                    }`}>
                      {tx.transaction_type === 'deposit' ? (
                        <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <div className="text-white font-medium capitalize">
                        {tx.transaction_type} • {tx.payment_method?.toUpperCase()}
                      </div>
                      <div className="text-slate-400 text-sm">
                        {new Date(tx.initiated_at).toLocaleDateString()} at{' '}
                        {new Date(tx.initiated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      {tx.description && (
                        <div className="text-slate-400 text-xs mt-1">{tx.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-bold ${
                      tx.transaction_type === 'deposit' ? 'text-blue-400' : 'text-green-400'
                    }`}>
                      {tx.transaction_type === 'deposit' ? '+' : '-'}{formatCurrency(tx.amount)}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${getStatusColor(tx.status)}`}>
                      {tx.status}
                    </span>
                  </div>
                </div>

                {/* Additional details */}
                {(tx.metadata || tx.plaid_transfer_id) && (
                  <div className="mt-3 pt-3 border-t border-slate-700 flex flex-wrap gap-4 text-xs text-slate-400">
                    {tx.plaid_transfer_id && (
                      <div>
                        <span className="text-slate-500">Transfer ID:</span> {tx.plaid_transfer_id.substring(0, 16)}...
                      </div>
                    )}
                    {tx.metadata?.estimated_settlement && (
                      <div>
                        <span className="text-slate-500">Est. Settlement:</span>{' '}
                        {new Date(tx.metadata.estimated_settlement).toLocaleDateString()}
                      </div>
                    )}
                    {tx.metadata?.transfer_status && (
                      <div>
                        <span className="text-slate-500">Plaid Status:</span> {tx.metadata.transfer_status}
                      </div>
                    )}
                    {tx.metadata?.failure_reason && (
                      <div className="text-red-400">
                        <span className="text-slate-500">Reason:</span> {tx.metadata.failure_reason}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {transactions.length === 0 && (
            <div className="text-center py-8 text-slate-400">
              <p>No transactions yet</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
