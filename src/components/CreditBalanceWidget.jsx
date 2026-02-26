import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { CreditService } from '../lib/creditService';

export default function CreditBalanceWidget() {
  const { dealer } = useStore();
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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
  );
}
