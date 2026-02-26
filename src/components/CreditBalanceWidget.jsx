import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { CreditService } from '../lib/creditService';

export default function CreditBalanceWidget() {
  const { dealer } = useStore();
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const isAdmin = dealer?.dealer_name === 'OG DiX Motor Club';

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowAdminMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!dealer?.id) return;

    loadBalance();

    // Refresh every 30 seconds
    const interval = setInterval(loadBalance, 30000);
    return () => clearInterval(interval);
  }, [dealer?.id]);

  async function loadBalance() {
    try {
      const bal = await CreditService.getCreditBalance(dealer.id);
      setBalance(bal);
    } catch (error) {
      console.error('Failed to load credit balance:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading || !balance) {
    return null;
  }

  // Unlimited tier
  if (balance.unlimited) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-lg border border-green-500/20">
        <div className="flex items-center gap-1.5">
          <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="text-sm font-semibold text-green-400">Unlimited</span>
        </div>
      </div>
    );
  }

  // Calculate percentage for color coding
  const percentage = balance.allowance > 0 ? (balance.total / balance.allowance) * 100 : 0;
  const isLow = percentage < 20;
  const isMedium = percentage >= 20 && percentage < 50;

  return (
    <div className="relative" ref={menuRef}>
      <div className="flex items-center gap-1">
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
            isLow
              ? 'bg-orange-900/20 border-orange-500/30 hover:bg-orange-900/30'
              : isMedium
              ? 'bg-yellow-900/20 border-yellow-500/30 hover:bg-yellow-900/30'
              : 'bg-gray-800 border-gray-700 hover:bg-gray-700'
          }`}
          onClick={() => navigate('/settings?tab=billing')}
          title="Click to manage credits and billing"
        >
      <div className="flex items-center gap-1.5">
        <svg
          className={`w-4 h-4 ${isLow ? 'text-orange-400' : isMedium ? 'text-yellow-400' : 'text-blue-400'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div className="text-sm">
          <span className={`font-semibold ${isLow ? 'text-orange-400' : isMedium ? 'text-yellow-400' : 'text-white'}`}>
            {balance.total.toLocaleString()}
          </span>
          <span className="text-gray-400 ml-1">
            credit{balance.total !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {isLow && (
        <div className="flex items-center gap-1 ml-1 px-2 py-0.5 bg-orange-500/20 rounded text-xs font-semibold text-orange-300">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          Low
        </div>
      )}

      {balance.bonus > 0 && (
        <div className="text-xs text-green-400 ml-1">
          +{balance.bonus} bonus
        </div>
      )}
        </div>

        {/* Admin Quick Menu */}
        {isAdmin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowAdminMenu(!showAdminMenu);
            }}
            className="p-1.5 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 transition-colors"
            title="Admin Quick Actions"
          >
            <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>
        )}
      </div>

      {/* Admin Dropdown Menu */}
      {isAdmin && showAdminMenu && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="p-2 bg-orange-900/20 border-b border-orange-500/30">
            <div className="text-xs font-semibold text-orange-400 flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              Admin Quick Actions
            </div>
          </div>
          <div className="p-1">
            <button
              onClick={() => {
                setShowAdminMenu(false);
                navigate('/dev?tab=subscriptions');
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-800 rounded flex items-center gap-2 text-white"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Manage Subscriptions
            </button>
            <button
              onClick={() => {
                setShowAdminMenu(false);
                navigate('/dev');
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-800 rounded flex items-center gap-2 text-white"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Dev Console
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
