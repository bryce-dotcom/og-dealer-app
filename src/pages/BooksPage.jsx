import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';
import { usePlaidLink } from 'react-plaid-link';
import { CreditService } from '../lib/creditService';

export default function BooksPage() {
  const { dealerId, inventory, bhphLoans, deals, customers, currentEmployee } = useStore();
  const themeContext = useTheme();
  const theme = themeContext?.theme || { bg: '#09090b', bgCard: '#18181b', border: '#27272a', text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a', accent: '#f97316' };

  // Role-based access control for financial data
  const userRoles = currentEmployee?.roles || [];
  const hasNoEmployee = !currentEmployee;
  const canViewFinancials = hasNoEmployee || userRoles.some(r =>
    ['Owner', 'CEO', 'Admin', 'President', 'VP Operations', 'Finance'].includes(r)
  );

  const [activeTab, setActiveTab] = useState('health');
  const [categories, setCategories] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [manualExpenses, setManualExpenses] = useState([]);
  const [inventoryExpenses, setInventoryExpenses] = useState([]);
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

  // Date filter state
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Custom sync state
  const [showCustomSync, setShowCustomSync] = useState(false);
  const [syncStartDate, setSyncStartDate] = useState('');
  const [syncEndDate, setSyncEndDate] = useState('');

  const [expenseForm, setExpenseForm] = useState({ description: '', amount: '', expense_date: new Date().toISOString().split('T')[0], vendor: '', category_id: null });
  const [assetForm, setAssetForm] = useState({ name: '', asset_type: 'equipment', purchase_price: '', current_value: '' });
  const [liabilityForm, setLiabilityForm] = useState({ name: '', liability_type: 'loan', current_balance: '', monthly_payment: '', lender: '' });

  // AI categorization state
  const [aiSuggestions, setAiSuggestions] = useState({});
  const [loadingAI, setLoadingAI] = useState(false);

  // Access control - check if user has permission to view Books page
  const [hasAccess, setHasAccess] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  // Check user access on mount
  useEffect(() => {
    async function checkAccess() {
      const { data: { session } } = await supabase.auth.getSession();

      // If user is authenticated as dealer owner, grant access
      if (session?.user) {
        // Check if this user owns the current dealership
        const { data: dealerData } = await supabase
          .from('dealer_settings')
          .select('owner_user_id')
          .eq('id', dealerId)
          .single();

        // Dealer owner has full access
        if (dealerData?.owner_user_id === session.user.id) {
          setHasAccess(true);
        } else {
          // Future: Check if employee has admin access_level
          // For now, deny access if not dealer owner
          setHasAccess(false);
        }
      }
      setCheckingAccess(false);
    }

    if (dealerId) checkAccess();
  }, [dealerId]);

  useEffect(() => { if (dealerId && hasAccess) fetchAll(); }, [dealerId, hasAccess]);

  async function fetchAll() {
    setLoading(true);
    const [cats, banks, txns, expenses, invExpenses, assetData, liabData] = await Promise.all([
      supabase.from('expense_categories').select('*').or(`dealer_id.eq.${dealerId},dealer_id.is.null`).order('sort_order'),
      supabase.from('bank_accounts').select('*').eq('dealer_id', dealerId).eq('is_plaid_connected', true),
      supabase.from('bank_transactions').select('*, bank_accounts(account_name, account_mask, institution_name, account_type)').eq('dealer_id', dealerId).order('transaction_date', { ascending: false }),
      supabase.from('manual_expenses').select('*').eq('dealer_id', dealerId).order('expense_date', { ascending: false }),
      supabase.from('inventory_expenses').select('*').eq('dealer_id', dealerId),
      supabase.from('assets').select('*').eq('dealer_id', dealerId).eq('status', 'active'),
      supabase.from('liabilities').select('*').eq('dealer_id', dealerId).eq('status', 'active')
    ]);
    if (cats.data) setCategories(cats.data);
    if (banks.data) setBankAccounts(banks.data);
    if (txns.data) {
      setTransactions(txns.data);
      // Get AI suggestions for inbox transactions
      if (cats.data && expenses.data) {
        const inboxTxns = txns.data.filter(t => t.status === 'inbox');
        if (inboxTxns.length > 0) {
          getAISuggestions(inboxTxns.slice(0, 10), cats.data, expenses.data); // Limit to first 10 for performance
        }
      }
    }
    if (expenses.data) setManualExpenses(expenses.data);
    if (invExpenses.data) setInventoryExpenses(invExpenses.data);
    if (assetData.data) setAssets(assetData.data);
    if (liabData.data) setLiabilities(liabData.data);
    setLoading(false);
  }

  // Get AI categorization and matching suggestions
  async function getAISuggestions(inboxTransactions, categories, manualExpenses) {
    setLoadingAI(true);
    const suggestions = {};

    // Process transactions in parallel (limit to avoid rate limits)
    const promises = inboxTransactions.map(async (txn) => {
      try {
        const { data, error } = await supabase.functions.invoke('categorize-transaction', {
          body: {
            transaction: txn,
            categories: categories.filter(c => c.type === (txn.is_income ? 'income' : 'expense')),
            manual_expenses: manualExpenses.filter(e => {
              // Only check expenses within 7 days of transaction
              const txnDate = new Date(txn.transaction_date);
              const expDate = new Date(e.expense_date);
              const daysDiff = Math.abs((txnDate - expDate) / (1000 * 60 * 60 * 24));
              return daysDiff <= 7;
            })
          }
        });

        if (data && data.success) {
          suggestions[txn.id] = {
            category: data.suggested_category,
            confidence: data.confidence,
            matches: data.matches || []
          };
        }
      } catch (err) {
        console.error(`AI suggestion failed for txn ${txn.id}:`, err);
      }
    });

    await Promise.all(promises);
    setAiSuggestions(suggestions);
    setLoadingAI(false);
  }

  // Create Plaid link token
  async function createLinkToken() {
    try {
      console.log('[PLAID] Creating link token for dealer:', dealerId);
      const { data, error } = await supabase.functions.invoke('plaid-link-token', {
        body: { user_id: String(dealerId) }
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

  const config = {
    token: linkToken,
    onSuccess: onPlaidSuccess,
  };

  console.log('[PLAID] usePlaidLink config:', { token: linkToken, hasToken: !!linkToken });

  const { open, ready } = usePlaidLink(config);

  console.log('[PLAID] usePlaidLink result:', { ready, hasOpen: !!open, openType: typeof open });

  // Track if we should auto-open when ready
  const shouldOpenRef = useRef(false);

  // Auto-open Plaid Link when token is ready
  useEffect(() => {
    if (ready && linkToken && shouldOpenRef.current) {
      console.log('[PLAID] Link is ready, opening modal...');
      shouldOpenRef.current = false;
      open();
    }
  }, [ready, linkToken, open]);

  // Handle connect button click
  async function handleConnectClick() {
    console.log('[PLAID] Button clicked, creating token...');
    shouldOpenRef.current = true;
    const success = await createLinkToken();
    console.log('[PLAID] Token creation result:', success);
  }

  // Sync transactions for an account
  async function syncAccount(accountId = null, startDate = null, endDate = null) {
    // Check credits BEFORE operation
    const creditCheck = await CreditService.checkCredits(dealerId, 'PLAID_SYNC');

    if (!creditCheck.success) {
      if (creditCheck.rate_limited) {
        showToast(`Rate limit reached. Try again at ${new Date(creditCheck.next_allowed_at).toLocaleTimeString()}`, 'error');
        return;
      }
      showToast(creditCheck.message || 'Unable to sync bank account', 'error');
      return;
    }

    if (creditCheck.warning) {
      console.warn(creditCheck.warning);
    }

    setSyncing(true);
    try {
      const body = {
        action: 'sync_transactions',
        dealer_id: dealerId,
        account_id: accountId
      };

      if (startDate) body.start_date = startDate;
      if (endDate) body.end_date = endDate;

      const { data, error } = await supabase.functions.invoke('plaid-sync', { body });

      if (error) throw error;

      // Consume credits AFTER successful sync
      await CreditService.consumeCredits(
        dealerId,
        'PLAID_SYNC',
        accountId?.toString() || null,
        {
          account_id: accountId,
          start_date: startDate,
          end_date: endDate,
          transactions_synced: data.transactions_count || 0
        }
      );

      showToast(data.message || 'Sync complete', 'success');
      await fetchAll(); // Refresh transactions
      setShowCustomSync(false);
      setSyncStartDate('');
      setSyncEndDate('');
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

  async function toggleAccountType(accountId, isLiability) {
    try {
      const { error } = await supabase
        .from('bank_accounts')
        .update({ is_liability: isLiability })
        .eq('id', accountId)
        .eq('dealer_id', dealerId);

      if (error) throw error;
      showToast(`Account updated to ${isLiability ? 'Money I Owe 💳' : 'Money I Own 💰'}`, 'success');
      await fetchAll();
    } catch (err) {
      console.error('Failed to update account type:', err);
      showToast('Failed to update account', 'error');
    }
  }

  function showToast(message, type = 'info') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  // CALCULATIONS
  // Use manual categorization (is_liability) if set, otherwise auto-detect from account_type
  const assetAccounts = bankAccounts.filter(a => {
    if (a.is_liability === false) return true; // Manually marked as asset
    if (a.is_liability === true) return false; // Manually marked as liability
    // Auto-detect: depository/checking/savings = assets
    return a.account_type === 'depository' || a.account_type === 'checking' || a.account_type === 'savings';
  });

  const liabilityAccounts = bankAccounts.filter(a => {
    if (a.is_liability === true) return true; // Manually marked as liability
    if (a.is_liability === false) return false; // Manually marked as asset
    // Auto-detect: credit cards/loans = liabilities
    return a.account_type === 'credit_card' || a.account_type === 'credit' || a.account_type === 'loan' || a.account_type === 'line_of_credit';
  });

  const cashInBank = assetAccounts.reduce((sum, a) => sum + (parseFloat(a.current_balance) || 0), 0);
  const creditCardDebt = liabilityAccounts.reduce((sum, a) => sum + Math.abs(parseFloat(a.current_balance) || 0), 0);

  // Calculate inventory value including ALL expenses per vehicle (In Stock, For Sale, AND BHPH)
  const inventoryValue = (inventory || [])
    .filter(v => v.status === 'In Stock' || v.status === 'For Sale' || v.status === 'BHPH')
    .reduce((sum, v) => {
      // Start with purchase price
      const purchasePrice = parseFloat(v.purchase_price) || 0;

      // Add inventory_expenses for this vehicle
      const invExpenseTotal = (inventoryExpenses || [])
        .filter(e => e.inventory_id === v.id)
        .reduce((expSum, e) => expSum + (parseFloat(e.amount) || 0), 0);

      // Add bank transaction expenses for this vehicle (booked expenses only)
      const bankExpenseTotal = (transactions || [])
        .filter(t => t.inventory_id === v.id && t.status === 'booked' && !t.is_income)
        .reduce((txnSum, t) => txnSum + Math.abs(parseFloat(t.amount) || 0), 0);

      // Total cost for this vehicle = purchase + all expenses
      const vehicleTotalCost = purchasePrice + invExpenseTotal + bankExpenseTotal;

      return sum + vehicleTotalCost;
    }, 0);
  const bhphOwed = (bhphLoans || []).filter(l => l.status === 'Active').reduce((sum, l) => sum + (parseFloat(l.current_balance) || 0), 0);
  const bhphMonthly = (bhphLoans || []).filter(l => l.status === 'Active').reduce((sum, l) => sum + (parseFloat(l.monthly_payment) || 0), 0);
  const otherAssets = assets.reduce((sum, a) => sum + (parseFloat(a.current_value) || 0), 0);
  const otherLiabilities = liabilities.reduce((sum, l) => sum + (parseFloat(l.current_balance) || 0), 0);

  const totalOwn = cashInBank + inventoryValue + bhphOwed + otherAssets;
  const totalOwe = creditCardDebt + otherLiabilities;
  const netWorth = totalOwn - totalOwe;
  const healthScore = totalOwn > 0 ? Math.min(100, Math.max(0, Math.round((netWorth / totalOwn) * 100))) : 50;
  const inventoryCount = (inventory || []).filter(v => v.status === 'In Stock' || v.status === 'For Sale' || v.status === 'BHPH').length;
  const bhphCount = (bhphLoans || []).filter(l => l.status === 'Active').length;

  // AI BUSINESS VALUATION - AUTOMOTIVE DEALERSHIP INDUSTRY STANDARDS
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

  // Calculate average customer lifetime value (CLV)
  const avgDealPrice = recentDeals.length > 0 ? annualRevenue / recentDeals.length : 0;
  const repeatCustomerRate = 0.15; // Industry avg: 15% of customers return for another purchase
  const customerLifetimeValue = avgDealPrice * (1 + repeatCustomerRate);

  // Calculate BHPH portfolio quality multiplier (1.2x-1.5x based on performance)
  const bhphPerformanceMultiplier = bhphCount > 0 ?
    Math.min(1.5, Math.max(1.2, 1.2 + (bhphAnnualIncome / Math.max(1, bhphOwed)) * 0.3)) : 1.3;

  // Calculate monthly profit for goodwill calculation
  const monthlyProfit = recentDeals.length > 0 ? annualProfit / 12 : 0;
  const profitableMonths = annualProfit > 0 ? 12 : Math.max(1, Math.round(recentDeals.length / 2));

  // Goodwill = 6-18 months of profit based on deal volume and profitability
  const goodwillMonths = recentDeals.length >= 24 ? 18 : // High volume: 18 months
                         recentDeals.length >= 12 ? 12 : // Medium volume: 12 months
                         recentDeals.length >= 6 ? 9 :   // Low volume: 9 months
                         6;                               // Startup: 6 months
  const goodwillValue = Math.max(0, monthlyProfit * goodwillMonths);

  // Industry standard: Small dealerships trade at 1.5-2.5x SDE (Seller's Discretionary Earnings)
  // BHPH lots command higher multiples (2.0-3.5x) due to recurring revenue
  const hasBHPH = bhphCount > 5 && bhphAnnualIncome > 12000;
  const sdeMultiple = hasBHPH ?
    (bhphAnnualIncome > 50000 ? 3.0 : 2.5) : // Strong BHPH: 2.5-3.0x
    (annualRevenue > 500000 ? 2.5 : 2.0);    // Standard used car lot: 2.0-2.5x

  // Owner compensation: Industry standard for small dealership owner
  const ownerCompensation = annualRevenue > 500000 ? 75000 :
                           annualRevenue > 250000 ? 60000 :
                           50000;

  // Valuation components
  const val = {
    inventory: inventoryValue,
    bhphPortfolio: bhphOwed * bhphPerformanceMultiplier,
    cash: cashInBank,
    equipment: otherAssets,
    customers: customerCount * Math.min(customerLifetimeValue, 500), // Cap at $500/customer
    goodwill: goodwillValue,
    liabilities: totalOwe
  };
  const enterpriseValue = val.inventory + val.bhphPortfolio + val.cash + val.equipment + val.customers + val.goodwill - val.liabilities;
  const sdeValuation = (annualProfit + ownerCompensation) * sdeMultiple;
  const finalValuation = Math.max(enterpriseValue, sdeValuation, netWorth);

  // Confidence based on deal volume and revenue consistency
  const confidence = recentDeals.length >= 24 && annualRevenue > 250000 ? 'High' :
                    recentDeals.length >= 12 && annualRevenue > 100000 ? 'Medium' :
                    'Low';

  const formatCurrency = (a) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(a || 0);
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-';
  const formatDateTime = (d) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-';
  const getHealthColor = (s) => s >= 70 ? '#22c55e' : s >= 40 ? '#eab308' : '#ef4444';

  async function bookTransaction(txn, categoryId, inventoryId = null) {
    await supabase.from('bank_transactions').update({
      status: 'booked',
      category_id: categoryId,
      inventory_id: inventoryId
    }).eq('id', txn.id);
    fetchAll();
  }
  async function ignoreTransaction(txn) { await supabase.from('bank_transactions').update({ status: 'ignored' }).eq('id', txn.id); fetchAll(); }
  async function reconcileTransaction(txn, categoryId, manualExpenseId, inventoryId = null) {
    // Book the bank transaction
    await supabase.from('bank_transactions').update({
      status: 'booked',
      category_id: categoryId,
      inventory_id: inventoryId
    }).eq('id', txn.id);
    // Mark the manual expense as reconciled (or delete it)
    if (manualExpenseId) {
      await supabase.from('manual_expenses').update({ status: 'reconciled' }).eq('id', manualExpenseId);
    }
    fetchAll();
  }
  async function addExpense() { if (!expenseForm.description || !expenseForm.amount) return; await supabase.from('manual_expenses').insert({ ...expenseForm, amount: parseFloat(expenseForm.amount), dealer_id: dealerId, status: 'pending' }); setShowAddExpense(false); setExpenseForm({ description: '', amount: '', expense_date: new Date().toISOString().split('T')[0], vendor: '', category_id: null }); fetchAll(); }
  async function addAsset() { if (!assetForm.name || !assetForm.current_value) return; await supabase.from('assets').insert({ ...assetForm, purchase_price: parseFloat(assetForm.purchase_price) || 0, current_value: parseFloat(assetForm.current_value), dealer_id: dealerId, status: 'active' }); setShowAddAsset(false); setAssetForm({ name: '', asset_type: 'equipment', purchase_price: '', current_value: '' }); fetchAll(); }
  async function addLiability() { if (!liabilityForm.name || !liabilityForm.current_balance) return; await supabase.from('liabilities').insert({ ...liabilityForm, current_balance: parseFloat(liabilityForm.current_balance), monthly_payment: parseFloat(liabilityForm.monthly_payment) || 0, dealer_id: dealerId, status: 'active' }); setShowAddLiability(false); setLiabilityForm({ name: '', liability_type: 'loan', current_balance: '', monthly_payment: '', lender: '' }); fetchAll(); }

  // Export Functions
  function exportToCSV() {
    const exportData = bookedTxns.map(txn => {
      const cat = categories.find(c => c.id === txn.category_id);
      const account = txn.bank_accounts;
      const vehicle = txn.inventory_id && inventory ? inventory.find(v => v.id === txn.inventory_id) : null;

      return {
        Date: formatDate(txn.transaction_date),
        Description: txn.merchant_name || txn.description,
        Category: cat?.name || 'Uncategorized',
        Account: account ? `${account.institution_name} - ${account.account_name}` : 'Manual Entry',
        Vehicle: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : '',
        Amount: txn.is_income ? Math.abs(txn.amount) : -Math.abs(txn.amount),
        Type: txn.is_income ? 'Income' : 'Expense'
      };
    });

    const headers = Object.keys(exportData[0] || {});
    const csv = [
      headers.join(','),
      ...exportData.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
    ].join('\n');

    downloadFile(csv, `books-export-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
    showToast('Exported to CSV', 'success');
  }

  function exportToQuickBooks() {
    // QuickBooks IIF format
    let iif = '!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tCLASS\tAMOUNT\tMEMO\n';
    iif += '!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tCLASS\tAMOUNT\tMEMO\n';
    iif += '!ENDTRNS\n';

    bookedTxns.forEach((txn, idx) => {
      const cat = categories.find(c => c.id === txn.category_id);
      const account = txn.bank_accounts;
      const vehicle = txn.inventory_id && inventory ? inventory.find(v => v.id === txn.inventory_id) : null;

      const trnsType = txn.is_income ? 'DEPOSIT' : 'CHECK';
      const date = new Date(txn.transaction_date).toLocaleDateString('en-US');
      const acctName = account ? `${account.institution_name} ${account.account_name}` : 'Cash';
      const amount = txn.is_income ? Math.abs(txn.amount) : -Math.abs(txn.amount);
      const memo = vehicle ? `${txn.merchant_name || txn.description} - ${vehicle.year} ${vehicle.make} ${vehicle.model}` : (txn.merchant_name || txn.description);

      // Transaction header
      iif += `TRNS\t${idx + 1}\t${trnsType}\t${date}\t${acctName}\t${txn.merchant_name || ''}\t\t${amount}\t${memo}\n`;
      // Split line (category)
      iif += `SPL\t${idx + 1}\t${trnsType}\t${date}\t${cat?.name || 'Uncategorized'}\t\t\t${-amount}\t${memo}\n`;
      iif += 'ENDTRNS\n';
    });

    downloadFile(iif, `quickbooks-export-${new Date().toISOString().split('T')[0]}.iif`, 'text/plain');
    showToast('Exported for QuickBooks Desktop', 'success');
  }

  function exportToExcel() {
    // Generate Excel-compatible CSV with better formatting
    const exportData = bookedTxns.map(txn => {
      const cat = categories.find(c => c.id === txn.category_id);
      const account = txn.bank_accounts;
      const vehicle = txn.inventory_id && inventory ? inventory.find(v => v.id === txn.inventory_id) : null;

      return {
        Date: formatDate(txn.transaction_date),
        Description: txn.merchant_name || txn.description,
        Category: cat?.name || 'Uncategorized',
        Account: account ? `${account.institution_name} - ${account.account_name}` : 'Manual Entry',
        Vehicle: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : '',
        'Debit': txn.is_income ? '' : Math.abs(txn.amount).toFixed(2),
        'Credit': txn.is_income ? Math.abs(txn.amount).toFixed(2) : '',
        'Balance': '',
        Notes: vehicle ? `Vehicle ID: ${vehicle.stock_number || vehicle.id.slice(0, 8)}` : ''
      };
    });

    const headers = Object.keys(exportData[0] || {});
    const csv = [
      headers.join(','),
      ...exportData.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
    ].join('\n');

    downloadFile(csv, `books-export-excel-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
    showToast('Exported for Excel', 'success');
  }

  function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Filter transactions by date
  const filterByDate = (txn) => {
    if (!filterStartDate && !filterEndDate) return true;
    const txnDate = new Date(txn.transaction_date || txn.expense_date);
    const start = filterStartDate ? new Date(filterStartDate) : null;
    const end = filterEndDate ? new Date(filterEndDate) : null;

    if (start && end) {
      return txnDate >= start && txnDate <= end;
    } else if (start) {
      return txnDate >= start;
    } else if (end) {
      return txnDate <= end;
    }
    return true;
  };

  const inboxTxns = transactions.filter(t => t.status === 'inbox').filter(filterByDate);
  const bookedTxns = transactions.filter(t => t.status === 'booked').filter(filterByDate);
  const filteredExpenses = manualExpenses.filter(filterByDate);
  const connectedAccounts = bankAccounts.filter(a => a.is_plaid_connected);
  const tabs = [
    { id: 'health', label: '💪 Business Health', color: '#22c55e' },
    { id: 'accounts', label: '🏦 Accounts', count: connectedAccounts.length, color: '#3b82f6' },
    { id: 'inbox', label: '📥 Inbox', count: inboxTxns.length, color: '#f97316' },
    { id: 'expenses', label: '💸 Expenses', count: manualExpenses.length, color: '#8b5cf6' },
    { id: 'booked', label: '📚 Booked', color: '#10b981' }
  ];

  // Show loading or access denied screen
  if (checkingAccess) {
    return (
      <div style={{ padding: '60px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: '14px', color: theme.textMuted }}>Checking access...</div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div style={{ padding: '60px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
        <h2 style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 8px', color: theme.text }}>Access Denied</h2>
        <p style={{ color: theme.textMuted, fontSize: '14px', maxWidth: '400px', margin: '0 auto' }}>
          You don't have permission to view the Books page. This page is restricted to dealership administrators only.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', backgroundColor: theme.bg, minHeight: '100vh' }}>
      {/* Toast Notification */}
      {toast && (
        <div style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 100, backgroundColor: toast.type === 'error' ? '#ef4444' : toast.type === 'success' ? '#22c55e' : '#3b82f6', color: '#fff', padding: '16px 24px', borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.3)', fontWeight: '500' }}>
          {toast.message}
        </div>
      )}

      {/* Access Control */}
      {!canViewFinancials ? (
        <div style={{ maxWidth: '600px', margin: '100px auto', textAlign: 'center' }}>
          <div style={{ fontSize: '64px', marginBottom: '24px' }}>🔒</div>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: theme.text, marginBottom: '16px' }}>Access Restricted</h1>
          <p style={{ color: theme.textMuted, fontSize: '16px', lineHeight: '1.6', marginBottom: '24px' }}>
            This page contains sensitive financial information and is only accessible to authorized personnel.
          </p>
          <div style={{
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`,
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px'
          }}>
            <div style={{ color: theme.textSecondary, fontSize: '14px', marginBottom: '12px' }}>
              <strong style={{ color: theme.text }}>Authorized Roles:</strong>
            </div>
            <div style={{ color: theme.accent, fontSize: '13px', lineHeight: '1.8' }}>
              CEO • President • VP Operations • Finance • Admin • Owner
            </div>
          </div>
          <p style={{ color: theme.textMuted, fontSize: '14px' }}>
            If you believe you should have access, please contact your administrator.
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div><h1 style={{ fontSize: '28px', fontWeight: '700', color: theme.text, margin: 0 }}>Books</h1><p style={{ color: theme.textMuted, margin: '4px 0 0', fontSize: '14px' }}>Your money, simplified</p></div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '8px 12px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px' }}>
            <label style={{ color: theme.textMuted, fontSize: '13px', whiteSpace: 'nowrap' }}>From:</label>
            <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} style={{ padding: '6px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '13px' }} />
            <label style={{ color: theme.textMuted, fontSize: '13px', whiteSpace: 'nowrap' }}>To:</label>
            <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} style={{ padding: '6px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '13px' }} />
            {(filterStartDate || filterEndDate) && (
              <button onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }} style={{ padding: '4px 8px', backgroundColor: 'transparent', color: theme.textMuted, border: 'none', cursor: 'pointer', fontSize: '12px' }}>Clear</button>
            )}
          </div>
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
                        <ValRow label={`BHPH Portfolio (${bhphPerformanceMultiplier.toFixed(2)}x)`} value={val.bhphPortfolio} f={formatCurrency} note="Quality-adjusted recurring income" />
                        <ValRow label="Cash & Bank" value={val.cash} f={formatCurrency} />
                        <ValRow label="Equipment & Assets" value={val.equipment} f={formatCurrency} />
                        <ValRow label={`Customer Base (${customerCount})`} value={val.customers} f={formatCurrency} note={`~$${Math.round(customerLifetimeValue)} CLV per customer`} />
                        <ValRow label="Goodwill & Brand" value={val.goodwill} f={formatCurrency} note={`${goodwillMonths} months of profit`} />
                        <ValRow label="Less: Debts" value={-val.liabilities} f={formatCurrency} neg />
                      </div>
                      <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.2)', display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: '600' }}>Enterprise Value</span><span style={{ color: '#fff', fontWeight: '700' }}>{formatCurrency(enterpriseValue)}</span></div>
                      <div style={{ marginTop: '8px', color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>Alternative: {formatCurrency(sdeValuation)} ({sdeMultiple.toFixed(1)}x SDE - {hasBHPH ? 'BHPH Premium' : 'Standard Dealership'})</div>
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
                  {totalOwe === 0 ? <div style={{ textAlign: 'center', padding: '40px', color: theme.textMuted }}><div style={{ fontSize: '32px', marginBottom: '12px' }}>🎉</div><div>Debt free!</div></div> : (
                    <>
                      {liabilityAccounts.map(a => (
                        <div key={a.id} style={{ padding: '12px', backgroundColor: theme.bg, borderRadius: '8px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '20px' }}>{a.account_type === 'credit_card' || a.account_type === 'credit' ? '💳' : '🏦'}</span>
                            <div>
                              <div style={{ color: theme.text, fontWeight: '500' }}>{a.institution_name || a.account_name}</div>
                              <div style={{ color: theme.textMuted, fontSize: '12px' }}>{a.account_name} {a.account_mask && `••${a.account_mask}`}</div>
                            </div>
                          </div>
                          <div style={{ color: '#ef4444', fontWeight: '600' }}>{formatCurrency(Math.abs(a.current_balance))}</div>
                        </div>
                      ))}
                      {liabilities.map(l => (
                        <div key={l.id} style={{ padding: '12px', backgroundColor: theme.bg, borderRadius: '8px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}><div><div style={{ color: theme.text, fontWeight: '500' }}>{l.name}</div><div style={{ color: theme.textMuted, fontSize: '12px' }}>{l.lender}</div></div><div style={{ textAlign: 'right' }}><div style={{ color: '#ef4444', fontWeight: '600' }}>{formatCurrency(l.current_balance)}</div>{l.monthly_payment > 0 && <div style={{ color: theme.textMuted, fontSize: '12px' }}>{formatCurrency(l.monthly_payment)}/mo</div>}</div></div>
                      ))}
                    </>
                  )}
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
                    <>
                      <button onClick={() => syncAccount()} disabled={syncing} style={{ padding: '10px 20px', backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: '8px', fontWeight: '600', cursor: syncing ? 'not-allowed' : 'pointer', opacity: syncing ? 0.6 : 1 }}>
                        {syncing ? 'Syncing...' : '🔄 Sync All'}
                      </button>
                      <button onClick={() => setShowCustomSync(true)} style={{ padding: '10px 20px', backgroundColor: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>
                        📅 Custom Sync
                      </button>
                    </>
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

                      {/* Simple Toggle: Money I OWE vs Money I OWN */}
                      <div style={{ marginBottom: '12px', padding: '10px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                        <div style={{ color: theme.textMuted, fontSize: '11px', marginBottom: '6px' }}>This account is:</div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => toggleAccountType(account.id, false)}
                            style={{
                              flex: 1,
                              padding: '8px',
                              backgroundColor: account.is_liability === false ? '#22c55e' : 'transparent',
                              color: account.is_liability === false ? '#fff' : theme.textMuted,
                              border: `1px solid ${account.is_liability === false ? '#22c55e' : theme.border}`,
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: account.is_liability === false ? '600' : '400'
                            }}
                          >
                            💰 Money I OWN
                          </button>
                          <button
                            onClick={() => toggleAccountType(account.id, true)}
                            style={{
                              flex: 1,
                              padding: '8px',
                              backgroundColor: account.is_liability === true ? '#ef4444' : 'transparent',
                              color: account.is_liability === true ? '#fff' : theme.textMuted,
                              border: `1px solid ${account.is_liability === true ? '#ef4444' : theme.border}`,
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: account.is_liability === true ? '600' : '400'
                            }}
                          >
                            💳 Money I OWE
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', padding: '12px', backgroundColor: theme.bg, borderRadius: '8px' }}>
                        <div style={{ color: theme.textMuted, fontSize: '13px' }}>
                          {(() => {
                            // Use manual categorization if set
                            if (account.is_liability === true) return 'You Owe';
                            if (account.is_liability === false) return 'You Have';
                            // Auto-detect
                            return (account.account_type === 'credit_card' || account.account_type === 'credit' || account.account_type === 'loan' || account.account_type === 'line_of_credit') ? 'You Owe' : 'You Have';
                          })()}
                        </div>
                        <div style={{ color: (() => {
                          // Use manual categorization if set
                          if (account.is_liability === true) return '#ef4444';
                          if (account.is_liability === false) return '#22c55e';
                          // Auto-detect
                          return (account.account_type === 'credit_card' || account.account_type === 'credit' || account.account_type === 'loan' || account.account_type === 'line_of_credit') ? '#ef4444' : '#22c55e';
                        })(), fontSize: '20px', fontWeight: '700' }}>
                          {formatCurrency(Math.abs(account.current_balance))}
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
              <div style={{ marginBottom: '16px', padding: '16px', backgroundColor: 'rgba(249, 115, 22, 0.1)', borderRadius: '12px', border: '1px solid rgba(249, 115, 22, 0.3)' }}><div style={{ color: theme.accent, fontWeight: '600' }}>📥 Transactions to Review</div><div style={{ color: theme.textSecondary, fontSize: '14px' }}>{filterStartDate || filterEndDate ? `Showing ${inboxTxns.length} filtered transactions` : 'Pick a category, then "Book It"'}</div></div>
              {inboxTxns.length === 0 ? <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted }}><div style={{ fontSize: '48px', marginBottom: '16px' }}>✨</div><div>All caught up!</div></div> : inboxTxns.map(txn => <TxnCard key={txn.id} txn={txn} categories={categories} theme={theme} f={formatCurrency} fd={formatDate} onBook={bookTransaction} onIgnore={ignoreTransaction} onReconcile={reconcileTransaction} aiSuggestion={aiSuggestions[txn.id]} manualExpenses={manualExpenses} loadingAI={loadingAI} inventory={inventory} />)}
            </div>
          )}

          {activeTab === 'expenses' && (
            <div>
              <div style={{ marginBottom: '16px', padding: '16px', backgroundColor: 'rgba(139, 92, 246, 0.1)', borderRadius: '12px', border: '1px solid rgba(139, 92, 246, 0.3)' }}><div style={{ color: '#8b5cf6', fontWeight: '600' }}>💸 Your Expenses</div><div style={{ color: theme.textSecondary, fontSize: '14px' }}>{filterStartDate || filterEndDate ? `Filtered: ${filteredExpenses.length} of ${manualExpenses.length}` : `Total: ${manualExpenses.length}`}</div></div>
              {filteredExpenses.length === 0 ? <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted }}>{filterStartDate || filterEndDate ? 'No expenses in this date range' : 'No expenses yet'}</div> : filteredExpenses.map(exp => {
                const cat = categories.find(c => c.id === exp.category_id);
                return (<div key={exp.id} style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}><div style={{ width: '48px', height: '48px', borderRadius: '8px', backgroundColor: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>{cat?.icon || '📄'}</div><div><div style={{ color: theme.text, fontWeight: '600' }}>{exp.description}</div><div style={{ color: theme.textMuted, fontSize: '13px' }}>{exp.vendor} • {formatDate(exp.expense_date)}</div></div></div><div style={{ color: '#ef4444', fontWeight: '700', fontSize: '18px' }}>{formatCurrency(exp.amount)}</div></div>);
              })}
            </div>
          )}

          {activeTab === 'booked' && (
            <div>
              <div style={{ marginBottom: '16px', padding: '16px', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div style={{ color: '#10b981', fontWeight: '600' }}>📚 Booked Transactions</div>
                  <div style={{ color: theme.textSecondary, fontSize: '14px' }}>{filterStartDate || filterEndDate ? `Showing ${bookedTxns.length} filtered transactions` : `Total: ${bookedTxns.length}`}</div>
                </div>
                {bookedTxns.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={exportToCSV} style={{ padding: '8px 16px', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' }}>
                      📊 CSV
                    </button>
                    <button onClick={exportToQuickBooks} style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' }}>
                      💼 QuickBooks
                    </button>
                    <button onClick={exportToExcel} style={{ padding: '8px 16px', backgroundColor: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' }}>
                      📈 Excel
                    </button>
                  </div>
                )}
              </div>
              {bookedTxns.length === 0 ? <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted }}>Nothing booked yet</div> : (
                <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ backgroundColor: theme.bg }}><th style={{ padding: '12px 16px', textAlign: 'left', color: theme.textMuted, fontSize: '12px' }}>DATE</th><th style={{ padding: '12px 16px', textAlign: 'left', color: theme.textMuted, fontSize: '12px' }}>WHAT</th><th style={{ padding: '12px 16px', textAlign: 'left', color: theme.textMuted, fontSize: '12px' }}>ACCOUNT</th><th style={{ padding: '12px 16px', textAlign: 'left', color: theme.textMuted, fontSize: '12px' }}>CATEGORY</th><th style={{ padding: '12px 16px', textAlign: 'right', color: theme.textMuted, fontSize: '12px' }}>AMOUNT</th></tr></thead>
                    <tbody>{bookedTxns.map(txn => { const cat = categories.find(c => c.id === txn.category_id); const account = txn.bank_accounts; return (<tr key={txn.id} style={{ borderTop: `1px solid ${theme.border}` }}><td style={{ padding: '12px 16px', color: theme.textSecondary }}>{formatDate(txn.transaction_date)}</td><td style={{ padding: '12px 16px', color: theme.text }}>{txn.merchant_name}</td><td style={{ padding: '12px 16px', color: theme.textMuted, fontSize: '13px' }}>{account ? <><span style={{ marginRight: '4px' }}>{account.account_type === 'credit_card' ? '💳' : '🏦'}</span>{account.institution_name} {account.account_mask && `••${account.account_mask}`}</> : '-'}</td><td style={{ padding: '12px 16px' }}>{cat && <span style={{ padding: '4px 10px', backgroundColor: `${cat.color}20`, borderRadius: '6px', fontSize: '13px', color: cat.color }}>{cat.icon} {cat.name}</span>}</td><td style={{ padding: '12px 16px', textAlign: 'right', color: txn.is_income ? '#22c55e' : '#ef4444', fontWeight: '600' }}>{formatCurrency(Math.abs(txn.amount))}</td></tr>); })}</tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
        </>
      )}

      {showAddExpense && <Modal title="Add Expense" onClose={() => setShowAddExpense(false)} theme={theme}><Field label="What?" value={expenseForm.description} onChange={v => setExpenseForm({...expenseForm, description: v})} theme={theme} /><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}><Field label="Amount" type="number" value={expenseForm.amount} onChange={v => setExpenseForm({...expenseForm, amount: v})} theme={theme} /><Field label="Date" type="date" value={expenseForm.expense_date} onChange={v => setExpenseForm({...expenseForm, expense_date: v})} theme={theme} /></div><Field label="Where?" value={expenseForm.vendor} onChange={v => setExpenseForm({...expenseForm, vendor: v})} theme={theme} /><CatPicker categories={categories.filter(c => c.type === 'expense')} selected={expenseForm.category_id} onSelect={id => setExpenseForm({...expenseForm, category_id: id})} theme={theme} /><div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}><button onClick={() => setShowAddExpense(false)} style={{ flex: 1, padding: '12px', backgroundColor: theme.bg, color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer' }}>Cancel</button><button onClick={addExpense} style={{ flex: 1, padding: '12px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Add</button></div></Modal>}
      {showAddAsset && <Modal title="Add Something You Own" onClose={() => setShowAddAsset(false)} theme={theme}><Field label="What?" value={assetForm.name} onChange={v => setAssetForm({...assetForm, name: v})} theme={theme} /><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}><Field label="Paid" type="number" value={assetForm.purchase_price} onChange={v => setAssetForm({...assetForm, purchase_price: v})} theme={theme} /><Field label="Worth now" type="number" value={assetForm.current_value} onChange={v => setAssetForm({...assetForm, current_value: v})} theme={theme} /></div><div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}><button onClick={() => setShowAddAsset(false)} style={{ flex: 1, padding: '12px', backgroundColor: theme.bg, color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer' }}>Cancel</button><button onClick={addAsset} style={{ flex: 1, padding: '12px', backgroundColor: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Add</button></div></Modal>}
      {showAddLiability && <Modal title="Add Something You Owe" onClose={() => setShowAddLiability(false)} theme={theme}><Field label="What?" value={liabilityForm.name} onChange={v => setLiabilityForm({...liabilityForm, name: v})} theme={theme} /><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}><Field label="Still owe" type="number" value={liabilityForm.current_balance} onChange={v => setLiabilityForm({...liabilityForm, current_balance: v})} theme={theme} /><Field label="Monthly" type="number" value={liabilityForm.monthly_payment} onChange={v => setLiabilityForm({...liabilityForm, monthly_payment: v})} theme={theme} /></div><Field label="Lender" value={liabilityForm.lender} onChange={v => setLiabilityForm({...liabilityForm, lender: v})} theme={theme} /><div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}><button onClick={() => setShowAddLiability(false)} style={{ flex: 1, padding: '12px', backgroundColor: theme.bg, color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer' }}>Cancel</button><button onClick={addLiability} style={{ flex: 1, padding: '12px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Add</button></div></Modal>}

      {showCustomSync && (
        <Modal title="Custom Date Range Sync" onClose={() => setShowCustomSync(false)} theme={theme}>
          <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: 'rgba(139, 92, 246, 0.1)', borderRadius: '8px', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
            <div style={{ color: '#8b5cf6', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>💡 Tip</div>
            <div style={{ color: theme.textSecondary, fontSize: '12px' }}>Sync transactions from a specific date range. Useful for getting historical data when first connecting accounts.</div>
          </div>
          <Field label="Start Date" type="date" value={syncStartDate} onChange={v => setSyncStartDate(v)} theme={theme} />
          <Field label="End Date" type="date" value={syncEndDate} onChange={v => setSyncEndDate(v)} theme={theme} />
          <div style={{ marginBottom: '16px', padding: '10px', backgroundColor: theme.bg, borderRadius: '6px' }}>
            <div style={{ color: theme.textMuted, fontSize: '12px' }}>
              {syncStartDate && syncEndDate ? (
                <>Syncing from <strong style={{ color: theme.text }}>{new Date(syncStartDate).toLocaleDateString()}</strong> to <strong style={{ color: theme.text }}>{new Date(syncEndDate).toLocaleDateString()}</strong></>
              ) : (
                'Please select both start and end dates'
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => setShowCustomSync(false)} style={{ flex: 1, padding: '12px', backgroundColor: theme.bg, color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => syncAccount(null, syncStartDate, syncEndDate)} disabled={!syncStartDate || !syncEndDate || syncing} style={{ flex: 1, padding: '12px', backgroundColor: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '8px', cursor: (!syncStartDate || !syncEndDate || syncing) ? 'not-allowed' : 'pointer', opacity: (!syncStartDate || !syncEndDate || syncing) ? 0.6 : 1 }}>
              {syncing ? 'Syncing...' : 'Sync'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ValRow({ label, value, f, note, neg }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '13px' }}>{label}</div>{note && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>{note}</div>}</div><div style={{ color: neg ? '#ef4444' : '#22c55e', fontWeight: '600' }}>{f(value)}</div></div>;
}
function Modal({ title, onClose, children, theme }) { return <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}><div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, maxWidth: '450px', width: '100%', maxHeight: '90vh', overflow: 'auto' }}><div style={{ padding: '20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '700', margin: 0 }}>{title}</h2><button onClick={onClose} style={{ background: 'none', border: 'none', color: theme.textMuted, fontSize: '24px', cursor: 'pointer' }}>×</button></div><div style={{ padding: '20px' }}>{children}</div></div></div>; }
function Field({ label, value, onChange, type = 'text', theme }) { return <div style={{ marginBottom: '16px' }}><label style={{ display: 'block', color: theme.textSecondary, fontSize: '13px', marginBottom: '6px' }}>{label}</label><input type={type} value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%', padding: '12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '15px' }} /></div>; }
function CatPicker({ categories, selected, onSelect, theme }) { return <div style={{ marginBottom: '16px' }}><label style={{ display: 'block', color: theme.textSecondary, fontSize: '13px', marginBottom: '6px' }}>Category</label><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', maxHeight: '180px', overflow: 'auto' }}>{categories.map(cat => <button key={cat.id} onClick={() => onSelect(cat.id)} style={{ padding: '8px', backgroundColor: selected === cat.id ? `${cat.color}30` : theme.bg, border: `1px solid ${selected === cat.id ? cat.color : theme.border}`, borderRadius: '8px', cursor: 'pointer', textAlign: 'center' }}><div style={{ fontSize: '18px' }}>{cat.icon}</div><div style={{ color: theme.textSecondary, fontSize: '10px' }}>{cat.name}</div></button>)}</div></div>; }
function TxnCard({ txn, categories, theme, f, fd, onBook, onIgnore, onReconcile, aiSuggestion, manualExpenses, loadingAI, inventory }) {
  const [sel, setSel] = useState(null);
  const [show, setShow] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [showVehicles, setShowVehicles] = useState(false);
  const cat = categories.find(c => c.id === sel);
  const account = txn.bank_accounts;
  const vehicle = selectedVehicle ? inventory.find(v => v.id === selectedVehicle) : null;

  // Auto-select AI suggested category for this transaction
  useEffect(() => {
    if (aiSuggestion && aiSuggestion.category && categories.length > 0) {
      // Strip emojis and extra text from AI suggestion (e.g., "Fuel (⛽)" -> "Fuel")
      const cleanCategory = aiSuggestion.category.replace(/\s*\([^)]*\)\s*/g, '').trim();
      const suggestedCat = categories.find(c => c.name === cleanCategory);
      if (suggestedCat) {
        setSel(suggestedCat.id);
      }
    } else {
      // Reset if no AI suggestion yet
      setSel(null);
    }
    setSelectedMatch(null);
  }, [txn.id, aiSuggestion, categories]);

  // Find matching manual expenses based on AI suggestions
  const matches = aiSuggestion?.matches?.map(m => {
    const expense = manualExpenses.find(e => e.id === m.expense_id);
    return expense ? { ...expense, confidence: m.confidence, reason: m.reason } : null;
  }).filter(Boolean) || [];

  return (
    <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <div style={{ color: theme.text, fontWeight: '600' }}>{txn.merchant_name || 'Unknown'}</div>
          <div style={{ color: theme.textMuted, fontSize: '13px' }}>{fd(txn.transaction_date)}</div>
          {account && (
            <div style={{ color: theme.textMuted, fontSize: '12px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>{account.account_type === 'credit_card' ? '💳' : '🏦'}</span>
              <span>{account.institution_name || 'Bank'} - {account.account_name} {account.account_mask && `••${account.account_mask}`}</span>
            </div>
          )}
        </div>
        <div style={{ color: txn.amount < 0 ? '#ef4444' : '#22c55e', fontWeight: '700', fontSize: '20px' }}>{f(Math.abs(txn.amount))}</div>
      </div>

      {/* AI Suggestion Badge */}
      {loadingAI && !aiSuggestion && (
        <div style={{ marginBottom: '12px', padding: '8px', backgroundColor: 'rgba(139, 92, 246, 0.1)', borderRadius: '8px', border: '1px dashed rgba(139, 92, 246, 0.3)', fontSize: '12px', color: '#8b5cf6', textAlign: 'center' }}>
          🤖 AI analyzing...
        </div>
      )}
      {aiSuggestion && aiSuggestion.category && (
        <div style={{ marginBottom: '12px', padding: '8px', backgroundColor: 'rgba(139, 92, 246, 0.1)', borderRadius: '8px', border: '1px solid rgba(139, 92, 246, 0.3)', fontSize: '12px', color: '#8b5cf6' }}>
          🤖 AI suggests: <strong>{aiSuggestion.category}</strong> ({aiSuggestion.confidence}% confident)
        </div>
      )}

      {/* Matching Expenses */}
      {matches.length > 0 && (
        <div style={{ marginBottom: '12px', padding: '12px', backgroundColor: 'rgba(249, 115, 22, 0.1)', borderRadius: '8px', border: '1px solid rgba(249, 115, 22, 0.3)' }}>
          <div style={{ color: '#f97316', fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>🔗 Possible duplicates found:</div>
          {matches.map(match => (
            <button
              key={match.id}
              onClick={() => setSelectedMatch(selectedMatch?.id === match.id ? null : match)}
              style={{
                width: '100%',
                padding: '10px',
                marginBottom: '8px',
                backgroundColor: selectedMatch?.id === match.id ? 'rgba(249, 115, 22, 0.2)' : theme.bg,
                border: `1px solid ${selectedMatch?.id === match.id ? '#f97316' : theme.border}`,
                borderRadius: '6px',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: theme.text, fontSize: '13px', fontWeight: '500' }}>{match.description}</div>
                  <div style={{ color: theme.textMuted, fontSize: '11px' }}>{match.vendor} • {fd(match.expense_date)}</div>
                  <div style={{ color: '#f97316', fontSize: '11px', marginTop: '4px' }}>💡 {match.reason}</div>
                </div>
                <div style={{ color: theme.text, fontWeight: '600' }}>{f(match.amount)}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Category Picker */}
      <button onClick={() => setShow(!show)} style={{ width: '100%', padding: '12px', marginBottom: '12px', backgroundColor: cat ? `${cat.color}20` : theme.bg, border: `1px solid ${cat ? cat.color : theme.border}`, borderRadius: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: cat ? cat.color : theme.textMuted }}>{cat ? `${cat.icon} ${cat.name}` : 'Pick category...'}</span>
        <span style={{ color: theme.textMuted }}>{show ? '▲' : '▼'}</span>
      </button>
      {show && (
        <div style={{ marginBottom: '12px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', padding: '8px', backgroundColor: theme.bg, borderRadius: '8px' }}>
          {categories.filter(c => c.type === (txn.amount < 0 ? 'expense' : 'income')).map(c => (
            <button
              key={c.id}
              onClick={() => { setSel(c.id); setShow(false); }}
              style={{ padding: '8px', backgroundColor: sel === c.id ? `${c.color}30` : 'transparent', border: `1px solid ${sel === c.id ? c.color : theme.border}`, borderRadius: '8px', cursor: 'pointer', textAlign: 'center' }}
            >
              <div style={{ fontSize: '18px' }}>{c.icon}</div>
              <div style={{ color: theme.textSecondary, fontSize: '9px' }}>{c.name}</div>
            </button>
          ))}
        </div>
      )}

      {/* Vehicle Selector */}
      {(() => {
        // For expenses: show In Stock, For Sale, BHPH
        // For income: show only Sold and BHPH
        const isExpense = txn.amount < 0;
        const isIncome = txn.amount > 0;

        let availableVehicles = [];
        if (isExpense && inventory) {
          availableVehicles = inventory.filter(v => v.status === 'In Stock' || v.status === 'For Sale' || v.status === 'BHPH');
        } else if (isIncome && inventory) {
          availableVehicles = inventory.filter(v => v.status === 'Sold' || v.status === 'BHPH');

          // AI Smart Sort: Match by amount
          const txnAmount = Math.abs(txn.amount);
          availableVehicles = availableVehicles.sort((a, b) => {
            // For Sold vehicles, match against sale_price
            // For BHPH vehicles, match against monthly_payment or remaining balance
            const getMatchScore = (v) => {
              if (v.status === 'Sold' && v.sale_price) {
                const diff = Math.abs(parseFloat(v.sale_price) - txnAmount);
                return diff;
              }
              if (v.status === 'BHPH') {
                // Check if it matches monthly payment or down payment
                const monthlyDiff = v.monthly_payment ? Math.abs(parseFloat(v.monthly_payment) - txnAmount) : Infinity;
                const downDiff = v.down_payment ? Math.abs(parseFloat(v.down_payment) - txnAmount) : Infinity;
                return Math.min(monthlyDiff, downDiff);
              }
              return Infinity;
            };
            return getMatchScore(a) - getMatchScore(b);
          });
        }

        return (isExpense || isIncome) && availableVehicles.length > 0;
      })() && (() => {
        const isExpense = txn.amount < 0;
        const isIncome = txn.amount > 0;
        const txnAmount = Math.abs(txn.amount);

        let availableVehicles = [];
        if (isExpense) {
          availableVehicles = inventory.filter(v => v.status === 'In Stock' || v.status === 'For Sale' || v.status === 'BHPH');
        } else {
          availableVehicles = inventory.filter(v => v.status === 'Sold' || v.status === 'BHPH');
          availableVehicles = availableVehicles.sort((a, b) => {
            const getMatchScore = (v) => {
              if (v.status === 'Sold' && v.sale_price) {
                return Math.abs(parseFloat(v.sale_price) - txnAmount);
              }
              if (v.status === 'BHPH') {
                const monthlyDiff = v.monthly_payment ? Math.abs(parseFloat(v.monthly_payment) - txnAmount) : Infinity;
                const downDiff = v.down_payment ? Math.abs(parseFloat(v.down_payment) - txnAmount) : Infinity;
                return Math.min(monthlyDiff, downDiff);
              }
              return Infinity;
            };
            return getMatchScore(a) - getMatchScore(b);
          });
        }

        // Get AI suggestion for top match
        const topMatch = availableVehicles[0];
        const topMatchScore = topMatch && (() => {
          if (topMatch.status === 'Sold' && topMatch.sale_price) {
            const diff = Math.abs(parseFloat(topMatch.sale_price) - txnAmount);
            return diff < 50 ? `Matches sale price: ${formatCurrency(topMatch.sale_price)}` : null;
          }
          if (topMatch.status === 'BHPH') {
            if (topMatch.monthly_payment && Math.abs(parseFloat(topMatch.monthly_payment) - txnAmount) < 5) {
              return `Matches monthly payment: ${formatCurrency(topMatch.monthly_payment)}`;
            }
            if (topMatch.down_payment && Math.abs(parseFloat(topMatch.down_payment) - txnAmount) < 50) {
              return `Matches down payment: ${formatCurrency(topMatch.down_payment)}`;
            }
          }
          return null;
        })();

        return (
          <>
            <button onClick={() => setShowVehicles(!showVehicles)} style={{ width: '100%', padding: '12px', marginBottom: '12px', backgroundColor: vehicle ? 'rgba(34, 197, 94, 0.1)' : theme.bg, border: `1px solid ${vehicle ? '#22c55e' : theme.border}`, borderRadius: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: vehicle ? '#22c55e' : theme.textMuted }}>
                {vehicle ? `🚗 ${vehicle.year} ${vehicle.make} ${vehicle.model}` : `🚗 Link to vehicle (${isIncome ? 'income' : 'expense'})`}
              </span>
              <span style={{ color: theme.textMuted }}>{showVehicles ? '▲' : '▼'}</span>
            </button>
            {showVehicles && (
              <div style={{ marginBottom: '12px', maxHeight: '250px', overflow: 'auto', padding: '8px', backgroundColor: theme.bg, borderRadius: '8px' }}>
                <button
                  onClick={() => { setSelectedVehicle(null); setShowVehicles(false); }}
                  style={{ width: '100%', padding: '8px', marginBottom: '4px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', cursor: 'pointer', textAlign: 'left', color: theme.textMuted, fontSize: '13px' }}
                >
                  None - General {isIncome ? 'income' : 'expense'}
                </button>
                {availableVehicles.map((v, idx) => {
                  const isTopMatch = idx === 0 && topMatchScore;
                  return (
                    <button
                      key={v.id}
                      onClick={() => { setSelectedVehicle(v.id); setShowVehicles(false); }}
                      style={{ width: '100%', padding: '10px', marginBottom: '6px', backgroundColor: selectedVehicle === v.id ? 'rgba(34, 197, 94, 0.2)' : isTopMatch ? 'rgba(139, 92, 246, 0.1)' : 'transparent', border: `1px solid ${selectedVehicle === v.id ? '#22c55e' : isTopMatch ? '#8b5cf6' : theme.border}`, borderRadius: '6px', cursor: 'pointer', textAlign: 'left' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ color: theme.text, fontSize: '13px', fontWeight: '500' }}>
                            {v.year} {v.make} {v.model}
                            {isTopMatch && <span style={{ marginLeft: '8px', padding: '2px 6px', backgroundColor: '#8b5cf6', color: '#fff', borderRadius: '4px', fontSize: '10px', fontWeight: '600' }}>🤖 AI MATCH</span>}
                          </div>
                          <div style={{ color: theme.textMuted, fontSize: '11px' }}>
                            {v.status} • Stock #{v.stock_number || v.id.slice(0, 8)}
                          </div>
                          {isTopMatch && (
                            <div style={{ color: '#8b5cf6', fontSize: '11px', marginTop: '4px' }}>
                              💡 {topMatchScore}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        );
      })()}

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '12px' }}>
        {selectedMatch ? (
          <button
            onClick={() => sel && onReconcile(txn, sel, selectedMatch.id, selectedVehicle)}
            disabled={!sel}
            style={{ flex: 1, padding: '12px', backgroundColor: sel ? '#f97316' : theme.border, color: sel ? '#fff' : theme.textMuted, border: 'none', borderRadius: '8px', fontWeight: '600', cursor: sel ? 'pointer' : 'not-allowed' }}
          >
            🔗 Reconcile & Book
          </button>
        ) : (
          <button
            onClick={() => sel && onBook(txn, sel, selectedVehicle)}
            disabled={!sel}
            style={{ flex: 1, padding: '12px', backgroundColor: sel ? '#22c55e' : theme.border, color: sel ? '#fff' : theme.textMuted, border: 'none', borderRadius: '8px', fontWeight: '600', cursor: sel ? 'pointer' : 'not-allowed' }}
          >
            ✓ Book It
          </button>
        )}
        <button onClick={() => onIgnore(txn)} style={{ padding: '12px 20px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer' }}>
          Skip
        </button>
      </div>
        </>
      )}
    </div>
  );
}
