import { useState, useEffect } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useTheme } from '../components/Layout';
import { LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#f97316', '#3b82f6', '#22c55e', '#eab308', '#8b5cf6', '#ef4444', '#06b6d4'];

export default function AdvancedAnalyticsPage() {
  const { dealerId, inventory, deals, bhphLoans, customers } = useStore();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [snapshots, setSnapshots] = useState([]);
  const [seasonalData, setSeasonalData] = useState([]);
  const [timeRange, setTimeRange] = useState('30d');

  useEffect(() => {
    if (dealerId) loadAnalytics();
  }, [dealerId, timeRange]);

  async function loadAnalytics() {
    try {
      setLoading(true);

      // Take fresh snapshot
      await supabase.rpc('take_analytics_snapshot', { p_dealer_id: dealerId });

      // Load historical snapshots
      const daysBack = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 365;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);

      const { data: snapshotData } = await supabase
        .from('analytics_snapshots')
        .select('*')
        .eq('dealer_id', dealerId)
        .gte('snapshot_date', startDate.toISOString().split('T')[0])
        .order('snapshot_date', { ascending: true });

      setSnapshots(snapshotData || []);

      // Load seasonal patterns
      const { data: seasonal } = await supabase
        .from('seasonal_vehicle_patterns')
        .select('*')
        .eq('dealer_id', dealerId);

      setSeasonalData(seasonal || []);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  }

  function formatCurrency(val) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(val || 0);
  }

  // Calculate live metrics from store data
  const activeInventory = (inventory || []).filter(v => v.status === 'In Stock');
  const totalInventoryValue = activeInventory.reduce((s, v) => s + (parseFloat(v.price) || 0), 0);
  const avgDaysOnLot = activeInventory.length > 0
    ? activeInventory.reduce((s, v) => s + Math.floor((Date.now() - new Date(v.created_at)) / 86400000), 0) / activeInventory.length
    : 0;
  const over60 = activeInventory.filter(v => (Date.now() - new Date(v.created_at)) / 86400000 > 60).length;
  const over90 = activeInventory.filter(v => (Date.now() - new Date(v.created_at)) / 86400000 > 90).length;

  const recentDeals = (deals || []).filter(d => d.status === 'Sold' && new Date(d.created_at) > new Date(Date.now() - 30 * 86400000));
  const totalRevenue = recentDeals.reduce((s, d) => s + (parseFloat(d.sale_price) || 0), 0);
  const totalProfit = recentDeals.reduce((s, d) => s + (parseFloat(d.profit) || 0), 0);
  const avgProfit = recentDeals.length > 0 ? totalProfit / recentDeals.length : 0;

  const activeLoans = (bhphLoans || []).filter(l => l.status === 'active');
  const totalLoanBalance = activeLoans.reduce((s, l) => s + (parseFloat(l.remaining_balance) || 0), 0);
  const overdueLoans = activeLoans.filter(l => l.next_payment_date && new Date(l.next_payment_date) < new Date());

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

  // Profit by month from deals
  const profitByMonth = {};
  (deals || []).filter(d => d.status === 'Sold').forEach(d => {
    const month = new Date(d.created_at).toLocaleDateString('en-US', { year: '2-digit', month: 'short' });
    if (!profitByMonth[month]) profitByMonth[month] = { month, revenue: 0, profit: 0, count: 0 };
    profitByMonth[month].revenue += parseFloat(d.sale_price) || 0;
    profitByMonth[month].profit += parseFloat(d.profit) || 0;
    profitByMonth[month].count++;
  });
  const monthlyData = Object.values(profitByMonth).slice(-12);

  // Chart data from snapshots
  const chartData = snapshots.map(s => ({
    date: new Date(s.snapshot_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    inventory: s.total_vehicles,
    value: s.total_inventory_value,
    sold: s.vehicles_sold,
    profit: s.total_profit,
    loans: s.active_loans,
    overdue: s.payments_overdue,
    customers: s.total_customers,
  }));

  const Card = ({ children, style = {} }) => (
    <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px', ...style }}>
      {children}
    </div>
  );

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>Advanced Analytics</h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', margin: '4px 0 0' }}>Business intelligence and performance trends</p>
        </div>
        <div style={{ display: 'flex', gap: '4px', backgroundColor: theme.bgCard, borderRadius: '8px', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
          {[
            { value: '7d', label: '7D' },
            { value: '30d', label: '30D' },
            { value: '90d', label: '90D' },
            { value: '1y', label: '1Y' },
          ].map(r => (
            <button key={r.value} onClick={() => setTimeRange(r.value)} style={{
              padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
              backgroundColor: timeRange === r.value ? theme.accent : 'transparent',
              color: timeRange === r.value ? '#fff' : theme.textSecondary,
            }}>{r.label}</button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Inventory', value: activeInventory.length, sub: `${formatCurrency(totalInventoryValue)} value`, color: theme.accent },
          { label: 'Avg Days on Lot', value: Math.round(avgDaysOnLot), sub: `${over60} over 60d | ${over90} over 90d`, color: over90 > 0 ? '#ef4444' : '#22c55e' },
          { label: 'Sold (30d)', value: recentDeals.length, sub: formatCurrency(totalRevenue) + ' revenue', color: '#3b82f6' },
          { label: 'Profit (30d)', value: formatCurrency(totalProfit), sub: `${formatCurrency(avgProfit)} avg/vehicle`, color: '#22c55e' },
          { label: 'BHPH Loans', value: activeLoans.length, sub: formatCurrency(totalLoanBalance) + ' balance', color: '#8b5cf6' },
          { label: 'Overdue', value: overdueLoans.length, sub: `${activeLoans.length > 0 ? ((overdueLoans.length / activeLoans.length) * 100).toFixed(1) : 0}% delinquency`, color: overdueLoans.length > 0 ? '#ef4444' : '#22c55e' },
          { label: 'Customers', value: (customers || []).length, sub: 'total in database', color: '#06b6d4' },
        ].map((kpi, i) => (
          <Card key={i}>
            <div style={{ color: theme.textMuted, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>{kpi.label}</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: kpi.color }}>{kpi.value}</div>
            <div style={{ color: theme.textMuted, fontSize: '12px', marginTop: '2px' }}>{kpi.sub}</div>
          </Card>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        {/* Revenue & Profit Trend */}
        <Card>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Revenue & Profit by Month</h3>
          {monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                <XAxis dataKey="month" stroke={theme.textMuted} fontSize={12} />
                <YAxis stroke={theme.textMuted} fontSize={12} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px' }}
                  formatter={(v) => [formatCurrency(v), '']} />
                <Legend />
                <Bar dataKey="revenue" fill="#3b82f6" name="Revenue" radius={[4, 4, 0, 0]} />
                <Bar dataKey="profit" fill="#22c55e" name="Profit" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>No sales data yet</div>
          )}
        </Card>

        {/* Inventory Trend */}
        <Card>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Inventory Level Trend</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                <XAxis dataKey="date" stroke={theme.textMuted} fontSize={12} />
                <YAxis stroke={theme.textMuted} fontSize={12} />
                <Tooltip contentStyle={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px' }} />
                <Area type="monotone" dataKey="inventory" stroke={theme.accent} fill={`${theme.accent}20`} strokeWidth={2} name="Vehicles" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
              Analytics snapshots will appear after daily data collection
            </div>
          )}
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        {/* Make Distribution */}
        <Card>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Inventory by Make</h3>
          {makePieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={makePieData} cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={2} dataKey="value">
                    {makePieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px' }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                {makePieData.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: COLORS[i % COLORS.length] }} />
                      <span style={{ color: theme.textSecondary }}>{item.name}</span>
                    </div>
                    <span style={{ fontWeight: '600' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>No inventory</div>
          )}
        </Card>

        {/* BHPH Health */}
        <Card>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>BHPH Portfolio Health</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', color: theme.textSecondary }}>Current Loans</span>
                <span style={{ fontWeight: '700', fontSize: '20px' }}>{activeLoans.length}</span>
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
              <div style={{ fontSize: '13px', color: theme.textSecondary, marginBottom: '4px' }}>Delinquency Rate</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: overdueLoans.length > 0 ? '#ef4444' : '#22c55e' }}>
                {activeLoans.length > 0 ? ((overdueLoans.length / activeLoans.length) * 100).toFixed(1) : 0}%
              </div>
            </div>
          </div>
        </Card>

        {/* Aging Analysis */}
        <Card>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Inventory Aging</h3>
          {(() => {
            const buckets = [
              { label: '0-30 days', count: 0, color: '#22c55e' },
              { label: '31-60 days', count: 0, color: '#eab308' },
              { label: '61-90 days', count: 0, color: '#f97316' },
              { label: '90+ days', count: 0, color: '#ef4444' },
            ];
            activeInventory.forEach(v => {
              const days = Math.floor((Date.now() - new Date(v.created_at)) / 86400000);
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
                  Total: {activeInventory.length} vehicles | Avg: {Math.round(avgDaysOnLot)} days
                </div>
              </div>
            );
          })()}
        </Card>
      </div>

      {/* Seasonal Patterns */}
      {seasonalData.length > 0 && (
        <Card style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Seasonal Vehicle Patterns</h3>
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
                      <td style={{ padding: '10px 12px', fontWeight: '600', fontSize: '14px' }}>{s.make} {s.model || ''}</td>
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
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Recent Sales Performance (30d)</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Vehicle</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Sale Price</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Profit</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Days</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Customer</th>
                </tr>
              </thead>
              <tbody>
                {recentDeals.slice(0, 10).map(d => (
                  <tr key={d.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '10px 12px', fontWeight: '600', fontSize: '14px' }}>
                      {d.vehicle_year} {d.vehicle_make} {d.vehicle_model}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#3b82f6', fontWeight: '600' }}>{formatCurrency(d.sale_price)}</td>
                    <td style={{ padding: '10px 12px', color: (d.profit || 0) >= 0 ? '#22c55e' : '#ef4444', fontWeight: '600' }}>{formatCurrency(d.profit)}</td>
                    <td style={{ padding: '10px 12px', color: theme.textSecondary }}>{d.days_in_stock || '-'}</td>
                    <td style={{ padding: '10px 12px', color: theme.textSecondary }}>{d.customer_name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
