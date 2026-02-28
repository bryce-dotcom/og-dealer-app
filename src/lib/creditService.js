import { supabase } from './supabase';

// Default credit costs (fallback if database config not available)
const DEFAULT_CREDIT_COSTS = {
  VEHICLE_RESEARCH: 10,
  DEAL_DOCTOR: 15,
  MARKET_COMP_REPORT: 20,
  AI_ARNIE_QUERY: 3,
  VIN_DECODE: 1,
  FORM_GENERATION: 5,
  PLAID_SYNC: 5,
  PAYROLL_RUN: 10,
  AI_VEHICLE_ANALYSIS: 5,     // Per vehicle AI analysis
  BUYING_RECOMMENDATIONS: 15, // "What to buy" report
  PROFIT_CALCULATOR: 0        // Free (client-side math)
};

// Cache for credit costs (loaded from database)
let CREDIT_COSTS_CACHE = null;
let CACHE_TIMESTAMP = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load credit costs from database (with caching)
 * @returns {Promise<object>} Credit costs object
 */
async function loadCreditCosts() {
  // Return cache if valid
  if (CREDIT_COSTS_CACHE && CACHE_TIMESTAMP && (Date.now() - CACHE_TIMESTAMP < CACHE_TTL)) {
    return CREDIT_COSTS_CACHE;
  }

  try {
    const { data, error } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'CREDIT_COSTS')
      .single();

    if (error || !data) {
      console.warn('Failed to load credit costs from database, using defaults:', error);
      return DEFAULT_CREDIT_COSTS;
    }

    CREDIT_COSTS_CACHE = data.value;
    CACHE_TIMESTAMP = Date.now();
    return CREDIT_COSTS_CACHE;
  } catch (err) {
    console.error('Error loading credit costs:', err);
    return DEFAULT_CREDIT_COSTS;
  }
}

// Export for backward compatibility (will use cached values)
export const CREDIT_COSTS = DEFAULT_CREDIT_COSTS;

// Rate limits (uses per hour when out of credits)
export const RATE_LIMITS = {
  vehicle_research: 2,
  deal_doctor: 2,
  market_comp_report: 1,
  ai_arnie_query: 5,
  vin_decode: 10,
  form_generation: 5,
  plaid_sync: 1,
  payroll_run: 1,
  ai_vehicle_analysis: 3,      // 3 AI analyses per hour without credits
  buying_recommendations: 1     // 1 recommendation report per hour
};

/**
 * Credit Service - Handles all credit checking, consumption, and tracking
 */
export class CreditService {
  /**
   * Check if dealer has credits for a feature (call BEFORE operation)
   * @param {number} dealerId - The dealer ID
   * @param {string} featureType - Feature type key (e.g., 'vehicle_research')
   * @returns {Promise<{success: boolean, credits_remaining?: number, warning?: string, rate_limited?: boolean}>}
   */
  static async checkCredits(dealerId, featureType) {
    const costs = await loadCreditCosts();
    const cost = costs[featureType.toUpperCase()] || 0;

    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('dealer_id', dealerId)
      .single();

    if (error || !subscription) {
      return { success: false, error: 'No subscription found' };
    }

    // Unlimited tier always succeeds
    if (subscription.plan_tier === 'unlimited') {
      return { success: true, unlimited: true, credits_remaining: 999999 };
    }

    const totalCredits = subscription.credits_remaining + subscription.bonus_credits;

    // Has enough credits
    if (totalCredits >= cost) {
      return {
        success: true,
        credits_remaining: totalCredits,
        will_deduct: cost
      };
    }

    // Out of credits - check rate limit
    const rateLimitCheck = await this.checkRateLimit(dealerId, featureType);

    if (rateLimitCheck.allowed) {
      return {
        success: true,
        credits_remaining: 0,
        warning: 'Low on credits. Upgrade for unlimited access.',
        rate_limited_mode: true
      };
    }

    return {
      success: false,
      credits_remaining: 0,
      rate_limited: true,
      next_allowed_at: rateLimitCheck.next_allowed_at,
      message: `Rate limit exceeded. Try again at ${new Date(rateLimitCheck.next_allowed_at).toLocaleTimeString()}`
    };
  }

  /**
   * Consume credits after successful operation (call AFTER operation)
   * @param {number} dealerId - The dealer ID
   * @param {string} featureType - Feature type key
   * @param {string} contextId - Optional context ID (deal_id, vehicle_id, etc.)
   * @param {object} metadata - Optional metadata to log
   * @returns {Promise<{success: boolean, credits_remaining: number}>}
   */
  static async consumeCredits(dealerId, featureType, contextId = null, metadata = null) {
    const costs = await loadCreditCosts();
    const cost = costs[featureType.toUpperCase()] || 0;

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('dealer_id', dealerId)
      .single();

    if (!subscription) {
      return { success: false, error: 'No subscription found' };
    }

    // Unlimited tier - log usage but don't deduct
    if (subscription.plan_tier === 'unlimited') {
      await this.logUsage(dealerId, subscription.id, featureType, 0, contextId, true, metadata);
      return { success: true, credits_remaining: 999999 };
    }

    // Deduct from bonus_credits first, then credits_remaining
    let newBonus = subscription.bonus_credits;
    let newRemaining = subscription.credits_remaining;

    if (newBonus >= cost) {
      newBonus -= cost;
    } else if (newBonus > 0) {
      const fromBonus = newBonus;
      const fromRemaining = cost - fromBonus;
      newBonus = 0;
      newRemaining = Math.max(0, newRemaining - fromRemaining);
    } else {
      newRemaining = Math.max(0, newRemaining - cost);
    }

    // Update subscription
    const { error } = await supabase
      .from('subscriptions')
      .update({
        credits_remaining: newRemaining,
        bonus_credits: newBonus,
        credits_used_this_cycle: subscription.credits_used_this_cycle + cost,
        updated_at: new Date().toISOString()
      })
      .eq('id', subscription.id);

    if (error) {
      console.error('Failed to update credits:', error);
      return { success: false, error: error.message };
    }

    // Log usage
    await this.logUsage(dealerId, subscription.id, featureType, cost, contextId, true, metadata);

    return {
      success: true,
      credits_remaining: newRemaining + newBonus,
      credits_used: cost
    };
  }

  /**
   * Check rate limiting for out-of-credit usage
   * @param {number} dealerId - The dealer ID
   * @param {string} featureType - Feature type key
   * @returns {Promise<{allowed: boolean, next_allowed_at?: string}>}
   */
  static async checkRateLimit(dealerId, featureType) {
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

    const { data: recentUsage } = await supabase
      .from('credit_usage_log')
      .select('created_at')
      .eq('dealer_id', dealerId)
      .eq('feature_type', featureType)
      .gte('created_at', oneHourAgo)
      .order('created_at', { ascending: false });

    const limit = RATE_LIMITS[featureType] || 3;
    const usageCount = recentUsage?.length || 0;

    if (usageCount >= limit) {
      const oldestUsage = recentUsage[recentUsage.length - 1];
      const nextAllowedAt = new Date(new Date(oldestUsage.created_at).getTime() + 3600000);
      return { allowed: false, next_allowed_at: nextAllowedAt.toISOString() };
    }

    return { allowed: true };
  }

  /**
   * Log credit usage to audit trail
   * @param {number} dealerId - The dealer ID
   * @param {string} subscriptionId - The subscription ID
   * @param {string} featureType - Feature type key
   * @param {number} creditsUsed - Credits consumed (0 for unlimited)
   * @param {string} contextId - Optional context ID
   * @param {boolean} success - Whether the operation succeeded
   * @param {object} metadata - Optional metadata
   */
  static async logUsage(dealerId, subscriptionId, featureType, creditsUsed, contextId, success, metadata) {
    const { data: { session } } = await supabase.auth.getSession();

    await supabase.from('credit_usage_log').insert({
      dealer_id: dealerId,
      subscription_id: subscriptionId,
      feature_type: featureType,
      credits_used: creditsUsed,
      context_id: contextId,
      user_id: session?.user?.id,
      success,
      metadata
    });
  }

  /**
   * Get credit balance for display
   * @param {number} dealerId - The dealer ID
   * @returns {Promise<{total: number, tier: string, unlimited?: boolean}>}
   */
  static async getCreditBalance(dealerId) {
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('dealer_id', dealerId)
      .single();

    if (!subscription) return { total: 0, tier: 'none' };

    if (subscription.plan_tier === 'unlimited') {
      return { total: 999999, tier: 'unlimited', unlimited: true };
    }

    return {
      total: subscription.credits_remaining + subscription.bonus_credits,
      monthly: subscription.credits_remaining,
      bonus: subscription.bonus_credits,
      used: subscription.credits_used_this_cycle,
      allowance: subscription.monthly_credit_allowance,
      tier: subscription.plan_tier,
      next_reset: subscription.billing_cycle_end
    };
  }

  /**
   * Get plan tier name display
   * @param {string} tier - Plan tier
   * @returns {string} Display name
   */
  static getPlanDisplayName(tier) {
    const names = {
      free: 'Free',
      pro: 'Pro',
      dealer: 'Dealer',
      unlimited: 'Unlimited'
    };
    return names[tier] || tier;
  }

  /**
   * Get plan pricing info
   * @param {string} tier - Plan tier
   * @returns {{price: number, credits: number, name: string}}
   */
  static getPlanInfo(tier) {
    const plans = {
      free: { price: 0, credits: 10, name: 'Free' },
      pro: { price: 79, credits: 500, name: 'Pro' },
      dealer: { price: 149, credits: 1500, name: 'Dealer' },
      unlimited: { price: 299, credits: 999999, name: 'Unlimited' }
    };
    return plans[tier] || plans.free;
  }

  /**
   * Get current credit costs from database
   * @returns {Promise<object>} Credit costs object
   */
  static async getCreditCosts() {
    return await loadCreditCosts();
  }

  /**
   * Update credit costs in database (admin only)
   * @param {object} newCosts - New credit costs object
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  static async updateCreditCosts(newCosts) {
    try {
      const { error } = await supabase
        .from('system_config')
        .upsert({
          key: 'CREDIT_COSTS',
          value: newCosts,
          description: 'Credit costs for each feature type'
        }, { onConflict: 'key' });

      if (error) {
        console.error('Failed to update credit costs:', error);
        return { success: false, error: error.message };
      }

      // Clear cache so new values are loaded immediately
      CREDIT_COSTS_CACHE = null;
      CACHE_TIMESTAMP = null;

      return { success: true };
    } catch (err) {
      console.error('Error updating credit costs:', err);
      return { success: false, error: err.message };
    }
  }
}
