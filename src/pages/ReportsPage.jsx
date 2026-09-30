import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';

// A deal counts as a sale once it reaches one of these stages (same stage names as the Deals page).
// Archived deals are included: the Deals page only lets you archive a locked (finished) deal.
const SOLD_STAGES = ['Sold', 'Delivered'];
const ON_LOT_STATUSES = ['In Stock', 'For Sale'];

const pad2 = (n) => String(n).padStart(2, '0');
const toYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
// Date-only strings ("2026-02-12") are read as LOCAL dates, not UTC midnight.
const parseLocalDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v;
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};
const dealSalePrice = (d) => parseFloat(d.vehicle_cash_price) || parseFloat(d.price) || parseFloat(d.sale_price) || 0;
const isCompletedSale = (d) => SOLD_STAGES.includes(d.stage);

// Date range for a range id. `end` is the end of today, so today's records are included.
function getDateRange(range) {
  const now = new Date();
  let start = new Date(now.getFullYear(), now.getMonth(), 1);
  switch (range) {
    case 'week': start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6); break;
    case 'quarter': start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1); break;
    case 'year': start = new Date(now.getFullYear(), 0, 1); break;
    case 'all': start = new Date(2000, 0, 1); break;
    default: break;
  }
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start, end };
}

const RANGE_LABELS = { week: 'Last 7 Days', month: 'This Month', quarter: 'This Quarter', year: 'This Year', all: 'All Time' };

export default function ReportsPage() {
  const { dealerId, inventory, bhphLoans, deals, employees, customers, currentEmployee } = useStore();
  const themeContext = useTheme();
  const theme = themeContext?.theme || { bg: '#09090b', bgCard: '#18181b', border: '#27272a', text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a', accent: '#f97316' };

  const [activeTab, setActiveTab] = useState('premade');
  const [activeReport, setActiveReport] = useState(null);
  const [dateRange, setDateRange] = useState('month');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reportData, setReportData] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [vehicleExpenses, setVehicleExpenses] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [paystubs, setPaystubs] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [customReport, setCustomReport] = useState({ dataSource: null, fields: [], groupBy: null, sortBy: null, sortDir: 'desc', name: '' });
  const [customResults, setCustomResults] = useState(null);
  const [savedReports, setSavedReports] = useState([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [savingReport, setSavingReport] = useState(false);

  // Role check - if no currentEmployee, assume dealer owner (full access)
  const userRoles = currentEmployee?.roles || [];
  const hasNoEmployee = !currentEmployee;
  const canViewFinancials = hasNoEmployee || userRoles.some(r => ['Owner', 'CEO', 'Admin', 'President', 'VP Operations', 'Finance'].includes(r));
  const isAdmin = canViewFinancials; // Alias for backwards compatibility
  const isManager = isAdmin || userRoles.some(r => ['Manager', 'HR'].includes(r));
  const isHR = hasNoEmployee || userRoles.some(r => ['Owner', 'CEO', 'Admin', 'HR'].includes(r));

  useEffect(() => { if (dealerId) fetchData(); }, [dealerId]);

  async function fetchData() {
    const [txns, cats, exps, time, stubs, comms, saved] = await Promise.all([
      supabase.from('bank_transactions').select('*').eq('dealer_id', dealerId),
      supabase.from('expense_categories').select('*').or(`dealer_id.eq.${dealerId},dealer_id.is.null`),
      supabase.from('inventory_expenses').select('inventory_id, amount').eq('dealer_id', dealerId),
      supabase.from('time_clock').select('*, employees(name)').eq('dealer_id', dealerId),
      isHR ? supabase.from('paystubs').select('*, employees(name)').eq('dealer_id', dealerId) : { data: [] },
      supabase.from('inventory_commissions').select('*, employees(name)').eq('dealer_id', dealerId),
      isManager ? supabase.from('saved_reports').select('*').eq('dealer_id', dealerId).order('created_at', { ascending: false }) : { data: [] }
    ]);
    const firstError = [txns, cats, exps, time, stubs, comms, saved].find(r => r.error)?.error;
    setLoadError(firstError ? 'Some report data could not load: ' + firstError.message : '');
    if (txns.data) setTransactions(txns.data);
    if (cats.data) setCategories(cats.data);
    if (exps.data) setVehicleExpenses(exps.data);
    if (time.data) setTimeEntries(time.data);
    if (stubs.data) setPaystubs(stubs.data);
    if (comms.data) setCommissions(comms.data);
    if (saved.data) setSavedReports(saved.data);
  }

  const formatCurrency = (a) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(a || 0);
  const formatDate = (d) => { const x = parseLocalDate(d); return x ? x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'; };

  const premadeReports = [
    { id: 'profit-loss', icon: '📊', label: 'Did I Make Money?', desc: 'Profit on cars sold', color: '#22c55e', cat: 'Financial' },
    { id: 'balance-sheet', icon: '⚖️', label: 'What Do I Own?', desc: 'Cars on the lot + BHPH owed to you', color: '#3b82f6', cat: 'Financial' },
    { id: 'expense-breakdown', icon: '💸', label: 'Where Did Money Go?', desc: 'Expenses by category', color: '#ef4444', cat: 'Financial' },
    { id: 'inventory', icon: '🚗', label: 'Inventory Report', desc: 'Stock levels & values', color: '#8b5cf6', cat: 'Inventory' },
    { id: 'inventory-aging', icon: '📅', label: 'Inventory Aging', desc: 'Days on lot', color: '#f97316', cat: 'Inventory' },
    { id: 'price-variance', icon: '📉', label: 'Price Variance', desc: 'Asking price vs sale price', color: '#ec4899', cat: 'Inventory' },
    { id: 'bhph-collection', icon: '📋', label: 'Who Owes Me?', desc: 'BHPH (buy here pay here) loans', color: '#22c55e', cat: 'BHPH' },
    { id: 'deals-summary', icon: '🤝', label: 'Deals Summary', desc: 'Sold & delivered deals', color: '#8b5cf6', cat: 'Sales' },
    { id: 'salesman-performance', icon: '🏆', label: 'Salesman Performance', desc: 'By salesperson', color: '#f97316', cat: 'Sales' },
    { id: 'customer-list', icon: '👥', label: 'Customer List', desc: 'All customers', color: '#06b6d4', cat: 'Customers' },
    { id: 'team-roster', icon: '🧑‍🤝‍🧑', label: 'Team Roster', desc: 'Employee list', color: '#22c55e', cat: 'Team' },
    { id: 'time-summary', icon: '⏰', label: 'Time Summary', desc: 'Hours worked', color: '#3b82f6', cat: 'Team' },
    { id: 'commissions', icon: '💰', label: 'Commissions', desc: 'Commission entries by person', color: '#f97316', cat: 'Team' },
  ];

  const confidentialReports = [
    { id: 'payroll-summary', icon: '💵', label: 'Payroll Summary', desc: 'Pay history', color: '#ef4444', cat: 'Confidential' },
    { id: 'employee-costs', icon: '📊', label: 'Employee Costs', desc: 'Total labor costs', color: '#8b5cf6', cat: 'Confidential' },
  ];

  const dataSources = [
    { id: 'inventory', label: '🚗 Inventory', fields: ['year', 'make', 'model', 'vin', 'miles', 'purchase_price', 'list_price', 'sale_price', 'profit', 'status', 'stock_number', 'date_acquired', 'sale_date', 'created_at'] },
    { id: 'deals', label: '🤝 Deals', fields: ['purchaser_name', 'stage', 'date_of_sale', 'salesman', 'price', 'balance_due', 'archived', 'created_at'] },
    { id: 'bhph_loans', label: '📋 BHPH Loans', fields: ['client_name', 'term_months', 'interest_rate', 'purchase_price', 'down_payment', 'monthly_payment', 'balance', 'status', 'next_payment_date'] },
    { id: 'customers', label: '👥 Customers', fields: ['name', 'phone', 'email', 'address', 'created_at'] },
    { id: 'transactions', label: '💰 Transactions', fields: ['transaction_date', 'merchant_name', 'amount', 'status', 'is_income'] },
    ...(isManager ? [{ id: 'employees', label: '🧑‍🤝‍🧑 Employees', fields: ['name', 'roles', 'active', 'created_at'] }] : []),
    ...(isManager ? [{ id: 'time_clock', label: '⏰ Time Clock', fields: ['clock_in', 'clock_out', 'total_hours', 'paid'] }] : []),
    ...(isHR ? [{ id: 'paystubs', label: '💵 Paystubs (Confidential)', fields: ['pay_date', 'gross_pay', 'net_pay', 'federal_tax', 'state_tax'] }] : [])
  ];

  // `range` is passed in directly so a button click never runs with the previous range.
  function runReport(type, range = dateRange) {
    setLoading(true);
    setActiveReport(type);
    const { start, end } = getDateRange(range);
    const inRange = (v) => { const d = parseLocalDate(v); return !!d && d >= start && d <= end; };
    const periodSales = (deals || []).filter(d => isCompletedSale(d) && inRange(d.date_of_sale));
    const vehicleById = {};
    (inventory || []).forEach(v => { vehicleById[String(v.id)] = v; });
    let data = {};

    switch (type) {
      case 'profit-loss': {
        const expByVehicle = {};
        vehicleExpenses.forEach(e => { const k = String(e.inventory_id); expByVehicle[k] = (expByVehicle[k] || 0) + (parseFloat(e.amount) || 0); });
        let revenue = 0, vehicleCost = 0, vehicleExp = 0, missingVehicle = 0;
        periodSales.forEach(d => {
          const v = vehicleById[String(d.vehicle_id)];
          revenue += dealSalePrice(d);
          if (!v) { missingVehicle++; return; }
          vehicleCost += parseFloat(v.purchase_price) || 0;
          vehicleExp += expByVehicle[String(d.vehicle_id)] || 0;
        });
        // Bank activity shown for reference only: it includes car purchases, so adding it would double count.
        const bookedTxns = transactions.filter(t => t.status === 'booked' && inRange(t.transaction_date));
        const bankIn = bookedTxns.filter(t => t.is_income).reduce((sum, t) => sum + Math.abs(parseFloat(t.amount) || 0), 0);
        const bankOut = bookedTxns.filter(t => !t.is_income).reduce((sum, t) => sum + Math.abs(parseFloat(t.amount) || 0), 0);
        const soldIds = new Set((deals || []).filter(isCompletedSale).map(d => String(d.vehicle_id)));
        const soldWithoutDeal = (inventory || []).filter(v => v.status === 'Sold' && !soldIds.has(String(v.id))).length;
        data = { revenue, vehicleCost, vehicleExp, profit: revenue - vehicleCost - vehicleExp, dealCount: periodSales.length, missingVehicle, bankIn, bankOut, soldWithoutDeal };
        break;
      }
      case 'balance-sheet': {
        const onLot = (inventory || []).filter(v => ON_LOT_STATUSES.includes(v.status));
        const invValue = onLot.reduce((sum, v) => sum + (parseFloat(v.purchase_price) || 0), 0);
        const activeLoans = (bhphLoans || []).filter(l => l.status === 'Active');
        const bhphValue = activeLoans.reduce((sum, l) => sum + (parseFloat(l.balance) || 0), 0);
        data = { inventory: invValue, inventoryCount: onLot.length, bhph: bhphValue, bhphCount: activeLoans.length };
        break;
      }
      case 'expense-breakdown': {
        const expTxns = transactions.filter(t => t.status === 'booked' && !t.is_income && inRange(t.transaction_date));
        const byCategory = {};
        expTxns.forEach(t => { const cat = categories.find(c => c.id === t.category_id); const name = cat?.name || 'Other'; if (!byCategory[name]) byCategory[name] = { amount: 0, count: 0, icon: cat?.icon || '📁', color: cat?.color || '#6b7280' }; byCategory[name].amount += Math.abs(parseFloat(t.amount) || 0); byCategory[name].count++; });
        const total = Object.values(byCategory).reduce((sum, c) => sum + c.amount, 0);
        data = { total, categories: Object.entries(byCategory).map(([name, v]) => ({ name, ...v, percent: total > 0 ? (v.amount / total * 100) : 0 })).sort((a, b) => b.amount - a.amount) };
        break;
      }
      case 'inventory': {
        const inStock = (inventory || []).filter(v => ON_LOT_STATUSES.includes(v.status));
        const value = inStock.reduce((sum, v) => sum + (parseFloat(v.purchase_price) || 0), 0);
        data = { count: inStock.length, value, avgCost: inStock.length > 0 ? value / inStock.length : 0, vehicles: inStock };
        break;
      }
      case 'inventory-aging': {
        const inv = (inventory || []).filter(v => ON_LOT_STATUSES.includes(v.status));
        const now = new Date();
        const withAge = inv.map(v => {
          const acquired = parseLocalDate(v.date_acquired) || parseLocalDate(v.created_at);
          return { ...v, daysOnLot: acquired ? Math.max(0, Math.floor((now - acquired) / (1000 * 60 * 60 * 24))) : 0 };
        });
        data = { vehicles: withAge.sort((a, b) => b.daysOnLot - a.daysOnLot), avgDays: withAge.length > 0 ? Math.round(withAge.reduce((sum, v) => sum + v.daysOnLot, 0) / withAge.length) : 0, over30: withAge.filter(v => v.daysOnLot > 30).length, over60: withAge.filter(v => v.daysOnLot > 60).length, over90: withAge.filter(v => v.daysOnLot > 90).length };
        break;
      }
      case 'price-variance': {
        // Sale date = the vehicle's sale_date, or the date of its Sold/Delivered deal.
        const dealDateByVehicle = {};
        (deals || []).filter(isCompletedSale).forEach(d => { if (d.date_of_sale) dealDateByVehicle[String(d.vehicle_id)] = d.date_of_sale; });
        const sold = (inventory || []).filter(v => v.status === 'Sold' && v.list_price && v.sale_price);
        const soldDate = (v) => v.sale_date || dealDateByVehicle[String(v.id)] || null;
        const undated = sold.filter(v => !soldDate(v)).length;
        const soldVehicles = sold.filter(v => (range === 'all' ? true : inRange(soldDate(v))));
        const withVariance = soldVehicles.map(v => {
          const listPrice = parseFloat(v.list_price) || 0;
          const salePrice = parseFloat(v.sale_price) || 0;
          const cost = parseFloat(v.purchase_price) || 0;
          const discount = listPrice - salePrice;
          const discountPct = listPrice > 0 ? (discount / listPrice) * 100 : 0;
          const grossProfit = salePrice - cost;
          return { ...v, list_price: listPrice, sale_price: salePrice, purchase_price: cost, discount, discount_pct: discountPct, gross_profit: grossProfit };
        }).sort((a, b) => b.discount - a.discount);
        const totalListPrice = withVariance.reduce((sum, v) => sum + v.list_price, 0);
        const totalSalePrice = withVariance.reduce((sum, v) => sum + v.sale_price, 0);
        const totalDiscount = withVariance.reduce((sum, v) => sum + v.discount, 0);
        const totalCost = withVariance.reduce((sum, v) => sum + v.purchase_price, 0);
        const totalGrossProfit = totalSalePrice - totalCost;
        const avgDiscountPct = withVariance.length > 0 ? withVariance.reduce((sum, v) => sum + v.discount_pct, 0) / withVariance.length : 0;
        data = { vehicles: withVariance, count: withVariance.length, totalListPrice, totalSalePrice, totalDiscount, totalGrossProfit, avgDiscountPct, undated: range === 'all' ? 0 : undated };
        break;
      }
      case 'bhph-collection': {
        const activeLoans = (bhphLoans || []).filter(l => l.status === 'Active');
        data = { activeCount: activeLoans.length, totalOwed: activeLoans.reduce((sum, l) => sum + (parseFloat(l.balance) || 0), 0), monthlyExpected: activeLoans.reduce((sum, l) => sum + (parseFloat(l.monthly_payment) || 0), 0), loans: activeLoans.map(l => { const v = vehicleById[String(l.vehicle_id)]; return { ...l, balance: parseFloat(l.balance) || 0, monthly_payment: parseFloat(l.monthly_payment) || 0, vehicle: v ? `${v.year} ${v.make} ${v.model}` : 'Unknown' }; }).sort((a, b) => b.balance - a.balance) };
        break;
      }
      case 'deals-summary': {
        const rows = periodSales.map(d => ({ ...d, sale_price_display: dealSalePrice(d) })).sort((a, b) => String(b.date_of_sale).localeCompare(String(a.date_of_sale)));
        data = { count: rows.length, totalRevenue: rows.reduce((sum, d) => sum + d.sale_price_display, 0), deals: rows };
        break;
      }
      case 'salesman-performance': {
        const bySalesman = {};
        periodSales.forEach(d => { const name = d.salesman || 'Unknown'; if (!bySalesman[name]) bySalesman[name] = { deals: 0, revenue: 0 }; bySalesman[name].deals++; bySalesman[name].revenue += dealSalePrice(d); });
        data = { salespeople: Object.entries(bySalesman).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue) };
        break;
      }
      case 'customer-list': {
        data = { customers: [...(customers || [])].sort((a, b) => (a.name || '').localeCompare(b.name || '')), count: (customers || []).length };
        break;
      }
      case 'team-roster': {
        data = { employees: employees || [], activeCount: (employees || []).filter(e => e.active).length, totalCount: (employees || []).length };
        break;
      }
      case 'time-summary': {
        const periodTime = timeEntries.filter(t => t.clock_in && inRange(t.clock_in));
        const byEmployee = {};
        periodTime.forEach(t => { const name = t.employees?.name || 'Unknown'; if (!byEmployee[name]) byEmployee[name] = { hours: 0, entries: 0, open: 0 }; byEmployee[name].hours += parseFloat(t.total_hours) || 0; byEmployee[name].entries++; if (!t.clock_out) byEmployee[name].open++; });
        data = { totalHours: periodTime.reduce((sum, t) => sum + (parseFloat(t.total_hours) || 0), 0), openShifts: periodTime.filter(t => !t.clock_out).length, byEmployee: Object.entries(byEmployee).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.hours - a.hours) };
        break;
      }
      case 'commissions': {
        const periodComms = commissions.filter(c => inRange(c.created_at));
        const byEmployee = {};
        periodComms.forEach(c => { const name = c.employees?.name || c.employee_name || 'Unknown'; if (!byEmployee[name]) byEmployee[name] = { amount: 0, deals: 0 }; byEmployee[name].amount += parseFloat(c.amount) || 0; byEmployee[name].deals++; });
        data = { total: periodComms.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0), byEmployee: Object.entries(byEmployee).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.amount - a.amount) };
        break;
      }
      case 'payroll-summary': {
        if (!isHR) { data = { error: 'Access denied' }; break; }
        const periodStubs = paystubs.filter(p => inRange(p.pay_date));
        data = { totalPaid: periodStubs.reduce((sum, p) => sum + (parseFloat(p.net_pay) || 0), 0), totalGross: periodStubs.reduce((sum, p) => sum + (parseFloat(p.gross_pay) || 0), 0), paycheckCount: periodStubs.length };
        break;
      }
      case 'employee-costs': {
        if (!isHR) { data = { error: 'Access denied' }; break; }
        const periodStubs = paystubs.filter(p => inRange(p.pay_date));
        const byEmployee = {};
        periodStubs.forEach(p => { const name = p.employees?.name || 'Unknown'; if (!byEmployee[name]) byEmployee[name] = { gross: 0, net: 0, count: 0 }; byEmployee[name].gross += parseFloat(p.gross_pay) || 0; byEmployee[name].net += parseFloat(p.net_pay) || 0; byEmployee[name].count++; });
        data = { byEmployee: Object.entries(byEmployee).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.gross - a.gross), totalCost: periodStubs.reduce((sum, p) => sum + (parseFloat(p.gross_pay) || 0), 0) };
        break;
      }
      default: break;
    }
    setReportData(data);
    setLoading(false);
  }

  // `config` and `range` are passed in directly so a saved report or a range click never uses stale state.
  function runCustomReport(config = customReport, range = dateRange) {
    if (!config.dataSource) return;
    setLoading(true);
    let sourceData = [];
    switch (config.dataSource) {
      case 'inventory': sourceData = inventory || []; break;
      case 'deals': sourceData = deals || []; break;
      case 'bhph_loans': sourceData = bhphLoans || []; break;
      case 'customers': sourceData = customers || []; break;
      case 'transactions': sourceData = transactions; break;
      case 'employees': sourceData = isManager ? (employees || []) : []; break;
      case 'time_clock': sourceData = isManager ? timeEntries : []; break;
      case 'paystubs': sourceData = isHR ? paystubs : []; break;
      default: break;
    }
    const { start, end } = getDateRange(range);
    const dateField = config.dataSource === 'transactions' ? 'transaction_date' : config.dataSource === 'deals' ? 'date_of_sale' : config.dataSource === 'time_clock' ? 'clock_in' : config.dataSource === 'paystubs' ? 'pay_date' : 'created_at';
    sourceData = sourceData.filter(item => { const d = parseLocalDate(item[dateField]); return d && d >= start && d <= end; });
    if (config.sortBy) { sourceData = [...sourceData].sort((a, b) => { const aVal = a[config.sortBy]; const bVal = b[config.sortBy]; if (typeof aVal === 'number' && typeof bVal === 'number') return config.sortDir === 'asc' ? aVal - bVal : bVal - aVal; return config.sortDir === 'asc' ? String(aVal ?? '').localeCompare(String(bVal ?? '')) : String(bVal ?? '').localeCompare(String(aVal ?? '')); }); }
    let grouped = null;
    if (config.groupBy) { grouped = {}; sourceData.forEach(item => { const key = item[config.groupBy] ?? 'Unknown'; if (!grouped[key]) grouped[key] = []; grouped[key].push(item); }); }
    setCustomResults({ data: sourceData, grouped, fields: config.fields.length > 0 ? config.fields : dataSources.find(d => d.id === config.dataSource)?.fields || [] });
    setActiveReport('custom');
    setLoading(false);
  }

  function changeRange(range) {
    setDateRange(range);
    if (activeReport === 'custom') runCustomReport(customReport, range);
    else if (activeReport) runReport(activeReport, range);
  }

  function exportCSV() {
    if (!customResults) return;
    const esc = (v) => { const s = Array.isArray(v) ? v.join('; ') : String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const headers = customResults.fields;
    const rows = customResults.data.map(item => headers.map(h => esc(item[h])).join(','));
    const csv = [headers.map(esc).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `report-${toYMD(new Date())}.csv`; a.click();
  }

  async function saveReport() {
    if (!customReport.name || !customReport.dataSource) return;
    setSavingReport(true);
    const { error } = await supabase.from('saved_reports').insert({
      dealer_id: dealerId,
      name: customReport.name,
      data_source: customReport.dataSource,
      fields: customReport.fields,
      group_by: customReport.groupBy,
      sort_by: customReport.sortBy,
      sort_dir: customReport.sortDir,
      created_by: currentEmployee?.id || null
    });
    setSavingReport(false);
    if (error) { alert('Could not save the report: ' + error.message); return; }
    setShowSaveDialog(false);
    setCustomReport({ ...customReport, name: '' });
    fetchData();
  }

  async function deleteSavedReport(saved) {
    if (!confirm(`Delete the saved report "${saved.name}"? This can't be undone.`)) return;
    const { error } = await supabase.from('saved_reports').delete().eq('id', saved.id).eq('dealer_id', dealerId);
    if (error) { alert('Could not delete the report: ' + error.message); return; }
    fetchData();
  }

  function savedToConfig(saved) {
    return {
      dataSource: saved.data_source,
      fields: saved.fields || [],
      groupBy: saved.group_by,
      sortBy: saved.sort_by,
      sortDir: saved.sort_dir || 'desc',
      name: saved.name
    };
  }

  function loadSavedReport(saved) {
    setCustomReport(savedToConfig(saved));
    setActiveTab('custom');
  }

  function runSavedReport(saved) {
    const config = savedToConfig(saved);
    setCustomReport(config);
    runCustomReport(config);
  }

  const tabs = [
    { id: 'premade', label: '📋 Pre-Made Reports', color: '#22c55e' },
    ...(isManager && savedReports.length > 0 ? [{ id: 'saved', label: `⭐ My Reports (${savedReports.length})`, color: '#f97316' }] : []),
    ...(isManager ? [{ id: 'custom', label: '🔧 Custom Builder', color: '#8b5cf6' }] : []),
    ...(isHR ? [{ id: 'confidential', label: '🔒 Confidential', color: '#ef4444' }] : [])
  ];

  const Stat = ({ label, value, color }) => <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '20px', border: `1px solid ${theme.border}` }}><div style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '8px' }}>{label}</div><div style={{ color: color || theme.text, fontSize: '28px', fontWeight: '700' }}>{value}</div></div>;
  const Note = ({ children }) => <p style={{ color: theme.textMuted, fontSize: '13px', margin: '0 0 20px', lineHeight: 1.5 }}>{children}</p>;

  return (
    <div style={{ padding: '24px', backgroundColor: theme.bg, minHeight: '100vh' }}>
      {/* Access Control */}
      {!canViewFinancials ? (
        <div style={{ maxWidth: '600px', margin: '100px auto', textAlign: 'center' }}>
          <div style={{ fontSize: '64px', marginBottom: '24px' }}>🔒</div>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: theme.text, marginBottom: '16px' }}>Access Restricted</h1>
          <p style={{ color: theme.textMuted, fontSize: '16px', lineHeight: '1.6', marginBottom: '24px' }}>
            This page contains sensitive financial reports and is only accessible to authorized personnel.
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
        <div><h1 style={{ fontSize: '28px', fontWeight: '700', color: theme.text, margin: 0 }}>Reports</h1><p style={{ color: theme.textMuted, margin: '4px 0 0', fontSize: '14px' }}>Pick a report or build your own. The date buttons set which dates are counted.</p></div>
        {isManager && (
          <button onClick={() => { setActiveTab('custom'); setActiveReport(null); setReportData(null); setCustomResults(null); }} style={{ padding: '12px 24px', backgroundColor: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '15px' }}>🔧 Build Your Own</button>
        )}
      </div>

      {loadError && <div style={{ padding: '12px 16px', marginBottom: '16px', backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#ef4444', fontSize: '14px' }}>{loadError}</div>}

      <div style={{ marginBottom: '24px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {[{ id: 'week', label: 'Last 7 Days' }, { id: 'month', label: 'This Month' }, { id: 'quarter', label: 'Quarter' }, { id: 'year', label: 'Year' }, { id: 'all', label: 'All Time' }].map(r => (
          <button key={r.id} onClick={() => changeRange(r.id)} style={{ padding: '8px 16px', backgroundColor: dateRange === r.id ? theme.accent : 'transparent', color: dateRange === r.id ? '#fff' : theme.textSecondary, border: `1px solid ${dateRange === r.id ? theme.accent : theme.border}`, borderRadius: '6px', fontWeight: '500', cursor: 'pointer', fontSize: '13px' }}>{r.label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {tabs.map(tab => (<button key={tab.id} onClick={() => { setActiveTab(tab.id); setActiveReport(null); setReportData(null); }} style={{ padding: '12px 20px', backgroundColor: activeTab === tab.id ? tab.color : 'transparent', color: activeTab === tab.id ? '#fff' : theme.textSecondary, border: `1px solid ${activeTab === tab.id ? tab.color : theme.border}`, borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>{tab.label}</button>))}
      </div>

      {activeTab === 'premade' && !activeReport && (
        <div>
          {['Financial', 'Inventory', 'BHPH', 'Sales', 'Customers', 'Team'].map(cat => (
            <div key={cat} style={{ marginBottom: '24px' }}>
              <h3 style={{ color: theme.textSecondary, fontSize: '14px', fontWeight: '600', marginBottom: '12px', textTransform: 'uppercase' }}>{cat}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '12px' }}>
                {premadeReports.filter(r => r.cat === cat).map(r => (
                  <button key={r.id} onClick={() => runReport(r.id)} style={{ padding: '16px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: `${r.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>{r.icon}</div>
                    <div><div style={{ color: theme.text, fontWeight: '600' }}>{r.label}</div><div style={{ color: theme.textMuted, fontSize: '12px' }}>{r.desc}</div></div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'saved' && isManager && !activeReport && (
        <div>
          <div style={{ marginBottom: '16px', padding: '16px', backgroundColor: 'rgba(249, 115, 22, 0.1)', borderRadius: '12px', border: '1px solid rgba(249, 115, 22, 0.3)' }}><div style={{ color: theme.accent, fontWeight: '600' }}>⭐ Your Saved Reports</div><div style={{ color: theme.textSecondary, fontSize: '14px' }}>Click Run to see a report again for the dates selected above</div></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            {savedReports.map(saved => (
              <div key={saved.id} style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '20px', border: `1px solid ${theme.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                  <div>
                    <div style={{ color: theme.text, fontWeight: '600', fontSize: '16px' }}>{saved.name}</div>
                    <div style={{ color: theme.textMuted, fontSize: '12px' }}>{dataSources.find(d => d.id === saved.data_source)?.label || saved.data_source}</div>
                  </div>
                  <button onClick={() => deleteSavedReport(saved)} title="Delete saved report" style={{ padding: '4px 8px', backgroundColor: 'transparent', color: theme.textMuted, border: 'none', cursor: 'pointer', fontSize: '14px' }}>🗑</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '12px' }}>
                  {(saved.fields || []).slice(0, 4).map(f => <span key={f} style={{ padding: '2px 8px', backgroundColor: theme.bg, borderRadius: '4px', fontSize: '11px', color: theme.textSecondary }}>{f}</span>)}
                  {(saved.fields?.length || 0) > 4 && <span style={{ padding: '2px 8px', backgroundColor: theme.bg, borderRadius: '4px', fontSize: '11px', color: theme.textMuted }}>+{saved.fields.length - 4}</span>}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => runSavedReport(saved)} style={{ flex: 1, padding: '10px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>▶ Run</button>
                  <button onClick={() => loadSavedReport(saved)} style={{ padding: '10px 16px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '6px', cursor: 'pointer' }}>✎ Edit</button>
                </div>
              </div>
            ))}
          </div>
          {savedReports.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted, backgroundColor: theme.bgCard, borderRadius: '12px' }}>No saved reports yet. Build a custom report and save it.</div>}
        </div>
      )}

      {activeTab === 'custom' && isManager && !activeReport && (
        <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', padding: '24px', border: `1px solid ${theme.border}` }}>
          <h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '700', marginBottom: '20px' }}>🔧 Build Your Own Report</h2>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', color: theme.textSecondary, fontSize: '13px', marginBottom: '8px' }}>1. Pick Your Data</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
              {dataSources.map(ds => (<button key={ds.id} onClick={() => setCustomReport({ ...customReport, dataSource: ds.id, fields: [], groupBy: null, sortBy: null })} style={{ padding: '12px', backgroundColor: customReport.dataSource === ds.id ? `${theme.accent}30` : theme.bg, border: `1px solid ${customReport.dataSource === ds.id ? theme.accent : theme.border}`, borderRadius: '8px', cursor: 'pointer', color: customReport.dataSource === ds.id ? theme.accent : theme.text, fontWeight: '500' }}>{ds.label}</button>))}
            </div>
          </div>
          {customReport.dataSource && (
            <>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '13px', marginBottom: '8px' }}>2. Select Fields</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {dataSources.find(d => d.id === customReport.dataSource)?.fields.map(f => (<button key={f} onClick={() => setCustomReport({ ...customReport, fields: customReport.fields.includes(f) ? customReport.fields.filter(x => x !== f) : [...customReport.fields, f] })} style={{ padding: '8px 12px', backgroundColor: customReport.fields.includes(f) ? theme.accent : theme.bg, color: customReport.fields.includes(f) ? '#fff' : theme.textSecondary, border: `1px solid ${customReport.fields.includes(f) ? theme.accent : theme.border}`, borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>{f}</button>))}
                </div>
              </div>
              <div style={{ marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ display: 'block', color: theme.textSecondary, fontSize: '13px', marginBottom: '8px' }}>Group By</label>
                  <select value={customReport.groupBy || ''} onChange={e => setCustomReport({ ...customReport, groupBy: e.target.value || null })} style={{ padding: '12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, width: '180px' }}>
                    <option value="">No grouping</option>
                    {dataSources.find(d => d.id === customReport.dataSource)?.fields.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', color: theme.textSecondary, fontSize: '13px', marginBottom: '8px' }}>Sort By</label>
                  <select value={customReport.sortBy || ''} onChange={e => setCustomReport({ ...customReport, sortBy: e.target.value || null })} style={{ padding: '12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, width: '180px' }}>
                    <option value="">Default</option>
                    {dataSources.find(d => d.id === customReport.dataSource)?.fields.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button onClick={() => runCustomReport()} disabled={!customReport.dataSource} style={{ padding: '16px 32px', backgroundColor: customReport.dataSource ? '#8b5cf6' : theme.border, color: customReport.dataSource ? '#fff' : theme.textMuted, border: 'none', borderRadius: '8px', fontWeight: '600', cursor: customReport.dataSource ? 'pointer' : 'not-allowed', fontSize: '16px' }}>🚀 Run Report</button>
            {customReport.dataSource && (
              <button onClick={() => setShowSaveDialog(true)} style={{ padding: '16px 24px', backgroundColor: 'transparent', color: '#22c55e', border: '2px solid #22c55e', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '16px' }}>💾 Save Report</button>
            )}
          </div>

          {/* Save Dialog */}
          {showSaveDialog && (
            <div style={{ marginTop: '16px', padding: '16px', backgroundColor: theme.bg, borderRadius: '12px', border: `2px solid #22c55e` }}>
              <div style={{ color: theme.text, fontWeight: '600', marginBottom: '12px' }}>Save This Report</div>
              <input
                type="text"
                value={customReport.name}
                onChange={e => setCustomReport({ ...customReport, name: e.target.value })}
                placeholder="Report name (e.g., Monthly Inventory Check)"
                style={{ width: '100%', padding: '12px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', marginBottom: '12px' }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={saveReport} disabled={!customReport.name || savingReport} style={{ padding: '10px 20px', backgroundColor: customReport.name ? '#22c55e' : theme.border, color: customReport.name ? '#fff' : theme.textMuted, border: 'none', borderRadius: '6px', fontWeight: '600', cursor: customReport.name ? 'pointer' : 'not-allowed', opacity: savingReport ? 0.6 : 1 }}>{savingReport ? 'Saving...' : 'Save'}</button>
                <button onClick={() => setShowSaveDialog(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'confidential' && isHR && !activeReport && (
        <div>
          <div style={{ marginBottom: '16px', padding: '16px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.3)' }}><div style={{ color: '#ef4444', fontWeight: '600' }}>🔒 Confidential Reports - Admin/HR Only</div></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '12px' }}>
            {confidentialReports.map(r => (<button key={r.id} onClick={() => runReport(r.id)} style={{ padding: '16px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '12px' }}><div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: `${r.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>{r.icon}</div><div><div style={{ color: theme.text, fontWeight: '600' }}>{r.label}</div><div style={{ color: theme.textMuted, fontSize: '12px' }}>{r.desc}</div></div></button>))}
          </div>
        </div>
      )}

      {activeReport && (
        <div>
          <button onClick={() => { setActiveReport(null); setReportData(null); setCustomResults(null); }} style={{ marginBottom: '20px', padding: '8px 16px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '6px', cursor: 'pointer' }}>← Back</button>
          <span style={{ marginLeft: '12px', color: theme.textMuted, fontSize: '13px' }}>Dates: {RANGE_LABELS[dateRange]}</span>
          {loading ? <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted }}>⏳ Loading...</div> : (
            <>
              {activeReport === 'custom' && customResults && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}><h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '700', margin: 0 }}>Custom Report ({customResults.data.length} records)</h2><button onClick={exportCSV} style={{ padding: '10px 20px', backgroundColor: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>📥 Export CSV</button></div>
                  {customResults.grouped ? Object.entries(customResults.grouped).map(([group, items]) => (<div key={group} style={{ marginBottom: '24px' }}><h3 style={{ color: theme.accent, fontSize: '16px', marginBottom: '12px' }}>{group} ({items.length})</h3><DataTable data={items} fields={customResults.fields} theme={theme} f={formatCurrency} fd={formatDate} /></div>)) : <DataTable data={customResults.data} fields={customResults.fields} theme={theme} f={formatCurrency} fd={formatDate} />}
                </div>
              )}
              {reportData && activeReport !== 'custom' && (
                <>
                  {reportData.error && <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>🔒 {reportData.error}</div>}
                  {activeReport === 'profit-loss' && !reportData.error && (
                    <div><h2 style={{ color: theme.text, fontSize: '24px', marginBottom: '8px' }}>📊 Did I Make Money?</h2>
                      <Note>Profit = sale price of deals marked Sold or Delivered (by sale date) − what you paid for those cars − their recorded vehicle expenses. It does not include overhead like rent, payroll or commissions.</Note>
                      <div style={{ background: reportData.profit >= 0 ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', borderRadius: '20px', padding: '32px', textAlign: 'center', marginBottom: '24px' }}><div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '18px' }}>{reportData.profit >= 0 ? 'Yes! On cars sold you made' : 'Ouch. On cars sold you lost'}</div><div style={{ color: '#fff', fontSize: '48px', fontWeight: '800' }}>{formatCurrency(Math.abs(reportData.profit))}</div></div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}><Stat label="Car Sales" value={formatCurrency(reportData.revenue)} color="#22c55e" /><Stat label="What You Paid for Them" value={formatCurrency(reportData.vehicleCost)} color="#ef4444" /><Stat label="Vehicle Expenses" value={formatCurrency(reportData.vehicleExp)} color="#ef4444" /><Stat label="Cars Sold" value={reportData.dealCount} /></div>
                      {reportData.missingVehicle > 0 && <p style={{ color: '#eab308', fontSize: '13px', marginTop: '16px' }}>{reportData.missingVehicle} sold deal{reportData.missingVehicle === 1 ? ' has' : 's have'} no matching vehicle in Inventory, so the car cost is counted as $0 and profit may be too high.</p>}
                      {reportData.soldWithoutDeal > 0 && <p style={{ color: '#eab308', fontSize: '13px', marginTop: '8px' }}>Heads up: {reportData.soldWithoutDeal} vehicle{reportData.soldWithoutDeal === 1 ? ' is' : 's are'} marked Sold in Inventory without a Sold/Delivered deal. They are not counted here.</p>}
                      <div style={{ marginTop: '24px', padding: '16px', backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
                        <div style={{ color: theme.textSecondary, fontSize: '13px', marginBottom: '8px', fontWeight: '600' }}>Bank account activity (for reference, not part of the profit above)</div>
                        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '14px' }}>
                          <span style={{ color: theme.textSecondary }}>Money in: <strong style={{ color: '#22c55e' }}>{formatCurrency(reportData.bankIn)}</strong></span>
                          <span style={{ color: theme.textSecondary }}>Money out: <strong style={{ color: '#ef4444' }}>{formatCurrency(reportData.bankOut)}</strong></span>
                        </div>
                        <div style={{ color: theme.textMuted, fontSize: '12px', marginTop: '6px' }}>Only transactions you've booked on the Books page. Bank money out includes buying cars, so it isn't subtracted again.</div>
                      </div>
                    </div>
                  )}
                  {activeReport === 'balance-sheet' && !reportData.error && (
                    <div><h2 style={{ color: theme.text, fontSize: '24px', marginBottom: '8px' }}>⚖️ What Do I Own?</h2>
                      <Note>Cars on the lot (In Stock or For Sale) at what you paid for them, plus what BHPH customers still owe you. Always as of today.</Note>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}><Stat label={`Inventory (${reportData.inventoryCount})`} value={formatCurrency(reportData.inventory)} color="#22c55e" /><Stat label={`BHPH Owed (${reportData.bhphCount})`} value={formatCurrency(reportData.bhph)} color="#3b82f6" /></div>
                    </div>
                  )}
                  {activeReport === 'expense-breakdown' && !reportData.error && (
                    <div><h2 style={{ color: theme.text, fontSize: '24px', marginBottom: '8px' }}>💸 Where Did Money Go?</h2>
                      <Note>Money out of your bank accounts, from transactions you've booked on the Books page, grouped by category.</Note>
                      <Stat label="Total Spent" value={formatCurrency(reportData.total)} color="#ef4444" />
                      <div style={{ marginTop: '24px' }}>{reportData.categories.map(c => (<div key={c.name} style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '16px', marginBottom: '12px', border: `1px solid ${theme.border}` }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ fontSize: '20px' }}>{c.icon}</span><span style={{ color: theme.text, fontWeight: '600' }}>{c.name}</span><span style={{ color: theme.textMuted, fontSize: '12px' }}>({c.count})</span></div><span style={{ color: '#ef4444', fontWeight: '700' }}>{formatCurrency(c.amount)}</span></div><div style={{ height: '8px', backgroundColor: theme.bg, borderRadius: '4px', overflow: 'hidden' }}><div style={{ height: '100%', width: `${c.percent}%`, backgroundColor: c.color, borderRadius: '4px' }}></div></div></div>))}</div>
                    </div>
                  )}
                  {activeReport === 'inventory' && !reportData.error && (
                    <div><h2 style={{ color: theme.text, fontSize: '24px', marginBottom: '8px' }}>🚗 Inventory</h2>
                      <Note>Cars on the lot right now (In Stock or For Sale). Value is what you paid.</Note>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '24px' }}><Stat label="On the Lot" value={reportData.count} color={theme.accent} /><Stat label="Total Cost" value={formatCurrency(reportData.value)} color="#22c55e" /><Stat label="Avg Cost" value={formatCurrency(reportData.avgCost)} /></div>
                      <DataTable data={reportData.vehicles} fields={['year', 'make', 'model', 'miles', 'purchase_price', 'list_price', 'sale_price', 'status']} theme={theme} f={formatCurrency} fd={formatDate} />
                    </div>
                  )}
                  {activeReport === 'inventory-aging' && !reportData.error && (
                    <div><h2 style={{ color: theme.text, fontSize: '24px', marginBottom: '8px' }}>📅 Inventory Aging</h2>
                      <Note>How long each car on the lot has been sitting, counted from its acquired date.</Note>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '24px' }}><Stat label="Avg Days on Lot" value={reportData.avgDays} /><Stat label="Over 30 Days" value={reportData.over30} color="#eab308" /><Stat label="Over 60 Days" value={reportData.over60} color="#f97316" /><Stat label="Over 90 Days" value={reportData.over90} color="#ef4444" /></div>
                      <DataTable data={reportData.vehicles} fields={['year', 'make', 'model', 'daysOnLot', 'purchase_price', 'list_price', 'sale_price']} theme={theme} f={formatCurrency} fd={formatDate} />
                    </div>
                  )}
                  {activeReport === 'price-variance' && !reportData.error && (
                    <div><h2 style={{ color: theme.text, fontSize: '24px', marginBottom: '8px' }}>📉 Price Variance Report</h2>
                      <Note>Sold cars: the asking (list) price compared with what they actually sold for.{reportData.undated > 0 ? ` ${reportData.undated} sold car${reportData.undated === 1 ? ' has' : 's have'} no sale date and only show under All Time.` : ''}</Note>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                        <Stat label="Vehicles Sold" value={reportData.count} color="#ec4899" />
                        <Stat label="Total List Price" value={formatCurrency(reportData.totalListPrice)} />
                        <Stat label="Total Sale Price" value={formatCurrency(reportData.totalSalePrice)} color="#22c55e" />
                        <Stat label="Total Discount" value={formatCurrency(reportData.totalDiscount)} color="#ef4444" />
                        <Stat label="Avg Discount %" value={reportData.avgDiscountPct.toFixed(1) + '%'} color="#f97316" />
                        <Stat label="Gross Profit" value={formatCurrency(reportData.totalGrossProfit)} color={reportData.totalGrossProfit >= 0 ? '#22c55e' : '#ef4444'} />
                      </div>
                      {reportData.vehicles.length > 0 ? (
                        <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, overflow: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                            <thead><tr style={{ backgroundColor: theme.bg }}>
                              {['Vehicle', 'Cost', 'List Price', 'Sale Price', 'Discount $', 'Discount %', 'Gross Profit'].map(h => (
                                <th key={h} style={{ padding: '12px 16px', textAlign: h === 'Vehicle' ? 'left' : 'right', color: theme.textMuted, fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>{reportData.vehicles.slice(0, 100).map((v, i) => (
                              <tr key={i} style={{ borderTop: `1px solid ${theme.border}` }}>
                                <td style={{ padding: '12px 16px', color: theme.text, fontWeight: '500' }}>{v.year} {v.make} {v.model}{v.stock_number ? ` (#${v.stock_number})` : ''}</td>
                                <td style={{ padding: '12px 16px', color: theme.text, textAlign: 'right' }}>{formatCurrency(v.purchase_price)}</td>
                                <td style={{ padding: '12px 16px', color: theme.textSecondary, textAlign: 'right' }}>{formatCurrency(v.list_price)}</td>
                                <td style={{ padding: '12px 16px', color: '#22c55e', textAlign: 'right', fontWeight: '600' }}>{formatCurrency(v.sale_price)}</td>
                                <td style={{ padding: '12px 16px', color: v.discount > 0 ? '#ef4444' : '#22c55e', textAlign: 'right', fontWeight: '600' }}>{v.discount > 0 ? '-' : '+'}{formatCurrency(Math.abs(v.discount))}</td>
                                <td style={{ padding: '12px 16px', color: v.discount_pct > 10 ? '#ef4444' : v.discount_pct > 5 ? '#f97316' : theme.textSecondary, textAlign: 'right' }}>{v.discount_pct.toFixed(1)}%</td>
                                <td style={{ padding: '12px 16px', color: v.gross_profit >= 0 ? '#22c55e' : '#ef4444', textAlign: 'right', fontWeight: '700' }}>{formatCurrency(v.gross_profit)}</td>
                              </tr>
                            ))}</tbody>
                            <tfoot><tr style={{ borderTop: `2px solid ${theme.border}`, backgroundColor: theme.bg }}>
                              <td style={{ padding: '12px 16px', color: theme.text, fontWeight: '700' }}>TOTALS ({reportData.count} vehicles)</td>
                              <td style={{ padding: '12px 16px', color: theme.text, textAlign: 'right', fontWeight: '600' }}>{formatCurrency(reportData.vehicles.reduce((s, v) => s + v.purchase_price, 0))}</td>
                              <td style={{ padding: '12px 16px', color: theme.textSecondary, textAlign: 'right', fontWeight: '600' }}>{formatCurrency(reportData.totalListPrice)}</td>
                              <td style={{ padding: '12px 16px', color: '#22c55e', textAlign: 'right', fontWeight: '700' }}>{formatCurrency(reportData.totalSalePrice)}</td>
                              <td style={{ padding: '12px 16px', color: '#ef4444', textAlign: 'right', fontWeight: '700' }}>-{formatCurrency(reportData.totalDiscount)}</td>
                              <td style={{ padding: '12px 16px', color: theme.textSecondary, textAlign: 'right', fontWeight: '600' }}>{reportData.avgDiscountPct.toFixed(1)}%</td>
                              <td style={{ padding: '12px 16px', color: reportData.totalGrossProfit >= 0 ? '#22c55e' : '#ef4444', textAlign: 'right', fontWeight: '700' }}>{formatCurrency(reportData.totalGrossProfit)}</td>
                            </tr></tfoot>
                          </table>
                        </div>
                      ) : (
                        <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted, backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
                          <p style={{ fontSize: '16px', marginBottom: '8px' }}>No sold vehicles with list price data in this period</p>
                          <p style={{ fontSize: '13px' }}>Make sure to set a List Price on vehicles before marking them as Sold</p>
                        </div>
                      )}
                    </div>
                  )}
                  {activeReport === 'bhph-collection' && !reportData.error && (
                    <div><h2 style={{ color: theme.text, fontSize: '24px', marginBottom: '8px' }}>📋 Who Owes Me?</h2>
                      <Note>Active BHPH (buy here pay here) loans: what each customer still owes you, as of today.</Note>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '24px' }}><Stat label="Active Loans" value={reportData.activeCount} color={theme.accent} /><Stat label="Total Owed" value={formatCurrency(reportData.totalOwed)} color="#22c55e" /><Stat label="Monthly Expected" value={formatCurrency(reportData.monthlyExpected)} color="#3b82f6" /></div>
                      <DataTable data={reportData.loans} fields={['client_name', 'vehicle', 'balance', 'monthly_payment', 'next_payment_date']} theme={theme} f={formatCurrency} fd={formatDate} />
                    </div>
                  )}
                  {activeReport === 'deals-summary' && !reportData.error && (
                    <div><h2 style={{ color: theme.text, fontSize: '24px', marginBottom: '8px' }}>🤝 Deals Summary</h2>
                      <Note>Deals marked Sold or Delivered, by sale date. Leads and deals still being worked are not counted. Sale price is the vehicle price before tax, fees and add-ons.</Note>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '24px' }}><Stat label="Deals Closed" value={reportData.count} color={theme.accent} /><Stat label="Total Sales" value={formatCurrency(reportData.totalRevenue)} color="#22c55e" /></div>
                      <DataTable data={reportData.deals} fields={['purchaser_name', 'stage', 'date_of_sale', 'salesman', 'sale_price_display']} theme={theme} f={formatCurrency} fd={formatDate} />
                    </div>
                  )}
                  {activeReport === 'salesman-performance' && !reportData.error && (
                    <div><h2 style={{ color: theme.text, fontSize: '24px', marginBottom: '8px' }}>🏆 Salesman Performance</h2>
                      <Note>Deals marked Sold or Delivered in this period, by the salesperson on the deal.</Note>
                      {reportData.salespeople.length === 0 && <div style={{ padding: '20px', color: theme.textMuted, textAlign: 'center' }}>No sold deals in this period</div>}
                      {reportData.salespeople.map((s, i) => (<div key={s.name} style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '20px', marginBottom: '12px', border: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}><div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: i === 0 ? '#fbbf24' : i === 1 ? '#9ca3af' : i === 2 ? '#cd7f32' : theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', color: i < 3 ? '#000' : theme.text }}>{i + 1}</div><div><div style={{ color: theme.text, fontWeight: '600', fontSize: '18px' }}>{s.name}</div><div style={{ color: theme.textMuted, fontSize: '13px' }}>{s.deals} deals</div></div></div><div style={{ color: '#22c55e', fontSize: '24px', fontWeight: '700' }}>{formatCurrency(s.revenue)}</div></div>))}
                    </div>
                  )}
                  {activeReport === 'customer-list' && !reportData.error && (
                    <div><h2 style={{ color: theme.text, fontSize: '24px', marginBottom: '24px' }}>👥 Customers ({reportData.count})</h2>
                      <DataTable data={reportData.customers} fields={['name', 'phone', 'email', 'address']} theme={theme} f={formatCurrency} fd={formatDate} />
                    </div>
                  )}
                  {activeReport === 'team-roster' && !reportData.error && (
                    <div><h2 style={{ color: theme.text, fontSize: '24px', marginBottom: '24px' }}>🧑‍🤝‍🧑 Team ({reportData.activeCount} active)</h2>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>{reportData.employees.map(e => (<div key={e.id} style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '20px', border: `1px solid ${theme.border}` }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ color: theme.text, fontWeight: '600', fontSize: '18px' }}>{e.name}</div><div style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', backgroundColor: e.active ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)', color: e.active ? '#22c55e' : '#ef4444' }}>{e.active ? 'Active' : 'Inactive'}</div></div><div style={{ color: theme.textMuted, fontSize: '13px', marginTop: '8px' }}>{(e.roles || []).join(', ')}</div></div>))}</div>
                    </div>
                  )}
                  {activeReport === 'time-summary' && !reportData.error && (
                    <div><h2 style={{ color: theme.text, fontSize: '24px', marginBottom: '8px' }}>⏰ Time Summary</h2>
                      <Note>Hours from the Time Clock, by clock-in date.{reportData.openShifts > 0 ? ` ${reportData.openShifts} shift${reportData.openShifts === 1 ? ' is' : 's are'} still clocked in and not counted yet.` : ''}</Note>
                      <Stat label="Total Hours" value={Math.round(reportData.totalHours * 10) / 10} color={theme.accent} />
                      <div style={{ marginTop: '24px' }}>{reportData.byEmployee.map(e => (<div key={e.name} style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '16px', marginBottom: '12px', border: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div style={{ color: theme.text, fontWeight: '600' }}>{e.name}</div><div style={{ color: theme.textMuted, fontSize: '13px' }}>{e.entries} shift{e.entries === 1 ? '' : 's'}{e.open > 0 ? ` (${e.open} still open)` : ''}</div></div><div style={{ color: theme.accent, fontSize: '24px', fontWeight: '700' }}>{Math.round(e.hours * 10) / 10}h</div></div>))}</div>
                    </div>
                  )}
                  {activeReport === 'commissions' && !reportData.error && (
                    <div><h2 style={{ color: theme.text, fontSize: '24px', marginBottom: '8px' }}>💰 Commissions</h2>
                      <Note>Commissions entered on vehicles in Inventory, by the date they were entered.</Note>
                      <Stat label="Total Commissions" value={formatCurrency(reportData.total)} color={reportData.total < 0 ? '#ef4444' : '#22c55e'} />
                      <div style={{ marginTop: '24px' }}>{reportData.byEmployee.map(e => (<div key={e.name} style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '16px', marginBottom: '12px', border: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div style={{ color: theme.text, fontWeight: '600' }}>{e.name}</div><div style={{ color: theme.textMuted, fontSize: '13px' }}>{e.deals} {e.deals === 1 ? 'entry' : 'entries'}</div></div><div style={{ color: e.amount < 0 ? '#ef4444' : '#22c55e', fontSize: '24px', fontWeight: '700' }}>{formatCurrency(e.amount)}</div></div>))}</div>
                    </div>
                  )}
                  {activeReport === 'payroll-summary' && !reportData.error && (
                    <div><h2 style={{ color: theme.text, fontSize: '24px', marginBottom: '8px' }}>💵 Payroll Summary</h2>
                      <Note>Paystubs created by Run Payroll, by pay date. Taxes and net pay on paystubs are estimates.</Note>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}><Stat label="Est. Net Paid" value={formatCurrency(reportData.totalPaid)} color="#22c55e" /><Stat label="Gross Wages" value={formatCurrency(reportData.totalGross)} /><Stat label="Paychecks" value={reportData.paycheckCount} /></div>
                    </div>
                  )}
                  {activeReport === 'employee-costs' && !reportData.error && (
                    <div><h2 style={{ color: theme.text, fontSize: '24px', marginBottom: '8px' }}>📊 Employee Costs</h2>
                      <Note>Gross pay from paystubs, by pay date. Does not include employer-side payroll taxes.</Note>
                      <Stat label="Total Gross Pay" value={formatCurrency(reportData.totalCost)} color="#ef4444" />
                      <div style={{ marginTop: '24px' }}>{reportData.byEmployee.map(e => (<div key={e.name} style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '16px', marginBottom: '12px', border: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div style={{ color: theme.text, fontWeight: '600' }}>{e.name}</div><div style={{ color: theme.textMuted, fontSize: '13px' }}>{e.count} paychecks</div></div><div style={{ textAlign: 'right' }}><div style={{ color: '#ef4444', fontSize: '20px', fontWeight: '700' }}>{formatCurrency(e.gross)}</div><div style={{ color: theme.textMuted, fontSize: '13px' }}>Est. net: {formatCurrency(e.net)}</div></div></div>))}</div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
}

const FIELD_LABELS = { sale_price_display: 'sale price', daysOnLot: 'days on lot', client_name: 'customer', total_hours: 'hours' };

function DataTable({ data, fields, theme, f, fd }) {
  if (!data || data.length === 0) return <div style={{ padding: '20px', color: theme.textMuted, textAlign: 'center' }}>No data</div>;
  const isMoney = (fld) => fld.includes('price') || fld.includes('amount') || fld.includes('balance') || fld.includes('payment') || fld.includes('pay') || fld.includes('cost') || fld.includes('revenue') || fld.includes('tax') || fld === 'profit';
  return (
    <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
        <thead><tr style={{ backgroundColor: theme.bg }}>{fields.map(fld => <th key={fld} style={{ padding: '12px 16px', textAlign: 'left', color: theme.textMuted, fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>{FIELD_LABELS[fld] || fld.replace(/_/g, ' ')}</th>)}</tr></thead>
        <tbody>{data.slice(0, 100).map((item, i) => (
          <tr key={i} style={{ borderTop: `1px solid ${theme.border}` }}>{fields.map(fld => {
            let val = item[fld];
            if (typeof val === 'boolean') val = val ? 'Yes' : 'No';
            else if (Array.isArray(val)) val = val.join(', ');
            else if (val !== null && val !== undefined && val !== '' && isMoney(fld) && !isNaN(Number(val))) val = f(Number(val));
            else if (val && (fld.includes('date') || fld.endsWith('_at') || fld.startsWith('clock'))) {
              val = fld.startsWith('clock') || fld.endsWith('_at') ? new Date(val).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : fd(val);
            }
            return <td key={fld} style={{ padding: '12px 16px', color: theme.text }}>{val ?? '-'}</td>;
          })}</tr>
        ))}</tbody>
      </table>
      {data.length > 100 && <div style={{ padding: '12px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>Showing first 100 of {data.length}</div>}
    </div>
  );
}
