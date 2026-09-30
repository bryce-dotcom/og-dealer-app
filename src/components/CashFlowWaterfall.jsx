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

  useEffect(() => {
    if (!dealerId) {
      return;
    }
    fetchCashFlowData();

    // Refresh quietly every 30 seconds (no loading flash)
    const interval = setInterval(() => {
      fetchCashFlowData({ silent: true });
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
      // Deal profit from sold/delivered deals in date range
      // Join with inventory to get purchase_price
      const { data: deals, error: dealsError } = await supabase
        .from('deals')
        .select(`
          sale_price,
          trade_allowance,
          trade_value,
          gap_insurance,
          extended_warranty,
          protection_package,
          doc_fee,
          stage,
          date_of_sale,
          vehicle_id,
          inventory!deals_vehicle_id_fkey(purchase_price)
        `)
        .eq('dealer_id', dealerId)
        .or('stage.eq.Sold,stage.eq.Delivered')
        .gte('date_of_sale', startDate)
        .lte('date_of_sale', endDate);

      if (dealsError) throw dealsError;

      const soldVehicleIds = (deals || []).map(d => d.vehicle_id).filter(Boolean);

      // Pull recon/expense totals for the sold vehicles so vehicle profit reflects
      // real gross profit. These expenses live on inventory_expenses per vehicle.
      let reconByVehicle = {};
      if (soldVehicleIds.length) {
        const { data: exp } = await supabase
          .from('inventory_expenses')
          .select('inventory_id, amount')
          .eq('dealer_id', dealerId)
          .in('inventory_id', soldVehicleIds);
        (exp || []).forEach(e => {
          reconByVehicle[e.inventory_id] = (reconByVehicle[e.inventory_id] || 0) + (parseFloat(e.amount) || 0);
        });
      }

      const dealProfit = (deals || []).reduce((sum, deal) => {
        const purchasePrice = parseFloat(deal.inventory?.purchase_price) || 0;
        const recon = reconByVehicle[deal.vehicle_id] || 0;
        // sale_price is the car's price; a trade-in is part of how the buyer pays it,
        // not extra income, so it is not added on top.
        const vehicleProfit = (parseFloat(deal.sale_price) || 0) - purchasePrice - recon;
        const fiProfit =
          (parseFloat(deal.gap_insurance) || 0) * 0.75 +
          (parseFloat(deal.extended_warranty) || 0) * 0.50 +
          (parseFloat(deal.protection_package) || 0) * 0.70;
        return sum + vehicleProfit + fiProfit + (parseFloat(deal.doc_fee) || 0);
      }, 0);

      // BHPH interest income
      const { data: payments, error: paymentsError } = await supabase
        .from('bhph_payments')
        .select('interest')
        .eq('dealer_id', dealerId)
        .gte('payment_date', startDate)
        .lte('payment_date', endDate);

      if (paymentsError) throw paymentsError;

      const interestIncome = (payments || []).reduce((sum, p) => sum + (parseFloat(p.interest) || 0), 0);

      // Cars marked Sold in Inventory without a Sold/Delivered deal still count.
      const [{ data: allSoldDeals }, { data: invSold }] = await Promise.all([
        supabase.from('deals').select('vehicle_id').eq('dealer_id', dealerId).in('stage', ['Sold', 'Delivered']),
        supabase.from('inventory').select('id, sale_price, purchase_price')
          .eq('dealer_id', dealerId).eq('status', 'Sold')
          .gte('sale_date', startDate).lte('sale_date', endDate)
      ]);
      const hasDeal = new Set((allSoldDeals || []).map(d => String(d.vehicle_id)));
      const invOnly = (invSold || []).filter(v => !hasDeal.has(String(v.id)));
      let invOnlyProfit = 0;
      if (invOnly.length) {
        const { data: exp } = await supabase
          .from('inventory_expenses')
          .select('inventory_id, amount')
          .eq('dealer_id', dealerId)
          .in('inventory_id', invOnly.map(v => v.id));
        const recon = {};
        (exp || []).forEach(e => { recon[e.inventory_id] = (recon[e.inventory_id] || 0) + (parseFloat(e.amount) || 0); });
        invOnlyProfit = invOnly.reduce((sum, v) =>
          sum + (parseFloat(v.sale_price) || 0) - (parseFloat(v.purchase_price) || 0) - (recon[v.id] || 0), 0);
      }

      return {
        total: dealProfit + invOnlyProfit + interestIncome,
        carsSold: (deals || []).length + invOnly.length,
        carProfit: dealProfit + invOnlyProfit,
        interestIncome
      };
    } catch (error) {
      console.error('Error calculating gross profit:', error);
      return { total: 0, carsSold: 0, carProfit: 0, interestIncome: 0, error: true };
    }
  }

  async function calculateBurnRate(startDate, endDate) {
    try {
      // NOTE: inventory_expenses (recon) are now deducted from vehicle profit in
      // calculateRevenue, so they are NOT included here — including them would double-count.
      const [paystubs, expenses, liabilities] = await Promise.all([
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

        supabase.from('liabilities')
          .select('monthly_payment')
          .eq('dealer_id', dealerId)
          .eq('status', 'active')
      ]);

      const payroll = (paystubs.data || []).reduce((sum, p) => sum + (parseFloat(p.gross_pay) || 0), 0);
      const opex = (expenses.data || []).reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

      // Prorate monthly payments for period
      const days = Math.max(1, (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24));
      const monthlyFactor = days / 30;
      const debtPayments = (liabilities.data || []).reduce((sum, l) => sum + (parseFloat(l.monthly_payment) || 0), 0) * monthlyFactor;

      // Recon is already subtracted from each car's profit, so it isn't listed here.
      return {
        total: payroll + opex + debtPayments,
        breakdown: {
          Payroll: payroll,
          Expenses: opex,
          'Loan payments': Math.round(debtPayments)
        }
      };
    } catch (error) {
      console.error('Error calculating burn rate:', error);
      return { total: 0, breakdown: { Payroll: 0, Expenses: 0, 'Loan payments': 0 } };
    }
  }

  function getCapitalTarget(revenue) {
    return Math.max(revenue * 0.15, 5000);
  }

  async function calculateSpoilsRequired(startDate, endDate) {
    try {
      // Scope inventory_commissions to the period (created_at) since that table has no
      // payment status column — we can't tell paid vs unpaid, so use period activity.
      // Scope `commissions` to rows still pending that were created in or before the period end.
      const [invComm, dealComm] = await Promise.all([
        supabase.from('inventory_commissions')
          .select('amount')
          .eq('dealer_id', dealerId)
          .gte('created_at', startDate)
          .lte('created_at', endDate + 'T23:59:59'),

        supabase.from('commissions')
          .select('amount')
          .eq('dealer_id', dealerId)
          .eq('status', 'pending')
          .lte('created_at', endDate + 'T23:59:59')
      ]);

      const total =
        (invComm.data || []).reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0) +
        (dealComm.data || []).reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);

      return total;
    } catch (error) {
      console.error('Error calculating spoils required:', error);
      return 0;
    }
  }

  async function fetchCashFlowData({ silent = false } = {}) {
    if (!silent) setLoading(true);
    const { start, end } = getPeriodDates(selectedPeriod);

    try {
      const profit = await calculateRevenue(start, end);
      const revenue = profit.total;
      const burnRateData = await calculateBurnRate(start, end);
      const capitalTarget = getCapitalTarget(revenue);
      const spoilsRequired = await calculateSpoilsRequired(start, end);

      // Calculate flow
      const toBurn = Math.min(revenue, burnRateData.total);
      const toCapital = Math.max(0, Math.min(revenue - toBurn, capitalTarget));
      const toSpoils = Math.max(0, revenue - toBurn - toCapital);

      const flowData = {
        revenue,
        profit,
        burnRate: burnRateData.total,
        burnRateBreakdown: burnRateData.breakdown,
        capitalTarget,
        spoilsRequired,
        flow: { toBurn, toCapital, toSpoils }
      };

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

  // A bucket with nothing due is "covered", not 0% empty.
  const fill = (current, target) => (target > 0 ? Math.min(100, (current / target) * 100) : 100);
  const burnPct = fill(data.flow.toBurn, data.burnRate);
  const capitalPct = fill(data.flow.toCapital, data.capitalTarget);
  const spoilsPct = fill(data.flow.toSpoils, data.spoilsRequired);

  const burnMet = data.flow.toBurn >= data.burnRate;
  const money = (n) => `$${Math.round(n || 0).toLocaleString()}`;

  const BucketCard = ({ step, title, help, current, target, percentage, gradient, breakdown }) => (
    <div style={{
      backgroundColor: theme.bg,
      border: `1px solid ${theme.border}`,
      borderRadius: '8px',
      padding: '16px',
      flex: '1 1 200px',
      minWidth: '200px'
    }}>
      <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '2px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {step}. {title}
      </div>
      <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '10px' }}>{help}</div>

      <div style={{ width: '100%', height: '12px', backgroundColor: theme.border, borderRadius: '6px', overflow: 'hidden', marginBottom: '8px' }}>
        <div style={{ width: `${percentage}%`, height: '100%', background: gradient, transition: 'width 0.5s ease' }} />
      </div>

      {target > 0 ? (
        <>
          <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>
            {money(current)} <span style={{ fontSize: '13px', fontWeight: '500', color: theme.textMuted }}>of {money(target)}</span>
          </div>
          <div style={{ fontSize: '13px', color: percentage >= 100 ? '#22c55e' : theme.textSecondary, marginTop: '2px' }}>
            {percentage >= 100 ? '✓ Covered' : `${money(target - current)} still needed`}
          </div>
        </>
      ) : (
        <div style={{ fontSize: '14px', color: theme.textMuted }}>Nothing due this period</div>
      )}

      {breakdown && target > 0 && (
        <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: `1px solid ${theme.border}` }}>
          {Object.entries(breakdown).filter(([, v]) => v > 0).map(([key, value]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: theme.textSecondary, marginBottom: '2px' }}>
              <span>{key}</span>
              <span style={{ color: theme.text }}>{money(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const p = data.profit || {};

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: 0 }}>
            Where the profit goes — {periodLabels[selectedPeriod]}
          </h2>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '4px' }}>
            Profit pays the bills first, then savings, then commissions.
          </div>
        </div>
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          style={{ padding: '8px 12px', backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '13px', cursor: 'pointer', outline: 'none' }}
        >
          <option value="current-month">This Month</option>
          <option value="last-month">Last Month</option>
          <option value="last-3-months">Last 3 Months</option>
          <option value="ytd">Year to Date</option>
        </select>
      </div>

      {/* Gross profit */}
      <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
        <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>GROSS PROFIT</div>
        <div style={{ fontSize: '32px', fontWeight: '700', color: data.revenue > 0 ? '#22c55e' : data.revenue < 0 ? '#ef4444' : theme.text }}>
          {money(data.revenue)}
        </div>
        <div style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '4px' }}>
          {p.error
            ? "Couldn't load sales for this period. Try Refresh."
            : p.carsSold > 0
              ? `${p.carsSold} car${p.carsSold === 1 ? '' : 's'} sold: ${money(p.carProfit)} profit (sale price − what you paid − recon)` +
                (p.interestIncome > 0 ? ` + ${money(p.interestIncome)} BHPH interest` : '')
              : p.interestIncome > 0
                ? `No cars sold yet. ${money(p.interestIncome)} BHPH interest collected.`
                : 'No sales recorded yet. A sale counts when its deal is marked Sold, or the car is marked Sold in Inventory with a sale date.'}
        </div>
      </div>

      {/* Buckets */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <BucketCard
          step={1}
          title="Bills"
          help="Payroll, expenses and loan payments"
          current={data.flow.toBurn}
          target={data.burnRate}
          percentage={burnPct}
          gradient="linear-gradient(135deg, #ef4444 0%, #f97316 100%)"
          breakdown={data.burnRateBreakdown}
        />
        <BucketCard
          step={2}
          title="Savings"
          help="Goal: 15% of profit (at least $5,000)"
          current={data.flow.toCapital}
          target={data.capitalTarget}
          percentage={capitalPct}
          gradient="linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)"
        />
        <BucketCard
          step={3}
          title="Commissions"
          help="Commissions owed to your team"
          current={data.flow.toSpoils}
          target={data.spoilsRequired}
          percentage={spoilsPct}
          gradient="linear-gradient(135deg, #22c55e 0%, #10b981 100%)"
        />
      </div>

      {/* Summary */}
      <div style={{ padding: '12px 16px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}`, fontSize: '14px', lineHeight: '1.6' }}>
        {data.burnRate === 0 && data.revenue === 0 ? (
          <span style={{ color: theme.textMuted }}>No sales or bills recorded for this period yet.</span>
        ) : burnMet ? (
          <span style={{ color: '#22c55e' }}>✓ Profit covers this period's bills</span>
        ) : (
          <span style={{ color: '#ef4444' }}>Bills are {money(data.burnRate - data.flow.toBurn)} more than profit so far</span>
        )}
        {data.flow.toCapital > 0 && <span style={{ color: theme.textSecondary }}> • {money(data.flow.toCapital)} toward savings</span>}
        {data.spoilsRequired > 0 && (
          <span style={{ color: data.flow.toSpoils >= data.spoilsRequired ? '#22c55e' : '#eab308' }}>
            {' '}• {data.flow.toSpoils >= data.spoilsRequired ? 'Commissions covered' : `${money(data.spoilsRequired)} in commissions owed`}
          </span>
        )}
      </div>
    </div>
  );
}
