# Sales Reps Tab - Code to ADD to DevConsolePage.jsx

## STEP 1: Add to sections array (around line 2110)

Find this line:
```javascript
const sections = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'feedback', label: 'Feedback (' + feedbackList.filter(f => f.status === 'new').length + ')' },
  { id: 'dealers', label: 'Dealers' },
  { id: 'users', label: 'Users' },
```

ADD this line after 'dealers':
```javascript
  { id: 'salesreps', label: 'Sales Reps' },
```

## STEP 2: Add state variables (around line 17-72)

Find the state declarations section near the top. After the existing useState declarations, ADD:

```javascript
// Sales Reps states
const [salesReps, setSalesReps] = useState([]);
const [repSignups, setRepSignups] = useState([]);
const [commissionPayouts, setCommissionPayouts] = useState([]);
const [selectedRep, setSelectedRep] = useState(null);
const [addRepModal, setAddRepModal] = useState(false);
const [addSignupModal, setAddSignupModal] = useState(false);
const [payoutCalculator, setPayoutCalculator] = useState(null);
const [dealersList, setDealersList] = useState([]);
```

## STEP 3: Add data fetching (in the fetchAllData function around line 270-290)

Find the fetchAllData function. In the Promise.all array, ADD these queries:

```javascript
supabase.from('sales_reps').select('*').order('created_at', { ascending: false }),
supabase.from('rep_signups').select('*').order('signup_date', { ascending: false }),
supabase.from('commission_payouts').select('*').order('payout_period', { ascending: false }),
supabase.from('dealer_settings').select('id, dealer_name, account_status').order('dealer_name'),
```

Then in the destructuring and setState, ADD:

```javascript
const [dealers, users, feedback, audit, promos, templates, rules, staging, library, reps, signups, payouts, allDealersList] = await Promise.all([...]);

// Later in the setState section, ADD:
if (reps.data) setSalesReps(reps.data);
if (signups.data) setRepSignups(signups.data);
if (payouts.data) setCommissionPayouts(payouts.data);
if (allDealersList.data) setDealersList(allDealersList.data);
```

## STEP 4: Add handler functions (after line 480, after other handler functions)

```javascript
// ========== SALES REPS FUNCTIONS ==========

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
    const { error } = await supabase
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
```

## STEP 5: Add the Sales Reps section UI (after line 2290, after the Users section)

Find the `{/* USERS */}` section that starts with `{activeSection === 'users' && (`

After the CLOSING of that section (after its final `</div>` and `)}`), ADD:

```javascript
        {/* SALES REPS */}
        {activeSection === 'salesreps' && (
          <div>
            {/* Dashboard Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <div style={{ ...cardStyle, marginBottom: 0 }}>
                <div style={{ fontSize: '13px', color: '#a1a1aa', marginBottom: '8px' }}>Active Reps</div>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#22c55e' }}>
                  {salesReps.filter(r => r.status === 'active').length}
                </div>
              </div>
              <div style={{ ...cardStyle, marginBottom: 0 }}>
                <div style={{ fontSize: '13px', color: '#a1a1aa', marginBottom: '8px' }}>Total Signups</div>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#3b82f6' }}>
                  {repSignups.filter(s => s.status === 'active').length}
                </div>
              </div>
              <div style={{ ...cardStyle, marginBottom: 0 }}>
                <div style={{ fontSize: '13px', color: '#a1a1aa', marginBottom: '8px' }}>Total MRR</div>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#f97316' }}>
                  ${repSignups.filter(s => s.status === 'active').reduce((sum, s) => sum + parseFloat(s.monthly_rate || 0), 0).toFixed(2)}
                </div>
              </div>
              <div style={{ ...cardStyle, marginBottom: 0 }}>
                <div style={{ fontSize: '13px', color: '#a1a1aa', marginBottom: '8px' }}>Commissions Owed</div>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#eab308' }}>
                  ${commissionPayouts.filter(p => !p.paid).reduce((sum, p) => sum + parseFloat(p.net_payout || 0), 0).toFixed(2)}
                </div>
              </div>
            </div>

            {/* Rep Roster */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>Rep Roster</h3>
                <button onClick={() => setAddRepModal(true)} style={btnPrimary}>+ Add Rep</button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #3f3f46' }}>
                      <th style={{ textAlign: 'left', padding: '12px 8px', color: '#a1a1aa' }}>Name</th>
                      <th style={{ textAlign: 'left', padding: '12px 8px', color: '#a1a1aa' }}>Territory</th>
                      <th style={{ textAlign: 'left', padding: '12px 8px', color: '#a1a1aa' }}>Status</th>
                      <th style={{ textAlign: 'right', padding: '12px 8px', color: '#a1a1aa' }}>Start Date</th>
                      <th style={{ textAlign: 'right', padding: '12px 8px', color: '#a1a1aa' }}>Active Signups</th>
                      <th style={{ textAlign: 'right', padding: '12px 8px', color: '#a1a1aa' }}>MRR</th>
                      <th style={{ textAlign: 'right', padding: '12px 8px', color: '#a1a1aa' }}>Months Active</th>
                      <th style={{ padding: '12px 8px', color: '#a1a1aa', textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesReps.map(rep => {
                      const activeSignups = repSignups.filter(s => s.rep_id === rep.id && s.status === 'active');
                      const totalMRR = activeSignups.reduce((sum, s) => sum + parseFloat(s.monthly_rate || 0), 0);
                      const monthsActive = rep.start_date ? Math.floor((new Date() - new Date(rep.start_date)) / (1000 * 60 * 60 * 24 * 30)) : 0;
                      const statusColors = { active: '#22c55e', inactive: '#eab308', terminated_for_cause: '#ef4444' };

                      return (
                        <tr key={rep.id} style={{ borderBottom: '1px solid #3f3f46' }}>
                          <td style={{ padding: '12px 8px' }}>
                            <div style={{ fontWeight: '600' }}>{rep.name}</div>
                            <div style={{ fontSize: '11px', color: '#71717a' }}>{rep.email}</div>
                          </td>
                          <td style={{ padding: '12px 8px', color: '#a1a1aa' }}>{rep.territory || '-'}</td>
                          <td style={{ padding: '12px 8px' }}>
                            <span style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '600',
                              backgroundColor: statusColors[rep.status] + '20',
                              color: statusColors[rep.status]
                            }}>
                              {rep.status}
                            </span>
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', color: '#a1a1aa' }}>
                            {rep.start_date ? new Date(rep.start_date).toLocaleDateString() : '-'}
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '600' }}>{activeSignups.length}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '600', color: '#f97316' }}>
                            ${totalMRR.toFixed(2)}
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', color: '#a1a1aa' }}>{monthsActive}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                            <button
                              onClick={() => setSelectedRep(rep)}
                              style={{ ...btnSecondary, padding: '6px 12px', fontSize: '12px' }}
                            >
                              Details
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Signups Tracker */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>Signups Tracker</h3>
                <button onClick={() => setAddSignupModal(true)} style={btnSuccess}>+ Add Signup</button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #3f3f46' }}>
                      <th style={{ textAlign: 'left', padding: '12px 8px', color: '#a1a1aa' }}>Dealer</th>
                      <th style={{ textAlign: 'left', padding: '12px 8px', color: '#a1a1aa' }}>Plan</th>
                      <th style={{ textAlign: 'right', padding: '12px 8px', color: '#a1a1aa' }}>Monthly Rate</th>
                      <th style={{ textAlign: 'right', padding: '12px 8px', color: '#a1a1aa' }}>Signup Date</th>
                      <th style={{ textAlign: 'left', padding: '12px 8px', color: '#a1a1aa' }}>Status</th>
                      <th style={{ textAlign: 'left', padding: '12px 8px', color: '#a1a1aa' }}>Rep</th>
                      <th style={{ padding: '12px 8px', color: '#a1a1aa', textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repSignups.map(signup => {
                      const rep = salesReps.find(r => r.id === signup.rep_id);
                      const statusColors = { active: '#22c55e', cancelled: '#71717a', clawback: '#ef4444', paused: '#eab308' };

                      return (
                        <tr key={signup.id} style={{ borderBottom: '1px solid #3f3f46' }}>
                          <td style={{ padding: '12px 8px', fontWeight: '600' }}>{signup.dealer_name}</td>
                          <td style={{ padding: '12px 8px', color: '#a1a1aa' }}>{signup.plan_type}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '600' }}>
                            ${parseFloat(signup.monthly_rate || 0).toFixed(2)}
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', color: '#a1a1aa' }}>
                            {new Date(signup.signup_date).toLocaleDateString()}
                          </td>
                          <td style={{ padding: '12px 8px' }}>
                            <span style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '600',
                              backgroundColor: statusColors[signup.status] + '20',
                              color: statusColors[signup.status]
                            }}>
                              {signup.status}
                              {signup.clawback_applied && ' 🔄'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 8px', color: '#a1a1aa' }}>{rep?.name || '-'}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                            {signup.status === 'active' && (
                              <button
                                onClick={() => handleCancelSignup(signup.id, signup.rep_id)}
                                style={{ ...btnDanger, padding: '6px 12px', fontSize: '12px' }}
                              >
                                Cancel
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payout Calculator */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>Monthly Payout Calculator</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#a1a1aa', marginBottom: '6px' }}>Select Rep</label>
                  <select
                    value={payoutCalculator?.rep_id || ''}
                    onChange={(e) => setPayoutCalculator(prev => ({ ...prev, rep_id: parseInt(e.target.value), period: prev?.period || new Date().toISOString().slice(0, 7) }))}
                    style={inputStyle}
                  >
                    <option value="">Choose rep...</option>
                    {salesReps.map(rep => (
                      <option key={rep.id} value={rep.id}>{rep.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#a1a1aa', marginBottom: '6px' }}>Period (YYYY-MM)</label>
                  <input
                    type="month"
                    value={payoutCalculator?.period || new Date().toISOString().slice(0, 7)}
                    onChange={(e) => setPayoutCalculator(prev => ({ ...prev, period: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
                <div style={{ alignSelf: 'flex-end' }}>
                  <button
                    onClick={() => {
                      if (payoutCalculator?.rep_id && payoutCalculator?.period) {
                        const calc = calculatePayout(payoutCalculator.rep_id, payoutCalculator.period);
                        setPayoutCalculator({ ...payoutCalculator, ...calc });
                      }
                    }}
                    style={btnPrimary}
                  >
                    Calculate
                  </button>
                </div>
              </div>

              {payoutCalculator && payoutCalculator.net_payout !== undefined && (
                <div style={{ backgroundColor: '#18181b', borderRadius: '8px', padding: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '4px' }}>Upfront</div>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: '#3b82f6' }}>
                        ${payoutCalculator.upfront_total.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '11px', color: '#71717a' }}>{payoutCalculator.upfront_count} signups</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '4px' }}>Residual</div>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: '#22c55e' }}>
                        ${payoutCalculator.residual_total.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '11px', color: '#71717a' }}>{payoutCalculator.residual_accounts} accounts</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '4px' }}>Bonus</div>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: '#f97316' }}>
                        ${payoutCalculator.bonus_total.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '4px' }}>Clawback</div>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: '#ef4444' }}>
                        -${payoutCalculator.clawback_total.toFixed(2)}
                      </div>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <div style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '4px' }}>Net Payout</div>
                      <div style={{ fontSize: '32px', fontWeight: '700', color: '#fff' }}>
                        ${payoutCalculator.net_payout.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      onClick={() => handleSavePayout(payoutCalculator)}
                      style={btnPrimary}
                    >
                      Save Payout
                    </button>
                    {commissionPayouts.find(p => p.rep_id === payoutCalculator.rep_id && p.payout_period === payoutCalculator.period && !p.paid) && (
                      <button
                        onClick={() => {
                          const payout = commissionPayouts.find(p => p.rep_id === payoutCalculator.rep_id && p.payout_period === payoutCalculator.period);
                          if (payout) handleMarkPaid(payout.id);
                        }}
                        style={btnSuccess}
                      >
                        Mark as Paid
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Payout History */}
              {payoutCalculator?.rep_id && (
                <div style={{ marginTop: '24px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#a1a1aa' }}>
                    Payout History for {salesReps.find(r => r.id === payoutCalculator.rep_id)?.name}
                  </h4>
                  <table style={{ width: '100%', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #3f3f46' }}>
                        <th style={{ textAlign: 'left', padding: '8px', color: '#a1a1aa' }}>Period</th>
                        <th style={{ textAlign: 'right', padding: '8px', color: '#a1a1aa' }}>Net Payout</th>
                        <th style={{ textAlign: 'center', padding: '8px', color: '#a1a1aa' }}>Paid</th>
                        <th style={{ textAlign: 'right', padding: '8px', color: '#a1a1aa' }}>Paid Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commissionPayouts
                        .filter(p => p.rep_id === payoutCalculator.rep_id)
                        .sort((a, b) => b.payout_period.localeCompare(a.payout_period))
                        .map(payout => (
                          <tr key={payout.id} style={{ borderBottom: '1px solid #3f3f46' }}>
                            <td style={{ padding: '8px' }}>{payout.payout_period}</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: '600' }}>
                              ${parseFloat(payout.net_payout).toFixed(2)}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'center' }}>
                              {payout.paid ? '✅' : '⏳'}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', color: '#a1a1aa' }}>
                              {payout.paid_date ? new Date(payout.paid_date).toLocaleDateString() : '-'}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#18181b', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#a1a1aa' }}>Total Paid:</span>
                      <span style={{ fontWeight: '700', color: '#22c55e' }}>
                        ${commissionPayouts
                          .filter(p => p.rep_id === payoutCalculator.rep_id && p.paid)
                          .reduce((sum, p) => sum + parseFloat(p.net_payout || 0), 0)
                          .toFixed(2)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                      <span style={{ color: '#a1a1aa' }}>Total Owed:</span>
                      <span style={{ fontWeight: '700', color: '#eab308' }}>
                        ${commissionPayouts
                          .filter(p => p.rep_id === payoutCalculator.rep_id && !p.paid)
                          .reduce((sum, p) => sum + parseFloat(p.net_payout || 0), 0)
                          .toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Vesting Calculator */}
            {selectedRep && (
              <div style={cardStyle}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>
                  Vesting Status: {selectedRep.name}
                </h3>
                <div style={{ backgroundColor: '#18181b', borderRadius: '8px', padding: '20px' }}>
                  {(() => {
                    const vesting = calculateVesting(selectedRep);
                    const activeSignups = repSignups.filter(s => s.rep_id === selectedRep.id && s.status === 'active');
                    const monthlyResidual = activeSignups.reduce((sum, s) => sum + (s.monthly_rate * selectedRep.residual_rate), 0);
                    const projectedResidual = monthlyResidual * vesting.residualMonths;

                    return (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                          <div>
                            <div style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '4px' }}>Months Active</div>
                            <div style={{ fontSize: '24px', fontWeight: '700' }}>{vesting.monthsActive}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '4px' }}>Residual Period</div>
                            <div style={{ fontSize: '24px', fontWeight: '700', color: '#3b82f6' }}>
                              {vesting.residualMonths} months
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '4px' }}>Monthly Residual</div>
                            <div style={{ fontSize: '24px', fontWeight: '700', color: '#22c55e' }}>
                              ${monthlyResidual.toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '4px' }}>Projected Residual</div>
                            <div style={{ fontSize: '24px', fontWeight: '700', color: '#f97316' }}>
                              ${projectedResidual.toFixed(2)}
                            </div>
                          </div>
                        </div>
                        <div style={{ padding: '16px', backgroundColor: '#27272a', borderRadius: '6px', fontSize: '14px' }}>
                          <div style={{ fontWeight: '600', marginBottom: '8px' }}>Vesting Rules:</div>
                          <div style={{ color: '#a1a1aa', lineHeight: '1.6' }}>
                            • 0-6 months: No residual after departure<br />
                            • 6-12 months: 6 months residual<br />
                            • 12-24 months: 12 months residual<br />
                            • 24+ months: 24 months residual<br /><br />
                            <strong style={{ color: '#fff' }}>Current Status:</strong> {vesting.description}
                          </div>
                        </div>
                        {selectedRep.status !== 'active' && selectedRep.end_date && vesting.residualMonths > 0 && (
                          <div style={{ marginTop: '16px', padding: '16px', backgroundColor: '#1e293b', borderRadius: '6px', borderLeft: '3px solid #eab308' }}>
                            <div style={{ fontWeight: '600', marginBottom: '4px', color: '#eab308' }}>Residual Countdown</div>
                            <div style={{ fontSize: '13px', color: '#d4d4d8' }}>
                              Departed: {new Date(selectedRep.end_date).toLocaleDateString()}<br />
                              Residual ends: {new Date(new Date(selectedRep.end_date).setMonth(new Date(selectedRep.end_date).getMonth() + vesting.residualMonths)).toLocaleDateString()}<br />
                              Remaining payments: {Math.max(0, vesting.residualMonths - Math.floor((new Date() - new Date(selectedRep.end_date)) / (1000 * 60 * 60 * 24 * 30)))}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
                <button onClick={() => setSelectedRep(null)} style={{ ...btnSecondary, marginTop: '16px' }}>
                  Close
                </button>
              </div>
            )}
          </div>
        )}
```

## STEP 6: Add modals (before the closing `</div>` before line 4818)

Find where other modals are (search for `{addDealerModal &&`), and ADD these modals nearby:

```javascript
      {/* Add Rep Modal */}
      {addRepModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ backgroundColor: '#18181b', borderRadius: '16px', padding: '32px', maxWidth: '600px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '24px' }}>Add Sales Rep</h2>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              handleAddRep({
                name: formData.get('name'),
                email: formData.get('email'),
                phone: formData.get('phone'),
                territory: formData.get('territory'),
                start_date: formData.get('start_date'),
                upfront_commission: parseFloat(formData.get('upfront_commission')),
                residual_rate: parseFloat(formData.get('residual_rate')),
                bonus_threshold: parseInt(formData.get('bonus_threshold')),
                bonus_amount: parseFloat(formData.get('bonus_amount')),
                clawback_days: parseInt(formData.get('clawback_days')),
                notes: formData.get('notes')
              });
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#a1a1aa', marginBottom: '6px' }}>Name *</label>
                    <input name="name" required style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#a1a1aa', marginBottom: '6px' }}>Email *</label>
                    <input name="email" type="email" required style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#a1a1aa', marginBottom: '6px' }}>Phone</label>
                    <input name="phone" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#a1a1aa', marginBottom: '6px' }}>Territory</label>
                    <input name="territory" style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#a1a1aa', marginBottom: '6px' }}>Start Date</label>
                  <input name="start_date" type="date" defaultValue={new Date().toISOString().split('T')[0]} style={inputStyle} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#a1a1aa', marginBottom: '6px' }}>Upfront Commission ($)</label>
                    <input name="upfront_commission" type="number" step="0.01" defaultValue="300.00" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#a1a1aa', marginBottom: '6px' }}>Residual Rate (0-1)</label>
                    <input name="residual_rate" type="number" step="0.0001" defaultValue="0.15" style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#a1a1aa', marginBottom: '6px' }}>Bonus Threshold (signups/month)</label>
                    <input name="bonus_threshold" type="number" defaultValue="15" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#a1a1aa', marginBottom: '6px' }}>Bonus Amount ($)</label>
                    <input name="bonus_amount" type="number" step="0.01" defaultValue="750.00" style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#a1a1aa', marginBottom: '6px' }}>Clawback Period (days)</label>
                  <input name="clawback_days" type="number" defaultValue="90" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#a1a1aa', marginBottom: '6px' }}>Notes</label>
                  <textarea name="notes" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button type="button" onClick={() => setAddRepModal(false)} style={btnSecondary}>Cancel</button>
                  <button type="submit" disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.5 : 1 }}>
                    {loading ? 'Adding...' : 'Add Rep'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Signup Modal */}
      {addSignupModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ backgroundColor: '#18181b', borderRadius: '16px', padding: '32px', maxWidth: '500px', width: '90%' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '24px' }}>Add Signup</h2>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              const dealerId = parseInt(formData.get('dealer_id'));
              const dealerName = dealersList.find(d => d.id === dealerId)?.dealer_name || 'Unknown';

              handleAddSignup({
                rep_id: parseInt(formData.get('rep_id')),
                dealer_id: dealerId,
                dealer_name: dealerName,
                signup_date: formData.get('signup_date'),
                plan_type: formData.get('plan_type'),
                monthly_rate: parseFloat(formData.get('monthly_rate')),
                status: 'active'
              });
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#a1a1aa', marginBottom: '6px' }}>Sales Rep *</label>
                  <select name="rep_id" required style={inputStyle}>
                    <option value="">Choose rep...</option>
                    {salesReps.filter(r => r.status === 'active').map(rep => (
                      <option key={rep.id} value={rep.id}>{rep.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#a1a1aa', marginBottom: '6px' }}>Dealer *</label>
                  <select name="dealer_id" required style={inputStyle}>
                    <option value="">Choose dealer...</option>
                    {dealersList.map(dealer => (
                      <option key={dealer.id} value={dealer.id}>
                        {dealer.dealer_name} {dealer.account_status ? `(${dealer.account_status})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#a1a1aa', marginBottom: '6px' }}>Signup Date</label>
                  <input name="signup_date" type="date" defaultValue={new Date().toISOString().split('T')[0]} style={inputStyle} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#a1a1aa', marginBottom: '6px' }}>Plan Type</label>
                    <select name="plan_type" defaultValue="pro" style={inputStyle}>
                      <option value="starter">Starter</option>
                      <option value="pro">Pro</option>
                      <option value="dealer">Dealer</option>
                      <option value="unlimited">Unlimited</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#a1a1aa', marginBottom: '6px' }}>Monthly Rate ($)</label>
                    <input name="monthly_rate" type="number" step="0.01" defaultValue="79.00" style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button type="button" onClick={() => setAddSignupModal(false)} style={btnSecondary}>Cancel</button>
                  <button type="submit" disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.5 : 1 }}>
                    {loading ? 'Adding...' : 'Add Signup'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
```

That's everything! These are ADDITIONS to DevConsolePage.jsx - do NOT replace the file.
