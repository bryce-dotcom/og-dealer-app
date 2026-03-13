import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const BRAND = 'OG DiX Motor Club';

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

export default function InvestorLayout({ children, title, subtitle, maxWidth = '72rem' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [investor, setInvestor] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const prev = { bg: document.body.style.backgroundColor, color: document.body.style.color };
    document.body.style.backgroundColor = '#f9fafb';
    document.body.style.color = '#111827';
    return () => { document.body.style.backgroundColor = prev.bg; document.body.style.color = prev.color; };
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/investor/login'); return; }
      const { data } = await supabase.from('investors').select('id, full_name, email').eq('user_id', user.id).single();
      if (!data) { navigate('/investor/login'); return; }
      setInvestor(data);
      const { data: count } = await supabase.rpc('get_investor_unread_count', { p_investor_id: data.id });
      setUnreadCount(count || 0);
    })();
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate('/investor/login');
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', color: '#111827', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      {/* Nav */}
      <header style={{ backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '0 1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
            {/* Brand */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 32, height: 32, backgroundColor: '#111827', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>OG</span>
              </div>
              <div>
                <div style={{ color: '#111827', fontWeight: 600, fontSize: 14 }}>{BRAND}</div>
                <div style={{ color: '#9ca3af', fontSize: 11 }}>Investor Portal</div>
              </div>
            </div>

            {/* Desktop nav */}
            <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {navLinks.map(link => (
                <button
                  key={link.path}
                  onClick={() => navigate(link.path)}
                  style={{
                    padding: '8px 12px', borderRadius: 6, fontSize: 14, fontWeight: 500, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                    backgroundColor: location.pathname === link.path ? '#111827' : 'transparent',
                    color: location.pathname === link.path ? '#fff' : '#4b5563',
                  }}
                >
                  {link.label}
                </button>
              ))}
            </nav>

            {/* Right side */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => navigate('/investor/notifications')} style={{ position: 'relative', padding: 8, background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>
                <svg style={{ width: 20, height: 20 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
                {unreadCount > 0 && (
                  <span style={{ position: 'absolute', top: 4, right: 4, width: 16, height: 16, backgroundColor: '#ef4444', color: '#fff', fontSize: 10, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              <div className="relative group">
                <button style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#fff', fontSize: 12, fontWeight: 500 }}>{investor?.full_name?.[0] || '?'}</span>
                  </div>
                  <span style={{ fontSize: 14, color: '#374151', fontWeight: 500 }}>{investor?.full_name?.split(' ')[0] || ''}</span>
                  <svg style={{ width: 16, height: 16, color: '#9ca3af' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </button>
                <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all" style={{ zIndex: 100 }}>
                  {secondaryLinks.map(link => (
                    <button key={link.path} onClick={() => navigate(link.path)} style={{ width: '100%', textAlign: 'left', padding: '10px 16px', fontSize: 14, color: '#4b5563', background: 'none', border: 'none', cursor: 'pointer' }}
                      onMouseOver={e => e.target.style.backgroundColor = '#f9fafb'}
                      onMouseOut={e => e.target.style.backgroundColor = 'transparent'}>
                      {link.label}
                    </button>
                  ))}
                  <div style={{ borderTop: '1px solid #f3f4f6' }} />
                  <button onClick={handleSignOut} style={{ width: '100%', textAlign: 'left', padding: '10px 16px', fontSize: 14, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0 0 8px 8px' }}
                    onMouseOver={e => e.target.style.backgroundColor = '#fef2f2'}
                    onMouseOut={e => e.target.style.backgroundColor = 'transparent'}>
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile nav */}
          {mobileMenuOpen && (
            <div style={{ borderTop: '1px solid #f3f4f6', padding: '8px 0 12px' }}>
              {[...navLinks, ...secondaryLinks].map(link => (
                <button key={link.path} onClick={() => { navigate(link.path); setMobileMenuOpen(false); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', fontSize: 14, fontWeight: 500, borderRadius: 6, border: 'none', cursor: 'pointer',
                    backgroundColor: location.pathname === link.path ? '#111827' : 'transparent',
                    color: location.pathname === link.path ? '#fff' : '#4b5563',
                  }}>
                  {link.label}
                </button>
              ))}
              <div style={{ borderTop: '1px solid #f3f4f6', margin: '8px 0' }} />
              <button onClick={handleSignOut} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', fontSize: 14, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6 }}>
                Sign Out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Page Content */}
      <main style={{ maxWidth, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {(title || subtitle) && (
          <div style={{ marginBottom: 32 }}>
            {title && <h1 style={{ fontSize: 24, fontWeight: 600, color: '#111827', margin: 0 }}>{title}</h1>}
            {subtitle && <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>{subtitle}</p>}
          </div>
        )}
        {children}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #e5e7eb', backgroundColor: '#fff', marginTop: 48 }}>
        <div style={{ maxWidth: '48rem', margin: '0 auto', padding: '1.5rem' }}>
          <p style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.6 }}>
            <strong style={{ color: '#6b7280' }}>Important Disclosures: </strong>
            Portfolio values and returns are based on available data and may not reflect real-time market conditions.
            Past performance is not indicative of future results. All investments involve risk, including the possible loss of principal.
            Securities offered through private placement under Regulation D, Rule 506(b). Not FDIC insured. Not bank guaranteed. May lose value.
          </p>
        </div>
      </footer>
    </div>
  );
}
