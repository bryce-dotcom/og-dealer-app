import { useState, useEffect } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useTheme } from '../components/Layout';

export default function BHPHPage() {
  const { bhphLoans, inventory, dealerId, refreshBhphLoans } = useStore();
  const themeContext = useTheme();
  const theme = themeContext?.theme || {
    bg: '#09090b', bgCard: '#18181b', border: '#27272a',
    text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a',
    accent: '#f97316', accentBg: 'rgba(249,115,22,0.15)'
  };

  const [showDetail, setShowDetail] = useState(null);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [showPayment, setShowPayment] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [newPayment, setNewPayment] = useState({ amount: '', date: new Date().toISOString().split('T')[0], method: 'Cash', notes: '' });
  const [newDeal, setNewDeal] = useState({
    vehicle_id: '', client_name: '', purchase_price: '', down_payment: '',
    term_months: '36', interest_rate: '18'
  });

  const activeLoans = bhphLoans.filter(l => l.status === 'Active');
  const totalOutstanding = activeLoans.reduce((sum, l) => sum + (l.balance || 0), 0);
  const monthlyExpected = activeLoans.reduce((sum, l) => sum + (l.monthly_payment || 0), 0);

  const getVehicle = (vehicleId) => inventory.find(v => v.id == vehicleId || v.stock_number == vehicleId);
  const availableVehicles = inventory.filter(v => v.status === 'For Sale' || v.status === 'In Stock');

  const statusColor = (status) => {
    switch(status) {
      case 'Active': return { bg: '#166534', text: '#4ade80' };
      case 'Paid Off': return { bg: '#1e40af', text: '#60a5fa' };
      case 'Default': return { bg: '#7f1d1d', text: '#fca5a5' };
      default: return { bg: theme.border, text: theme.textSecondary };
    }
  };

  const calcMonthlyPayment = (principal, rate, months) => {
    if (!principal || !months) return 0;
    const monthlyRate = (rate || 18) / 100 / 12;
    if (monthlyRate === 0) return principal / months;
    return (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
  };

  const generateAmortization = (loan) => {
    const schedule = [];
    const financed = (loan.purchase_price || 0) - (loan.down_payment || 0);
    let balance = financed;
    const rate = parseFloat(loan.interest_rate) || 18;
    const monthlyRate = rate > 1 ? rate / 100 / 12 : rate / 12; // handle if stored as 0.14 vs 14
    const payment = loan.monthly_payment || calcMonthlyPayment(financed, rate > 1 ? rate : rate * 100, loan.term_months);
    
    for (let i = 1; i <= (loan.term_months || 36); i++) {
      const interest = balance * monthlyRate;
      const principal = payment - interest;
      balance = Math.max(0, balance - principal);
      schedule.push({ month: i, payment, principal, interest, balance });
    }
    return schedule;
  };

  const fetchPayments = async (loanId) => {
    setLoadingPayments(true);
    try {
      const { data, error } = await supabase
        .from('bhph_payments')
        .select('*')
        .eq('loan_id', loanId)
        .order('payment_date', { ascending: false });
      if (error) throw error;
      setPayments(data || []);
    } catch (err) {
      console.error('Error fetching payments:', err);
      setPayments([]);
    }
    setLoadingPayments(false);
  };

  const recordPayment = async () => {
    if (!newPayment.amount || !showPayment) return;
    setSavingPayment(true);
    
    try {
      const { error: paymentError } = await supabase
        .from('bhph_payments')
        .insert({
          loan_id: showPayment.id,
          amount: parseFloat(newPayment.amount),
          payment_date: newPayment.date,
          method: newPayment.method,
          notes: newPayment.notes,
          dealer_id: dealerId
        });
      
      if (paymentError) throw paymentError;

      const newBalance = Math.max(0, (showPayment.balance || 0) - parseFloat(newPayment.amount));
      const newPaymentsMade = (showPayment.payments_made || 0) + 1;
      const newStatus = newBalance <= 0 ? 'Paid Off' : 'Active';
      
      const { error: updateError } = await supabase
        .from('bhph_loans')
        .update({ 
          balance: newBalance, 
          status: newStatus,
          payments_made: newPaymentsMade,
          payments_remaining: (showPayment.term_months || 36) - newPaymentsMade
        })
        .eq('id', showPayment.id);
      
      if (updateError) throw updateError;

      await refreshBhphLoans();
      await fetchPayments(showPayment.id);
      setNewPayment({ amount: '', date: new Date().toISOString().split('T')[0], method: 'Cash', notes: '' });
      setShowPayment(prev => ({ ...prev, balance: newBalance, status: newStatus, payments_made: newPaymentsMade }));
      
      alert('Payment recorded!');
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setSavingPayment(false);
  };

  const createBHPHDeal = async () => {
    if (!newDeal.vehicle_id || !newDeal.client_name || !newDeal.purchase_price) {
      alert('Vehicle, Customer, and Price are required');
      return;
    }

    const principal = parseFloat(newDeal.purchase_price) - parseFloat(newDeal.down_payment || 0);
    const monthlyPayment = calcMonthlyPayment(principal, parseFloat(newDeal.interest_rate), parseInt(newDeal.term_months));

    try {
      const { error: loanError } = await supabase
        .from('bhph_loans')
        .insert({
          vehicle_id: newDeal.vehicle_id,
          client_name: newDeal.client_name,
          purchase_price: parseFloat(newDeal.purchase_price),
          down_payment: parseFloat(newDeal.down_payment || 0),
          term_months: parseInt(newDeal.term_months),
          interest_rate: parseFloat(newDeal.interest_rate) / 100, // store as decimal
          monthly_payment: monthlyPayment,
          balance: principal,
          status: 'Active',
          dealer_id: dealerId,
          payments_made: 0,
          payments_remaining: parseInt(newDeal.term_months)
        });

      if (loanError) throw loanError;

      await supabase.from('inventory').update({ status: 'BHPH' }).eq('id', newDeal.vehicle_id);

      await refreshBhphLoans();
      setShowNewDeal(false);
      setNewDeal({ vehicle_id: '', client_name: '', purchase_price: '', down_payment: '', term_months: '36', interest_rate: '18' });
      alert('BHPH deal created!');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const openDetail = (loan) => {
    setShowDetail(loan);
    fetchPayments(loan.id);
  };

  const openPaymentModal = (loan) => {
    setShowPayment(loan);
    setNewPayment({ amount: loan.monthly_payment?.toFixed(2) || '', date: new Date().toISOString().split('T')[0], method: 'Cash', notes: '' });
  };

  // Calculate progress - handle the fact that balance might be full amount initially
  const calcProgress = (loan) => {
    const financed = (loan.purchase_price || 0) - (loan.down_payment || 0);
    const currentBal = loan.balance || financed;
    // If balance equals purchase_price, it was never updated - use payments_made instead
    const paid = loan.balance === loan.purchase_price 
      ? (loan.payments_made || 0) * (loan.monthly_payment || 0)
      : financed - currentBal;
    const pct = financed > 0 ? Math.min(100, Math.max(0, Math.round((paid / financed) * 100))) : 0;
    return { financed, paid, pct, remaining: financed - paid };
  };

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px', outline: 'none' };
  const labelStyle = { display: 'block', marginBottom: '6px', fontSize: '13px', color: theme.textSecondary, fontWeight: '500' };

  return (
    <div style={{ padding: '24px', backgroundColor: theme.bg, minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>BHPH Loans</h1>
          <p style={{ color: theme.textMuted, margin: '4px 0 0', fontSize: '14px' }}>{activeLoans.length} active loans</p>
        </div>
        <button onClick={() => setShowNewDeal(true)} style={{ padding: '10px 20px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>+ New BHPH Deal</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '20px', border: `1px solid ${theme.border}` }}>
          <div style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '4px' }}>Active Loans</div>
          <div style={{ color: theme.text, fontSize: '28px', fontWeight: '700' }}>{activeLoans.length}</div>
        </div>
        <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '20px', border: `1px solid ${theme.border}` }}>
          <div style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '4px' }}>Outstanding Balance</div>
          <div style={{ color: theme.accent, fontSize: '28px', fontWeight: '700' }}>${totalOutstanding.toLocaleString()}</div>
        </div>
        <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '20px', border: `1px solid ${theme.border}` }}>
          <div style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '4px' }}>Monthly Expected</div>
          <div style={{ color: '#4ade80', fontSize: '28px', fontWeight: '700' }}>${monthlyExpected.toLocaleString()}</div>
        </div>
      </div>

      {/* Loans Table */}
      <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', overflow: 'hidden', border: `1px solid ${theme.border}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: theme.border }}>
              {['Customer', 'Vehicle', 'Balance', 'Payment', 'Progress', 'Status', 'Actions'].map(h => (
                <th key={h} style={{ padding: '14px 16px', textAlign: 'left', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bhphLoans.map((loan, i) => {
              const vehicle = getVehicle(loan.vehicle_id);
              const sc = statusColor(loan.status);
              const progress = calcProgress(loan);
              return (
                <tr key={loan.id || i} style={{ borderBottom: `1px solid ${theme.border}`, cursor: 'pointer' }} onClick={() => openDetail(loan)}>
                  <td style={{ padding: '14px 16px', color: theme.text, fontWeight: '500' }}>{loan.client_name || 'Unknown'}</td>
                  <td style={{ padding: '14px 16px', color: theme.textSecondary }}>{vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : loan.vehicle_id}</td>
                  <td style={{ padding: '14px 16px', color: theme.accent, fontWeight: '600' }}>${progress.remaining.toLocaleString()}</td>
                  <td style={{ padding: '14px 16px', color: '#4ade80', fontWeight: '500' }}>${(loan.monthly_payment || 0).toFixed(2)}/mo</td>
                  <td style={{ padding: '14px 16px', minWidth: '120px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ flex: 1, height: '6px', backgroundColor: theme.border, borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${progress.pct}%`, backgroundColor: '#4ade80', borderRadius: '3px' }} />
                      </div>
                      <span style={{ color: theme.textMuted, fontSize: '12px', minWidth: '35px' }}>{progress.pct}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px' }}><span style={{ padding: '4px 10px', borderRadius: '12px', backgroundColor: sc.bg, color: sc.text, fontSize: '12px', fontWeight: '500' }}>{loan.status}</span></td>
                  <td style={{ padding: '14px 16px' }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => openPaymentModal(loan)} style={{ padding: '6px 12px', backgroundColor: '#4ade80', color: '#000', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>+ Payment</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {bhphLoans.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>No BHPH loans. Click "+ New BHPH Deal" to create one.</div>}
      </div>

      {/* Loan Detail Modal */}
      {showDetail && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', width: '100%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto', border: `1px solid ${theme.border}` }}>
            <div style={{ padding: '24px', borderBottom: `1px solid ${theme.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <h2 style={{ color: theme.text, margin: 0, fontSize: '22px', fontWeight: '700' }}>{showDetail.client_name}</h2>
                  <div style={{ color: theme.textSecondary, fontSize: '14px', marginTop: '4px' }}>
                    {(() => { const v = getVehicle(showDetail.vehicle_id); return v ? `${v.year} ${v.make} ${v.model}` : showDetail.vehicle_id; })()}
                  </div>
                </div>
                <button onClick={() => setShowDetail(null)} style={{ background: 'none', border: 'none', color: theme.textMuted, fontSize: '28px', cursor: 'pointer', lineHeight: 1 }}>×</button>
              </div>
            </div>

            <div style={{ padding: '24px' }}>
              {/* Progress Bar */}
              {(() => {
                const progress = calcProgress(showDetail);
                return (
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ color: theme.textSecondary, fontSize: '13px' }}>Loan Progress</span>
                      <span style={{ color: theme.text, fontSize: '13px', fontWeight: '600' }}>{progress.pct}% paid</span>
                    </div>
                    <div style={{ height: '10px', backgroundColor: theme.border, borderRadius: '5px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${progress.pct}%`, backgroundColor: progress.pct >= 100 ? '#4ade80' : theme.accent, borderRadius: '5px', transition: 'width 0.3s ease' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                      <span style={{ color: theme.textMuted, fontSize: '11px' }}>${progress.paid.toLocaleString()} paid</span>
                      <span style={{ color: theme.textMuted, fontSize: '11px' }}>${progress.financed.toLocaleString()} financed</span>
                    </div>
                  </div>
                );
              })()}

              {/* Loan Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                <div style={{ backgroundColor: theme.border, padding: '14px', borderRadius: '8px' }}>
                  <div style={{ color: theme.textMuted, fontSize: '12px' }}>Purchase Price</div>
                  <div style={{ color: theme.text, fontWeight: '700', fontSize: '18px' }}>${(showDetail.purchase_price || 0).toLocaleString()}</div>
                </div>
                <div style={{ backgroundColor: theme.border, padding: '14px', borderRadius: '8px' }}>
                  <div style={{ color: theme.textMuted, fontSize: '12px' }}>Down Payment</div>
                  <div style={{ color: '#4ade80', fontWeight: '700', fontSize: '18px' }}>${(showDetail.down_payment || 0).toLocaleString()}</div>
                </div>
                <div style={{ backgroundColor: theme.border, padding: '14px', borderRadius: '8px' }}>
                  <div style={{ color: theme.textMuted, fontSize: '12px' }}>Remaining Balance</div>
                  <div style={{ color: theme.accent, fontWeight: '700', fontSize: '18px' }}>${calcProgress(showDetail).remaining.toLocaleString()}</div>
                </div>
                <div style={{ backgroundColor: theme.border, padding: '14px', borderRadius: '8px' }}>
                  <div style={{ color: theme.textMuted, fontSize: '12px' }}>Monthly Payment</div>
                  <div style={{ color: theme.text, fontWeight: '700', fontSize: '18px' }}>${(showDetail.monthly_payment || 0).toFixed(2)}</div>
                </div>
                <div style={{ backgroundColor: theme.border, padding: '14px', borderRadius: '8px' }}>
                  <div style={{ color: theme.textMuted, fontSize: '12px' }}>Interest Rate</div>
                  <div style={{ color: theme.text, fontWeight: '700', fontSize: '18px' }}>{((showDetail.interest_rate || 0) * (showDetail.interest_rate < 1 ? 100 : 1)).toFixed(1)}%</div>
                </div>
                <div style={{ backgroundColor: theme.border, padding: '14px', borderRadius: '8px' }}>
                  <div style={{ color: theme.textMuted, fontSize: '12px' }}>Payments</div>
                  <div style={{ color: theme.text, fontWeight: '700', fontSize: '18px' }}>{showDetail.payments_made || 0} / {showDetail.term_months || 36}</div>
                </div>
              </div>

              {/* Payment History */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ color: theme.textSecondary, fontSize: '14px', fontWeight: '600' }}>PAYMENT HISTORY</div>
                  <button onClick={() => openPaymentModal(showDetail)} style={{ padding: '6px 14px', backgroundColor: '#4ade80', color: '#000', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>+ Record Payment</button>
                </div>
                {loadingPayments ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: theme.textMuted }}>Loading...</div>
                ) : payments.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: theme.textMuted, backgroundColor: theme.border, borderRadius: '8px' }}>No payments recorded yet</div>
                ) : (
                  <div style={{ backgroundColor: theme.border, borderRadius: '8px', overflow: 'hidden' }}>
                    {payments.slice(0, 5).map((p, i) => (
                      <div key={p.id || i} style={{ padding: '12px 16px', borderBottom: i < Math.min(payments.length, 5) - 1 ? `1px solid ${theme.bgCard}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ color: theme.text, fontWeight: '500' }}>${parseFloat(p.amount).toFixed(2)}</div>
                          <div style={{ color: theme.textMuted, fontSize: '12px' }}>{p.payment_date} • {p.method}</div>
                        </div>
                        {p.notes && <div style={{ color: theme.textMuted, fontSize: '12px' }}>{p.notes}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Amortization */}
              <details style={{ marginBottom: '16px' }}>
                <summary style={{ color: theme.textSecondary, fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginBottom: '12px' }}>AMORTIZATION SCHEDULE</summary>
                <div style={{ maxHeight: '300px', overflowY: 'auto', backgroundColor: theme.border, borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ position: 'sticky', top: 0, backgroundColor: theme.bgCard }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left', color: theme.textSecondary }}>Mo</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', color: theme.textSecondary }}>Payment</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', color: theme.textSecondary }}>Principal</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', color: theme.textSecondary }}>Interest</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', color: theme.textSecondary }}>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {generateAmortization(showDetail).map((row, i) => (
                        <tr key={i} style={{ borderTop: `1px solid ${theme.bgCard}`, backgroundColor: i < (showDetail.payments_made || 0) ? 'rgba(74,222,128,0.1)' : 'transparent' }}>
                          <td style={{ padding: '8px 12px', color: theme.textMuted }}>{row.month}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: theme.text }}>${row.payment.toFixed(2)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#4ade80' }}>${row.principal.toFixed(2)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#f87171' }}>${row.interest.toFixed(2)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: theme.accent }}>${row.balance.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>

              <button onClick={() => setShowDetail(null)} style={{ width: '100%', padding: '12px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPayment && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px' }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '400px', border: `1px solid ${theme.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: theme.text, margin: 0, fontSize: '18px' }}>Record Payment</h2>
              <button onClick={() => setShowPayment(null)} style={{ background: 'none', border: 'none', color: theme.textMuted, fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: theme.border, borderRadius: '8px' }}>
              <div style={{ color: theme.text, fontWeight: '600' }}>{showPayment.client_name}</div>
              <div style={{ color: theme.textMuted, fontSize: '13px' }}>Balance: ${calcProgress(showPayment).remaining.toLocaleString()}</div>
            </div>

            <div style={{ display: 'grid', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Amount *</label>
                <input type="number" value={newPayment.amount} onChange={(e) => setNewPayment(prev => ({ ...prev, amount: e.target.value }))} style={inputStyle} placeholder="$" />
              </div>
              <div>
                <label style={labelStyle}>Date</label>
                <input type="date" value={newPayment.date} onChange={(e) => setNewPayment(prev => ({ ...prev, date: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Method</label>
                <select value={newPayment.method} onChange={(e) => setNewPayment(prev => ({ ...prev, method: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Check">Check</option>
                  <option value="ACH">ACH / Bank Transfer</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <input type="text" value={newPayment.notes} onChange={(e) => setNewPayment(prev => ({ ...prev, notes: e.target.value }))} style={inputStyle} placeholder="Optional" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setShowPayment(null)} style={{ flex: 1, padding: '12px', backgroundColor: theme.border, color: theme.text, border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
              <button onClick={recordPayment} disabled={savingPayment || !newPayment.amount} style={{ flex: 1, padding: '12px', backgroundColor: '#4ade80', color: '#000', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>{savingPayment ? 'Saving...' : 'Record Payment'}</button>
            </div>
          </div>
        </div>
      )}

      {/* New BHPH Deal Modal */}
      {showNewDeal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '450px', border: `1px solid ${theme.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: theme.text, margin: 0, fontSize: '18px' }}>New BHPH Deal</h2>
              <button onClick={() => setShowNewDeal(false)} style={{ background: 'none', border: 'none', color: theme.textMuted, fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ display: 'grid', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Vehicle *</label>
                <select value={newDeal.vehicle_id} onChange={(e) => {
                  const v = inventory.find(x => x.id == e.target.value);
                  setNewDeal(prev => ({ ...prev, vehicle_id: e.target.value, purchase_price: v?.sale_price || '' }));
                }} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Select vehicle...</option>
                  {availableVehicles.map(v => (<option key={v.id} value={v.id}>{v.year} {v.make} {v.model} - ${v.sale_price?.toLocaleString()}</option>))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Customer Name *</label>
                <input type="text" value={newDeal.client_name} onChange={(e) => setNewDeal(prev => ({ ...prev, client_name: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Sale Price *</label>
                <input type="number" value={newDeal.purchase_price} onChange={(e) => setNewDeal(prev => ({ ...prev, purchase_price: e.target.value }))} style={inputStyle} placeholder="$" />
              </div>
              <div>
                <label style={labelStyle}>Down Payment</label>
                <input type="number" value={newDeal.down_payment} onChange={(e) => setNewDeal(prev => ({ ...prev, down_payment: e.target.value }))} style={inputStyle} placeholder="$" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Term (months)</label>
                  <select value={newDeal.term_months} onChange={(e) => setNewDeal(prev => ({ ...prev, term_months: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="12">12 months</option>
                    <option value="24">24 months</option>
                    <option value="36">36 months</option>
                    <option value="48">48 months</option>
                    <option value="60">60 months</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Interest Rate %</label>
                  <input type="number" value={newDeal.interest_rate} onChange={(e) => setNewDeal(prev => ({ ...prev, interest_rate: e.target.value }))} style={inputStyle} />
                </div>
              </div>

              {newDeal.purchase_price && (
                <div style={{ backgroundColor: theme.border, padding: '14px', borderRadius: '8px' }}>
                  <div style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '4px' }}>Estimated Monthly Payment</div>
                  <div style={{ color: '#4ade80', fontSize: '24px', fontWeight: '700' }}>
                    ${calcMonthlyPayment(
                      parseFloat(newDeal.purchase_price) - parseFloat(newDeal.down_payment || 0),
                      parseFloat(newDeal.interest_rate),
                      parseInt(newDeal.term_months)
                    ).toFixed(2)}/mo
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setShowNewDeal(false)} style={{ flex: 1, padding: '12px', backgroundColor: theme.border, color: theme.text, border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
              <button onClick={createBHPHDeal} style={{ flex: 1, padding: '12px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Create BHPH Deal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}