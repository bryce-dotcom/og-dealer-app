import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import InvestorLayout from '../components/InvestorLayout';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#f97316', '#8b5cf6', '#ec4899'];

const card = { backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', overflow: 'hidden' };
const tooltipStyle = { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 6px rgba(0,0,0,0.07)' };

export default function InvestorAnalytics() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [investor, setInvestor] = useState(null);
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [timeRange, setTimeRange] = useState('12m');
  const [capitalHistory, setCapitalHistory] = useState([]);
  const [vehicleData, setVehicleData] = useState([]);

  useEffect(() => { loadAnalytics(); }, []);

  async function loadAnalytics() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/investor/login'); return; }
      const { data: investorData } = await supabase.from('investors').select('*').eq('user_id', user.id).single();
      setInvestor(investorData);
      const { data: statsData } = await supabase.rpc('get_investor_dashboard_stats', { p_investor_id: investorData.id });
      setStats(statsData);
      const { data: analyticsData } = await supabase.rpc('get_investor_analytics', { p_investor_id: investorData.id });
      setAnalytics(analyticsData);
      const { data: capitalData } = await supabase.from('investor_capital')
        .select('amount, transaction_type, status, initiated_at, completed_at')
        .eq('investor_id', investorData.id).eq('status', 'completed').order('initiated_at', { ascending: true });
      let cumulative = 0;
      const history = (capitalData || []).map(tx => {
        cumulative += tx.transaction_type === 'deposit' ? parseFloat(tx.amount) : -parseFloat(tx.amount);
        return { date: new Date(tx.initiated_at).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), amount: parseFloat(tx.amount), type: tx.transaction_type, cumulative };
      });
      setCapitalHistory(history);
      const { data: vehicles } = await supabase.from('investor_vehicles').select('*')
        .in('pool_id', supabase.from('investor_pool_shares').select('pool_id').eq('investor_id', investorData.id))
        .order('purchase_date', { ascending: true });
      setVehicleData(vehicles || []);
    } catch (error) { console.error('Error loading analytics:', error); }
    finally { setLoading(false); }
  }

  function fmt(v) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v || 0); }
  function fmtPct(v) { return (v || 0).toFixed(1) + '%'; }

  if (loading) {
    return (
      <InvestorLayout title="Portfolio Analytics">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
          <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#111827', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
      </InvestorLayout>
    );
  }

  const monthlyPerf = analytics?.monthly_performance || [];
  const vehicleStats = analytics?.vehicle_stats || [];
  const poolAllocation = analytics?.pool_allocation || [];
  const totalVehicles = vehicleData.length;
  const soldVehicles = vehicleData.filter(v => v.status === 'sold');
  const avgDaysHeld = soldVehicles.length > 0 ? soldVehicles.reduce((s, v) => s + (v.days_held || 0), 0) / soldVehicles.length : 0;
  const avgROI = soldVehicles.length > 0 ? soldVehicles.reduce((s, v) => s + ((v.gross_profit || 0) / (v.purchase_price || 1) * 100), 0) / soldVehicles.length : 0;
  const totalInvestorProfit = soldVehicles.reduce((s, v) => s + (parseFloat(v.investor_profit) || 0), 0);
  const winRate = soldVehicles.length > 0 ? (soldVehicles.filter(v => (v.gross_profit || 0) > 0).length / soldVehicles.length * 100) : 0;
  const profitPieData = [
    { name: 'Investor Share', value: totalInvestorProfit },
    { name: 'Platform Fee', value: soldVehicles.reduce((s, v) => s + (parseFloat(v.platform_fee_amount) || 0), 0) },
    { name: 'Dealer Share', value: soldVehicles.reduce((s, v) => s + (parseFloat(v.dealer_profit) || 0), 0) },
  ].filter(d => d.value > 0);
  const statusPieData = vehicleStats.map(v => ({ name: v.status === 'active' ? 'Active' : v.status === 'sold' ? 'Sold' : v.status, value: v.count }));

  return (
    <InvestorLayout title="Portfolio Analytics" subtitle="Detailed performance metrics and trends" maxWidth="80rem">

      {/* Time Range + KPIs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div />
        <div style={{ display: 'flex', backgroundColor: '#f3f4f6', borderRadius: 8, padding: 3 }}>
          {[{ value: '3m', label: '3M' }, { value: '6m', label: '6M' }, { value: '12m', label: '1Y' }, { value: 'all', label: 'All' }].map(r => (
            <button key={r.value} onClick={() => setTimeRange(r.value)}
              style={{ padding: '6px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                backgroundColor: timeRange === r.value ? '#111827' : 'transparent', color: timeRange === r.value ? '#fff' : '#6b7280' }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Invested', value: fmt(stats?.total_invested), color: '#2563eb' },
          { label: 'Lifetime ROI', value: fmtPct(stats?.lifetime_roi), color: (stats?.lifetime_roi || 0) >= 0 ? '#16a34a' : '#dc2626' },
          { label: 'Vehicles Funded', value: totalVehicles, color: '#111827' },
          { label: 'Win Rate', value: fmtPct(winRate), color: '#16a34a' },
          { label: 'Avg Days to Sell', value: Math.round(avgDaysHeld), color: '#d97706' },
          { label: 'Avg ROI/Vehicle', value: fmtPct(avgROI), color: '#2563eb' },
        ].map((m, i) => (
          <div key={i} style={{ ...card, padding: 16 }}>
            <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 500, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        <div style={{ ...card, padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 16 }}>Capital Growth</h2>
          {capitalHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={capitalHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
                <YAxis stroke="#9ca3af" fontSize={12} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#111827' }} formatter={v => [fmt(v), '']} />
                <Area type="monotone" dataKey="cumulative" stroke="#3b82f6" fill="#3b82f620" strokeWidth={2} name="Total Capital" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 280, color: '#9ca3af' }}>No capital transactions yet</div>
          )}
        </div>

        <div style={{ ...card, padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 16 }}>Monthly Returns</h2>
          {monthlyPerf.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyPerf}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} tickFormatter={v => { const [y, m] = v.split('-'); return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short' }); }} />
                <YAxis stroke="#9ca3af" fontSize={12} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#111827' }} formatter={v => [fmt(v), '']} />
                <Legend />
                <Bar dataKey="gross_profit" fill="#10b981" name="Gross Profit" radius={[4, 4, 0, 0]} />
                <Bar dataKey="investor_profit" fill="#3b82f6" name="Your Share" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 280, color: '#9ca3af' }}>No vehicle sales data yet</div>
          )}
        </div>
      </div>

      {/* Charts Row 2: Pie Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginBottom: 24 }}>
        {[
          { title: 'Pool Allocation', data: poolAllocation.map(p => ({ name: p.pool_name, value: parseFloat(p.capital_invested) || 0 })), empty: 'No pool allocations', colors: COLORS },
          { title: 'Vehicle Status', data: statusPieData, empty: 'No vehicle data', colors: COLORS },
          { title: 'Profit Split', data: profitPieData, empty: 'No profit data yet', colors: ['#3b82f6', '#f59e0b', '#10b981'] },
        ].map((chart, ci) => (
          <div key={ci} style={{ ...card, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 16 }}>{chart.title}</h2>
            {chart.data.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={chart.data} cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={2} dataKey="value">
                      {chart.data.map((_, i) => <Cell key={i} fill={chart.colors[i % chart.colors.length]} />)}
                    </Pie>
                    <Tooltip formatter={v => fmt(v)} contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ marginTop: 8 }}>
                  {chart.data.map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: chart.colors[i % chart.colors.length] }} />
                        <span style={{ color: '#6b7280' }}>{item.name}</span>
                      </div>
                      <span style={{ fontWeight: 600, color: '#111827' }}>{typeof item.value === 'number' && item.value > 100 ? fmt(item.value) : item.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 280, color: '#9ca3af' }}>{chart.empty}</div>
            )}
          </div>
        ))}
      </div>

      {/* Pool Performance Table */}
      {poolAllocation.length > 0 && (
        <div style={{ ...card, marginBottom: 24 }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #f3f4f6' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111827', margin: 0 }}>Pool Performance</h2>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  {['Pool', 'Invested', 'Ownership', 'Profit Earned', 'ROI', 'Vehicles Funded', 'Vehicles Sold'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {poolAllocation.map((pool, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 500, color: '#111827' }}>{pool.pool_name}</td>
                    <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 600, color: '#2563eb' }}>{fmt(pool.capital_invested)}</td>
                    <td style={{ padding: '14px 16px', fontSize: 14, color: '#374151' }}>{parseFloat(pool.ownership_percentage || 0).toFixed(2)}%</td>
                    <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 600, color: '#16a34a' }}>{fmt(pool.total_profit_earned)}</td>
                    <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 600, color: parseFloat(pool.current_roi || 0) >= 0 ? '#16a34a' : '#dc2626' }}>{fmtPct(pool.current_roi)}</td>
                    <td style={{ padding: '14px 16px', fontSize: 14, color: '#374151' }}>{pool.total_vehicles_funded || 0}</td>
                    <td style={{ padding: '14px 16px', fontSize: 14, color: '#374151' }}>{pool.total_vehicles_sold || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Vehicle Sales Table */}
      {soldVehicles.length > 0 && (
        <div style={card}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #f3f4f6' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111827', margin: 0 }}>Recent Vehicle Sales</h2>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  {['Vehicle', 'Purchase', 'Sale', 'Profit', 'Your Share', 'Days Held', 'ROI'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {soldVehicles.slice(0, 10).map(v => {
                  const roi = v.purchase_price > 0 ? ((v.gross_profit || 0) / v.purchase_price * 100) : 0;
                  return (
                    <tr key={v.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 500, color: '#111827' }}>{v.vehicle_info?.year} {v.vehicle_info?.make} {v.vehicle_info?.model}</td>
                      <td style={{ padding: '14px 16px', fontSize: 14, color: '#6b7280' }}>{fmt(v.purchase_price)}</td>
                      <td style={{ padding: '14px 16px', fontSize: 14, color: '#6b7280' }}>{fmt(v.sale_price)}</td>
                      <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 600, color: (v.gross_profit || 0) >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(v.gross_profit)}</td>
                      <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 600, color: '#2563eb' }}>{fmt(v.investor_profit)}</td>
                      <td style={{ padding: '14px 16px', fontSize: 14, color: '#6b7280' }}>{v.days_held || 0}</td>
                      <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 600, color: roi >= 0 ? '#16a34a' : '#dc2626' }}>{roi.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </InvestorLayout>
  );
}
