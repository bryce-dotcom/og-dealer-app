import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const BRAND_SHORT = 'OGDMC';

export default function InvestorDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [investor, setInvestor] = useState(null);
  const [stats, setStats] = useState(null);
  const [portfolioData, setPortfolioData] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [activeVehicles, setActiveVehicles] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
      generatePortfolioData(investorData.id);

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
      .limit(6);
    setActiveVehicles(data || []);
  }

  async function loadRecentTransactions(investorId) {
    const { data: capital } = await supabase.from('investor_capital').select('*').eq('investor_id', investorId).order('initiated_at', { ascending: false }).limit(5);
    const { data: distributions } = await supabase.from('investor_distributions').select('*, vehicle:investor_vehicles(vehicle_info)').eq('investor_id', investorId).order('created_at', { ascending: false }).limit(5);
    const combined = [
      ...(capital || []).map(t => ({ ...t, type: 'capital' })),
      ...(distributions || []).map(t => ({ ...t, type: 'distribution' }))
    ].sort((a, b) => new Date(b.created_at || b.initiated_at) - new Date(a.created_at || a.initiated_at));
    setRecentTransactions(combined.slice(0, 10));
  }

  function generatePortfolioData() {
    const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    setPortfolioData(months.map((month, i) => ({
      month, invested: 50000 + (i * 10000), returned: i * 8000, profit: i * 2000
    })));
  }

  function fmt(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);
  }

  function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate('/investor/login');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-amber-500/30 border-t-amber-400 rounded-full animate-spin mx-auto mb-6" />
          <p className="text-slate-500 text-sm tracking-wide">Loading your portfolio...</p>
        </div>
      </div>
    );
  }

  if (!investor) {
    return (
      <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 mb-4">Investor account not found.</p>
          <button onClick={() => navigate('/investor/login')} className="text-amber-400 text-sm hover:underline">Return to login</button>
        </div>
      </div>
    );
  }

  const s = stats || {};
  const roiPositive = (s.lifetime_roi || 0) >= 0;

  const navItems = [
    { label: 'Dashboard', path: '/investor/dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { label: 'Portfolio', path: '/investor/portfolio', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
    { label: 'Capital', path: '/investor/capital', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Analytics', path: '/investor/analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { label: 'Reports', path: '/investor/reports', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { label: 'Bank Account', path: '/investor/bank-account', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
    { label: 'Accreditation', path: '/investor/accreditation', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
    { label: 'Settings', path: '/investor/settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
  ];

  return (
    <div className="min-h-screen bg-[#0B1120] flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-white/[0.06] bg-[#080D1A]">
        {/* Brand */}
        <div className="px-6 py-6 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 border border-amber-500/30 bg-amber-500/10 flex items-center justify-center">
              <span className="font-serif text-[10px] font-bold tracking-widest text-amber-400">{BRAND_SHORT}</span>
            </div>
            <div>
              <div className="text-white text-sm font-medium tracking-wide">Investor Portal</div>
              <div className="text-slate-600 text-[10px] tracking-wider uppercase">Private Access</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(item => {
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm transition ${
                  active
                    ? 'bg-amber-500/10 text-amber-400 border-l-2 border-amber-400'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.03]'
                }`}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                <span className="tracking-wide">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-600/20 border border-amber-500/30 flex items-center justify-center">
              <span className="text-amber-400 text-xs font-semibold">{investor.full_name?.[0]}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-xs font-medium truncate">{investor.full_name}</div>
              <div className="text-slate-600 text-[10px] truncate">{investor.email}</div>
            </div>
          </div>
          <button onClick={handleSignOut} className="w-full text-left text-slate-500 hover:text-red-400 text-xs tracking-wide transition">
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-[#080D1A]/95 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-slate-400 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <span className="font-serif text-xs tracking-widest text-amber-400">{BRAND_SHORT}</span>
          <button onClick={() => navigate('/investor/notifications')} className="relative text-slate-400 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-amber-500 text-black text-[9px] rounded-full flex items-center justify-center font-bold">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-[#080D1A] border-r border-white/[0.06] overflow-y-auto">
            <div className="px-6 py-6 border-b border-white/[0.06] flex items-center justify-between">
              <span className="font-serif text-sm tracking-widest text-amber-400">{BRAND_SHORT}</span>
              <button onClick={() => setSidebarOpen(false)} className="text-slate-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <nav className="px-3 py-4 space-y-0.5">
              {navItems.map(item => (
                <button
                  key={item.path}
                  onClick={() => { navigate(item.path); setSidebarOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm text-slate-400 hover:text-white hover:bg-white/[0.03] transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d={item.icon} /></svg>
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
            <div className="px-4 py-4 border-t border-white/[0.06]">
              <button onClick={handleSignOut} className="text-slate-500 hover:text-red-400 text-xs">Sign Out</button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto lg:pt-0 pt-14">
        <div className="max-w-6xl mx-auto px-6 py-8">

          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
            <div>
              <div className="text-[10px] tracking-[0.3em] text-amber-500/60 uppercase mb-2">Welcome back</div>
              <h1 className="text-3xl font-serif font-light text-white tracking-wide">
                {investor.full_name}
              </h1>
              <p className="text-slate-500 text-sm mt-1">Portfolio overview as of {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/investor/notifications')}
                className="relative px-4 py-2.5 border border-white/[0.08] hover:border-white/[0.15] text-slate-400 hover:text-white rounded-sm text-xs tracking-wide transition hidden md:flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
                Alerts
                {unreadCount > 0 && <span className="w-4 h-4 bg-amber-500 text-black text-[9px] rounded-full flex items-center justify-center font-bold">{unreadCount}</span>}
              </button>
              <button
                onClick={() => navigate('/investor/capital')}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-black font-semibold rounded-sm text-xs tracking-wide uppercase transition shadow-lg shadow-amber-500/10"
              >
                Fund Account
              </button>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total Invested', value: fmt(s.total_invested), sub: 'Capital deployed', color: 'text-white' },
              { label: 'Total Returns', value: fmt(s.total_returned), sub: 'Distributions received', color: 'text-emerald-400' },
              { label: 'Lifetime ROI', value: `${(s.lifetime_roi || 0).toFixed(1)}%`, sub: `~${((s.lifetime_roi || 0) * 6).toFixed(0)}% annualized`, color: roiPositive ? 'text-emerald-400' : 'text-red-400' },
              { label: 'Available Balance', value: fmt(s.available_balance), sub: 'Ready to withdraw', color: 'text-white' },
            ].map((stat, i) => (
              <div key={i} className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-5">
                <div className="text-[10px] tracking-[0.15em] text-slate-500 uppercase mb-3">{stat.label}</div>
                <div className={`text-2xl lg:text-3xl font-light font-serif ${stat.color} mb-1`}>{stat.value}</div>
                <div className="text-slate-600 text-[11px]">{stat.sub}</div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Portfolio Growth */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-white/[0.06]">
                <h2 className="font-serif text-base text-white tracking-wide">Portfolio Growth</h2>
              </div>
              <div className="p-6">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={portfolioData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="month" stroke="#475569" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#475569" tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', fontSize: '12px' }}
                      labelStyle={{ color: '#94a3b8' }}
                      formatter={(v) => [`$${v.toLocaleString()}`, '']}
                    />
                    <Line type="monotone" dataKey="invested" stroke="#d4af37" strokeWidth={1.5} dot={false} name="Invested" />
                    <Line type="monotone" dataKey="returned" stroke="#34d399" strokeWidth={1.5} dot={false} name="Returned" />
                    <Line type="monotone" dataKey="profit" stroke="#818cf8" strokeWidth={1.5} dot={false} name="Profit" />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-center gap-6 mt-4">
                  {[{ label: 'Invested', color: '#d4af37' }, { label: 'Returned', color: '#34d399' }, { label: 'Profit', color: '#818cf8' }].map(l => (
                    <div key={l.label} className="flex items-center gap-2">
                      <div className="w-2.5 h-0.5 rounded-full" style={{ backgroundColor: l.color }} />
                      <span className="text-slate-500 text-[10px] tracking-wider uppercase">{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Investment Status */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-white/[0.06]">
                <h2 className="font-serif text-base text-white tracking-wide">Fund Metrics</h2>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-3 gap-6">
                  {[
                    { label: 'Active Positions', value: s.active_vehicles || 0, color: 'text-amber-400' },
                    { label: 'Sold (30d)', value: s.vehicles_sold_30d || 0, color: 'text-emerald-400' },
                    { label: 'Pending Payout', value: fmt(s.pending_distributions), color: 'text-violet-400' },
                  ].map(m => (
                    <div key={m.label} className="text-center">
                      <div className={`text-3xl font-serif font-light ${m.color} mb-1`}>{m.value}</div>
                      <div className="text-[10px] tracking-wider text-slate-500 uppercase">{m.label}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 pt-6 border-t border-white/[0.06]">
                  <div className="flex items-center gap-2 text-slate-500 text-xs">
                    <svg className="w-4 h-4 text-amber-500/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                    </svg>
                    <span>Your capital is deployed across {s.active_vehicles || 0} actively listed vehicles</span>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <button
                    onClick={() => navigate('/investor/reports')}
                    className="px-4 py-3 border border-white/[0.06] hover:border-amber-500/30 rounded-sm text-xs text-slate-400 hover:text-amber-400 tracking-wide transition text-left"
                  >
                    <span className="block text-white text-sm mb-0.5">Reports</span>
                    Statements & K-1s
                  </button>
                  <button
                    onClick={() => navigate('/investor/analytics')}
                    className="px-4 py-3 border border-white/[0.06] hover:border-amber-500/30 rounded-sm text-xs text-slate-400 hover:text-amber-400 tracking-wide transition text-left"
                  >
                    <span className="block text-white text-sm mb-0.5">Analytics</span>
                    Performance data
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Active Investments */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <h2 className="font-serif text-base text-white tracking-wide">Active Positions</h2>
              <button onClick={() => navigate('/investor/portfolio')} className="text-amber-500/70 hover:text-amber-400 text-xs tracking-wide transition">
                View All &rarr;
              </button>
            </div>

            {activeVehicles.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 divide-x divide-y divide-white/[0.04]">
                {activeVehicles.map(vehicle => {
                  const daysHeld = Math.floor((new Date() - new Date(vehicle.purchase_date)) / (1000 * 60 * 60 * 24));
                  return (
                    <div key={vehicle.id} className="p-5 hover:bg-white/[0.02] transition">
                      <div className="aspect-[16/10] bg-slate-900 rounded-sm mb-3 overflow-hidden">
                        {vehicle.inventory?.photos?.[0] ? (
                          <img src={vehicle.inventory.photos[0]} alt="Vehicle" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-700 text-xs">No Image</div>
                        )}
                      </div>
                      <h3 className="text-white text-sm font-medium mb-2">
                        {vehicle.vehicle_info?.year} {vehicle.vehicle_info?.make} {vehicle.vehicle_info?.model}
                      </h3>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Capital Deployed</span>
                          <span className="text-white">{fmt(vehicle.capital_deployed)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Days Held</span>
                          <span className="text-slate-300">{daysHeld}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Status</span>
                          <span className="text-amber-400/80 text-[10px] tracking-wider uppercase">Active</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-16 text-center">
                <div className="w-12 h-12 border border-white/[0.08] rounded-sm flex items-center justify-center mx-auto mb-4">
                  <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859" />
                  </svg>
                </div>
                <p className="text-slate-500 text-sm">No active positions</p>
                <p className="text-slate-600 text-xs mt-1">Your capital will be deployed into vetted inventory shortly.</p>
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-white/[0.06]">
              <h2 className="font-serif text-base text-white tracking-wide">Recent Activity</h2>
            </div>

            {recentTransactions.length > 0 ? (
              <div className="divide-y divide-white/[0.04]">
                {recentTransactions.map((tx, i) => {
                  const isCapital = tx.type === 'capital';
                  const isDeposit = isCapital && tx.transaction_type === 'deposit';
                  const isDistribution = tx.type === 'distribution';
                  const positive = isDeposit || isDistribution;

                  return (
                    <div key={i} className="flex items-center justify-between px-6 py-4 hover:bg-white/[0.01] transition">
                      <div className="flex items-center gap-4">
                        <div className={`w-8 h-8 rounded-sm flex items-center justify-center ${
                          isDeposit ? 'bg-blue-500/10 border border-blue-500/20' :
                          isDistribution ? 'bg-emerald-500/10 border border-emerald-500/20' :
                          'bg-amber-500/10 border border-amber-500/20'
                        }`}>
                          <svg className={`w-3.5 h-3.5 ${isDeposit ? 'text-blue-400' : isDistribution ? 'text-emerald-400' : 'text-amber-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                            {positive ? (
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l6.75-6.75M12 19.5l-6.75-6.75" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19.5v-15m0 0l-6.75 6.75M12 4.5l6.75 6.75" />
                            )}
                          </svg>
                        </div>
                        <div>
                          <div className="text-white text-sm">
                            {isCapital
                              ? (tx.transaction_type === 'deposit' ? 'Capital Deposit' : 'Withdrawal')
                              : `Distribution${tx.vehicle?.vehicle_info ? ` — ${tx.vehicle.vehicle_info.year} ${tx.vehicle.vehicle_info.make} ${tx.vehicle.vehicle_info.model}` : ''}`}
                          </div>
                          <div className="text-slate-600 text-[11px] mt-0.5">
                            {fmtDate(tx.created_at || tx.initiated_at)} &middot; <span className="capitalize">{tx.status}</span>
                          </div>
                        </div>
                      </div>
                      <div className={`text-sm font-medium font-serif ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                        {positive ? '+' : '-'}{fmt(Math.abs(tx.amount))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center">
                <p className="text-slate-600 text-sm">No recent activity</p>
              </div>
            )}
          </div>

          {/* Footer Disclaimer */}
          <div className="border-t border-white/[0.04] pt-6 mt-4">
            <p className="text-[10px] text-slate-600 leading-relaxed max-w-3xl">
              <strong className="text-slate-500">Disclaimer:</strong> Portfolio values and returns shown are based on available data and may not reflect real-time market conditions.
              Past performance is not indicative of future results. All investments involve risk, including the possible loss of principal.
              This portal is provided for informational purposes only and does not constitute investment advice. Securities offered through
              private placement under Regulation D, Rule 506(b).
            </p>
          </div>

        </div>
      </main>
    </div>
  );
}
