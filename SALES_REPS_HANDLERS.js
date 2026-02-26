// ========== SALES REPS FUNCTIONS ==========
// INSERT THESE AFTER line 480 in DevConsolePage.jsx (after handleSendInvite function)

const refreshSalesRepsData = async () => {
  try {
    const [reps, signups, payouts, dealers] = await Promise.all([
      supabase.from('sales_reps').select('*').order('created_at', { ascending: false }),
      supabase.from('rep_signups').select('*').order('signup_date', { ascending: false }),
      supabase.from('commission_payouts').select('*').order('payout_period', { ascending: false }),
      supabase.from('dealer_settings').select('id, dealer_name, account_status').order('dealer_name')
    ]);
    if (reps.data) setSalesReps(reps.data);
    if (signups.data) setRepSignups(signups.data);
    if (payouts.data) setCommissionPayouts(payouts.data);
    if (dealers.data) setDealersList(dealers.data);
  } catch (err) {
    showToast('Error fetching sales reps data: ' + err.message, 'error');
  }
};

const handleAddRep = async (repData) => {
  setLoading(true);
  try {
    const { data, error } = await supabase
      .from('sales_reps')
      .insert([repData])
      .select()
      .single();
    if (error) throw error;
    setSalesReps([data, ...salesReps]);
    setAddRepModal(false);
    showToast('Sales rep added successfully');
  } catch (err) {
    showToast('Error adding rep: ' + err.message, 'error');
  }
  setLoading(false);
};

const handleUpdateRep = async (repId, updates) => {
  try {
    const { error } = await supabase
      .from('sales_reps')
      .update(updates)
      .eq('id', repId);
    if (error) throw error;
    setSalesReps(salesReps.map(r => r.id === repId ? { ...r, ...updates } : r));
    showToast('Rep updated');
  } catch (err) {
    showToast('Error updating rep: ' + err.message, 'error');
  }
};

const handleAddSignup = async (signupData) => {
  setLoading(true);
  try {
    const { data, error } = await supabase
      .from('rep_signups')
      .insert([signupData])
      .select()
      .single();
    if (error) throw error;
    setRepSignups([data, ...repSignups]);
    setAddSignupModal(false);
    showToast('Signup added successfully');
  } catch (err) {
    showToast('Error adding signup: ' + err.message, 'error');
  }
  setLoading(false);
};

const handleCancelSignup = async (signupId, repId) => {
  const signup = repSignups.find(s => s.id === signupId);
  if (!signup) return;

  const rep = salesReps.find(r => r.id === repId);
  if (!rep) return;

  const daysSinceSignup = Math.floor((Date.now() - new Date(signup.signup_date).getTime()) / (1000 * 60 * 60 * 24));
  const withinClawback = daysSinceSignup <= rep.clawback_days;

  if (!confirm(`Cancel this signup?\n\nSigned up: ${daysSinceSignup} days ago\nClawback period: ${rep.clawback_days} days\n\n${withinClawback ? '⚠️ CLAWBACK WILL APPLY' : 'No clawback (outside window)'}`)) {
    return;
  }

  try {
    const { error } = await supabase
      .from('rep_signups')
      .update({
        status: withinClawback ? 'clawback' : 'cancelled',
        cancel_date: new Date().toISOString().split('T')[0],
        clawback_applied: withinClawback
      })
      .eq('id', signupId);

    if (error) throw error;
    await refreshSalesRepsData();
    showToast(withinClawback ? 'Signup cancelled - clawback applied' : 'Signup cancelled');
  } catch (err) {
    showToast('Error cancelling signup: ' + err.message, 'error');
  }
};

const calculatePayout = (repId, period) => {
  const rep = salesReps.find(r => r.id === repId);
  if (!rep) return null;

  const [year, month] = period.split('-').map(Number);
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0);

  // Get signups in this period
  const newSignups = repSignups.filter(s => {
    if (s.rep_id !== repId) return false;
    const signupDate = new Date(s.signup_date);
    return signupDate >= periodStart && signupDate <= periodEnd;
  });

  // Get all active signups for residuals
  const activeSignups = repSignups.filter(s =>
    s.rep_id === repId && s.status === 'active'
  );

  // Calculate components
  const upfrontTotal = newSignups.length * rep.upfront_commission;
  const upfrontCount = newSignups.length;

  const residualTotal = activeSignups.reduce((sum, s) => sum + (s.monthly_rate * rep.residual_rate), 0);
  const residualAccounts = activeSignups.length;

  const bonusTotal = upfrontCount >= rep.bonus_threshold ? rep.bonus_amount : 0;

  // Get clawbacks in this period
  const clawbacks = repSignups.filter(s => {
    if (s.rep_id !== repId || !s.clawback_applied) return false;
    if (!s.cancel_date) return false;
    const cancelDate = new Date(s.cancel_date);
    return cancelDate >= periodStart && cancelDate <= periodEnd;
  });
  const clawbackTotal = clawbacks.length * rep.upfront_commission;

  const grossPayout = upfrontTotal + residualTotal + bonusTotal;
  const netPayout = grossPayout - clawbackTotal;

  return {
    rep_id: repId,
    payout_period: period,
    upfront_total: upfrontTotal,
    upfront_count: upfrontCount,
    residual_total: residualTotal,
    residual_accounts: residualAccounts,
    bonus_total: bonusTotal,
    clawback_total: clawbackTotal,
    gross_payout: grossPayout,
    net_payout: netPayout
  };
};

const handleSavePayout = async (payoutData) => {
  try {
    const { data, error } = await supabase
      .from('commission_payouts')
      .upsert([payoutData], { onConflict: 'rep_id,payout_period' })
      .select()
      .single();

    if (error) throw error;

    const exists = commissionPayouts.find(p => p.rep_id === payoutData.rep_id && p.payout_period === payoutData.payout_period);
    if (exists) {
      setCommissionPayouts(commissionPayouts.map(p =>
        p.rep_id === payoutData.rep_id && p.payout_period === payoutData.payout_period ? data : p
      ));
    } else {
      setCommissionPayouts([data, ...commissionPayouts]);
    }

    showToast('Payout saved');
  } catch (err) {
    showToast('Error saving payout: ' + err.message, 'error');
  }
};

const handleMarkPaid = async (payoutId) => {
  try {
    const { error} = await supabase
      .from('commission_payouts')
      .update({ paid: true, paid_date: new Date().toISOString().split('T')[0] })
      .eq('id', payoutId);

    if (error) throw error;
    setCommissionPayouts(commissionPayouts.map(p =>
      p.id === payoutId ? { ...p, paid: true, paid_date: new Date().toISOString().split('T')[0] } : p
    ));
    showToast('Marked as paid');
  } catch (err) {
    showToast('Error marking as paid: ' + err.message, 'error');
  }
};

const calculateVesting = (rep) => {
  if (!rep.start_date) return { monthsActive: 0, residualMonths: 0, description: 'No start date' };

  const startDate = new Date(rep.start_date);
  const endDate = rep.end_date ? new Date(rep.end_date) : new Date();
  const monthsActive = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24 * 30));

  let residualMonths = 0;
  let description = '';

  if (monthsActive < 6) {
    residualMonths = 0;
    description = 'No vesting (< 6 months)';
  } else if (monthsActive < 12) {
    residualMonths = 6;
    description = '6 months residual (6-12 mo tenure)';
  } else if (monthsActive < 24) {
    residualMonths = 12;
    description = '12 months residual (12-24 mo tenure)';
  } else {
    residualMonths = 24;
    description = '24 months residual (24+ mo tenure)';
  }

  return { monthsActive, residualMonths, description };
};