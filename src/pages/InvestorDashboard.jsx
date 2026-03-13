import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import InvestorLayout from '../components/InvestorLayout';

export default function InvestorDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [investor, setInvestor] = useState(null);
  const [stats, setStats] = useState(null);
  const [portfolioData, setPortfolioData] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [activeVehicles, setActiveVehicles] = useState([]);

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

  if (loading) {
    return (
      <InvestorLayout>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 32, height: 32, border: '2px solid #d1d5db', borderTopColor: '#111827', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
            <p style={{ color: '#6b7280', fontSize: 14 }}>Loading your portfolio...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      </InvestorLayout>
    );
  }

  if (!investor) {
    return (
      <InvestorLayout>
        <div style={{ textAlign: 'center', padding: '4rem 0' }}>
          <p style={{ color: '#6b7280', marginBottom: 12 }}>Investor account not found.</p>
          <button onClick={() => navigate('/investor/login')} style={{ color: '#2563eb', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Return to login</button>
        </div>
      </InvestorLayout>
    );
  }

  const s = stats || {};

  return (
    <InvestorLayout>
      {/* Welcome */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#111827', margin: 0 }}>
            Welcome back, {investor.full_name?.split(' ')[0]}
          </h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <button
          onClick={() => navigate('/investor/capital')}
          style={{ padding: '10px 20px', backgroundColor: '#111827', color: '#fff', fontSize: 14, fontWeight: 500, borderRadius: 8, border: 'none', cursor: 'pointer' }}
        >
          Fund Account
        </button>
      </div>

      {/* Account Summary */}
      <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', marginBottom: 24, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f3f4f6' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: 0 }}>Account Summary</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {[
            { label: 'Total Invested', value: fmt(s.total_invested) },
            { label: 'Total Returns', value: fmt(s.total_returned), color: null },
            { label: 'Lifetime ROI', value: `${(s.lifetime_roi || 0).toFixed(1)}%`, color: (s.lifetime_roi || 0) >= 0 ? '#16a34a' : '#dc2626' },
            { label: 'Available Balance', value: fmt(s.available_balance) },
          ].map((stat, i) => (
            <div key={i} style={{ padding: '20px 24px', borderLeft: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{stat.label}</div>
              <div style={{ fontSize: 24, fontWeight: 600, color: stat.color || '#111827' }}>{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Two column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, marginBottom: 24 }}>
        {/* Portfolio Value Chart */}
        <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: 0 }}>Portfolio Value</h2>
            <div style={{ display: 'flex', gap: 4 }}>
              {['6M', '1Y', 'ALL'].map(period => (
                <button key={period} style={{
                  padding: '4px 10px', borderRadius: 4, fontSize: 12, border: 'none', cursor: 'pointer',
                  backgroundColor: period === '6M' ? '#111827' : 'transparent',
                  color: period === '6M' ? '#fff' : '#6b7280',
                }}>{period}</button>
              ))}
            </div>
          </div>
          <div style={{ padding: '16px 24px' }}>
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
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  labelStyle={{ color: '#6b7280', fontWeight: 500 }}
                  formatter={(v) => [`$${v.toLocaleString()}`, 'Value']}
                />
                <Area type="monotone" dataKey="value" stroke="#111827" strokeWidth={2} fill="url(#colorValue)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Fund Metrics */}
        <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #f3f4f6' }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: 0 }}>Fund Metrics</h2>
          </div>
          <div style={{ padding: 24 }}>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Active Positions</div>
              <div style={{ fontSize: 30, fontWeight: 600, color: '#111827' }}>{s.active_vehicles || 0}</div>
              <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Vehicles currently held</p>
            </div>
            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 20, marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Sold (30 days)</div>
              <div style={{ fontSize: 30, fontWeight: 600, color: '#111827' }}>{s.vehicles_sold_30d || 0}</div>
              <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Vehicles liquidated</p>
            </div>
            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Pending Distributions</div>
              <div style={{ fontSize: 30, fontWeight: 600, color: '#16a34a' }}>{fmt(s.pending_distributions)}</div>
              <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Awaiting payout</p>
            </div>
          </div>
        </div>
      </div>

      {/* Active Positions */}
      {activeVehicles.length > 0 && (
        <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', marginBottom: 24, overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: 0 }}>Active Positions</h2>
            <button onClick={() => navigate('/investor/portfolio')} style={{ color: '#2563eb', fontSize: 12, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer' }}>View All</button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vehicle</th>
                <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 11, fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Capital</th>
                <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 11, fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Days Held</th>
                <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 11, fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {activeVehicles.map(v => {
                const days = Math.floor((new Date() - new Date(v.purchase_date)) / (1000 * 60 * 60 * 24));
                return (
                  <tr key={v.id} style={{ borderBottom: '1px solid #fafafa' }}>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 40, height: 40, backgroundColor: '#f3f4f6', borderRadius: 6, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {v.inventory?.photos?.[0] ? (
                            <img src={v.inventory.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span style={{ color: '#9ca3af', fontSize: 10 }}>N/A</span>
                          )}
                        </div>
                        <span style={{ fontWeight: 500, color: '#111827' }}>
                          {v.vehicle_info?.year} {v.vehicle_info?.make} {v.vehicle_info?.model}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '16px 24px', textAlign: 'right', fontWeight: 500, color: '#111827' }}>{fmt(v.capital_deployed)}</td>
                    <td style={{ padding: '16px 24px', textAlign: 'right', color: '#6b7280' }}>{days}d</td>
                    <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', backgroundColor: '#f0fdf4', color: '#15803d', fontSize: 12, fontWeight: 500, borderRadius: 12 }}>
                        <span style={{ width: 6, height: 6, backgroundColor: '#22c55e', borderRadius: '50%' }} />
                        Active
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent Activity */}
      <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', marginBottom: 24, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f3f4f6' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: 0 }}>Recent Activity</h2>
        </div>

        {recentTransactions.length > 0 ? (
          <div>
            {recentTransactions.map((tx, i) => {
              const isCapital = tx.type === 'capital';
              const isDeposit = isCapital && tx.transaction_type === 'deposit';
              const isDistribution = tx.type === 'distribution';
              const positive = isDeposit || isDistribution;

              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: i < recentTransactions.length - 1 ? '1px solid #fafafa' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backgroundColor: positive ? '#f0fdf4' : '#fef2f2',
                    }}>
                      <svg style={{ width: 16, height: 16, color: positive ? '#16a34a' : '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        {positive
                          ? <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                          : <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        }
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>
                        {isCapital
                          ? (isDeposit ? 'Capital Deposit' : 'Withdrawal')
                          : `Distribution${tx.vehicle?.vehicle_info ? ` - ${tx.vehicle.vehicle_info.year} ${tx.vehicle.vehicle_info.make} ${tx.vehicle.vehicle_info.model}` : ''}`}
                      </div>
                      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                        {fmtDate(tx.created_at || tx.initiated_at)}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: positive ? '#16a34a' : '#ef4444' }}>
                      {positive ? '+' : '-'}{fmt(Math.abs(tx.amount))}
                    </div>
                    <div style={{
                      fontSize: 12, marginTop: 2,
                      color: tx.status === 'completed' ? '#22c55e' : tx.status === 'pending' ? '#f59e0b' : '#9ca3af',
                    }}>
                      {tx.status?.charAt(0).toUpperCase() + tx.status?.slice(1)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <p style={{ color: '#9ca3af', fontSize: 14 }}>No recent activity</p>
            <p style={{ color: '#d1d5db', fontSize: 12, marginTop: 4 }}>Transactions will appear here once your account is funded.</p>
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
        {[
          { label: 'Deposit Funds', desc: 'Add capital', path: '/investor/capital', icon: 'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
          { label: 'Reports', desc: 'Statements & tax docs', path: '/investor/reports', icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z' },
          { label: 'Accreditation', desc: 'Verify status', path: '/investor/accreditation', icon: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z' },
          { label: 'Settings', desc: 'Account & security', path: '/investor/settings', icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z' },
        ].map(item => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, textAlign: 'left', cursor: 'pointer' }}
            onMouseOver={e => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.boxShadow = '0 1px 3px 0 rgb(0 0 0 / 0.1)'; }}
            onMouseOut={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <svg style={{ width: 20, height: 20, color: '#9ca3af', marginBottom: 8 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
            </svg>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>{item.label}</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{item.desc}</div>
          </button>
        ))}
      </div>
    </InvestorLayout>
  );
}
