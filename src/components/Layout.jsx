import { useState, useEffect, createContext, useContext } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { getPermissions, NAV_PERMISSION_MAP } from '../lib/permissions';
import AIAssistant from './AIAssistant';
import FeedbackButton from './FeedbackButton';
import CreditBalanceWidget from './CreditBalanceWidget';

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

  const { dealer, setDealer, clearDealer, currentEmployee, setCurrentEmployee } = useStore();
  const navigate = useNavigate();
  const isAdmin = dealer?.dealer_name === 'OG DiX Motor Club';
  const permissions = getPermissions(currentEmployee);

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
        // First check if user is a dealer owner
        const { data: dealerData } = await supabase
          .from('dealer_settings')
          .select('*')
          .eq('owner_user_id', session.user.id)
          .maybeSingle();

        if (dealerData) {
          setDealer(dealerData);
          setCurrentEmployee(null); // null = dealer owner = full access
        } else {
          // Check if user is an employee
          const { data: employeeData } = await supabase
            .from('employees')
            .select('*')
            .eq('user_id', session.user.id)
            .eq('active', true)
            .maybeSingle();

          if (employeeData) {
            // Load dealer settings for this employee
            const { data: empDealerData } = await supabase
              .from('dealer_settings')
              .select('*')
              .eq('id', employeeData.dealer_id)
              .single();

            if (empDealerData) {
              setDealer(empDealerData);
              setCurrentEmployee(employeeData); // Store the employee record with roles
            } else {
              // Employee's dealer not found
              await supabase.auth.signOut();
              navigate('/login');
              return;
            }
          } else {
            // Not a dealer owner or employee
            await supabase.auth.signOut();
            navigate('/login');
            return;
          }
        }
      } else if (currentEmployee === undefined) {
        // Dealer loaded from persistence but currentEmployee not set yet
        const { data: empCheck } = await supabase
          .from('employees')
          .select('*')
          .eq('user_id', session.user.id)
          .eq('active', true)
          .maybeSingle();
        setCurrentEmployee(empCheck || null);
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
        { to: '/deal-finder', label: 'Deal Finder', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
        { to: '/research', label: 'Research', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
        { to: '/deals', label: 'Deals', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
        { to: '/customers', label: 'Customers', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
        { to: '/email-marketing', label: 'Connect', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
        { to: '/sms', label: 'SMS', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
        { to: '/appointments', label: 'Appointments', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
        { to: '/leads', label: 'Leads', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
        { to: '/trade-ins', label: 'Trade-Ins', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
        { to: '/deal-timeline', label: 'Deal Activity', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
        { to: '/test-drives', label: 'Test Drives', icon: 'M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10' },
      ]
    },
    {
      label: 'FINANCE',
      items: [
        { to: '/bhph', label: 'BHPH', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
        { to: '/books', label: 'Books', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
        { to: '/commissions', label: 'Commissions', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
        { to: '/reports', label: 'Reports', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
        { to: '/analytics', label: 'Analytics', icon: 'M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
        { to: '/floor-plan', label: 'Floor Plan', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
        { to: '/fi-products', label: 'F&I Products', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
        { to: '/auctions', label: 'Auctions', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
        { to: '/lenders', label: 'Lenders', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
        { to: '/deal-jackets', label: 'Deal Jackets', icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4' },
        { to: '/admin/investors', label: 'Investors', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
      ]
    },
    {
      label: 'TEAM',
      items: [
        { to: '/team', label: 'Employees', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
        { to: '/timeclock', label: 'Time Clock', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
        { to: '/payroll', label: 'Payroll', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
        { to: '/tasks', label: 'Tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
      ]
    },
    {
      label: 'ADMIN',
      items: [
        { to: '/import', label: 'Import Data', icon: 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12' },
        { to: '/marketplaces', label: 'Marketplaces', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z' },
        { to: '/document-rules', label: 'Doc Rules', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
        { to: '/esignature', label: 'E-Signatures', icon: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z' },
        { to: '/notifications', label: 'Notifications', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
        { to: '/compliance', label: 'Compliance', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
        { to: '/marketplace-listings', label: 'Listings', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
        { to: '/crm-workflows', label: 'Workflows', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' },
        { to: '/customer-portal', label: 'Portal', icon: 'M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
        { to: '/reconditioning', label: 'Reconditioning', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
        { to: '/vehicle-tracking', label: 'GPS Tracking', icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z' },
        { to: '/photos', label: 'Photos', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
        { to: '/titles', label: 'Titles & Reg', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
        { to: '/vendors', label: 'Vendors', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1' },
        { to: '/keys', label: 'Keys & Lot', icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z' },
        { to: '/warranty-claims', label: 'Warranty', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
        { to: '/service-orders', label: 'Service', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0' },
        { to: '/inspections', label: 'Inspections', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
        { to: '/reviews', label: 'Reviews', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
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
      <div style={{ padding: '16px', borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
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
        {(sidebarOpen || isMobile) && <CreditBalanceWidget />}
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
            {section.items.filter(item => {
              const permKey = NAV_PERMISSION_MAP[item.to];
              return !permKey || permissions[permKey];
            }).map(item => (
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
                <CreditBalanceWidget />
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

        <div style={{ position: 'fixed', bottom: '24px', left: '160px', zIndex: 51, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
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