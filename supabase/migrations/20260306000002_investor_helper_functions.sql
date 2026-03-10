-- ============================================
-- Investor Portal Helper Functions
-- ============================================

-- ============================================
-- Function: increment_investor_profit
-- ============================================
-- Updates investor totals when profit is distributed
CREATE OR REPLACE FUNCTION increment_investor_profit(
  p_investor_id uuid,
  p_amount numeric
)
RETURNS void AS $$
BEGIN
  UPDATE investors
  SET
    total_profit = COALESCE(total_profit, 0) + p_amount,
    total_returned = COALESCE(total_returned, 0) + p_amount,
    available_balance = COALESCE(available_balance, 0) + p_amount,
    updated_at = now()
  WHERE id = p_investor_id;

  -- Recalculate lifetime ROI
  UPDATE investors
  SET lifetime_roi = CASE
    WHEN total_invested > 0 THEN (total_profit / total_invested) * 100
    ELSE 0
  END
  WHERE id = p_investor_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Function: deploy_capital_to_vehicle
-- ============================================
-- Called when dealer purchases a vehicle using pool funds
CREATE OR REPLACE FUNCTION deploy_capital_to_vehicle(
  p_pool_id uuid,
  p_inventory_id text,
  p_dealer_id integer,
  p_purchase_price numeric,
  p_purchase_date date,
  p_vehicle_info jsonb
)
RETURNS uuid AS $$
DECLARE
  v_available_capital numeric;
  v_vehicle_id uuid;
BEGIN
  -- Check available capital
  SELECT available_capital INTO v_available_capital
  FROM investment_pools
  WHERE id = p_pool_id;

  IF v_available_capital < p_purchase_price THEN
    RAISE EXCEPTION 'Insufficient capital in pool. Available: %, Required: %',
      v_available_capital, p_purchase_price;
  END IF;

  -- Create investor_vehicles record
  INSERT INTO investor_vehicles (
    pool_id,
    inventory_id,
    dealer_id,
    capital_deployed,
    purchase_price,
    purchase_date,
    vehicle_info,
    status
  ) VALUES (
    p_pool_id,
    p_inventory_id,
    p_dealer_id,
    p_purchase_price,
    p_purchase_price,
    p_purchase_date,
    p_vehicle_info,
    'active'
  )
  RETURNING id INTO v_vehicle_id;

  -- Update pool balances
  UPDATE investment_pools
  SET
    deployed_capital = deployed_capital + p_purchase_price,
    available_capital = available_capital - p_purchase_price,
    total_vehicles_funded = total_vehicles_funded + 1,
    updated_at = now()
  WHERE id = p_pool_id;

  -- Log transaction
  INSERT INTO pool_transactions (
    pool_id,
    transaction_type,
    amount,
    balance_after,
    vehicle_id,
    description,
    transaction_date
  )
  SELECT
    p_pool_id,
    'vehicle_purchase',
    -p_purchase_price,
    available_capital,
    v_vehicle_id,
    'Vehicle purchase: ' || COALESCE(p_vehicle_info->>'year', '') || ' ' ||
      COALESCE(p_vehicle_info->>'make', '') || ' ' ||
      COALESCE(p_vehicle_info->>'model', ''),
    now()
  FROM investment_pools
  WHERE id = p_pool_id;

  RETURN v_vehicle_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Function: process_investor_deposit
-- ============================================
-- Called when investor deposit is completed
CREATE OR REPLACE FUNCTION process_investor_deposit(
  p_capital_transaction_id uuid
)
RETURNS void AS $$
DECLARE
  v_investor_id uuid;
  v_pool_id uuid;
  v_amount numeric;
BEGIN
  -- Get transaction details
  SELECT investor_id, pool_id, amount
  INTO v_investor_id, v_pool_id, v_amount
  FROM investor_capital
  WHERE id = p_capital_transaction_id;

  -- Update investor totals
  UPDATE investors
  SET
    total_invested = total_invested + v_amount,
    available_balance = available_balance + v_amount,
    updated_at = now()
  WHERE id = v_investor_id;

  -- Update pool
  UPDATE investment_pools
  SET
    total_capital = total_capital + v_amount,
    available_capital = available_capital + v_amount,
    updated_at = now()
  WHERE id = v_pool_id;

  -- Create or update pool share
  INSERT INTO investor_pool_shares (
    investor_id,
    pool_id,
    capital_invested,
    active
  ) VALUES (
    v_investor_id,
    v_pool_id,
    v_amount,
    true
  )
  ON CONFLICT (investor_id, pool_id) DO UPDATE
  SET
    capital_invested = investor_pool_shares.capital_invested + v_amount,
    updated_at = now();

  -- Recalculate all ownership percentages for this pool
  PERFORM recalculate_pool_ownership(v_pool_id);

  -- Log transaction
  INSERT INTO pool_transactions (
    pool_id,
    transaction_type,
    amount,
    investor_id,
    capital_transaction_id,
    description,
    transaction_date
  )
  SELECT
    v_pool_id,
    'investor_deposit',
    v_amount,
    v_investor_id,
    p_capital_transaction_id,
    'Investor deposit: ' || full_name,
    now()
  FROM investors
  WHERE id = v_investor_id;

  -- Mark transaction as completed
  UPDATE investor_capital
  SET
    status = 'completed',
    completed_at = now()
  WHERE id = p_capital_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Function: recalculate_pool_ownership
-- ============================================
-- Recalculates ownership percentages for all investors in a pool
CREATE OR REPLACE FUNCTION recalculate_pool_ownership(
  p_pool_id uuid
)
RETURNS void AS $$
DECLARE
  v_total_capital numeric;
BEGIN
  -- Get total capital in pool
  SELECT COALESCE(SUM(capital_invested), 0)
  INTO v_total_capital
  FROM investor_pool_shares
  WHERE pool_id = p_pool_id AND active = true;

  -- Update all ownership percentages
  UPDATE investor_pool_shares
  SET
    ownership_percentage = CASE
      WHEN v_total_capital > 0
      THEN (capital_invested / v_total_capital) * 100
      ELSE 0
    END,
    current_roi = CASE
      WHEN capital_invested > 0
      THEN (total_profit_earned / capital_invested) * 100
      ELSE 0
    END,
    updated_at = now()
  WHERE pool_id = p_pool_id AND active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Function: process_distribution_payout
-- ============================================
-- Called when distribution payment is confirmed
CREATE OR REPLACE FUNCTION process_distribution_payout(
  p_distribution_id uuid,
  p_plaid_transaction_id text DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_investor_id uuid;
  v_amount numeric;
BEGIN
  -- Get distribution details
  SELECT investor_id, amount
  INTO v_investor_id, v_amount
  FROM investor_distributions
  WHERE id = p_distribution_id;

  -- Update distribution status
  UPDATE investor_distributions
  SET
    status = 'paid',
    paid_at = now(),
    plaid_transaction_id = p_plaid_transaction_id
  WHERE id = p_distribution_id;

  -- Update investor totals
  UPDATE investors
  SET
    available_balance = available_balance - v_amount,
    updated_at = now()
  WHERE id = v_investor_id;

  -- Update pool share distribution total
  UPDATE investor_pool_shares ips
  SET
    total_distributions = total_distributions + v_amount,
    updated_at = now()
  FROM investor_distributions id
  WHERE ips.investor_id = id.investor_id
    AND ips.pool_id = id.pool_id
    AND id.id = p_distribution_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Function: get_investor_dashboard_stats
-- ============================================
-- Returns key metrics for investor dashboard
CREATE OR REPLACE FUNCTION get_investor_dashboard_stats(
  p_investor_id uuid
)
RETURNS jsonb AS $$
DECLARE
  v_stats jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_invested', COALESCE(total_invested, 0),
    'total_returned', COALESCE(total_returned, 0),
    'total_profit', COALESCE(total_profit, 0),
    'available_balance', COALESCE(available_balance, 0),
    'lifetime_roi', COALESCE(lifetime_roi, 0),
    'active_vehicles', (
      SELECT COUNT(*)
      FROM investor_vehicles iv
      JOIN investor_pool_shares ips ON iv.pool_id = ips.pool_id
      WHERE ips.investor_id = p_investor_id
        AND iv.status = 'active'
    ),
    'vehicles_sold_30d', (
      SELECT COUNT(*)
      FROM investor_vehicles iv
      JOIN investor_pool_shares ips ON iv.pool_id = ips.pool_id
      WHERE ips.investor_id = p_investor_id
        AND iv.status = 'sold'
        AND iv.sale_date >= CURRENT_DATE - INTERVAL '30 days'
    ),
    'pending_distributions', (
      SELECT COALESCE(SUM(amount), 0)
      FROM investor_distributions
      WHERE investor_id = p_investor_id
        AND status = 'pending'
    )
  )
  INTO v_stats
  FROM investors
  WHERE id = p_investor_id;

  RETURN v_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- GRANT EXECUTE PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION increment_investor_profit TO authenticated;
GRANT EXECUTE ON FUNCTION deploy_capital_to_vehicle TO authenticated;
GRANT EXECUTE ON FUNCTION process_investor_deposit TO authenticated;
GRANT EXECUTE ON FUNCTION recalculate_pool_ownership TO authenticated;
GRANT EXECUTE ON FUNCTION process_distribution_payout TO authenticated;
GRANT EXECUTE ON FUNCTION get_investor_dashboard_stats TO authenticated;
