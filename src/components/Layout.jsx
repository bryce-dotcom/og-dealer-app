import { useState, useEffect, createContext, useContext } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import AIAssistant from './AIAssistant';
import FeedbackButton from './FeedbackButton';

const ThemeContext = createContext(null);
export const useTheme = () => ({
  theme: {
    bg: '#09090b', bgCard: '#18181b', border: '#27272a',
    text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a',
    accent: '#f97316', accentBg: 'rgba(249,115,22,0.15)'
  }
});

export default function Layout() {
  const [showAI, setShowAI] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [authChecking, setAuthChecking] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('sidebarOpen');
    return saved !== null ? saved === 'true' : true;
  });
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved !== null ? saved === 'true' : true;
  });

  const { dealer, setDealer, clearDealer } = useStore();
  const navigate = useNavigate();
  const isAdmin = dealer?.dealer_name === 'OG DiX Motor Club';

  // Auth protection - check session on mount
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        navigate('/login');
        return;
      }

      // Load dealer if not already in store
      if (!dealer) {
        const { data: dealerData, error } = await supabase
          .from('dealer_settings')
          .select('*')
          .eq('owner_user_id', session.user.id)
          .single();

        if (dealerData) {
          setDealer(dealerData);
        } else {
          // No dealer found, redirect to login
          await supabase.auth.signOut();
          navigate('/login');
          return;
        }
      }

      setAuthChecking(false);
    };

    checkAuth();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) setMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => { localStorage.setItem('sidebarOpen', sidebarOpen); }, [sidebarOpen]);

  useEffect(() => {
    localStorage.setItem('darkMode', darkMode);
    const root = document.documentElement;
    if (darkMode) {
      root.style.setProperty('--bg-primary', '#09090b');
      root.style.setProperty('--bg-card', '#18181b');
      root.style.setProperty('--bg-card-hover', '#27272a');
      root.style.setProperty('--border-color', '#27272a');
      root.style.setProperty('--text-primary', '#ffffff');
      root.style.setProperty('--text-secondary', '#a1a1aa');
      root.style.setProperty('--text-muted', '#71717a');
    } else {
      root.style.setProperty('--bg-primary', '#f4f4f5');
      root.style.setProperty('--bg-card', '#ffffff');
      root.style.setProperty('--bg-card-hover', '#f4f4f5');
      root.style.setProperty('--border-color', '#e4e4e7');
      root.style.setProperty('--text-primary', '#18181b');
      root.style.setProperty('--text-secondary', '#52525b');
      root.style.setProperty('--text-muted', '#71717a');
    }
    root.style.setProperty('--accent', '#f97316');
    root.style.setProperty('--accent-bg', darkMode ? 'rgba(249,115,22,0.15)' : 'rgba(249,115,22,0.1)');
  }, [darkMode]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearDealer();
    navigate('/login');
  };

  // Organized navigation with sections
  const navSections = [
    {
      label: null, // No header for main
      items: [
        { to: '/dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      ]
    },
    {
      label: 'SALES',
      items: [
        { to: '/inventory', label: 'Inventory', icon: 'M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10M13 16H3m10 0h6m-6 0v-4h6v4m0 0h2' },
        { to: '/research', label: 'Research', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
        { to: '/deals', label: 'Deals', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
        { to: '/customers', label: 'Customers', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
      ]
    },
    {
      label: 'FINANCE',
      items: [
        { to: '/bhph', label: 'BHPH', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
        { to: '/books', label: 'Books', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
        { to: '/commissions', label: 'Commissions', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
        { to: '/reports', label: 'Reports', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
      ]
    },
    {
      label: 'TEAM',
      items: [
        { to: '/team', label: 'Employees', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
        { to: '/timeclock', label: 'Time Clock', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
        { to: '/payroll', label: 'Payroll', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
      ]
    },
    {
      label: 'ADMIN',
      items: [
        { to: '/document-rules', label: 'Doc Rules', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
        { to: '/admin/state-updates', label: 'State Updates', icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8' },
        { to: '/settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
      ]
    },
  ];

  const theme = {
    dark: darkMode,
    bg: darkMode ? '#09090b' : '#f4f4f5',
    bgCard: darkMode ? '#18181b' : '#ffffff',
    bgCardHover: darkMode ? '#27272a' : '#f4f4f5',
    border: darkMode ? '#27272a' : '#e4e4e7',
    text: darkMode ? '#ffffff' : '#18181b',
    textSecondary: darkMode ? '#a1a1aa' : '#52525b',
    textMuted: darkMode ? '#71717a' : '#71717a',
    accent: '#f97316',
    accentBg: darkMode ? 'rgba(249,115,22,0.15)' : 'rgba(249,115,22,0.1)',
  };

  const NavIcon = ({ path }) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );

  const sidebarWidth = sidebarOpen ? 240 : 72;

  const SidebarContent = ({ onNavClick }) => (
    <>
      <div style={{ padding: '16px', borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ backgroundColor: '#000', borderRadius: '8px', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src="/favicon.png" alt="OG Dealer" style={{ height: '28px', width: 'auto' }} />
        </div>
        {(sidebarOpen || isMobile) && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: theme.text, fontWeight: '600', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {dealer?.dealer_name || ''}
            </div>
            <div style={{ color: theme.textMuted, fontSize: '12px' }}>
              {dealer?.subscription_status === 'trial' ? '14-day trial' : dealer?.state || 'UT'}
            </div>
          </div>
        )}
      </div>

      <nav style={{ flex: 1, padding: '8px', overflowY: 'auto' }}>
        {navSections.map((section, sectionIndex) => (
          <div key={sectionIndex} style={{ marginBottom: '8px' }}>
            {section.label && (sidebarOpen || isMobile) && (
              <div style={{
                padding: '8px 12px 4px',
                fontSize: '11px',
                fontWeight: '600',
                color: theme.textMuted,
                letterSpacing: '0.5px',
                textTransform: 'uppercase'
              }}>
                {section.label}
              </div>
            )}
            {!sidebarOpen && !isMobile && section.label && (
              <div style={{ height: '1px', backgroundColor: theme.border, margin: '8px 12px' }} />
            )}
            {section.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onNavClick}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: (sidebarOpen || isMobile) ? '10px 12px' : '10px',
                  borderRadius: '8px',
                  color: isActive ? theme.text : theme.textSecondary,
                  backgroundColor: isActive ? theme.accentBg : 'transparent',
                  textDecoration: 'none',
                  fontSize: '14px',
                  fontWeight: isActive ? '600' : '500',
                  marginBottom: '2px',
                  justifyContent: (sidebarOpen || isMobile) ? 'flex-start' : 'center',
                  borderLeft: isActive ? `3px solid ${theme.accent}` : '3px solid transparent',
                  transition: 'all 0.15s ease'
                })}
                title={!sidebarOpen && !isMobile ? item.label : undefined}
              >
                <NavIcon path={item.icon} />
                {(sidebarOpen || isMobile) && <span>{item.label}</span>}
              </NavLink>
            ))}
          </div>
        ))}

        {isAdmin && (
          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${theme.border}` }}>
            {(sidebarOpen || isMobile) && (
              <div style={{
                padding: '8px 12px 4px',
                fontSize: '11px',
                fontWeight: '600',
                color: '#ef4444',
                letterSpacing: '0.5px',
                textTransform: 'uppercase'
              }}>
                DEV
              </div>
            )}
            <NavLink
              to="/admin/dev-console"
              onClick={onNavClick}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: (sidebarOpen || isMobile) ? '10px 12px' : '10px',
                borderRadius: '8px',
                color: '#ef4444',
                backgroundColor: isActive ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                textDecoration: 'none',
                fontSize: '14px',
                fontWeight: '600',
                marginBottom: '2px',
                justifyContent: (sidebarOpen || isMobile) ? 'flex-start' : 'center',
                borderLeft: isActive ? '3px solid #ef4444' : '3px solid transparent',
                transition: 'all 0.15s ease'
              })}
              title={!sidebarOpen && !isMobile ? 'Dev Console' : undefined}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              {(sidebarOpen || isMobile) && <span>Dev Console</span>}
            </NavLink>
            <NavLink
              to="/dev"
              onClick={onNavClick}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: (sidebarOpen || isMobile) ? '10px 12px' : '10px',
                borderRadius: '8px',
                color: '#ef4444',
                backgroundColor: isActive ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                textDecoration: 'none',
                fontSize: '14px',
                fontWeight: '600',
                marginBottom: '2px',
                justifyContent: (sidebarOpen || isMobile) ? 'flex-start' : 'center',
                borderLeft: isActive ? '3px solid #ef4444' : '3px solid transparent',
                transition: 'all 0.15s ease'
              })}
              title={!sidebarOpen && !isMobile ? 'Data Console' : undefined}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
              </svg>
              {(sidebarOpen || isMobile) && <span>Data Console</span>}
            </NavLink>
          </div>
        )}
      </nav>

      <div style={{ padding: '12px', borderTop: `1px solid ${theme.border}` }}>
        <button
          onClick={() => setDarkMode(!darkMode)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: (sidebarOpen || isMobile) ? 'flex-start' : 'center',
            gap: '12px',
            padding: '10px 12px',
            marginBottom: '8px',
            backgroundColor: 'transparent',
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            color: theme.textSecondary,
            fontSize: '14px',
            cursor: 'pointer'
          }}
        >
          {darkMode ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
          )}
          {(sidebarOpen || isMobile) && <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: (sidebarOpen || isMobile) ? 'flex-start' : 'center',
            gap: '12px',
            padding: '10px 12px',
            backgroundColor: 'transparent',
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            color: '#ef4444',
            fontSize: '14px',
            cursor: 'pointer'
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
          {(sidebarOpen || isMobile) && <span>Logout</span>}
        </button>
      </div>
    </>
  );

  // Show loading screen while checking auth
  if (authChecking) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: theme.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: theme.text
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '60px',
            height: '60px',
            backgroundColor: theme.accent,
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: '24px',
            fontWeight: '700',
            color: '#fff'
          }}>
            OG
          </div>
          <div style={{ fontSize: '14px', color: theme.textSecondary }}>Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <ThemeContext.Provider value={{ darkMode, setDarkMode, theme }}>
      <div style={{ minHeight: '100vh', backgroundColor: theme.bg, color: theme.text, transition: 'background-color 0.3s, color 0.3s' }}>
        {!isMobile && (
          <>
            <aside style={{
              position: 'fixed', top: 0, left: 0, height: '100vh', width: sidebarWidth,
              backgroundColor: theme.bgCard, borderRight: `1px solid ${theme.border}`,
              display: 'flex', flexDirection: 'column', transition: 'width 0.3s ease', zIndex: 40
            }}>
              <SidebarContent onNavClick={() => {}} />
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                style={{
                  position: 'absolute', top: '50%', right: '-12px', transform: 'translateY(-50%)',
                  width: '24px', height: '24px', borderRadius: '50%', backgroundColor: theme.bgCard,
                  border: `1px solid ${theme.border}`, cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', color: theme.textSecondary, zIndex: 50
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {sidebarOpen ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
                </svg>
              </button>
            </aside>
            <main style={{ marginLeft: sidebarWidth, minHeight: '100vh', transition: 'margin-left 0.3s ease' }}>
              <Outlet />
            </main>
          </>
        )}

        {isMobile && (
          <>
            <header style={{
              position: 'sticky', top: 0, zIndex: 40, display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', padding: '12px 16px', backgroundColor: theme.bgCard,
              borderBottom: `1px solid ${theme.border}`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ backgroundColor: '#000', borderRadius: '8px', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src="/favicon.png" alt="OG Dealer" style={{ height: '28px', width: 'auto' }} />
                </div>
                <span style={{ fontWeight: '600', fontSize: '15px' }}>{dealer?.dealer_name || ''}</span>
              </div>
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} style={{ background: 'none', border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '8px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '20px' }}>
                  <span style={{ display: 'block', height: '2px', backgroundColor: theme.text, transition: 'all 0.3s', transform: mobileMenuOpen ? 'rotate(45deg) translateY(6px)' : 'none' }} />
                  <span style={{ display: 'block', height: '2px', backgroundColor: theme.text, transition: 'all 0.3s', opacity: mobileMenuOpen ? 0 : 1 }} />
                  <span style={{ display: 'block', height: '2px', backgroundColor: theme.text, transition: 'all 0.3s', transform: mobileMenuOpen ? 'rotate(-45deg) translateY(-6px)' : 'none' }} />
                </div>
              </button>
            </header>
            {mobileMenuOpen && <div onClick={() => setMobileMenuOpen(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 45 }} />}
            <aside style={{
              position: 'fixed', top: 0, left: 0, height: '100vh', width: '280px', backgroundColor: theme.bgCard,
              borderRight: `1px solid ${theme.border}`, transform: mobileMenuOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 0.3s ease', zIndex: 50, display: 'flex', flexDirection: 'column'
            }}>
              <SidebarContent onNavClick={() => setMobileMenuOpen(false)} />
            </aside>
            <main style={{ minHeight: 'calc(100vh - 60px)' }}><Outlet /></main>
          </>
        )}

        <div style={{ position: 'fixed', bottom: '24px', left: '24px', zIndex: 35, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '20px', padding: '6px 12px', fontSize: '12px', fontWeight: '600', color: theme.text, boxShadow: '0 2px 8px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: theme.accent }}>✨</span>Ask Arnie
          </div>
          <button onClick={() => setShowAI(true)} className="arnie-btn" style={{ position: 'relative', width: '60px', height: '60px', borderRadius: '50%', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', padding: 0 }}>
            <div className="sparkle-ring" style={{ position: 'absolute', inset: '-4px', borderRadius: '50%', background: 'conic-gradient(from 0deg, #f97316, #fb923c, #fbbf24, #f97316)', animation: 'spin 3s linear infinite' }} />
            <div style={{ position: 'absolute', inset: '2px', borderRadius: '50%', backgroundColor: theme.bgCard, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src="/og-arnie.png" alt="OG Arnie" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = '<span style="font-size:24px">🤖</span>'; }} />
            </div>
            <div className="sparkle s1" style={{ position: 'absolute', top: '-8px', right: '5px', fontSize: '14px', animation: 'float 2s ease-in-out infinite' }}>✨</div>
            <div className="sparkle s2" style={{ position: 'absolute', bottom: '0', left: '-5px', fontSize: '12px', animation: 'float 2s ease-in-out infinite 0.5s' }}>✨</div>
            <div className="sparkle s3" style={{ position: 'absolute', top: '10px', left: '-8px', fontSize: '10px', animation: 'float 2s ease-in-out infinite 1s' }}>✨</div>
          </button>
        </div>
<FeedbackButton />
        <AIAssistant isOpen={showAI} onClose={() => setShowAI(false)} />

        <AIAssistant isOpen={showAI} onClose={() => setShowAI(false)} />

        <style>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes float { 0%, 100% { transform: translateY(0) scale(1); opacity: 1; } 50% { transform: translateY(-5px) scale(1.2); opacity: 0.8; } }
          .arnie-btn:hover .sparkle-ring { animation-duration: 1s; }
          .arnie-btn:hover .sparkle { animation-duration: 0.5s; }
        `}</style>
      </div>
    </ThemeContext.Provider>
  );
}