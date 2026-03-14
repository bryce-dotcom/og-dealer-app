import { useState, useEffect, useRef } from 'react';
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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const prev = { bg: document.body.style.backgroundColor, color: document.body.style.color };
    document.body.style.backgroundColor = '#f8fafc';
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

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate('/investor/login');
  }

  const isActive = (path) => location.pathname === path;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', color: '#111827', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      {/* Nav */}
      <header style={{
        backgroundColor: '#fff',
        borderBottom: '1px solid #e2e8f0',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '0 1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
            {/* Brand */}
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
              onClick={() => navigate('/investor/dashboard')}
            >
              <div style={{
                width: 34, height: 34,
                background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
                borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ color: '#fff', fontSize: 12, fontWeight: 800, letterSpacing: '-0.02em' }}>OG</span>
              </div>
              <div>
                <div style={{ color: '#0f172a', fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em' }}>{BRAND}</div>
                <div style={{ color: '#94a3b8', fontSize: 10, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Investor Portal</div>
              </div>
            </div>

            {/* Desktop nav */}
            <nav style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {navLinks.map(link => (
                <button
                  key={link.path}
                  onClick={() => navigate(link.path)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: isActive(link.path) ? 600 : 500,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    backgroundColor: isActive(link.path) ? '#0f172a' : 'transparent',
                    color: isActive(link.path) ? '#fff' : '#64748b',
                    letterSpacing: '-0.01em',
                  }}
                  onMouseOver={e => { if (!isActive(link.path)) e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
                  onMouseOut={e => { if (!isActive(link.path)) e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  {link.label}
                </button>
              ))}
            </nav>

            {/* Right side */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Notification bell */}
              <button
                onClick={() => navigate('/investor/notifications')}
                style={{
                  position: 'relative', padding: 8, background: 'none', border: 'none',
                  color: '#94a3b8', cursor: 'pointer', borderRadius: 6,
                }}
                onMouseOver={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <svg style={{ width: 20, height: 20 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: 4, right: 4,
                    width: 16, height: 16, backgroundColor: '#ef4444', color: '#fff',
                    fontSize: 10, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, border: '2px solid #fff',
                  }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* User dropdown */}
              <div ref={dropdownRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', borderRadius: 8, border: '1px solid transparent',
                    background: 'none', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseOver={e => { e.currentTarget.style.backgroundColor = '#f1f5f9'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                  onMouseOut={e => { if (!dropdownOpen) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; } }}
                >
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #0f172a 0%, #475569 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>{investor?.full_name?.[0] || '?'}</span>
                  </div>
                  <span style={{ fontSize: 13, color: '#334155', fontWeight: 500 }}>{investor?.full_name?.split(' ')[0] || ''}</span>
                  <svg style={{ width: 14, height: 14, color: '#94a3b8', transition: 'transform 0.15s', transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown menu — fully inline styles */}
                {dropdownOpen && (
                  <div style={{
                    position: 'absolute', right: 0, top: 'calc(100% + 4px)',
                    width: 200, backgroundColor: '#fff',
                    border: '1px solid #e2e8f0', borderRadius: 10,
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
                    zIndex: 100, overflow: 'hidden',
                    animation: 'fadeIn 0.12s ease-out',
                  }}>
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{investor?.full_name || 'Investor'}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{investor?.email || ''}</div>
                    </div>
                    {secondaryLinks.map(link => (
                      <button
                        key={link.path}
                        onClick={() => { navigate(link.path); setDropdownOpen(false); }}
                        style={{
                          width: '100%', textAlign: 'left', padding: '10px 14px',
                          fontSize: 13, color: isActive(link.path) ? '#0f172a' : '#475569',
                          fontWeight: isActive(link.path) ? 600 : 400,
                          background: isActive(link.path) ? '#f8fafc' : 'none',
                          border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}
                        onMouseOver={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                        onMouseOut={e => e.currentTarget.style.backgroundColor = isActive(link.path) ? '#f8fafc' : 'transparent'}
                      >
                        {link.label}
                      </button>
                    ))}
                    <div style={{ borderTop: '1px solid #f1f5f9' }} />
                    <button
                      onClick={() => { handleSignOut(); setDropdownOpen(false); }}
                      style={{
                        width: '100%', textAlign: 'left', padding: '10px 14px',
                        fontSize: 13, color: '#ef4444', fontWeight: 500,
                        background: 'none', border: 'none', cursor: 'pointer',
                      }}
                      onMouseOver={e => e.currentTarget.style.backgroundColor = '#fef2f2'}
                      onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>

              {/* Mobile menu toggle */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                style={{
                  display: 'none', // hide on desktop
                  padding: 8, background: 'none', border: 'none', color: '#64748b', cursor: 'pointer',
                }}
              >
                <svg style={{ width: 20, height: 20 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </button>
            </div>
          </div>

          {/* Mobile nav */}
          {mobileMenuOpen && (
            <div style={{ borderTop: '1px solid #f1f5f9', padding: '8px 0 12px' }}>
              {[...navLinks, ...secondaryLinks].map(link => (
                <button key={link.path} onClick={() => { navigate(link.path); setMobileMenuOpen(false); }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px',
                    fontSize: 14, fontWeight: 500, borderRadius: 6, border: 'none', cursor: 'pointer',
                    backgroundColor: isActive(link.path) ? '#0f172a' : 'transparent',
                    color: isActive(link.path) ? '#fff' : '#475569',
                  }}>
                  {link.label}
                </button>
              ))}
              <div style={{ borderTop: '1px solid #f1f5f9', margin: '8px 0' }} />
              <button onClick={handleSignOut} style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px',
                fontSize: 14, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6,
              }}>
                Sign Out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Page Content */}
      <main style={{ maxWidth, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {(title || subtitle) && (
          <div style={{ marginBottom: 28 }}>
            {title && <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>{title}</h1>}
            {subtitle && <p style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>{subtitle}</p>}
          </div>
        )}
        {children}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #e2e8f0', backgroundColor: '#fff', marginTop: 48 }}>
        <div style={{ maxWidth: '48rem', margin: '0 auto', padding: '1.5rem' }}>
          <p style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
            <strong style={{ color: '#64748b' }}>Important Disclosures: </strong>
            Portfolio values and returns are based on available data and may not reflect real-time market conditions.
            Past performance is not indicative of future results. All investments involve risk, including the possible loss of principal.
            Securities offered through private placement under Regulation D, Rule 506(b). Not FDIC insured. Not bank guaranteed. May lose value.
          </p>
        </div>
      </footer>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
