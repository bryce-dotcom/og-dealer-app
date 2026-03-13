import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

export default function InvestorDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [investor, setInvestor] = useState(null);
  const [stats, setStats] = useState(null);
  const [portfolioData, setPortfolioData] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [activeVehicles, setActiveVehicles] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => { loadDashboard(); }, []);

  async function loadDashboard() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/investor/login'); return; }

      const { data: investorData, error: investorError } = await supabase
        .from('investors').select('*').eq('user_id', user.id).single();
      if (investorError) throw investorError;
      setInvestor(investorData);

      const { data: statsData } = await supabase.rpc('get_investor_dashboard_stats', { p_investor_id: investorData.id });
      setStats(statsData);

      await loadActiveVehicles(investorData.id);
      await loadRecentTransactions(investorData.id);
      generatePortfolioData();

      const { data: countData } = await supabase.rpc('get_investor_unread_count', { p_investor_id: investorData.id });
      setUnreadCount(countData || 0);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadActiveVehicles(investorId) {
    const { data } = await supabase
      .from('investor_vehicles')
      .select('*, inventory:inventory(year, make, model, photos)')
      .eq('status', 'active')
      .in('pool_id', supabase.from('investor_pool_shares').select('pool_id').eq('investor_id', investorId))
      .order('purchase_date', { ascending: false })
      .limit(5);
    setActiveVehicles(data || []);
  }

  async function loadRecentTransactions(investorId) {
    const { data: capital } = await supabase.from('investor_capital').select('*').eq('investor_id', investorId).order('initiated_at', { ascending: false }).limit(5);
    const { data: distributions } = await supabase.from('investor_distributions').select('*, vehicle:investor_vehicles(vehicle_info)').eq('investor_id', investorId).order('created_at', { ascending: false }).limit(5);
    const combined = [
      ...(capital || []).map(t => ({ ...t, type: 'capital' })),
      ...(distributions || []).map(t => ({ ...t, type: 'distribution' }))
    ].sort((a, b) => new Date(b.created_at || b.initiated_at) - new Date(a.created_at || a.initiated_at));
    setRecentTransactions(combined.slice(0, 8));
  }

  function generatePortfolioData() {
    const months = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    setPortfolioData(months.map((month, i) => ({
      month,
      value: 50000 + (i * 12000) + Math.floor(Math.random() * 3000),
    })));
  }

  function fmt(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);
  }

  function fmtDate(d) {
    if (!d) return '--';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate('/investor/login');
  }

  // ─── Navigation ──────────────────────────────────────────

  const navLinks = [
    { label: 'Overview', path: '/investor/dashboard' },
    { label: 'Portfolio', path: '/investor/portfolio' },
    { label: 'Capital', path: '/investor/capital' },
    { label: 'Reports', path: '/investor/reports' },
    { label: 'Analytics', path: '/investor/analytics' },
  ];

  const secondaryLinks = [
    { label: 'Bank Account', path: '/investor/bank-account' },
    { label: 'Accreditation', path: '/investor/accreditation' },
    { label: 'Settings', path: '/investor/settings' },
  ];

  function NavBar() {
    return (
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          {/* Top row */}
          <div className="flex items-center justify-between h-16">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-900 rounded flex items-center justify-center">
                <span className="text-white text-xs font-bold">OG</span>
              </div>
              <div className="hidden sm:block">
                <div className="text-gray-900 font-semibold text-sm">OG DiX Motor Club</div>
                <div className="text-gray-400 text-[11px]">Investor Portal</div>
              </div>
            </div>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map(link => (
                <button
                  key={link.path}
                  onClick={() => navigate(link.path)}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                    location.pathname === link.path
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {link.label}
                </button>
              ))}
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-2">
              {/* Notifications */}
              <button
                onClick={() => navigate('/investor/notifications')}
                className="relative p-2 text-gray-400 hover:text-gray-600 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* User menu */}
              <div className="relative group">
                <button className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-gray-100 transition">
                  <div className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center">
                    <span className="text-white text-xs font-medium">{investor?.full_name?.[0] || '?'}</span>
                  </div>
                  <span className="hidden sm:block text-sm text-gray-700 font-medium max-w-[120px] truncate">
                    {investor?.full_name?.split(' ')[0]}
                  </span>
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </button>
                <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                  {secondaryLinks.map(link => (
                    <button key={link.path} onClick={() => navigate(link.path)} className="w-full text-left px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 first:rounded-t-lg">
                      {link.label}
                    </button>
                  ))}
                  <div className="border-t border-gray-100" />
                  <button onClick={handleSignOut} className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-b-lg">
                    Sign Out
                  </button>
                </div>
              </div>

              {/* Mobile menu button */}
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                  {mobileMenuOpen
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    : <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  }
                </svg>
              </button>
            </div>
          </div>

          {/* Mobile nav */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-gray-100 py-2 pb-3">
              {[...navLinks, ...secondaryLinks].map(link => (
                <button
                  key={link.path}
                  onClick={() => { navigate(link.path); setMobileMenuOpen(false); }}
                  className={`w-full text-left px-3 py-2.5 text-sm font-medium rounded-md ${
                    location.pathname === link.path ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {link.label}
                </button>
              ))}
              <div className="border-t border-gray-100 mt-2 pt-2">
                <button onClick={handleSignOut} className="w-full text-left px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-md">
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </header>
    );
  }

  // ─── Loading / Error ─────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500 text-sm">Loading your portfolio...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!investor) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-3">Investor account not found.</p>
          <button onClick={() => navigate('/investor/login')} className="text-blue-600 text-sm hover:underline">Return to login</button>
        </div>
      </div>
    );
  }

  const s = stats || {};

  // ─── Render ──────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* Welcome */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Welcome back, {investor.full_name?.split(' ')[0]}
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <button
            onClick={() => navigate('/investor/capital')}
            className="self-start sm:self-auto px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition"
          >
            Fund Account
          </button>
        </div>

        {/* Account Summary */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Account Summary</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-gray-100">
            {[
              { label: 'Total Invested', value: fmt(s.total_invested), change: null },
              { label: 'Total Returns', value: fmt(s.total_returned), change: null },
              { label: 'Lifetime ROI', value: `${(s.lifetime_roi || 0).toFixed(1)}%`, change: (s.lifetime_roi || 0) >= 0 ? 'positive' : 'negative' },
              { label: 'Available Balance', value: fmt(s.available_balance), change: null },
            ].map((stat, i) => (
              <div key={i} className="px-6 py-5">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{stat.label}</div>
                <div className={`text-2xl font-semibold ${
                  stat.change === 'positive' ? 'text-green-600' :
                  stat.change === 'negative' ? 'text-red-600' :
                  'text-gray-900'
                }`}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

          {/* Portfolio Value Chart - 2 cols */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Portfolio Value</h2>
              <div className="flex items-center gap-1 text-xs">
                {['6M', '1Y', 'ALL'].map(period => (
                  <button key={period} className={`px-2.5 py-1 rounded ${period === '6M' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                    {period}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-6 py-4">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={portfolioData}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#111827" stopOpacity={0.08} />
                      <stop offset="95%" stopColor="#111827" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="month" stroke="#9ca3af" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    labelStyle={{ color: '#6b7280', fontWeight: 500 }}
                    formatter={(v) => [`$${v.toLocaleString()}`, 'Value']}
                  />
                  <Area type="monotone" dataKey="value" stroke="#111827" strokeWidth={2} fill="url(#colorValue)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Fund Metrics - 1 col */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Fund Metrics</h2>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Active Positions</div>
                <div className="text-3xl font-semibold text-gray-900">{s.active_vehicles || 0}</div>
                <p className="text-xs text-gray-400 mt-1">Vehicles currently held</p>
              </div>
              <div className="border-t border-gray-100 pt-5">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Sold (30 days)</div>
                <div className="text-3xl font-semibold text-gray-900">{s.vehicles_sold_30d || 0}</div>
                <p className="text-xs text-gray-400 mt-1">Vehicles liquidated</p>
              </div>
              <div className="border-t border-gray-100 pt-5">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Pending Distributions</div>
                <div className="text-3xl font-semibold text-green-600">{fmt(s.pending_distributions)}</div>
                <p className="text-xs text-gray-400 mt-1">Awaiting payout</p>
              </div>
            </div>
          </div>
        </div>

        {/* Active Positions */}
        {activeVehicles.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Active Positions</h2>
              <button onClick={() => navigate('/investor/portfolio')} className="text-blue-600 hover:text-blue-700 text-xs font-medium">
                View All
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Vehicle</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Capital</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Days Held</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {activeVehicles.map(v => {
                    const days = Math.floor((new Date() - new Date(v.purchase_date)) / (1000 * 60 * 60 * 24));
                    return (
                      <tr key={v.id} className="hover:bg-gray-50 transition">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                              {v.inventory?.photos?.[0] ? (
                                <img src={v.inventory.photos[0]} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-400 text-[10px]">N/A</div>
                              )}
                            </div>
                            <span className="font-medium text-gray-900">
                              {v.vehicle_info?.year} {v.vehicle_info?.make} {v.vehicle_info?.model}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-gray-900">{fmt(v.capital_deployed)}</td>
                        <td className="px-6 py-4 text-right text-gray-500">{days}d</td>
                        <td className="px-6 py-4 text-right">
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-full">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                            Active
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

        {/* Recent Activity */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
          </div>

          {recentTransactions.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {recentTransactions.map((tx, i) => {
                const isCapital = tx.type === 'capital';
                const isDeposit = isCapital && tx.transaction_type === 'deposit';
                const isDistribution = tx.type === 'distribution';
                const positive = isDeposit || isDistribution;

                return (
                  <div key={i} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        positive ? 'bg-green-50' : 'bg-red-50'
                      }`}>
                        <svg className={`w-4 h-4 ${positive ? 'text-green-600' : 'text-red-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                          {positive
                            ? <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                            : <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                          }
                        </svg>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {isCapital
                            ? (isDeposit ? 'Capital Deposit' : 'Withdrawal')
                            : `Distribution${tx.vehicle?.vehicle_info ? ` - ${tx.vehicle.vehicle_info.year} ${tx.vehicle.vehicle_info.make} ${tx.vehicle.vehicle_info.model}` : ''}`}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {fmtDate(tx.created_at || tx.initiated_at)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-semibold ${positive ? 'text-green-600' : 'text-red-500'}`}>
                        {positive ? '+' : '-'}{fmt(Math.abs(tx.amount))}
                      </div>
                      <div className={`text-xs mt-0.5 ${
                        tx.status === 'completed' ? 'text-green-500' :
                        tx.status === 'pending' ? 'text-amber-500' :
                        'text-gray-400'
                      }`}>
                        {tx.status?.charAt(0).toUpperCase() + tx.status?.slice(1)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <p className="text-gray-400 text-sm">No recent activity</p>
              <p className="text-gray-300 text-xs mt-1">Transactions will appear here once your account is funded.</p>
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Deposit Funds', desc: 'Add capital', path: '/investor/capital', icon: 'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
            { label: 'Reports', desc: 'Statements & tax docs', path: '/investor/reports', icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z' },
            { label: 'Accreditation', desc: 'Verify status', path: '/investor/accreditation', icon: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z' },
            { label: 'Settings', desc: 'Account & security', path: '/investor/settings', icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z' },
          ].map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="bg-white border border-gray-200 rounded-xl p-4 text-left hover:border-gray-300 hover:shadow-sm transition group"
            >
              <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 mb-2 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              <div className="text-sm font-medium text-gray-900">{item.label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{item.desc}</div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <footer className="border-t border-gray-200 pt-6 pb-8">
          <p className="text-[11px] text-gray-400 leading-relaxed max-w-3xl">
            Portfolio values and returns are based on available data and may not reflect real-time market conditions.
            Past performance is not indicative of future results. All investments involve risk, including the possible loss of principal.
            This portal is for informational purposes only and does not constitute investment advice.
            Securities offered through private placement under Regulation D, Rule 506(b). Not FDIC insured. Not bank guaranteed. May lose value.
          </p>
        </footer>

      </main>
    </div>
  );
}
