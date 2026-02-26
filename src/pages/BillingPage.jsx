import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { CreditService } from '../lib/creditService';

export default function BillingPage() {
  const { dealer } = useStore();
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState(null);
  const [balance, setBalance] = useState(null);
  const [usage, setUsage] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, [dealer?.id]);

  async function loadData() {
    if (!dealer?.id) return;

    try {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('dealer_id', dealer.id)
        .single();

      setSubscription(sub);

      const bal = await CreditService.getCreditBalance(dealer.id);
      setBalance(bal);

      const { data: usageData } = await supabase
        .from('credit_usage_log')
        .select('*')
        .eq('dealer_id', dealer.id)
        .order('created_at', { ascending: false })
        .limit(20);

      setUsage(usageData || []);
    } catch (err) {
      console.error('Failed to load billing data:', err);
      setError('Failed to load billing information');
    }
  }

  async function handleUpgrade(planTier) {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const { data, error: funcError } = await supabase.functions.invoke('stripe-create-checkout', {
        body: {
          dealer_id: dealer.id,
          plan_tier: planTier,
          success_url: `${window.location.origin}/settings?tab=billing&payment=success`,
          cancel_url: `${window.location.origin}/settings?tab=billing&payment=canceled`
        }
      });

      if (funcError) throw funcError;

      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err) {
      console.error('Upgrade error:', err);
      setError(err.message || 'Failed to start checkout');
    } finally {
      setLoading(false);
    }
  }

  async function handlePurchaseCredits(dollarAmount) {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      // Calculate credits (approximately $0.40 per credit)
      const credits = Math.floor(dollarAmount * 2.5);

      const { data, error: funcError } = await supabase.functions.invoke('stripe-purchase-credits', {
        body: {
          dealer_id: dealer.id,
          amount_dollars: dollarAmount,
          credits: credits
        }
      });

      if (funcError) throw funcError;

      if (data?.client_secret) {
        // For now, redirect to a simple payment page
        // In production, you'd use Stripe Elements here
        setError(`Credit purchase of $${dollarAmount} (${credits} credits) - Payment integration coming soon!`);
      } else {
        throw new Error('No payment intent returned');
      }
    } catch (err) {
      console.error('Purchase error:', err);
      setError(err.message || 'Failed to purchase credits');
    } finally {
      setLoading(false);
    }
  }

  const formatFeatureName = (type) => {
    const names = {
      vehicle_research: 'Vehicle Research',
      deal_doctor: 'Deal Doctor',
      market_comp_report: 'Market Comp Report',
      ai_arnie_query: 'AI Arnie Query',
      vin_decode: 'VIN Decode',
      form_generation: 'Form Generation',
      plaid_sync: 'Plaid Bank Sync',
      payroll_run: 'Payroll Run'
    };
    return names[type] || type;
  };

  const currentPlan = subscription?.plan_tier || 'free';
  const isUnlimited = currentPlan === 'unlimited';

  return (
    <div className="max-w-6xl mx-auto">
      {/* Success/Error Messages */}
      {new URLSearchParams(window.location.search).get('payment') === 'success' && (
        <div className="mb-6 p-4 bg-green-900/20 border border-green-500/30 rounded-lg text-green-400">
          ✓ Payment successful! Your plan has been upgraded.
        </div>
      )}
      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Current Plan Section */}
      <div className="bg-zinc-900 rounded-lg p-6 mb-6 border border-zinc-800">
        <h2 className="text-xl font-bold mb-4">Current Plan</h2>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="text-3xl font-bold capitalize">{currentPlan}</div>
              {subscription?.status === 'trialing' && (
                <span className="px-3 py-1 bg-blue-900/30 border border-blue-500/30 text-blue-400 rounded-full text-sm">
                  Trial
                </span>
              )}
              {subscription?.status === 'past_due' && (
                <span className="px-3 py-1 bg-red-900/30 border border-red-500/30 text-red-400 rounded-full text-sm">
                  Past Due
                </span>
              )}
            </div>
            <div className="text-gray-400 space-y-1">
              {balance && (
                <div>
                  <span className="font-semibold text-white text-2xl">{balance.total.toLocaleString()}</span>
                  <span className="text-lg"> credits remaining</span>
                  {balance.bonus > 0 && <span className="text-green-400 ml-2">(+{balance.bonus} bonus)</span>}
                </div>
              )}
              {balance?.next_reset && !isUnlimited && (
                <div className="text-sm">
                  Credits reset: {new Date(balance.next_reset).toLocaleDateString()}
                </div>
              )}
              {balance && !isUnlimited && (
                <div className="text-sm">
                  Used this month: {balance.used} / {balance.allowance}
                </div>
              )}
            </div>
          </div>
          {!isUnlimited && (
            <button
              onClick={() => handleUpgrade('unlimited')}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Processing...' : 'Upgrade to Unlimited'}
            </button>
          )}
        </div>
      </div>

      {/* Pricing Tiers */}
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-4">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <PricingCard
            tier="free"
            name="Free"
            price={0}
            credits={10}
            features={['10 credits/month', 'All features', 'Rate limited when out']}
            current={currentPlan === 'free'}
            onSelect={() => {}}
            disabled={true}
            badge={subscription?.status === 'trialing' ? 'Current Trial' : undefined}
          />
          <PricingCard
            tier="pro"
            name="Pro"
            price={79}
            credits={500}
            features={['500 credits/month', 'All features', 'Email support']}
            current={currentPlan === 'pro'}
            onSelect={() => handleUpgrade('pro')}
            disabled={loading || currentPlan === 'unlimited'}
          />
          <PricingCard
            tier="dealer"
            name="Dealer"
            price={149}
            credits={1500}
            features={['1,500 credits/month', 'All features', 'Priority support']}
            current={currentPlan === 'dealer'}
            onSelect={() => handleUpgrade('dealer')}
            disabled={loading || currentPlan === 'unlimited'}
          />
          <PricingCard
            tier="unlimited"
            name="Unlimited"
            price={299}
            credits="unlimited"
            features={['Unlimited credits', 'All features', 'Priority support', 'Dedicated account manager']}
            current={currentPlan === 'unlimited'}
            onSelect={() => handleUpgrade('unlimited')}
            disabled={loading || currentPlan === 'unlimited'}
            recommended={true}
          />
        </div>
      </div>

      {/* Buy Additional Credits */}
      {!isUnlimited && (
        <div className="bg-zinc-900 rounded-lg p-6 mb-6 border border-zinc-800">
          <h2 className="text-xl font-bold mb-4">Buy Additional Credits</h2>
          <p className="text-gray-400 text-sm mb-4">
            Need more credits? Purchase in $20 increments - credits never expire!
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[20, 40, 60, 80, 100, 150, 200, 250, 300, 400, 500, 1000].map(amount => (
              <button
                key={amount}
                onClick={() => handlePurchaseCredits(amount)}
                disabled={loading}
                className="p-4 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="text-2xl font-bold text-white mb-1">${amount}</div>
                <div className="text-xs text-gray-400">≈ {Math.floor(amount * 2.5)} credits</div>
              </button>
            ))}
          </div>
          <div className="mt-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg text-sm text-blue-400">
            💡 <strong>Tip:</strong> Credits are approximately $0.40 each. Buying more saves more!
          </div>
        </div>
      )}

      {/* Credit Costs Reference */}
      <div className="bg-zinc-900 rounded-lg p-6 mb-6 border border-zinc-800">
        <h2 className="text-xl font-bold mb-4">Credit Costs</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <CreditCostItem name="Vehicle Research" cost={10} />
          <CreditCostItem name="Deal Doctor" cost={15} />
          <CreditCostItem name="Market Comp Report" cost={20} />
          <CreditCostItem name="AI Arnie Query" cost={3} />
          <CreditCostItem name="VIN Decode" cost={1} />
          <CreditCostItem name="Form Generation" cost={5} />
          <CreditCostItem name="Plaid Bank Sync" cost={5} />
          <CreditCostItem name="Payroll Run" cost={10} />
        </div>
      </div>

      {/* Recent Usage */}
      <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
        <h2 className="text-xl font-bold mb-4">Recent Usage</h2>
        {usage.length === 0 ? (
          <div className="text-gray-400 text-center py-8">No usage yet</div>
        ) : (
          <div className="space-y-2">
            {usage.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg"
              >
                <div className="flex-1">
                  <div className="font-medium">{formatFeatureName(item.feature_type)}</div>
                  <div className="text-sm text-gray-400">
                    {new Date(item.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-semibold ${item.credits_used === 0 ? 'text-green-400' : 'text-white'}`}>
                    {item.credits_used === 0 ? 'Unlimited' : `-${item.credits_used} credits`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PricingCard({ tier, name, price, credits, features, current, onSelect, disabled, recommended, badge }) {
  return (
    <div
      className={`relative p-6 rounded-lg border-2 transition-all ${
        current
          ? 'border-blue-500 bg-blue-900/10'
          : recommended
          ? 'border-green-500 bg-green-900/10'
          : 'border-zinc-800 bg-zinc-900'
      }`}
    >
      {recommended && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-full">
          RECOMMENDED
        </div>
      )}
      {badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-500 text-white text-xs font-bold rounded-full">
          {badge}
        </div>
      )}
      <div className="text-center mb-4">
        <h3 className="text-xl font-bold mb-2">{name}</h3>
        <div className="text-3xl font-bold mb-1">${price}</div>
        <div className="text-sm text-gray-400">/month</div>
        <div className="mt-2 text-lg font-semibold text-blue-400">
          {typeof credits === 'number' ? `${credits.toLocaleString()} credits` : credits}
        </div>
      </div>
      <ul className="space-y-2 mb-6">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {feature}
          </li>
        ))}
      </ul>
      <button
        onClick={onSelect}
        disabled={disabled || current}
        className={`w-full py-2 px-4 rounded-lg font-semibold transition-colors ${
          current
            ? 'bg-zinc-700 text-gray-400 cursor-default'
            : disabled
            ? 'bg-zinc-800 text-gray-500 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        }`}
      >
        {current ? 'Current Plan' : disabled && tier !== 'free' ? 'Unavailable' : tier === 'free' ? 'Default Plan' : 'Select Plan'}
      </button>
    </div>
  );
}

function CreditCostItem({ name, cost }) {
  return (
    <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
      <span className="text-sm font-medium">{name}</span>
      <span className="text-sm font-bold text-blue-400">{cost} credits</span>
    </div>
  );
}
