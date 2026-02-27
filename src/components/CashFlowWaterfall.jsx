import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useTheme } from './Layout';

export default function CashFlowWaterfall({ dealerId, period = 'current-month' }) {
  const themeContext = useTheme();
  const theme = themeContext?.theme || {
    bg: '#09090b', bgCard: '#18181b', border: '#27272a',
    text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a',
    accent: '#f97316', accentBg: 'rgba(249,115,22,0.15)'
  };

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(period);
  const [hoveredBucket, setHoveredBucket] = useState(null);

  useEffect(() => {
    console.log('CashFlowWaterfall mounted, dealerId:', dealerId);
    if (!dealerId) {
      console.log('No dealerId, skipping fetch');
      return;
    }
    fetchCashFlowData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchCashFlowData();
    }, 30000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealerId, selectedPeriod]);

  function getPeriodDates(period) {
    const now = new Date();
    let start, end;

    switch (period) {
      case 'current-month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'last-month':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'last-3-months':
        start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'ytd':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  }

  async function calculateRevenue(startDate, endDate) {
    try {
      console.log('Querying deals from', startDate, 'to', endDate);

      // Deal profit from sold/delivered deals
      const { data: deals, error: dealsError } = await supabase
        .from('deals')
        .select('sale_price, purchase_price, gap_insurance, extended_warranty, protection_package, doc_fee, stage, date_of_sale')
        .eq('dealer_id', dealerId)
        .or('stage.eq.Sold,stage.eq.Delivered')
        .gte('date_of_sale', startDate)
        .lte('date_of_sale', endDate);

      if (dealsError) throw dealsError;

      console.log('Found', (deals || []).length, 'sold/delivered deals:', deals);

      const dealProfit = (deals || []).reduce((sum, deal) => {
        const vehicleProfit = (deal.sale_price || 0) - (deal.purchase_price || 0);
        const fiProfit =
          (deal.gap_insurance || 0) * 0.75 +
          (deal.extended_warranty || 0) * 0.50 +
          (deal.protection_package || 0) * 0.70;
        return sum + vehicleProfit + fiProfit + (deal.doc_fee || 0);
      }, 0);

      // BHPH interest income
      const { data: payments, error: paymentsError } = await supabase
        .from('bhph_payments')
        .select('interest')
        .eq('dealer_id', dealerId)
        .gte('payment_date', startDate)
        .lte('payment_date', endDate);

      if (paymentsError) throw paymentsError;

      console.log('Found', (payments || []).length, 'BHPH payments');

      const interestIncome = (payments || []).reduce((sum, p) => sum + (p.interest || 0), 0);
      const totalRevenue = dealProfit + interestIncome;

      console.log('Revenue breakdown - Deal profit:', dealProfit, 'Interest:', interestIncome, 'Total:', totalRevenue);

      return totalRevenue;
    } catch (error) {
      console.error('Error calculating revenue:', error);
      console.error('Error details:', error.message, error.details, error.hint);
      return 0;
    }
  }

  async function calculateBurnRate(startDate, endDate) {
    try {
      // Execute queries in parallel
      const [paystubs, expenses, invExpenses, liabilities] = await Promise.all([
        supabase.from('paystubs')
          .select('gross_pay')
          .eq('dealer_id', dealerId)
          .gte('pay_date', startDate)
          .lte('pay_date', endDate),

        supabase.from('manual_expenses')
          .select('amount')
          .eq('dealer_id', dealerId)
          .gte('expense_date', startDate)
          .lte('expense_date', endDate),

        supabase.from('inventory_expenses')
          .select('amount')
          .eq('dealer_id', dealerId)
          .gte('expense_date', startDate)
          .lte('expense_date', endDate),

        supabase.from('liabilities')
          .select('monthly_payment')
          .eq('dealer_id', dealerId)
          .eq('status', 'active')
      ]);

      const payroll = (paystubs.data || []).reduce((sum, p) => sum + (p.gross_pay || 0), 0);
      const opex = (expenses.data || []).reduce((sum, e) => sum + (e.amount || 0), 0);
      const recon = (invExpenses.data || []).reduce((sum, e) => sum + (e.amount || 0), 0);

      // Prorate monthly payments for period
      const days = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24);
      const monthlyFactor = days / 30;
      const debtPayments = (liabilities.data || []).reduce((sum, l) => sum + (l.monthly_payment || 0), 0) * monthlyFactor;

      return {
        total: payroll + opex + recon + debtPayments,
        breakdown: {
          payroll,
          expenses: opex,
          recon,
          debt: debtPayments
        }
      };
    } catch (error) {
      console.error('Error calculating burn rate:', error);
      return { total: 0, breakdown: { payroll: 0, expenses: 0, recon: 0, debt: 0 } };
    }
  }

  function getCapitalTarget(revenue) {
    return Math.max(revenue * 0.15, 5000);
  }

  async function calculateSpoilsRequired() {
    try {
      const [invComm, dealComm] = await Promise.all([
        supabase.from('inventory_commissions')
          .select('amount')
          .eq('dealer_id', dealerId),

        supabase.from('commissions')
          .select('amount')
          .eq('dealer_id', dealerId)
          .eq('status', 'pending')
      ]);

      const total =
        (invComm.data || []).reduce((sum, c) => sum + (c.amount || 0), 0) +
        (dealComm.data || []).reduce((sum, c) => sum + (c.amount || 0), 0);

      return total;
    } catch (error) {
      console.error('Error calculating spoils required:', error);
      return 0;
    }
  }

  async function fetchCashFlowData() {
    setLoading(true);
    const { start, end } = getPeriodDates(selectedPeriod);
    console.log('Fetching cash flow data for period:', selectedPeriod, 'dates:', start, end);

    try {
      const revenue = await calculateRevenue(start, end);
      const burnRateData = await calculateBurnRate(start, end);
      const capitalTarget = getCapitalTarget(revenue);
      const spoilsRequired = await calculateSpoilsRequired();

      // Calculate flow
      const toBurn = Math.min(revenue, burnRateData.total);
      const toCapital = Math.max(0, Math.min(revenue - toBurn, capitalTarget));
      const toSpoils = Math.max(0, revenue - toBurn - toCapital);

      const flowData = {
        revenue,
        burnRate: burnRateData.total,
        burnRateBreakdown: burnRateData.breakdown,
        capitalTarget,
        spoilsRequired,
        flow: { toBurn, toCapital, toSpoils }
      };

      console.log('Cash flow data calculated:', flowData);
      setData(flowData);
    } catch (error) {
      console.error('Error fetching cash flow data:', error);
    }
    setLoading(false);
  }

  const cardStyle = {
    backgroundColor: theme.bgCard,
    border: `1px solid ${theme.border}`,
    borderRadius: '12px',
    padding: '20px',
    minHeight: '400px'
  };

  const periodLabels = {
    'current-month': 'This Month',
    'last-month': 'Last Month',
    'last-3-months': 'Last 3 Months',
    'ytd': 'Year to Date'
  };

  if (loading) {
    return (
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted }}>
          Loading cash flow data...
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Calculate percentages for bucket fills
  const burnPct = data.burnRate > 0 ? Math.min(100, (data.flow.toBurn / data.burnRate) * 100) : 0;
  const capitalPct = data.capitalTarget > 0 ? Math.min(100, (data.flow.toCapital / data.capitalTarget) * 100) : 0;
  const spoilsPct = data.spoilsRequired > 0 ? Math.min(100, (data.flow.toSpoils / data.spoilsRequired) * 100) : 0;

  // Status indicators
  const burnMet = data.flow.toBurn >= data.burnRate;
  const capitalMet = data.flow.toCapital >= data.capitalTarget;
  const spoilsMet = data.flow.toSpoils >= data.spoilsRequired;

  const BucketCard = ({ title, current, target, percentage, gradient, breakdown, onHover, onLeave }) => (
    <div
      style={{
        backgroundColor: theme.bg,
        border: `1px solid ${theme.border}`,
        borderRadius: '8px',
        padding: '16px',
        minWidth: '200px',
        position: 'relative',
        cursor: 'pointer'
      }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <div style={{
        fontSize: '12px',
        color: theme.textMuted,
        marginBottom: '8px',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}>
        {title}
      </div>

      {/* Progress bar */}
      <div style={{
        width: '100%',
        height: '24px',
        backgroundColor: theme.border,
        borderRadius: '4px',
        overflow: 'hidden',
        marginBottom: '8px'
      }}>
        <div style={{
          width: `${percentage}%`,
          height: '100%',
          background: gradient,
          transition: 'width 0.5s ease'
        }} />
      </div>

      {/* Amount */}
      <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text, marginBottom: '4px' }}>
        ${current.toLocaleString()} / ${target.toLocaleString()}
      </div>

      {/* Percentage and status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ fontSize: '14px', color: theme.textSecondary }}>
          {percentage.toFixed(0)}% Full
        </div>
        {percentage >= 100 && (
          <span style={{ fontSize: '14px', color: '#22c55e' }}>✓</span>
        )}
        {percentage >= 80 && percentage < 100 && (
          <span style={{ fontSize: '14px', color: '#eab308' }}>⚠</span>
        )}
        {percentage < 80 && (
          <span style={{ fontSize: '14px', color: '#ef4444' }}>⚠</span>
        )}
      </div>

      {/* Breakdown tooltip */}
      {breakdown && hoveredBucket === title && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: '0',
          marginTop: '8px',
          backgroundColor: theme.bgCard,
          border: `1px solid ${theme.border}`,
          borderRadius: '8px',
          padding: '12px',
          minWidth: '200px',
          zIndex: 10,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}>
          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px', fontWeight: '600' }}>
            BREAKDOWN
          </div>
          {Object.entries(breakdown).map(([key, value]) => (
            <div key={key} style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '13px',
              color: theme.textSecondary,
              marginBottom: '4px'
            }}>
              <span style={{ textTransform: 'capitalize' }}>{key}:</span>
              <span style={{ fontWeight: '600', color: theme.text }}>${value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const FlowArrow = ({ visible }) => (
    visible ? (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 12px'
      }}>
        <svg width="40" height="24" viewBox="0 0 40 24" fill="none">
          <path
            d="M2 12 L30 12 M30 12 L24 6 M30 12 L24 18"
            stroke={theme.accent}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div style={{
          fontSize: '11px',
          color: theme.accent,
          marginLeft: '4px',
          fontWeight: '600'
        }}>
          overflow
        </div>
      </div>
    ) : (
      <div style={{ width: '80px' }} />
    )
  );

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <h2 style={{
          fontSize: '18px',
          fontWeight: '600',
          color: theme.text,
          margin: 0
        }}>
          Cash Flow Waterfall - {periodLabels[selectedPeriod]}
        </h2>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* Refresh Button */}
          <button
            onClick={() => fetchCashFlowData()}
            disabled={loading}
            style={{
              padding: '8px 12px',
              backgroundColor: theme.bg,
              color: theme.textSecondary,
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              fontSize: '13px',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              opacity: loading ? 0.5 : 1
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            Refresh
          </button>

          {/* Period Selector */}
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            style={{
              padding: '8px 12px',
              backgroundColor: theme.bg,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              fontSize: '13px',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="current-month">This Month</option>
            <option value="last-month">Last Month</option>
            <option value="last-3-months">Last 3 Months</option>
            <option value="ytd">Year to Date</option>
          </select>
        </div>
      </div>

      {/* Revenue Display */}
      <div style={{
        marginBottom: '32px',
        padding: '16px',
        backgroundColor: theme.bg,
        borderRadius: '8px',
        border: `1px solid ${theme.border}`
      }}>
        <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>
          TOTAL REVENUE
        </div>
        <div style={{ fontSize: '32px', fontWeight: '700', color: theme.accent }}>
          ${data.revenue.toLocaleString()}
        </div>
      </div>

      {/* Waterfall Buckets */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '24px',
        flexWrap: 'wrap',
        justifyContent: 'center'
      }}>
        <BucketCard
          title="BURN RATE"
          current={data.flow.toBurn}
          target={data.burnRate}
          percentage={burnPct}
          gradient="linear-gradient(135deg, #ef4444 0%, #f97316 100%)"
          breakdown={data.burnRateBreakdown}
          onHover={() => setHoveredBucket('BURN RATE')}
          onLeave={() => setHoveredBucket(null)}
        />

        <FlowArrow visible={data.flow.toCapital > 0} />

        <BucketCard
          title="CAPITAL/DEBT"
          current={data.flow.toCapital}
          target={data.capitalTarget}
          percentage={capitalPct}
          gradient="linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)"
          breakdown={null}
          onHover={() => setHoveredBucket('CAPITAL/DEBT')}
          onLeave={() => setHoveredBucket(null)}
        />

        <FlowArrow visible={data.flow.toSpoils > 0} />

        <BucketCard
          title="SPOILS"
          current={data.flow.toSpoils}
          target={data.spoilsRequired}
          percentage={spoilsPct}
          gradient="linear-gradient(135deg, #22c55e 0%, #10b981 100%)"
          breakdown={null}
          onHover={() => setHoveredBucket('SPOILS')}
          onLeave={() => setHoveredBucket(null)}
        />
      </div>

      {/* Status Summary */}
      <div style={{
        padding: '16px',
        backgroundColor: theme.bg,
        borderRadius: '8px',
        border: `1px solid ${theme.border}`
      }}>
        <div style={{
          fontSize: '12px',
          color: theme.textMuted,
          marginBottom: '8px',
          fontWeight: '600'
        }}>
          STATUS
        </div>
        <div style={{ fontSize: '14px', color: theme.textSecondary, lineHeight: '1.6' }}>
          {burnMet && (
            <span style={{ color: '#22c55e' }}>✓ Burn Rate covered</span>
          )}
          {!burnMet && (
            <span style={{ color: '#ef4444' }}>⚠ Burn Rate not covered (${(data.burnRate - data.flow.toBurn).toLocaleString()} short)</span>
          )}

          {data.flow.toCapital > 0 && (
            <span style={{ color: theme.textSecondary }}>
              {' '} • Saving ${data.flow.toCapital.toLocaleString()}
            </span>
          )}

          {data.flow.toSpoils >= data.spoilsRequired && (
            <span style={{ color: '#22c55e' }}>
              {' '} • Commissions payable
            </span>
          )}

          {data.flow.toSpoils < data.spoilsRequired && data.spoilsRequired > 0 && (
            <span style={{ color: '#eab308' }}>
              {' '} • ${data.spoilsRequired.toLocaleString()} pending commissions
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
