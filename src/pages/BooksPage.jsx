import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';
import { usePlaidLink } from 'react-plaid-link';

export default function BooksPage() {
  const { dealerId, inventory, bhphLoans, deals, customers } = useStore();
  const themeContext = useTheme();
  const theme = themeContext?.theme || { bg: '#09090b', bgCard: '#18181b', border: '#27272a', text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a', accent: '#f97316' };

  const [activeTab, setActiveTab] = useState('health');
  const [categories, setCategories] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [manualExpenses, setManualExpenses] = useState([]);
  const [assets, setAssets] = useState([]);
  const [liabilities, setLiabilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [showAddLiability, setShowAddLiability] = useState(false);
  const [showValuationDetails, setShowValuationDetails] = useState(false);

  // Plaid state
  const [linkToken, setLinkToken] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState(null);

  const [expenseForm, setExpenseForm] = useState({ description: '', amount: '', expense_date: new Date().toISOString().split('T')[0], vendor: '', category_id: null });
  const [assetForm, setAssetForm] = useState({ name: '', asset_type: 'equipment', purchase_price: '', current_value: '' });
  const [liabilityForm, setLiabilityForm] = useState({ name: '', liability_type: 'loan', current_balance: '', monthly_payment: '', lender: '' });

  useEffect(() => { if (dealerId) fetchAll(); }, [dealerId]);

  async function fetchAll() {
    setLoading(true);
    const [cats, banks, txns, expenses, assetData, liabData] = await Promise.all([
      supabase.from('expense_categories').select('*').or(`dealer_id.eq.${dealerId},dealer_id.is.null`).order('sort_order'),
      supabase.from('bank_accounts').select('*').eq('dealer_id', dealerId),
      supabase.from('bank_transactions').select('*').eq('dealer_id', dealerId).order('transaction_date', { ascending: false }),
      supabase.from('manual_expenses').select('*').eq('dealer_id', dealerId).order('expense_date', { ascending: false }),
      supabase.from('assets').select('*').eq('dealer_id', dealerId).eq('status', 'active'),
      supabase.from('liabilities').select('*').eq('dealer_id', dealerId).eq('status', 'active')
    ]);
    if (cats.data) setCategories(cats.data);
    if (banks.data) setBankAccounts(banks.data);
    if (txns.data) setTransactions(txns.data);
    if (expenses.data) setManualExpenses(expenses.data);
    if (assetData.data) setAssets(assetData.data);
    if (liabData.data) setLiabilities(liabData.data);
    setLoading(false);
  }

  // Create Plaid link token
  async function createLinkToken() {
    try {
      console.log('[PLAID] Creating link token for dealer:', dealerId);
      const { data, error } = await supabase.functions.invoke('plaid-link-token', {
        body: { user_id: dealerId }
      });

      if (error) {
        console.error('[PLAID] Error from function:', error);
        throw error;
      }

      if (data?.error) {
        console.error('[PLAID] Error from edge function:', data.error);
        throw new Error(data.error);
      }

      if (data?.link_token) {
        console.log('[PLAID] Link token created successfully');
        setLinkToken(data.link_token);
        return true;
      } else {
        throw new Error('No link token returned');
      }
    } catch (err) {
      console.error('[PLAID] Failed to create link token:', err);
      const errorMessage = err?.message || 'Failed to initialize Plaid connection';
      showToast(errorMessage, 'error');
      return false;
    }
  }

  // Handle successful Plaid connection
  const onPlaidSuccess = useCallback(async (public_token, metadata) => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('plaid-sync', {
        body: {
          action: 'exchange_token',
          public_token,
          dealer_id: dealerId,
          metadata
        }
      });

      if (error) throw error;

      showToast(`Connected ${data.accounts?.length || 0} account(s) successfully!`, 'success');
      await fetchAll(); // Refresh accounts
      setLinkToken(null); // Reset link token
    } catch (err) {
      console.error('Failed to connect account:', err);
      showToast('Failed to connect account', 'error');
    } finally {
      setConnecting(false);
    }
  }, [dealerId]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
  });

  // Handle connect button click
  async function handleConnectClick() {
    const success = await createLinkToken();
    if (success) {
      // Wait a bit for the Plaid Link hook to be ready with the new token
      setTimeout(() => {
        if (ready) {
          open();
        }
      }, 100);
    }
  }

  // Sync transactions for an account
  async function syncAccount(accountId = null) {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('plaid-sync', {
        body: {
          action: 'sync_transactions',
          dealer_id: dealerId,
          account_id: accountId
        }
      });

      if (error) throw error;
      showToast(data.message || 'Sync complete', 'success');
      await fetchAll(); // Refresh transactions
    } catch (err) {
      console.error('Sync failed:', err);
      showToast('Failed to sync transactions', 'error');
    } finally {
      setSyncing(false);
    }
  }

  // Disconnect account
  async function disconnectAccount(accountId) {
    if (!confirm('Are you sure you want to disconnect this account?')) return;

    try {
      const { error } = await supabase.functions.invoke('plaid-sync', {
        body: {
          action: 'disconnect',
          dealer_id: dealerId,
          account_id: accountId
        }
      });

      if (error) throw error;
      showToast('Account disconnected', 'success');
      await fetchAll();
    } catch (err) {
      console.error('Failed to disconnect:', err);
      showToast('Failed to disconnect account', 'error');
    }
  }

  function showToast(message, type = 'info') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  // CALCULATIONS
  const cashInBank = bankAccounts.reduce((sum, a) => sum + (parseFloat(a.current_balance) || 0), 0);
  const inventoryValue = (inventory || []).filter(v => v.status === 'In Stock' || v.status === 'For Sale').reduce((sum, v) => sum + (parseFloat(v.purchase_price) || 0), 0);
  const bhphOwed = (bhphLoans || []).filter(l => l.status === 'Active').reduce((sum, l) => sum + (parseFloat(l.current_balance) || 0), 0);
  const bhphMonthly = (bhphLoans || []).filter(l => l.status === 'Active').reduce((sum, l) => sum + (parseFloat(l.monthly_payment) || 0), 0);
  const otherAssets = assets.reduce((sum, a) => sum + (parseFloat(a.current_value) || 0), 0);
  const totalOwn = cashInBank + inventoryValue + bhphOwed + otherAssets;
  const totalOwe = liabilities.reduce((sum, l) => sum + (parseFloat(l.current_balance) || 0), 0);
  const netWorth = totalOwn - totalOwe;
  const healthScore = totalOwn > 0 ? Math.min(100, Math.max(0, Math.round((netWorth / totalOwn) * 100))) : 50;
  const inventoryCount = (inventory || []).filter(v => v.status === 'In Stock' || v.status === 'For Sale').length;
  const bhphCount = (bhphLoans || []).filter(l => l.status === 'Active').length;

  // AI BUSINESS VALUATION
  const now = new Date();
  const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  const recentDeals = (deals || []).filter(d => new Date(d.date_of_sale) >= yearAgo);
  const annualRevenue = recentDeals.reduce((sum, d) => sum + (parseFloat(d.price) || 0), 0);
  const annualProfit = recentDeals.reduce((sum, d) => {
    const v = (inventory || []).find(v => String(v.id) === String(d.vehicle_id));
    return sum + ((parseFloat(d.price) || 0) - (parseFloat(v?.purchase_price) || 0));
  }, 0);
  const bhphAnnualIncome = bhphMonthly * 12;
  const customerCount = (customers || []).length;

  // Valuation components
  const val = {
    inventory: inventoryValue,
    bhphPortfolio: bhphOwed * 1.3,
    cash: cashInBank,
    equipment: otherAssets,
    customers: customerCount * 100,
    goodwill: Math.min(10000 + (24 * 5000), 75000),
    liabilities: totalOwe
  };
  const enterpriseValue = val.inventory + val.bhphPortfolio + val.cash + val.equipment + val.customers + val.goodwill - val.liabilities;
  const sdeValuation = (annualProfit + 50000) * 2.5;
  const finalValuation = Math.max(enterpriseValue, sdeValuation, netWorth);
  const confidence = annualRevenue > 100000 ? 'High' : annualRevenue > 50000 ? 'Medium' : 'Low';

  const formatCurrency = (a) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(a || 0);
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-';
  const formatDateTime = (d) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-';
  const getHealthColor = (s) => s >= 70 ? '#22c55e' : s >= 40 ? '#eab308' : '#ef4444';

  async function bookTransaction(txn, categoryId) { await supabase.from('bank_transactions').update({ status: 'booked', category_id: categoryId }).eq('id', txn.id); fetchAll(); }
  async function ignoreTransaction(txn) { await supabase.from('bank_transactions').update({ status: 'ignored' }).eq('id', txn.id); fetchAll(); }
  async function addExpense() { if (!expenseForm.description || !expenseForm.amount) return; await supabase.from('manual_expenses').insert({ ...expenseForm, amount: parseFloat(expenseForm.amount), dealer_id: dealerId, status: 'pending' }); setShowAddExpense(false); setExpenseForm({ description: '', amount: '', expense_date: new Date().toISOString().split('T')[0], vendor: '', category_id: null }); fetchAll(); }
  async function addAsset() { if (!assetForm.name || !assetForm.current_value) return; await supabase.from('assets').insert({ ...assetForm, purchase_price: parseFloat(assetForm.purchase_price) || 0, current_value: parseFloat(assetForm.current_value), dealer_id: dealerId, status: 'active' }); setShowAddAsset(false); setAssetForm({ name: '', asset_type: 'equipment', purchase_price: '', current_value: '' }); fetchAll(); }
  async function addLiability() { if (!liabilityForm.name || !liabilityForm.current_balance) return; await supabase.from('liabilities').insert({ ...liabilityForm, current_balance: parseFloat(liabilityForm.current_balance), monthly_payment: parseFloat(liabilityForm.monthly_payment) || 0, dealer_id: dealerId, status: 'active' }); setShowAddLiability(false); setLiabilityForm({ name: '', liability_type: 'loan', current_balance: '', monthly_payment: '', lender: '' }); fetchAll(); }

  const inboxTxns = transactions.filter(t => t.status === 'inbox');
  const bookedTxns = transactions.filter(t => t.status === 'booked');
  const connectedAccounts = bankAccounts.filter(a => a.is_plaid_connected);
  const tabs = [
    { id: 'health', label: '💪 Business Health', color: '#22c55e' },
    { id: 'accounts', label: '🏦 Accounts', count: connectedAccounts.length, color: '#3b82f6' },
    { id: 'inbox', label: '📥 Inbox', count: inboxTxns.length, color: '#f97316' },
    { id: 'expenses', label: '💸 Expenses', count: manualExpenses.length, color: '#8b5cf6' },
    { id: 'booked', label: '📚 Booked', color: '#10b981' }
  ];

  return (
    <div style={{ padding: '24px', backgroundColor: theme.bg, minHeight: '100vh' }}>
      {/* Toast Notification */}
      {toast && (
        <div style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 100, backgroundColor: toast.type === 'error' ? '#ef4444' : toast.type === 'success' ? '#22c55e' : '#3b82f6', color: '#fff', padding: '16px 24px', borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.3)', fontWeight: '500' }}>
          {toast.message}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div><h1 style={{ fontSize: '28px', fontWeight: '700', color: theme.text, margin: 0 }}>Books</h1><p style={{ color: theme.textMuted, margin: '4px 0 0', fontSize: '14px' }}>Your money, simplified</p></div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button onClick={() => setShowAddExpense(true)} style={{ padding: '10px 20px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>+ Expense</button>
          <button onClick={() => setShowAddAsset(true)} style={{ padding: '10px 20px', backgroundColor: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>+ I Own</button>
          <button onClick={() => setShowAddLiability(true)} style={{ padding: '10px 20px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>+ I Owe</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '8px' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '12px 20px', backgroundColor: activeTab === tab.id ? tab.color : 'transparent', color: activeTab === tab.id ? '#fff' : theme.textSecondary, border: `1px solid ${activeTab === tab.id ? tab.color : theme.border}`, borderRadius: '8px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {tab.label}{tab.count !== undefined && tab.count > 0 && <span style={{ backgroundColor: activeTab === tab.id ? 'rgba(255,255,255,0.2)' : tab.color, color: '#fff', padding: '2px 8px', borderRadius: '10px', fontSize: '12px' }}>{tab.count}</span>}
          </button>
        ))}
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted }}>Loading...</div> : (
        <>
          {activeTab === 'health' && (
            <div>
              <div style={{ background: `linear-gradient(135deg, ${theme.bgCard} 0%, ${getHealthColor(healthScore)}20 100%)`, borderRadius: '20px', padding: '32px', marginBottom: '24px', border: `2px solid ${getHealthColor(healthScore)}50` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '24px' }}>
                  <div>
                    <div style={{ color: theme.textMuted, fontSize: '14px', marginBottom: '8px' }}>YOUR EQUITY (What You Own - What You Owe)</div>
                    <div style={{ fontSize: '48px', fontWeight: '800', color: netWorth >= 0 ? '#22c55e' : '#ef4444' }}>{formatCurrency(netWorth)}</div>
                    <div style={{ color: theme.textSecondary, marginTop: '8px' }}>You have {formatCurrency(totalOwn)} and owe {formatCurrency(totalOwe)}.</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ width: '120px', height: '120px', borderRadius: '50%', background: `conic-gradient(${getHealthColor(healthScore)} ${healthScore * 3.6}deg, ${theme.border} 0deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: '100px', height: '100px', borderRadius: '50%', backgroundColor: theme.bgCard, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ fontSize: '32px', fontWeight: '800', color: getHealthColor(healthScore) }}>{healthScore}</div>
                        <div style={{ fontSize: '11px', color: theme.textMuted }}>HEALTH</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', borderRadius: '20px', padding: '32px', marginBottom: '24px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: '-20px', right: '-20px', fontSize: '120px', opacity: 0.1 }}>🤖</div>
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '24px' }}>🤖</span>
                    <div><div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '14px' }}>AI BUSINESS VALUATION</div><div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>What your dealership is worth if sold today</div></div>
                  </div>
                  <div style={{ fontSize: '56px', fontWeight: '800', color: '#fff', marginBottom: '16px' }}>{formatCurrency(finalValuation)}</div>
                  <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '16px' }}>
                    <div><div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>Confidence</div><div style={{ color: '#fff', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: confidence === 'High' ? '#22c55e' : confidence === 'Medium' ? '#eab308' : '#ef4444' }}></span>{confidence}</div></div>
                    <div><div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>Annual Revenue</div><div style={{ color: '#fff', fontWeight: '600' }}>{formatCurrency(annualRevenue)}</div></div>
                    <div><div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>Annual Profit</div><div style={{ color: '#fff', fontWeight: '600' }}>{formatCurrency(annualProfit)}</div></div>
                    <div><div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>BHPH Income/Year</div><div style={{ color: '#fff', fontWeight: '600' }}>{formatCurrency(bhphAnnualIncome)}</div></div>
                  </div>
                  <button onClick={() => setShowValuationDetails(!showValuationDetails)} style={{ padding: '8px 16px', backgroundColor: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: '500', cursor: 'pointer', fontSize: '13px' }}>{showValuationDetails ? 'Hide Details ▲' : 'How is this calculated? ▼'}</button>
                  {showValuationDetails && (
                    <div style={{ marginTop: '16px', padding: '16px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>
                      <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Valuation Breakdown</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                        <ValRow label="Inventory (at cost)" value={val.inventory} f={formatCurrency} />
                        <ValRow label="BHPH Portfolio (1.3x)" value={val.bhphPortfolio} f={formatCurrency} note="Recurring income premium" />
                        <ValRow label="Cash & Bank" value={val.cash} f={formatCurrency} />
                        <ValRow label="Equipment & Assets" value={val.equipment} f={formatCurrency} />
                        <ValRow label={`Customer Base (${customerCount})`} value={val.customers} f={formatCurrency} note="$100 per customer" />
                        <ValRow label="Goodwill & Brand" value={val.goodwill} f={formatCurrency} note="24 years reputation" />
                        <ValRow label="Less: Debts" value={-val.liabilities} f={formatCurrency} neg />
                      </div>
                      <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.2)', display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: '600' }}>Enterprise Value</span><span style={{ color: '#fff', fontWeight: '700' }}>{formatCurrency(enterpriseValue)}</span></div>
                      <div style={{ marginTop: '8px', color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>Alternative: {formatCurrency(sdeValuation)} (2.5x Seller's Discretionary Earnings)</div>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '24px' }}>
                <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', padding: '24px', border: `1px solid ${theme.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}><div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(34, 197, 94, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>💰</div><div><div style={{ color: theme.textMuted, fontSize: '13px' }}>WHAT YOU OWN</div><div style={{ color: '#22c55e', fontSize: '28px', fontWeight: '700' }}>{formatCurrency(totalOwn)}</div></div></div>
                  {[['💵', 'Cash in Bank', cashInBank], ['🚗', `Inventory (${inventoryCount})`, inventoryValue], ['📋', `BHPH Owed (${bhphCount})`, bhphOwed], ['🔧', 'Equipment', otherAssets]].map(([icon, label, value], i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: theme.bg, borderRadius: '8px', marginBottom: '8px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ fontSize: '20px' }}>{icon}</span><span style={{ color: theme.text }}>{label}</span></div><span style={{ color: '#22c55e', fontWeight: '600' }}>{formatCurrency(value)}</span></div>
                  ))}
                </div>
                <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', padding: '24px', border: `1px solid ${theme.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}><div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>📑</div><div><div style={{ color: theme.textMuted, fontSize: '13px' }}>WHAT YOU OWE</div><div style={{ color: '#ef4444', fontSize: '28px', fontWeight: '700' }}>{formatCurrency(totalOwe)}</div></div></div>
                  {liabilities.length === 0 ? <div style={{ textAlign: 'center', padding: '40px', color: theme.textMuted }}><div style={{ fontSize: '32px', marginBottom: '12px' }}>🎉</div><div>Debt free!</div></div> : liabilities.map(l => (
                    <div key={l.id} style={{ padding: '12px', backgroundColor: theme.bg, borderRadius: '8px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}><div><div style={{ color: theme.text, fontWeight: '500' }}>{l.name}</div><div style={{ color: theme.textMuted, fontSize: '12px' }}>{l.lender}</div></div><div style={{ textAlign: 'right' }}><div style={{ color: '#ef4444', fontWeight: '600' }}>{formatCurrency(l.current_balance)}</div>{l.monthly_payment > 0 && <div style={{ color: theme.textMuted, fontSize: '12px' }}>{formatCurrency(l.monthly_payment)}/mo</div>}</div></div>
                  ))}
                </div>
              </div>

              <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '12px', padding: '20px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                <div style={{ display: 'flex', gap: '12px' }}><span style={{ fontSize: '24px' }}>💡</span><div><div style={{ color: '#3b82f6', fontWeight: '600', marginBottom: '4px' }}>What This Means</div><div style={{ color: theme.textSecondary }}><strong style={{ color: theme.text }}>Equity ({formatCurrency(netWorth)})</strong> = What you'd have if you paid all bills.<br /><strong style={{ color: theme.text }}>Business Value ({formatCurrency(finalValuation)})</strong> = What a buyer would pay. Higher because it includes customer relationships, reputation, and BHPH earning potential.</div></div></div>
              </div>
            </div>
          )}

          {activeTab === 'accounts' && (
            <div>
              <div style={{ marginBottom: '16px', padding: '16px', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div><div style={{ color: '#3b82f6', fontWeight: '600' }}>🏦 Connected Accounts</div><div style={{ color: theme.textSecondary, fontSize: '14px' }}>Automatically sync bank and credit card transactions</div></div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={handleConnectClick} disabled={connecting} style={{ padding: '10px 20px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: connecting ? 'not-allowed' : 'pointer', opacity: connecting ? 0.6 : 1 }}>
                    {connecting ? 'Connecting...' : '+ Connect Bank/Card'}
                  </button>
                  {connectedAccounts.length > 0 && (
                    <button onClick={() => syncAccount()} disabled={syncing} style={{ padding: '10px 20px', backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: '8px', fontWeight: '600', cursor: syncing ? 'not-allowed' : 'pointer', opacity: syncing ? 0.6 : 1 }}>
                      {syncing ? 'Syncing...' : '🔄 Sync All'}
                    </button>
                  )}
                </div>
              </div>

              {connectedAccounts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '80px 20px', backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: '64px', marginBottom: '16px' }}>🏦</div>
                  <div style={{ color: theme.text, fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>No accounts connected</div>
                  <div style={{ color: theme.textMuted, marginBottom: '24px' }}>Connect your bank accounts and credit cards to automatically track transactions</div>
                  <button onClick={handleConnectClick} style={{ padding: '12px 24px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '15px' }}>
                    Connect Your First Account
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '16px' }}>
                  {connectedAccounts.map(account => (
                    <div key={account.id} style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, padding: '20px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
                        <div style={{ width: '56px', height: '56px', borderRadius: '12px', backgroundColor: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', flexShrink: 0 }}>
                          {account.account_type === 'credit_card' ? '💳' : '🏦'}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: theme.text, fontWeight: '600', marginBottom: '4px' }}>{account.institution_name || 'Bank Account'}</div>
                          <div style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '2px' }}>
                            {account.account_name} {account.account_mask && `••${account.account_mask}`}
                          </div>
                          <div style={{ color: theme.textSecondary, fontSize: '12px', display: 'inline-block', padding: '2px 8px', backgroundColor: theme.bg, borderRadius: '4px' }}>
                            {account.account_type?.replace('_', ' ').toUpperCase()}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', padding: '12px', backgroundColor: theme.bg, borderRadius: '8px' }}>
                        <div style={{ color: theme.textMuted, fontSize: '13px' }}>Balance</div>
                        <div style={{ color: account.account_type === 'credit_card' ? (account.current_balance > 0 ? '#ef4444' : theme.text) : '#22c55e', fontSize: '20px', fontWeight: '700' }}>
                          {formatCurrency(account.current_balance)}
                        </div>
                      </div>
                      <div style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '12px' }}>
                        Last synced: {formatDateTime(account.last_synced_at)}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => syncAccount(account.id)} disabled={syncing} style={{ flex: 1, padding: '8px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '500', cursor: syncing ? 'not-allowed' : 'pointer', fontSize: '13px', opacity: syncing ? 0.6 : 1 }}>
                          Sync Now
                        </button>
                        <button onClick={() => disconnectAccount(account.id)} style={{ padding: '8px 16px', backgroundColor: 'transparent', color: '#ef4444', border: `1px solid ${theme.border}`, borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                          Disconnect
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'inbox' && (
            <div>
              <div style={{ marginBottom: '16px', padding: '16px', backgroundColor: 'rgba(249, 115, 22, 0.1)', borderRadius: '12px', border: '1px solid rgba(249, 115, 22, 0.3)' }}><div style={{ color: theme.accent, fontWeight: '600' }}>📥 Transactions to Review</div><div style={{ color: theme.textSecondary, fontSize: '14px' }}>Pick a category, then "Book It"</div></div>
              {inboxTxns.length === 0 ? <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted }}><div style={{ fontSize: '48px', marginBottom: '16px' }}>✨</div><div>All caught up!</div></div> : inboxTxns.map(txn => <TxnCard key={txn.id} txn={txn} categories={categories} theme={theme} f={formatCurrency} fd={formatDate} onBook={bookTransaction} onIgnore={ignoreTransaction} />)}
            </div>
          )}

          {activeTab === 'expenses' && (
            <div>
              <div style={{ marginBottom: '16px', padding: '16px', backgroundColor: 'rgba(139, 92, 246, 0.1)', borderRadius: '12px', border: '1px solid rgba(139, 92, 246, 0.3)' }}><div style={{ color: '#8b5cf6', fontWeight: '600' }}>💸 Your Expenses</div></div>
              {manualExpenses.length === 0 ? <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted }}>No expenses yet</div> : manualExpenses.map(exp => {
                const cat = categories.find(c => c.id === exp.category_id);
                return (<div key={exp.id} style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}><div style={{ width: '48px', height: '48px', borderRadius: '8px', backgroundColor: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>{cat?.icon || '📄'}</div><div><div style={{ color: theme.text, fontWeight: '600' }}>{exp.description}</div><div style={{ color: theme.textMuted, fontSize: '13px' }}>{exp.vendor} • {formatDate(exp.expense_date)}</div></div></div><div style={{ color: '#ef4444', fontWeight: '700', fontSize: '18px' }}>{formatCurrency(exp.amount)}</div></div>);
              })}
            </div>
          )}

          {activeTab === 'booked' && (
            <div>
              <div style={{ marginBottom: '16px', padding: '16px', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.3)' }}><div style={{ color: '#10b981', fontWeight: '600' }}>📚 Booked Transactions</div></div>
              {bookedTxns.length === 0 ? <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted }}>Nothing booked yet</div> : (
                <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ backgroundColor: theme.bg }}><th style={{ padding: '12px 16px', textAlign: 'left', color: theme.textMuted, fontSize: '12px' }}>DATE</th><th style={{ padding: '12px 16px', textAlign: 'left', color: theme.textMuted, fontSize: '12px' }}>WHAT</th><th style={{ padding: '12px 16px', textAlign: 'left', color: theme.textMuted, fontSize: '12px' }}>CATEGORY</th><th style={{ padding: '12px 16px', textAlign: 'right', color: theme.textMuted, fontSize: '12px' }}>AMOUNT</th></tr></thead>
                    <tbody>{bookedTxns.map(txn => { const cat = categories.find(c => c.id === txn.category_id); return (<tr key={txn.id} style={{ borderTop: `1px solid ${theme.border}` }}><td style={{ padding: '12px 16px', color: theme.textSecondary }}>{formatDate(txn.transaction_date)}</td><td style={{ padding: '12px 16px', color: theme.text }}>{txn.merchant_name}</td><td style={{ padding: '12px 16px' }}>{cat && <span style={{ padding: '4px 10px', backgroundColor: `${cat.color}20`, borderRadius: '6px', fontSize: '13px', color: cat.color }}>{cat.icon} {cat.name}</span>}</td><td style={{ padding: '12px 16px', textAlign: 'right', color: txn.is_income ? '#22c55e' : '#ef4444', fontWeight: '600' }}>{formatCurrency(Math.abs(txn.amount))}</td></tr>); })}</tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {showAddExpense && <Modal title="Add Expense" onClose={() => setShowAddExpense(false)} theme={theme}><Field label="What?" value={expenseForm.description} onChange={v => setExpenseForm({...expenseForm, description: v})} theme={theme} /><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}><Field label="Amount" type="number" value={expenseForm.amount} onChange={v => setExpenseForm({...expenseForm, amount: v})} theme={theme} /><Field label="Date" type="date" value={expenseForm.expense_date} onChange={v => setExpenseForm({...expenseForm, expense_date: v})} theme={theme} /></div><Field label="Where?" value={expenseForm.vendor} onChange={v => setExpenseForm({...expenseForm, vendor: v})} theme={theme} /><CatPicker categories={categories.filter(c => c.type === 'expense')} selected={expenseForm.category_id} onSelect={id => setExpenseForm({...expenseForm, category_id: id})} theme={theme} /><div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}><button onClick={() => setShowAddExpense(false)} style={{ flex: 1, padding: '12px', backgroundColor: theme.bg, color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer' }}>Cancel</button><button onClick={addExpense} style={{ flex: 1, padding: '12px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Add</button></div></Modal>}
      {showAddAsset && <Modal title="Add Something You Own" onClose={() => setShowAddAsset(false)} theme={theme}><Field label="What?" value={assetForm.name} onChange={v => setAssetForm({...assetForm, name: v})} theme={theme} /><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}><Field label="Paid" type="number" value={assetForm.purchase_price} onChange={v => setAssetForm({...assetForm, purchase_price: v})} theme={theme} /><Field label="Worth now" type="number" value={assetForm.current_value} onChange={v => setAssetForm({...assetForm, current_value: v})} theme={theme} /></div><div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}><button onClick={() => setShowAddAsset(false)} style={{ flex: 1, padding: '12px', backgroundColor: theme.bg, color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer' }}>Cancel</button><button onClick={addAsset} style={{ flex: 1, padding: '12px', backgroundColor: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Add</button></div></Modal>}
      {showAddLiability && <Modal title="Add Something You Owe" onClose={() => setShowAddLiability(false)} theme={theme}><Field label="What?" value={liabilityForm.name} onChange={v => setLiabilityForm({...liabilityForm, name: v})} theme={theme} /><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}><Field label="Still owe" type="number" value={liabilityForm.current_balance} onChange={v => setLiabilityForm({...liabilityForm, current_balance: v})} theme={theme} /><Field label="Monthly" type="number" value={liabilityForm.monthly_payment} onChange={v => setLiabilityForm({...liabilityForm, monthly_payment: v})} theme={theme} /></div><Field label="Lender" value={liabilityForm.lender} onChange={v => setLiabilityForm({...liabilityForm, lender: v})} theme={theme} /><div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}><button onClick={() => setShowAddLiability(false)} style={{ flex: 1, padding: '12px', backgroundColor: theme.bg, color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer' }}>Cancel</button><button onClick={addLiability} style={{ flex: 1, padding: '12px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Add</button></div></Modal>}
    </div>
  );
}

function ValRow({ label, value, f, note, neg }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '13px' }}>{label}</div>{note && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>{note}</div>}</div><div style={{ color: neg ? '#ef4444' : '#22c55e', fontWeight: '600' }}>{f(value)}</div></div>;
}
function Modal({ title, onClose, children, theme }) { return <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}><div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, maxWidth: '450px', width: '100%', maxHeight: '90vh', overflow: 'auto' }}><div style={{ padding: '20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '700', margin: 0 }}>{title}</h2><button onClick={onClose} style={{ background: 'none', border: 'none', color: theme.textMuted, fontSize: '24px', cursor: 'pointer' }}>×</button></div><div style={{ padding: '20px' }}>{children}</div></div></div>; }
function Field({ label, value, onChange, type = 'text', theme }) { return <div style={{ marginBottom: '16px' }}><label style={{ display: 'block', color: theme.textSecondary, fontSize: '13px', marginBottom: '6px' }}>{label}</label><input type={type} value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%', padding: '12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '15px' }} /></div>; }
function CatPicker({ categories, selected, onSelect, theme }) { return <div style={{ marginBottom: '16px' }}><label style={{ display: 'block', color: theme.textSecondary, fontSize: '13px', marginBottom: '6px' }}>Category</label><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', maxHeight: '180px', overflow: 'auto' }}>{categories.map(cat => <button key={cat.id} onClick={() => onSelect(cat.id)} style={{ padding: '8px', backgroundColor: selected === cat.id ? `${cat.color}30` : theme.bg, border: `1px solid ${selected === cat.id ? cat.color : theme.border}`, borderRadius: '8px', cursor: 'pointer', textAlign: 'center' }}><div style={{ fontSize: '18px' }}>{cat.icon}</div><div style={{ color: theme.textSecondary, fontSize: '10px' }}>{cat.name}</div></button>)}</div></div>; }
function TxnCard({ txn, categories, theme, f, fd, onBook, onIgnore }) {
  const [sel, setSel] = useState(null);
  const [show, setShow] = useState(false);
  const cat = categories.find(c => c.id === sel);
  return (
    <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}><div><div style={{ color: theme.text, fontWeight: '600' }}>{txn.merchant_name || 'Unknown'}</div><div style={{ color: theme.textMuted, fontSize: '13px' }}>{fd(txn.transaction_date)}</div></div><div style={{ color: txn.amount < 0 ? '#ef4444' : '#22c55e', fontWeight: '700', fontSize: '20px' }}>{f(Math.abs(txn.amount))}</div></div>
      <button onClick={() => setShow(!show)} style={{ width: '100%', padding: '12px', marginBottom: '12px', backgroundColor: cat ? `${cat.color}20` : theme.bg, border: `1px solid ${cat ? cat.color : theme.border}`, borderRadius: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}><span style={{ color: cat ? cat.color : theme.textMuted }}>{cat ? `${cat.icon} ${cat.name}` : 'Pick category...'}</span><span style={{ color: theme.textMuted }}>{show ? '▲' : '▼'}</span></button>
      {show && <div style={{ marginBottom: '12px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', padding: '8px', backgroundColor: theme.bg, borderRadius: '8px' }}>{categories.filter(c => c.type === (txn.amount < 0 ? 'expense' : 'income')).map(c => <button key={c.id} onClick={() => { setSel(c.id); setShow(false); }} style={{ padding: '8px', backgroundColor: sel === c.id ? `${c.color}30` : 'transparent', border: `1px solid ${sel === c.id ? c.color : theme.border}`, borderRadius: '8px', cursor: 'pointer', textAlign: 'center' }}><div style={{ fontSize: '18px' }}>{c.icon}</div><div style={{ color: theme.textSecondary, fontSize: '9px' }}>{c.name}</div></button>)}</div>}
      <div style={{ display: 'flex', gap: '12px' }}><button onClick={() => sel && onBook(txn, sel)} disabled={!sel} style={{ flex: 1, padding: '12px', backgroundColor: sel ? '#22c55e' : theme.border, color: sel ? '#fff' : theme.textMuted, border: 'none', borderRadius: '8px', fontWeight: '600', cursor: sel ? 'pointer' : 'not-allowed' }}>✓ Book It</button><button onClick={() => onIgnore(txn)} style={{ padding: '12px 20px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer' }}>Skip</button></div>
    </div>
  );
}
