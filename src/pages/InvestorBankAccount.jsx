import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function InvestorBankAccount() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [investor, setInvestor] = useState(null);
  const [pool, setPool] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all', 'in', 'out'

  useEffect(() => {
    loadBankData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadTransactions, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadBankData() {
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

      // Get investor's pool
      const { data: shares } = await supabase
        .from('investor_pool_shares')
        .select(`
          *,
          pool:investment_pools(*)
        `)
        .eq('investor_id', investorData.id)
        .eq('active', true)
        .limit(1);

      if (shares && shares.length > 0) {
        setPool(shares[0].pool);
        await loadTransactions(shares[0].pool.id);
      }

    } catch (error) {
      console.error('Error loading bank data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadTransactions(poolId = pool?.id) {
    if (!poolId) return;

    try {
      const { data } = await supabase
        .from('pool_transactions')
        .select('*')
        .eq('pool_id', poolId)
        .order('transaction_date', { ascending: false })
        .limit(50);

      setTransactions(data || []);

      // Calculate current balance (mock for now - in production, get from Plaid)
      const total = (data || []).reduce((sum, tx) => {
        // Plaid amounts: negative = outflow, positive = inflow
        return sum + parseFloat(tx.amount || 0);
      }, 0);
      setBalance(Math.abs(total));

    } catch (error) {
      console.error('Error loading transactions:', error);
    }
  }

  async function handleSyncNow() {
    if (!pool) return;

    try {
      setSyncing(true);

      const { data, error } = await supabase.functions.invoke('plaid-sync-pool-transactions', {
        body: { pool_id: pool.id }
      });

      if (error) throw error;

      if (data.success) {
        alert(`Synced ${data.new_transactions} new transactions!`);
        await loadTransactions();
      } else {
        throw new Error(data.error || 'Sync failed');
      }

    } catch (error) {
      console.error('Error syncing:', error);
      alert('Failed to sync transactions: ' + error.message);
    } finally {
      setSyncing(false);
    }
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(Math.abs(amount || 0));
  }

  function getTransactionIcon(type) {
    switch (type) {
      case 'investor_deposit':
        return (
          <svg className="w-6 h-6 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
          </svg>
        );
      case 'vehicle_purchase':
        return (
          <svg className="w-6 h-6 text-red-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
            <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
          </svg>
        );
      case 'vehicle_sale':
        return (
          <svg className="w-6 h-6 text-green-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
          </svg>
        );
      case 'distribution':
        return (
          <svg className="w-6 h-6 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
          </svg>
        );
      case 'fee':
        return (
          <svg className="w-6 h-6 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
        );
      default:
        return (
          <svg className="w-6 h-6 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
            <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
          </svg>
        );
    }
  }

  const filteredTransactions = transactions.filter(tx => {
    if (filter === 'in') return parseFloat(tx.amount) > 0;
    if (filter === 'out') return parseFloat(tx.amount) < 0;
    return true;
  });

  const moneyIn = transactions.filter(tx => parseFloat(tx.amount) > 0).reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
  const moneyOut = transactions.filter(tx => parseFloat(tx.amount) < 0).reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount)), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Shared Bank Account</h1>
            <p className="text-blue-200">Live transaction feed from investment pool</p>
          </div>
          <button
            onClick={() => navigate('/investor/dashboard')}
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition"
          >
            ← Dashboard
          </button>
        </div>

        {/* Account Balance Card */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg text-blue-200 mb-2">{pool?.pool_name || 'Investment Pool'}</h2>
              <div className="text-5xl font-bold text-white mb-2">
                {formatCurrency(pool?.total_capital || balance || 0)}
              </div>
              <p className="text-blue-200 text-sm">Current Balance</p>
            </div>
            <button
              onClick={handleSyncNow}
              disabled={syncing || !pool?.plaid_access_token}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition flex items-center gap-2"
            >
              {syncing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Syncing...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Sync Now
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div className="bg-slate-800/50 rounded-lg p-4">
              <div className="text-blue-200 text-sm mb-1">Deployed</div>
              <div className="text-2xl font-bold text-amber-400">
                {formatCurrency(pool?.deployed_capital || 0)}
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4">
              <div className="text-blue-200 text-sm mb-1">Available</div>
              <div className="text-2xl font-bold text-green-400">
                {formatCurrency(pool?.available_capital || 0)}
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4">
              <div className="text-blue-200 text-sm mb-1">Reserved</div>
              <div className="text-2xl font-bold text-purple-400">
                {formatCurrency(pool?.reserved_capital || 0)}
              </div>
            </div>
          </div>
        </div>

        {/* Money Flow Summary */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div className="bg-green-500/10 backdrop-blur-lg rounded-2xl p-6 border border-green-500/30">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-green-200 text-sm mb-2">Money In (30d)</div>
                <div className="text-3xl font-bold text-green-400">+{formatCurrency(moneyIn)}</div>
              </div>
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            <div className="text-green-200 text-sm mt-2">
              Deposits & sales
            </div>
          </div>

          <div className="bg-red-500/10 backdrop-blur-lg rounded-2xl p-6 border border-red-500/30">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-red-200 text-sm mb-2">Money Out (30d)</div>
                <div className="text-3xl font-bold text-red-400">-{formatCurrency(moneyOut)}</div>
              </div>
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            <div className="text-red-200 text-sm mt-2">
              Purchases & distributions
            </div>
          </div>
        </div>

        {/* Transaction Feed */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 overflow-hidden">
          {/* Filters */}
          <div className="p-6 border-b border-white/20">
            <div className="flex gap-3">
              <button
                onClick={() => setFilter('all')}
                className={`px-6 py-2 rounded-lg font-semibold transition ${
                  filter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('in')}
                className={`px-6 py-2 rounded-lg font-semibold transition ${
                  filter === 'in'
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Money In
              </button>
              <button
                onClick={() => setFilter('out')}
                className={`px-6 py-2 rounded-lg font-semibold transition ${
                  filter === 'out'
                    ? 'bg-red-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Money Out
              </button>
            </div>
          </div>

          {/* Transactions */}
          <div className="divide-y divide-white/10">
            {filteredTransactions.map((tx, i) => {
              const isInflow = parseFloat(tx.amount) > 0;

              return (
                <div key={tx.id || i} className="p-4 hover:bg-white/5 transition">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        isInflow ? 'bg-green-500/20' : 'bg-red-500/20'
                      }`}>
                        {getTransactionIcon(tx.transaction_type)}
                      </div>
                      <div className="flex-1">
                        <div className="text-white font-medium">{tx.description}</div>
                        <div className="text-slate-400 text-sm">
                          {new Date(tx.transaction_date).toLocaleDateString()} at{' '}
                          {new Date(tx.transaction_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {tx.merchant_name && ` • ${tx.merchant_name}`}
                        </div>
                        {tx.plaid_category && (
                          <div className="text-xs text-blue-300 mt-1">{tx.plaid_category}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xl font-bold ${isInflow ? 'text-green-400' : 'text-red-400'}`}>
                        {isInflow ? '+' : '-'}{formatCurrency(tx.amount)}
                      </div>
                      <div className="text-xs text-slate-400 capitalize">
                        {tx.transaction_type?.replace(/_/g, ' ')}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredTransactions.length === 0 && (
            <div className="p-12 text-center text-slate-400">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <p>No transactions yet</p>
              <p className="text-sm mt-2">Connect bank account to see transaction history</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
