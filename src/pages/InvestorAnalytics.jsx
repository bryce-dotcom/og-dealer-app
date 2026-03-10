import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const COLORS = ['#3b82f6', '#00D96F', '#fbbf24', '#f97316', '#8b5cf6', '#ec4899'];

export default function InvestorAnalytics() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [investor, setInvestor] = useState(null);
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [timeRange, setTimeRange] = useState('12m');
  const [capitalHistory, setCapitalHistory] = useState([]);
  const [vehicleData, setVehicleData] = useState([]);

  useEffect(() => {
    loadAnalytics();
  }, []);

  async function loadAnalytics() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/investor/login'); return; }

      const { data: investorData } = await supabase
        .from('investors')
        .select('*')
        .eq('user_id', user.id)
        .single();

      setInvestor(investorData);

      // Get dashboard stats
      const { data: statsData } = await supabase.rpc('get_investor_dashboard_stats', {
        p_investor_id: investorData.id,
      });
      setStats(statsData);

      // Get analytics data
      const { data: analyticsData } = await supabase.rpc('get_investor_analytics', {
        p_investor_id: investorData.id,
      });
      setAnalytics(analyticsData);

      // Get capital transaction history for chart
      const { data: capitalData } = await supabase
        .from('investor_capital')
        .select('amount, transaction_type, status, initiated_at, completed_at')
        .eq('investor_id', investorData.id)
        .eq('status', 'completed')
        .order('initiated_at', { ascending: true });

      // Build cumulative capital history
      let cumulative = 0;
      const history = (capitalData || []).map(tx => {
        cumulative += tx.transaction_type === 'deposit' ? parseFloat(tx.amount) : -parseFloat(tx.amount);
        return {
          date: new Date(tx.initiated_at).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          amount: parseFloat(tx.amount),
          type: tx.transaction_type,
          cumulative,
        };
      });
      setCapitalHistory(history);

      // Get vehicle performance data
      const { data: vehicles } = await supabase
        .from('investor_vehicles')
        .select('*')
        .in('pool_id',
          supabase
            .from('investor_pool_shares')
            .select('pool_id')
            .eq('investor_id', investorData.id)
        )
        .order('purchase_date', { ascending: true });

      setVehicleData(vehicles || []);

    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount || 0);
  }

  function formatPct(val) {
    return (val || 0).toFixed(1) + '%';
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500"></div>
      </div>
    );
  }

  // Prepare chart data
  const monthlyPerf = analytics?.monthly_performance || [];
  const vehicleStats = analytics?.vehicle_stats || [];
  const poolAllocation = analytics?.pool_allocation || [];

  // Calculate derived metrics
  const totalVehicles = vehicleData.length;
  const soldVehicles = vehicleData.filter(v => v.status === 'sold');
  const avgDaysHeld = soldVehicles.length > 0
    ? soldVehicles.reduce((sum, v) => sum + (v.days_held || 0), 0) / soldVehicles.length
    : 0;
  const avgROI = soldVehicles.length > 0
    ? soldVehicles.reduce((sum, v) => sum + ((v.gross_profit || 0) / (v.purchase_price || 1) * 100), 0) / soldVehicles.length
    : 0;
  const totalGrossProfit = soldVehicles.reduce((sum, v) => sum + (parseFloat(v.gross_profit) || 0), 0);
  const totalInvestorProfit = soldVehicles.reduce((sum, v) => sum + (parseFloat(v.investor_profit) || 0), 0);
  const winRate = soldVehicles.length > 0
    ? (soldVehicles.filter(v => (v.gross_profit || 0) > 0).length / soldVehicles.length * 100)
    : 0;

  // Profit distribution pie data
  const profitPieData = [
    { name: 'Investor Share', value: totalInvestorProfit },
    { name: 'Platform Fee', value: soldVehicles.reduce((s, v) => s + (parseFloat(v.platform_fee_amount) || 0), 0) },
    { name: 'Dealer Share', value: soldVehicles.reduce((s, v) => s + (parseFloat(v.dealer_profit) || 0), 0) },
  ].filter(d => d.value > 0);

  // Vehicle status pie data
  const statusPieData = vehicleStats.map(v => ({
    name: v.status === 'active' ? 'Active' : v.status === 'sold' ? 'Sold' : v.status,
    value: v.count,
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Portfolio Analytics</h1>
            <p className="text-blue-200">Detailed performance metrics and trends</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-slate-800 rounded-lg p-1">
              {[
                { value: '3m', label: '3M' },
                { value: '6m', label: '6M' },
                { value: '12m', label: '1Y' },
                { value: 'all', label: 'All' },
              ].map(range => (
                <button
                  key={range.value}
                  onClick={() => setTimeRange(range.value)}
                  className={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${
                    timeRange === range.value
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => navigate('/investor/dashboard')}
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition"
            >
              ← Dashboard
            </button>
          </div>
        </div>

        {/* Key Performance Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
          {[
            { label: 'Total Invested', value: formatCurrency(stats?.total_invested), color: 'text-blue-400' },
            { label: 'Lifetime ROI', value: formatPct(stats?.lifetime_roi), color: (stats?.lifetime_roi || 0) >= 0 ? 'text-green-400' : 'text-red-400' },
            { label: 'Vehicles Funded', value: totalVehicles, color: 'text-white' },
            { label: 'Win Rate', value: formatPct(winRate), color: 'text-green-400' },
            { label: 'Avg Days to Sell', value: Math.round(avgDaysHeld), color: 'text-amber-400' },
            { label: 'Avg ROI/Vehicle', value: formatPct(avgROI), color: 'text-blue-400' },
          ].map((metric, i) => (
            <div key={i} className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
              <div className="text-blue-200 text-xs font-medium mb-1">{metric.label}</div>
              <div className={`text-2xl font-bold ${metric.color}`}>{metric.value}</div>
            </div>
          ))}
        </div>

        {/* Charts Row 1: Capital History & Monthly Performance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

          {/* Cumulative Capital Chart */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h2 className="text-xl font-bold text-white mb-4">Capital Growth</h2>
            {capitalHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={capitalHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                  <XAxis dataKey="date" stroke="#ffffff80" fontSize={12} />
                  <YAxis stroke="#ffffff80" fontSize={12} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    labelStyle={{ color: '#ffffff' }}
                    formatter={(v) => [formatCurrency(v), '']}
                  />
                  <Area type="monotone" dataKey="cumulative" stroke="#3b82f6" fill="#3b82f620" strokeWidth={2} name="Total Capital" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[280px] text-slate-400">
                No capital transactions yet
              </div>
            )}
          </div>

          {/* Monthly Performance */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h2 className="text-xl font-bold text-white mb-4">Monthly Returns</h2>
            {monthlyPerf.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthlyPerf}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                  <XAxis dataKey="month" stroke="#ffffff80" fontSize={12} tickFormatter={v => {
                    const [y, m] = v.split('-');
                    return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short' });
                  }} />
                  <YAxis stroke="#ffffff80" fontSize={12} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    labelStyle={{ color: '#ffffff' }}
                    formatter={(v) => [formatCurrency(v), '']}
                  />
                  <Legend />
                  <Bar dataKey="gross_profit" fill="#00D96F" name="Gross Profit" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="investor_profit" fill="#3b82f6" name="Your Share" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[280px] text-slate-400">
                No vehicle sales data yet
              </div>
            )}
          </div>
        </div>

        {/* Charts Row 2: Allocations & Profit Split */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

          {/* Pool Allocation */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h2 className="text-xl font-bold text-white mb-4">Pool Allocation</h2>
            {poolAllocation.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={poolAllocation.map(p => ({ name: p.pool_name, value: parseFloat(p.capital_invested) || 0 }))}
                      cx="50%" cy="50%" outerRadius={80} innerRadius={45}
                      paddingAngle={2} dataKey="value"
                    >
                      {poolAllocation.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-2">
                  {poolAllocation.map((pool, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-slate-300">{pool.pool_name}</span>
                      </div>
                      <div className="text-white font-semibold">{formatCurrency(pool.capital_invested)}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-[280px] text-slate-400">
                No pool allocations
              </div>
            )}
          </div>

          {/* Vehicle Status */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h2 className="text-xl font-bold text-white mb-4">Vehicle Status</h2>
            {statusPieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={statusPieData}
                      cx="50%" cy="50%" outerRadius={80} innerRadius={45}
                      paddingAngle={2} dataKey="value"
                    >
                      {statusPieData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-2">
                  {statusPieData.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-slate-300">{item.name}</span>
                      </div>
                      <div className="text-white font-semibold">{item.value}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-[280px] text-slate-400">
                No vehicle data
              </div>
            )}
          </div>

          {/* Profit Distribution */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h2 className="text-xl font-bold text-white mb-4">Profit Split</h2>
            {profitPieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={profitPieData}
                      cx="50%" cy="50%" outerRadius={80} innerRadius={45}
                      paddingAngle={2} dataKey="value"
                    >
                      <Cell fill="#3b82f6" />
                      <Cell fill="#fbbf24" />
                      <Cell fill="#00D96F" />
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-2">
                  {profitPieData.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ['#3b82f6', '#fbbf24', '#00D96F'][i] }} />
                        <span className="text-slate-300">{item.name}</span>
                      </div>
                      <div className="text-white font-semibold">{formatCurrency(item.value)}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-[280px] text-slate-400">
                No profit data yet
              </div>
            )}
          </div>
        </div>

        {/* Performance Table: Pool Details */}
        {poolAllocation.length > 0 && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">Pool Performance</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/20">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Pool</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Invested</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Ownership</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Profit Earned</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">ROI</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Vehicles Funded</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Vehicles Sold</th>
                  </tr>
                </thead>
                <tbody>
                  {poolAllocation.map((pool, i) => (
                    <tr key={i} className="border-b border-white/10 hover:bg-white/5">
                      <td className="px-4 py-4 text-white font-medium">{pool.pool_name}</td>
                      <td className="px-4 py-4 text-blue-400 font-semibold">{formatCurrency(pool.capital_invested)}</td>
                      <td className="px-4 py-4 text-white">{parseFloat(pool.ownership_percentage || 0).toFixed(2)}%</td>
                      <td className="px-4 py-4 text-green-400 font-semibold">{formatCurrency(pool.total_profit_earned)}</td>
                      <td className="px-4 py-4">
                        <span className={`font-semibold ${parseFloat(pool.current_roi || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatPct(pool.current_roi)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-white">{pool.total_vehicles_funded || 0}</td>
                      <td className="px-4 py-4 text-white">{pool.total_vehicles_sold || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Recent Vehicle Performance */}
        {soldVehicles.length > 0 && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h2 className="text-xl font-bold text-white mb-4">Recent Vehicle Sales</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/20">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Vehicle</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Purchase</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Sale</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Profit</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Your Share</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Days Held</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {soldVehicles.slice(0, 10).map(vehicle => {
                    const roi = vehicle.purchase_price > 0
                      ? ((vehicle.gross_profit || 0) / vehicle.purchase_price * 100)
                      : 0;
                    return (
                      <tr key={vehicle.id} className="border-b border-white/10 hover:bg-white/5">
                        <td className="px-4 py-4 text-white font-medium">
                          {vehicle.vehicle_info?.year} {vehicle.vehicle_info?.make} {vehicle.vehicle_info?.model}
                        </td>
                        <td className="px-4 py-4 text-slate-300">{formatCurrency(vehicle.purchase_price)}</td>
                        <td className="px-4 py-4 text-slate-300">{formatCurrency(vehicle.sale_price)}</td>
                        <td className="px-4 py-4">
                          <span className={`font-semibold ${(vehicle.gross_profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatCurrency(vehicle.gross_profit)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-blue-400 font-semibold">{formatCurrency(vehicle.investor_profit)}</td>
                        <td className="px-4 py-4 text-slate-300">{vehicle.days_held || 0}</td>
                        <td className="px-4 py-4">
                          <span className={`font-semibold ${roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {roi.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
