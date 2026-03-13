import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import InvestorLayout from '../components/InvestorLayout';

const cardStyle = { backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', marginBottom: 24, overflow: 'hidden' };

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

      const total = (data || []).reduce((sum, tx) => {
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
          <svg style={{ width: 24, height: 24, color: '#3b82f6' }} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
          </svg>
        );
      case 'vehicle_purchase':
        return (
          <svg style={{ width: 24, height: 24, color: '#ef4444' }} fill="currentColor" viewBox="0 0 20 20">
            <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
            <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
          </svg>
        );
      case 'vehicle_sale':
        return (
          <svg style={{ width: 24, height: 24, color: '#059669' }} fill="currentColor" viewBox="0 0 20 20">
            <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
          </svg>
        );
      case 'distribution':
        return (
          <svg style={{ width: 24, height: 24, color: '#7c3aed' }} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
          </svg>
        );
      case 'fee':
        return (
          <svg style={{ width: 24, height: 24, color: '#d97706' }} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
        );
      default:
        return (
          <svg style={{ width: 24, height: 24, color: '#6b7280' }} fill="currentColor" viewBox="0 0 20 20">
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
      <InvestorLayout title="Shared Bank Account">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 0' }}>
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500"></div>
        </div>
      </InvestorLayout>
    );
  }

  return (
    <InvestorLayout title="Shared Bank Account" subtitle="Live transaction feed from investment pool">

      {/* Account Balance Card */}
      <div style={{ ...cardStyle, padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 16, color: '#6b7280', marginBottom: 8, margin: 0 }}>{pool?.pool_name || 'Investment Pool'}</h2>
            <div style={{ fontSize: 40, fontWeight: 700, color: '#111827', margin: '8px 0' }}>
              {formatCurrency(pool?.total_capital || balance || 0)}
            </div>
            <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>Current Balance</p>
          </div>
          <button
            onClick={handleSyncNow}
            disabled={syncing || !pool?.plaid_access_token}
            style={{
              padding: '12px 24px', backgroundColor: syncing || !pool?.plaid_access_token ? '#e5e7eb' : '#111827',
              color: syncing || !pool?.plaid_access_token ? '#9ca3af' : '#fff',
              borderRadius: 8, fontWeight: 600, border: 'none', cursor: syncing || !pool?.plaid_access_token ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 14,
            }}
          >
            {syncing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
                Syncing...
              </>
            ) : (
              <>
                <svg style={{ width: 20, height: 20 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Sync Now
              </>
            )}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          <div style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 16 }}>
            <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 4 }}>Deployed</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#d97706' }}>
              {formatCurrency(pool?.deployed_capital || 0)}
            </div>
          </div>
          <div style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 16 }}>
            <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 4 }}>Available</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#059669' }}>
              {formatCurrency(pool?.available_capital || 0)}
            </div>
          </div>
          <div style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 16 }}>
            <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 4 }}>Reserved</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#7c3aed' }}>
              {formatCurrency(pool?.reserved_capital || 0)}
            </div>
          </div>
        </div>
      </div>

      {/* Money Flow Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        <div style={{ ...cardStyle, marginBottom: 0, padding: 24, borderLeft: '4px solid #059669' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 8 }}>Money In (30d)</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#059669' }}>+{formatCurrency(moneyIn)}</div>
            </div>
            <div style={{ width: 56, height: 56, backgroundColor: '#ecfdf5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg style={{ width: 28, height: 28, color: '#059669' }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          <div style={{ color: '#6b7280', fontSize: 14, marginTop: 8 }}>Deposits & sales</div>
        </div>

        <div style={{ ...cardStyle, marginBottom: 0, padding: 24, borderLeft: '4px solid #ef4444' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 8 }}>Money Out (30d)</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#ef4444' }}>-{formatCurrency(moneyOut)}</div>
            </div>
            <div style={{ width: 56, height: 56, backgroundColor: '#fef2f2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg style={{ width: 28, height: 28, color: '#ef4444', transform: 'rotate(180deg)' }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          <div style={{ color: '#6b7280', fontSize: 14, marginTop: 8 }}>Purchases & distributions</div>
        </div>
      </div>

      {/* Transaction Feed */}
      <div style={cardStyle}>
        {/* Filters */}
        <div style={{ padding: 24, borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              { key: 'all', label: 'All', activeColor: '#111827' },
              { key: 'in', label: 'Money In', activeColor: '#059669' },
              { key: 'out', label: 'Money Out', activeColor: '#ef4444' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  padding: '8px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14, border: 'none', cursor: 'pointer',
                  backgroundColor: filter === f.key ? f.activeColor : '#f3f4f6',
                  color: filter === f.key ? '#fff' : '#4b5563',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Transactions */}
        <div>
          {filteredTransactions.map((tx, i) => {
            const isInflow = parseFloat(tx.amount) > 0;

            return (
              <div key={tx.id || i} style={{ padding: 16, borderBottom: '1px solid #f3f4f6' }}
                onMouseOver={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backgroundColor: isInflow ? '#ecfdf5' : '#fef2f2',
                    }}>
                      {getTransactionIcon(tx.transaction_type)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#111827', fontWeight: 500 }}>{tx.description}</div>
                      <div style={{ color: '#6b7280', fontSize: 14 }}>
                        {new Date(tx.transaction_date).toLocaleDateString()} at{' '}
                        {new Date(tx.transaction_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {tx.merchant_name && ` \u2022 ${tx.merchant_name}`}
                      </div>
                      {tx.plaid_category && (
                        <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 4 }}>{tx.plaid_category}</div>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: isInflow ? '#059669' : '#ef4444' }}>
                      {isInflow ? '+' : '-'}{formatCurrency(tx.amount)}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'capitalize' }}>
                      {tx.transaction_type?.replace(/_/g, ' ')}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredTransactions.length === 0 && (
          <div style={{ padding: 48, textAlign: 'center', color: '#6b7280' }}>
            <svg style={{ width: 64, height: 64, margin: '0 auto 16px', opacity: 0.5 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p style={{ fontSize: 16 }}>No transactions yet</p>
            <p style={{ fontSize: 14, marginTop: 8 }}>Connect bank account to see transaction history</p>
          </div>
        )}
      </div>

    </InvestorLayout>
  );
}
