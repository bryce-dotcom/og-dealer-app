import { useState, useEffect } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useTheme } from '../components/Layout';
import { BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#f97316', '#3b82f6', '#22c55e', '#eab308', '#8b5cf6', '#ef4444', '#06b6d4'];

// A deal counts as a sale once it reaches one of these stages (same stage names as the Deals page).
// Archived deals are included: the Deals page only lets you archive a locked (finished) deal.
const SOLD_STAGES = ['Sold', 'Delivered'];
const ON_LOT_STATUSES = ['In Stock', 'For Sale'];
const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };

const pad2 = (n) => String(n).padStart(2, '0');
const toYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
// Date-only strings ("2026-02-12") are read as LOCAL dates, not UTC midnight.
const parseLocalDate = (s) => {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};
const dealSalePrice = (d) => parseFloat(d.vehicle_cash_price) || parseFloat(d.price) || parseFloat(d.sale_price) || 0;
const isCompletedSale = (d) => SOLD_STAGES.includes(d.stage) && !!d.date_of_sale;

export default function AdvancedAnalyticsPage() {
  const { dealerId, inventory, deals, bhphLoans, customers } = useStore();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [snapshots, setSnapshots] = useState([]);
  const [seasonalData, setSeasonalData] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [timeRange, setTimeRange] = useState('30d');

  useEffect(() => {
    if (dealerId) loadAnalytics();
  }, [dealerId, timeRange]);

  async function loadAnalytics() {
    setLoading(true);
    const daysBack = RANGE_DAYS[timeRange] || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Read-only. Nothing on this page writes snapshots.
    const [snapRes, seasonalRes, expRes] = await Promise.all([
      supabase.from('analytics_snapshots').select('*').eq('dealer_id', dealerId)
        .gte('snapshot_date', toYMD(startDate)).order('snapshot_date', { ascending: true }),
      supabase.from('seasonal_vehicle_patterns').select('*').eq('dealer_id', dealerId),
      supabase.from('inventory_expenses').select('inventory_id, amount').eq('dealer_id', dealerId)
    ]);
    const firstError = snapRes.error || seasonalRes.error || expRes.error;
    setLoadError(firstError ? 'Some analytics could not load: ' + firstError.message : '');
    setSnapshots(snapRes.data || []);
    setSeasonalData(seasonalRes.data || []);
    setExpenses(expRes.data || []);
    setLoading(false);
  }

  function formatCurrency(val) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val || 0);
  }

  const rangeDays = RANGE_DAYS[timeRange] || 30;
  const rangeLabel = timeRange.toUpperCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rangeStart = new Date(today);
  rangeStart.setDate(rangeStart.getDate() - rangeDays);

  // Days on lot: from the acquired date when we have it, else from when the vehicle was added.
  const acquiredDate = (v) => parseLocalDate(v.date_acquired) || parseLocalDate(v.created_at);
  const daysOnLot = (v) => {
    const d = acquiredDate(v);
    return d ? Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000)) : 0;
  };

  // Vehicles on the lot = In Stock or For Sale.
  const activeInventory = (inventory || []).filter(v => ON_LOT_STATUSES.includes(v.status));
  const totalInventoryValue = activeInventory.reduce((s, v) => s + (parseFloat(v.sale_price || v.list_price || v.purchase_price) || 0), 0);
  const avgDaysOnLot = activeInventory.length > 0
    ? activeInventory.reduce((s, v) => s + daysOnLot(v), 0) / activeInventory.length
    : 0;
  const over60 = activeInventory.filter(v => daysOnLot(v) > 60).length;
  const over90 = activeInventory.filter(v => daysOnLot(v) > 90).length;

  // Profit per sale = sale price - what we paid for the vehicle - its recorded expenses.
  const vehicleById = {};
  (inventory || []).forEach(v => { vehicleById[String(v.id)] = v; });
  const expensesByVehicle = {};
  expenses.forEach(e => {
    const key = String(e.inventory_id);
    expensesByVehicle[key] = (expensesByVehicle[key] || 0) + (parseFloat(e.amount) || 0);
  });
  const dealProfit = (d) => {
    const v = vehicleById[String(d.vehicle_id)];
    const purchase = parseFloat(v?.purchase_price) || 0;
    const vehicleExpenses = expensesByVehicle[String(d.vehicle_id)] || 0;
    return dealSalePrice(d) - purchase - vehicleExpenses;
  };

  const completedSales = (deals || []).filter(isCompletedSale);
  const recentDeals = completedSales
    .filter(d => { const sd = parseLocalDate(d.date_of_sale); return sd && sd >= rangeStart; })
    .sort((a, b) => String(b.date_of_sale).localeCompare(String(a.date_of_sale)));
  const totalRevenue = recentDeals.reduce((s, d) => s + dealSalePrice(d), 0);
  const totalProfit = recentDeals.reduce((s, d) => s + dealProfit(d), 0);
  const avgProfit = recentDeals.length > 0 ? totalProfit / recentDeals.length : 0;
  const missingCost = recentDeals.filter(d => !vehicleById[String(d.vehicle_id)]).length;

  // bhph_loans status default is 'Active' (capitalized) and column is `balance`, not `remaining_balance`.
  const activeLoans = (bhphLoans || []).filter(l => l.status === 'Active');
  const totalLoanBalance = activeLoans.reduce((s, l) => s + (parseFloat(l.balance) || 0), 0);
  const overdueLoans = activeLoans.filter(l => { const due = parseLocalDate(l.next_payment_date); return due && due < today; });

  // Make distribution for pie chart
  const makeDistribution = {};
  activeInventory.forEach(v => {
    const make = v.make || 'Unknown';
    makeDistribution[make] = (makeDistribution[make] || 0) + 1;
  });
  const makePieData = Object.entries(makeDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([name, value]) => ({ name, value }));

  // Revenue & profit by month of the sale date (last 12 months with sales, oldest first).
  const byMonth = {};
  completedSales.forEach(d => {
    const sd = parseLocalDate(d.date_of_sale);
    if (!sd) return;
    const key = `${sd.getFullYear()}-${pad2(sd.getMonth() + 1)}`;
    if (!byMonth[key]) byMonth[key] = { key, month: sd.toLocaleDateString('en-US', { year: '2-digit', month: 'short' }), revenue: 0, profit: 0, count: 0 };
    byMonth[key].revenue += dealSalePrice(d);
    byMonth[key].profit += dealProfit(d);
    byMonth[key].count++;
  });
  const monthlyData = Object.values(byMonth).sort((a, b) => a.key.localeCompare(b.key)).slice(-12);

  // Chart data from snapshots (none are being recorded right now; see empty state below).
  const chartData = snapshots.map(s => ({
    date: (parseLocalDate(s.snapshot_date) || new Date(s.snapshot_date)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    inventory: s.total_vehicles
  }));

  const Card = ({ children, style = {} }) => (
    <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px', color: theme.text, ...style }}>
      {children}
    </div>
  );

  return (
    <div style={{ padding: '24px', backgroundColor: theme.bg, minHeight: '100vh', color: theme.text }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0, color: theme.text }}>Advanced Analytics</h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', margin: '4px 0 0' }}>How your lot, sales and BHPH loans are doing. The buttons on the right pick how far back sales are counted.</p>
        </div>
        <div style={{ display: 'flex', gap: '4px', backgroundColor: theme.bgCard, borderRadius: '8px', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
          {[
            { value: '7d', label: '7D' },
            { value: '30d', label: '30D' },
            { value: '90d', label: '90D' },
            { value: '1y', label: '1Y' },
          ].map(r => (
            <button key={r.value} onClick={() => setTimeRange(r.value)} title={`Last ${RANGE_DAYS[r.value]} days`} style={{
              padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
              backgroundColor: timeRange === r.value ? theme.accent : 'transparent',
              color: timeRange === r.value ? '#fff' : theme.textSecondary,
            }}>{r.label}</button>
          ))}
        </div>
      </div>

      {loadError && <div style={{ padding: '12px 16px', marginBottom: '16px', backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#ef4444', fontSize: '14px' }}>{loadError}</div>}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '8px' }}>
        {[
          { label: 'On the Lot', value: activeInventory.length, sub: `${formatCurrency(totalInventoryValue)} asking`, color: theme.accent },
          { label: 'Avg Days on Lot', value: Math.round(avgDaysOnLot), sub: `${over60} over 60d | ${over90} over 90d`, color: over90 > 0 ? '#ef4444' : '#22c55e' },
          { label: `Sold (${rangeLabel})`, value: recentDeals.length, sub: formatCurrency(totalRevenue) + ' in sales', color: '#3b82f6' },
          { label: `Profit (${rangeLabel})`, value: formatCurrency(totalProfit), sub: `${formatCurrency(avgProfit)} avg/vehicle`, color: totalProfit < 0 ? '#ef4444' : '#22c55e' },
          { label: 'BHPH Loans', value: activeLoans.length, sub: formatCurrency(totalLoanBalance) + ' balance', color: '#8b5cf6' },
          { label: 'Overdue', value: overdueLoans.length, sub: `${activeLoans.length > 0 ? ((overdueLoans.length / activeLoans.length) * 100).toFixed(1) : 0}% behind on payments`, color: overdueLoans.length > 0 ? '#ef4444' : '#22c55e' },
          { label: 'Customers', value: (customers || []).length, sub: 'total in database', color: '#06b6d4' },
        ].map((kpi, i) => (
          <Card key={i}>
            <div style={{ color: theme.textMuted, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>{kpi.label}</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: kpi.color }}>{kpi.value}</div>
            <div style={{ color: theme.textMuted, fontSize: '12px', marginTop: '2px' }}>{kpi.sub}</div>
          </Card>
        ))}
      </div>
      <p style={{ color: theme.textMuted, fontSize: '12px', margin: '0 0 24px' }}>
        Sold = deals marked Sold or Delivered, by sale date. Profit = sale price − what you paid for the vehicle − its recorded expenses (not overhead or commissions). On the lot = In Stock or For Sale.
        {missingCost > 0 && ` ${missingCost} sale${missingCost === 1 ? " has" : 's have'} no matching vehicle in Inventory, so cost is counted as $0.`}
      </p>

      {/* Charts Row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '16px' }}>
        {/* Revenue & Profit Trend */}
        <Card>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: theme.text }}>Sales & Profit by Month</h3>
          {monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                <XAxis dataKey="month" stroke={theme.textMuted} fontSize={12} />
                <YAxis stroke={theme.textMuted} fontSize={12} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }}
                  formatter={(v, name) => [formatCurrency(v), name]} />
                <Legend />
                <Bar dataKey="revenue" fill="#3b82f6" name="Sales" radius={[4, 4, 0, 0]} />
                <Bar dataKey="profit" fill="#22c55e" name="Profit" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted, textAlign: 'center' }}>No deals marked Sold or Delivered yet</div>
          )}
        </Card>

        {/* Inventory Trend */}
        <Card>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: theme.text }}>Inventory Level Trend</h3>
          {chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                <XAxis dataKey="date" stroke={theme.textMuted} fontSize={12} />
                <YAxis stroke={theme.textMuted} fontSize={12} />
                <Tooltip contentStyle={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
                <Area type="monotone" dataKey="inventory" stroke={theme.accent} fill={`${theme.accent}20`} strokeWidth={2} name="Vehicles" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: theme.textMuted, textAlign: 'center', padding: '0 16px', gap: '8px' }}>
              <div>No history to chart yet.</div>
              <div style={{ fontSize: '12px' }}>OG Dealer doesn't save a daily count of your lot yet, so there's no trend to show. Today you have {activeInventory.length} vehicle{activeInventory.length === 1 ? '' : 's'} on the lot.</div>
            </div>
          )}
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '16px' }}>
        {/* Make Distribution */}
        <Card>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: theme.text }}>Inventory by Make</h3>
          {makePieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={makePieData} cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={2} dataKey="value">
                    {makePieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                {makePieData.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: COLORS[i % COLORS.length] }} />
                      <span style={{ color: theme.textSecondary }}>{item.name}</span>
                    </div>
                    <span style={{ fontWeight: '600', color: theme.text }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>No vehicles on the lot</div>
          )}
        </Card>

        {/* BHPH Health */}
        <Card>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: theme.text }}>BHPH Portfolio Health</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', color: theme.textSecondary }}>Current Loans</span>
                <span style={{ fontWeight: '700', fontSize: '20px', color: theme.text }}>{activeLoans.length}</span>
              </div>
              <div style={{ height: '8px', backgroundColor: theme.bg, borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: '4px',
                  width: activeLoans.length > 0 ? `${Math.max(((activeLoans.length - overdueLoans.length) / activeLoans.length) * 100, 5)}%` : '0%',
                  backgroundColor: '#22c55e',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '11px', color: theme.textMuted }}>
                <span>{activeLoans.length - overdueLoans.length} current</span>
                <span style={{ color: '#ef4444' }}>{overdueLoans.length} overdue</span>
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '12px' }}>
              <div style={{ fontSize: '13px', color: theme.textSecondary, marginBottom: '4px' }}>Total Balance</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#8b5cf6' }}>{formatCurrency(totalLoanBalance)}</div>
            </div>

            <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '12px' }}>
              <div style={{ fontSize: '13px', color: theme.textSecondary, marginBottom: '4px' }}>Delinquency Rate (loans past their next due date)</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: overdueLoans.length > 0 ? '#ef4444' : '#22c55e' }}>
                {activeLoans.length > 0 ? ((overdueLoans.length / activeLoans.length) * 100).toFixed(1) : 0}%
              </div>
            </div>
          </div>
        </Card>

        {/* Aging Analysis */}
        <Card>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: theme.text }}>Inventory Aging (days on lot)</h3>
          {(() => {
            const buckets = [
              { label: '0-30 days', count: 0, color: '#22c55e' },
              { label: '31-60 days', count: 0, color: '#eab308' },
              { label: '61-90 days', count: 0, color: '#f97316' },
              { label: '90+ days', count: 0, color: '#ef4444' },
            ];
            activeInventory.forEach(v => {
              const days = daysOnLot(v);
              if (days <= 30) buckets[0].count++;
              else if (days <= 60) buckets[1].count++;
              else if (days <= 90) buckets[2].count++;
              else buckets[3].count++;
            });
            const total = activeInventory.length || 1;

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {buckets.map((b, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', color: theme.textSecondary }}>{b.label}</span>
                      <span style={{ fontWeight: '600', color: b.color }}>{b.count}</span>
                    </div>
                    <div style={{ height: '6px', backgroundColor: theme.bg, borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(b.count / total) * 100}%`, backgroundColor: b.color, borderRadius: '3px' }} />
                    </div>
                  </div>
                ))}
                <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '8px', fontSize: '12px', color: theme.textMuted }}>
                  Total: {activeInventory.length} vehicles | Avg: {Math.round(avgDaysOnLot)} days (counted from the acquired date)
                </div>
              </div>
            );
          })()}
        </Card>
      </div>

      {/* Seasonal Patterns */}
      {seasonalData.length > 0 && (
        <Card style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: theme.text }}>Seasonal Vehicle Patterns</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Make/Model</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Best Buy Months</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Best Sell Months</th>
                </tr>
              </thead>
              <tbody>
                {seasonalData.slice(0, 10).map(s => {
                  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                  return (
                    <tr key={s.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <td style={{ padding: '10px 12px', fontWeight: '600', fontSize: '14px', color: theme.text }}>{s.make} {s.model || ''}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {(s.best_buy_months || []).map(m => (
                            <span key={m} style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', backgroundColor: '#22c55e20', color: '#22c55e' }}>
                              {monthNames[m - 1]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {(s.best_sell_months || []).map(m => (
                            <span key={m} style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', backgroundColor: '#3b82f620', color: '#3b82f6' }}>
                              {monthNames[m - 1]}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Top Sellers Table */}
      {recentDeals.length > 0 && (
        <Card>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: theme.text }}>Recent Sales ({rangeLabel})</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Vehicle</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Sold</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Sale Price</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Profit</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Days on Lot</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Customer</th>
                </tr>
              </thead>
              <tbody>
                {recentDeals.slice(0, 10).map(d => {
                  // Look up the vehicle + buyer since deals doesn't carry vehicle_year/make/model or customer_name.
                  const veh = vehicleById[String(d.vehicle_id)];
                  const buyer = d.purchaser_name || (() => {
                    const c = (customers || []).find(c => c.id === d.customer_id);
                    return c ? (c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim()) : '';
                  })();
                  const acquired = veh ? acquiredDate(veh) : null;
                  const sold = parseLocalDate(d.date_of_sale);
                  const days = acquired && sold ? Math.max(0, Math.round((sold - acquired) / 86400000)) : null;
                  const profit = dealProfit(d);
                  return (
                  <tr key={d.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '10px 12px', fontWeight: '600', fontSize: '14px', color: theme.text }}>
                      {veh ? [veh.year, veh.make, veh.model].filter(Boolean).join(' ') : `Deal #${d.id}`}
                    </td>
                    <td style={{ padding: '10px 12px', color: theme.textSecondary }}>{sold ? sold.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</td>
                    <td style={{ padding: '10px 12px', color: '#3b82f6', fontWeight: '600' }}>{formatCurrency(dealSalePrice(d))}</td>
                    <td style={{ padding: '10px 12px', color: profit >= 0 ? '#22c55e' : '#ef4444', fontWeight: '600' }}>{veh ? formatCurrency(profit) : '-'}</td>
                    <td style={{ padding: '10px 12px', color: theme.textSecondary }}>{days != null ? `${days}d` : '-'}</td>
                    <td style={{ padding: '10px 12px', color: theme.textSecondary }}>{buyer || '-'}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {loading && <div style={{ textAlign: 'center', padding: '16px', color: theme.textMuted, fontSize: '13px' }}>Loading...</div>}
    </div>
  );
}
