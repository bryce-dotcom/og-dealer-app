import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function InvestorDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [investor, setInvestor] = useState(null);
  const [stats, setStats] = useState(null);
  const [portfolioData, setPortfolioData] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [activeVehicles, setActiveVehicles] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      setLoading(true);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/investor/login');
        return;
      }

      // Get investor record
      const { data: investorData, error: investorError } = await supabase
        .from('investors')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (investorError) throw investorError;
      setInvestor(investorData);

      // Get dashboard stats
      const { data: statsData } = await supabase.rpc('get_investor_dashboard_stats', {
        p_investor_id: investorData.id
      });
      setStats(statsData);

      // Get active vehicles
      await loadActiveVehicles(investorData.id);

      // Get recent transactions
      await loadRecentTransactions(investorData.id);

      // Generate portfolio chart data (last 6 months)
      generatePortfolioData(investorData.id);

      // Get unread notification count
      const { data: countData } = await supabase.rpc('get_investor_unread_count', {
        p_investor_id: investorData.id,
      });
      setUnreadCount(countData || 0);

    } catch (error) {
      console.error('Error loading dashboard:', error);
      alert('Failed to load dashboard: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadActiveVehicles(investorId) {
    const { data } = await supabase
      .from('investor_vehicles')
      .select(`
        *,
        inventory:inventory(year, make, model, photos)
      `)
      .eq('status', 'active')
      .in('pool_id',
        supabase
          .from('investor_pool_shares')
          .select('pool_id')
          .eq('investor_id', investorId)
      )
      .order('purchase_date', { ascending: false })
      .limit(6);

    setActiveVehicles(data || []);
  }

  async function loadRecentTransactions(investorId) {
    // Get recent capital transactions and distributions
    const { data: capital } = await supabase
      .from('investor_capital')
      .select('*')
      .eq('investor_id', investorId)
      .order('initiated_at', { ascending: false })
      .limit(5);

    const { data: distributions } = await supabase
      .from('investor_distributions')
      .select('*, vehicle:investor_vehicles(vehicle_info)')
      .eq('investor_id', investorId)
      .order('created_at', { ascending: false })
      .limit(5);

    // Combine and sort
    const combined = [
      ...(capital || []).map(t => ({ ...t, type: 'capital' })),
      ...(distributions || []).map(t => ({ ...t, type: 'distribution' }))
    ].sort((a, b) => new Date(b.created_at || b.initiated_at) - new Date(a.created_at || a.initiated_at));

    setRecentTransactions(combined.slice(0, 10));
  }

  function generatePortfolioData(investorId) {
    // Mock data for now - in production, query historical data
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const data = months.map((month, i) => ({
      month,
      invested: 50000 + (i * 10000),
      returned: 0 + (i * 8000),
      profit: 0 + (i * 2000)
    }));
    setPortfolioData(data);
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount || 0);
  }

  function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500 mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading your portfolio...</p>
        </div>
      </div>
    );
  }

  if (!investor || !stats) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <div className="text-center text-white">
          <p className="text-xl">Investor account not found</p>
        </div>
      </div>
    );
  }

  const roiColor = stats.lifetime_roi >= 0 ? '#00D96F' : '#FF3B3B';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">
              Welcome back, {investor.full_name?.split(' ')[0]}
            </h1>
            <p className="text-blue-200">Your investment portfolio at a glance</p>
          </div>
          <div className="flex gap-3 items-center">
            <button
              onClick={() => navigate('/investor/notifications')}
              className="relative p-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
              title="Notifications"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => navigate('/investor/capital')}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition"
            >
              Deposit Funds
            </button>
            <button
              onClick={() => navigate('/investor/settings')}
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition"
            >
              Settings
            </button>
          </div>
        </div>

        {/* Hero Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-blue-200 text-sm font-medium">Total Invested</span>
              <svg className="w-6 h-6 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-3xl font-bold text-white mb-1">
              {formatCurrency(stats.total_invested)}
            </div>
            <div className="text-green-400 text-sm">+${((stats.total_invested || 0) * 0.05).toFixed(0)} this month</div>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-blue-200 text-sm font-medium">Total Returns</span>
              <svg className="w-6 h-6 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-3xl font-bold text-white mb-1">
              {formatCurrency(stats.total_returned)}
            </div>
            <div className="text-blue-300 text-sm">Principal + Profit</div>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-blue-200 text-sm font-medium">Lifetime ROI</span>
              <svg className="w-6 h-6 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-3xl font-bold text-white mb-1" style={{ color: roiColor }}>
              {(stats.lifetime_roi || 0).toFixed(1)}%
            </div>
            <div className="text-blue-300 text-sm">
              ~{((stats.lifetime_roi || 0) * 6).toFixed(0)}% annualized
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-blue-200 text-sm font-medium">Available Balance</span>
              <svg className="w-6 h-6 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-3xl font-bold text-white mb-1">
              {formatCurrency(stats.available_balance)}
            </div>
            <div className="text-blue-300 text-sm">Ready to withdraw</div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

          {/* Portfolio Growth Chart */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h2 className="text-xl font-bold text-white mb-4">Portfolio Growth</h2>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={portfolioData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                <XAxis dataKey="month" stroke="#ffffff80" />
                <YAxis stroke="#ffffff80" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  labelStyle={{ color: '#ffffff' }}
                />
                <Legend />
                <Line type="monotone" dataKey="invested" stroke="#3b82f6" strokeWidth={2} name="Invested" />
                <Line type="monotone" dataKey="returned" stroke="#00D96F" strokeWidth={2} name="Returned" />
                <Line type="monotone" dataKey="profit" stroke="#fbbf24" strokeWidth={2} name="Profit" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Active vs Sold Vehicles */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h2 className="text-xl font-bold text-white mb-4">Investment Status</h2>
            <div className="grid grid-cols-3 gap-4 mt-8">
              <div className="text-center">
                <div className="text-4xl font-bold text-blue-400 mb-2">{stats.active_vehicles}</div>
                <div className="text-blue-200 text-sm">Active Vehicles</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-green-400 mb-2">{stats.vehicles_sold_30d}</div>
                <div className="text-blue-200 text-sm">Sold (30d)</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-amber-400 mb-2">
                  {formatCurrency(stats.pending_distributions)}
                </div>
                <div className="text-blue-200 text-sm">Pending Payout</div>
              </div>
            </div>
            <div className="mt-6 p-4 bg-blue-900/30 rounded-lg border border-blue-500/30">
              <div className="flex items-center gap-2 text-blue-200 text-sm">
                <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span>Your capital is deployed in {stats.active_vehicles} actively listed vehicles</span>
              </div>
            </div>
          </div>
        </div>

        {/* Active Investments Grid */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-white">Active Investments</h2>
            <button
              onClick={() => navigate('/investor/portfolio')}
              className="text-blue-400 hover:text-blue-300 font-medium text-sm"
            >
              View All →
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeVehicles.map((vehicle) => {
              const daysHeld = Math.floor((new Date() - new Date(vehicle.purchase_date)) / (1000 * 60 * 60 * 24));
              const projectedProfit = (vehicle.purchase_price * 0.15); // Mock 15% profit

              return (
                <div key={vehicle.id} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 hover:border-blue-500 transition cursor-pointer">
                  <div className="aspect-video bg-slate-700 rounded-lg mb-3 overflow-hidden">
                    {vehicle.inventory?.photos?.[0] ? (
                      <img src={vehicle.inventory.photos[0]} alt="Vehicle" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500">No Photo</div>
                    )}
                  </div>
                  <h3 className="text-white font-semibold mb-2">
                    {vehicle.vehicle_info?.year} {vehicle.vehicle_info?.make} {vehicle.vehicle_info?.model}
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Your Capital:</span>
                      <span className="text-white font-medium">{formatCurrency(vehicle.capital_deployed)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Days Held:</span>
                      <span className="text-blue-400 font-medium">{daysHeld} days</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Projected Profit:</span>
                      <span className="text-green-400 font-medium">+{formatCurrency(projectedProfit)}</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-700">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Status:</span>
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded font-medium">
                        On Lot
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {activeVehicles.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>No active investments yet</p>
              <p className="text-sm mt-2">Your capital will be deployed to purchase vehicles soon</p>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
          <h2 className="text-2xl font-bold text-white mb-6">Recent Activity</h2>

          <div className="space-y-3">
            {recentTransactions.map((tx, i) => {
              const isCapital = tx.type === 'capital';
              const isDeposit = isCapital && tx.transaction_type === 'deposit';
              const isDistribution = tx.type === 'distribution';

              return (
                <div key={i} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      isDeposit ? 'bg-blue-500/20' :
                      isDistribution ? 'bg-green-500/20' :
                      'bg-amber-500/20'
                    }`}>
                      {isDeposit ? (
                        <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
                        </svg>
                      ) : isDistribution ? (
                        <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <div className="text-white font-medium">
                        {isCapital ? (
                          tx.transaction_type === 'deposit' ? 'Capital Deposit' : 'Withdrawal'
                        ) : (
                          `Profit Distribution${tx.vehicle?.vehicle_info ? ` - ${tx.vehicle.vehicle_info.year} ${tx.vehicle.vehicle_info.make} ${tx.vehicle.vehicle_info.model}` : ''}`
                        )}
                      </div>
                      <div className="text-slate-400 text-sm">
                        {formatDate(tx.created_at || tx.initiated_at)} • {tx.status}
                      </div>
                    </div>
                  </div>
                  <div className={`text-lg font-bold ${
                    isDeposit || isDistribution ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {isDeposit || isDistribution ? '+' : '-'}{formatCurrency(Math.abs(tx.amount))}
                  </div>
                </div>
              );
            })}
          </div>

          {recentTransactions.length === 0 && (
            <div className="text-center py-8 text-slate-400">
              <p>No recent activity</p>
            </div>
          )}
        </div>

        {/* Quick Navigation */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
          {[
            { label: 'Analytics', desc: 'Performance metrics', path: '/investor/analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
            { label: 'Reports', desc: 'Statements & tax docs', path: '/investor/reports', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
            { label: 'Accreditation', desc: 'Verify investor status', path: '/investor/accreditation', icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z' },
            { label: 'Bank Account', desc: 'Pool transactions', path: '/investor/bank-account', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
          ].map(nav => (
            <button
              key={nav.path}
              onClick={() => navigate(nav.path)}
              className="bg-white/5 hover:bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/10 hover:border-blue-500/50 transition text-left"
            >
              <svg className="w-6 h-6 text-blue-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={nav.icon} />
              </svg>
              <div className="text-white font-semibold">{nav.label}</div>
              <div className="text-slate-400 text-xs">{nav.desc}</div>
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}
