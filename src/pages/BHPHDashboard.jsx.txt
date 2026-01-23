import { useTheme } from '../components/Layout';

// Inside the component:
const themeContext = useTheme();
const theme = themeContext?.theme || {
  bg: '#09090b', bgCard: '#18181b', border: '#27272a',
  text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a',
  accent: '#f97316', accentBg: 'rgba(249,115,22,0.15)'
};

// Then use theme.bg, theme.bgCard, theme.text, etc instead of hardcoded colors
import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function BHPHDashboard() {
  const { darkMode } = useOutletContext();
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');

  const theme = darkMode ? {
    bg: '#09090b', card: '#18181b', cardInner: '#0c0c0e', border: '#27272a',
    text: '#fafafa', textMuted: '#71717a', accent: '#D4AF37', input: '#27272a',
    green: '#22c55e', red: '#ef4444', blue: '#3b82f6',
  } : {
    bg: '#f4f4f5', card: '#ffffff', cardInner: '#f9f9f9', border: '#e4e4e7',
    text: '#18181b', textMuted: '#71717a', accent: '#D4AF37', input: '#ffffff',
    green: '#22c55e', red: '#ef4444', blue: '#3b82f6',
  };

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    const [loansRes, paymentsRes] = await Promise.all([
      supabase.from('bhph_loans').select('*').order('created_at', { ascending: false }),
      supabase.from('payments').select('*').order('payment_date', { ascending: false }),
    ]);
    setLoans(loansRes.data || []);
    setPayments(paymentsRes.data || []);
    setLoading(false);
  }

  const formatCurrency = (num) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(num || 0);
  const formatDate = (d) => d ? new Date(d).toLocaleDateString() : '-';

  const totalPortfolio = loans.reduce((s, l) => s + parseFloat(l.balance || 0), 0);
  const monthlyIncome = loans.reduce((s, l) => s + parseFloat(l.monthly_payment || 0), 0);
  const activeLoans = loans.filter(l => l.status === 'Active').length;

  const getAmortization = (loan) => {
    if (!loan) return [];
    const principal = parseFloat(loan.purchase_price) - parseFloat(loan.down_payment || 0);
    const rate = parseFloat(loan.interest_rate) / 12;
    const term = parseInt(loan.term_months);
    const payment = parseFloat(loan.monthly_payment);
    let balance = principal;
    const schedule = [];
    const startDate = loan.first_payment_date ? new Date(loan.first_payment_date) : new Date();
    for (let i = 1; i <= term && balance > 0; i++) {
      const interest = balance * rate;
      const principalPaid = Math.min(payment - interest, balance);
      balance -= principalPaid;
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + i - 1);
      schedule.push({ payment: i, dueDate, amount: payment, principal: principalPaid, interest, balance: Math.max(0, balance) });
    }
    return schedule;
  };

  async function recordPayment() {
    if (!selectedLoan || !paymentAmount) return;
    const amount = parseFloat(paymentAmount);
    const newBalance = Math.max(0, parseFloat(selectedLoan.balance) - amount);
    await supabase.from('payments').insert({
      loan_id: selectedLoan.id, vehicle_id: selectedLoan.vehicle_id, amount,
      payment_date: new Date().toISOString().split('T')[0], method: paymentMethod, status: 'Completed',
    });
    await supabase.from('bhph_loans').update({
      balance: newBalance, payments_made: (selectedLoan.payments_made || 0) + 1,
      status: newBalance <= 0 ? 'Paid Off' : 'Active',
    }).eq('id', selectedLoan.id);
    setShowPaymentModal(false); setPaymentAmount(''); setSelectedLoan(null); fetchData();
  }

  const getLoanPayments = (loanId) => payments.filter(p => p.loan_id === loanId);

  if (loading) return <div style={{ background: theme.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.text }}>Loading BHPH data...</div>;

  return (
    <div style={{ background: theme.bg, minHeight: 'calc(100vh - 64px)', padding: '32px' }}>
      <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: theme.text, margin: 0 }}>BHPH Management</h1>
          <p style={{ fontSize: '14px', color: theme.textMuted, marginTop: '4px' }}>Buy Here Pay Here loan tracking & payments</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {[
            { label: 'Portfolio Balance', value: formatCurrency(totalPortfolio), color: theme.text },
            { label: 'Monthly Income', value: formatCurrency(monthlyIncome), color: theme.green },
            { label: 'Active Loans', value: activeLoans, color: theme.blue },
            { label: 'Total Payments', value: payments.length, color: theme.text },
          ].map((s, i) => (
            <div key={i} style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '20px' }}>
              <p style={{ fontSize: '12px', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>{s.label}</p>
              <p style={{ fontSize: '28px', fontWeight: '700', color: s.color, margin: 0 }}>{s.value}</p>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, margin: '0 0 20px 0' }}>Active Loans</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {loans.map(loan => {
                const paidPercent = loan.purchase_price ? ((parseFloat(loan.purchase_price) - parseFloat(loan.down_payment || 0) - parseFloat(loan.balance)) / (parseFloat(loan.purchase_price) - parseFloat(loan.down_payment || 0))) * 100 : 0;
                const isSelected = selectedLoan?.id === loan.id;
                return (
                  <div key={loan.id} onClick={() => setSelectedLoan(isSelected ? null : loan)} style={{ padding: '16px', background: isSelected ? theme.accent + '20' : theme.cardInner, border: isSelected ? `2px solid ${theme.accent}` : `1px solid ${theme.border}`, borderRadius: '12px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <div>
                        <p style={{ fontSize: '15px', fontWeight: '600', color: theme.text, margin: 0 }}>{loan.client_name}</p>
                        <p style={{ fontSize: '13px', color: theme.textMuted, marginTop: '2px' }}>{loan.vehicle_id}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '15px', fontWeight: '600', color: theme.green, margin: 0 }}>{formatCurrency(loan.monthly_payment)}/mo</p>
                        <p style={{ fontSize: '13px', color: theme.textMuted, marginTop: '2px' }}>Bal: {formatCurrency(loan.balance)}</p>
                      </div>
                    </div>
                    <div style={{ height: '8px', background: theme.border, borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, paidPercent))}%`, background: theme.accent, borderRadius: '4px' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '12px', color: theme.textMuted }}>
                      <span>{loan.term_months} months @ {(parseFloat(loan.interest_rate) * 100).toFixed(0)}%</span>
                      <span>{Math.round(paidPercent)}% paid</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px' }}>
            {selectedLoan ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, margin: 0 }}>{selectedLoan.client_name} - {selectedLoan.vehicle_id}</h3>
                  <button onClick={() => setShowPaymentModal(true)} style={{ padding: '10px 20px', background: theme.green, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>+ Record Payment</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                  {[
                    { label: 'Purchase Price', value: formatCurrency(selectedLoan.purchase_price) },
                    { label: 'Down Payment', value: formatCurrency(selectedLoan.down_payment) },
                    { label: 'Current Balance', value: formatCurrency(selectedLoan.balance), color: theme.accent },
                  ].map((item, i) => (
                    <div key={i} style={{ padding: '12px', background: theme.cardInner, borderRadius: '8px' }}>
                      <p style={{ fontSize: '11px', color: theme.textMuted, margin: 0 }}>{item.label}</p>
                      <p style={{ fontSize: '16px', fontWeight: '600', color: item.color || theme.text, margin: '4px 0 0 0' }}>{item.value}</p>
                    </div>
                  ))}
                </div>
                <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, margin: '0 0 12px 0' }}>Payment History</h4>
                <div style={{ maxHeight: '150px', overflowY: 'auto', marginBottom: '20px' }}>
                  {getLoanPayments(selectedLoan.id).length > 0 ? getLoanPayments(selectedLoan.id).map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${theme.border}` }}>
                      <span style={{ fontSize: '13px', color: theme.textMuted }}>{formatDate(p.payment_date)}</span>
                      <span style={{ fontSize: '13px', color: theme.text }}>{p.method}</span>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: theme.green }}>{formatCurrency(p.amount)}</span>
                    </div>
                  )) : <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '20px' }}>No payments recorded yet</p>}
                </div>
                <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, margin: '0 0 12px 0' }}>Amortization Schedule</h4>
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                        {['#', 'Due Date', 'Payment', 'Principal', 'Interest', 'Balance'].map(h => (
                          <th key={h} style={{ padding: '8px', textAlign: h === '#' || h === 'Due Date' ? 'left' : 'right', color: theme.textMuted }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {getAmortization(selectedLoan).map((row, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${theme.border}` }}>
                          <td style={{ padding: '8px', color: theme.text }}>{row.payment}</td>
                          <td style={{ padding: '8px', color: theme.text }}>{row.dueDate.toLocaleDateString()}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: theme.text }}>{formatCurrency(row.amount)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: theme.green }}>{formatCurrency(row.principal)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: theme.red }}>{formatCurrency(row.interest)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: theme.accent, fontWeight: '500' }}>{formatCurrency(row.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: theme.textMuted }}><p>Select a loan to view details</p></div>}
          </div>
        </div>

        {showPaymentModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: theme.card, borderRadius: '16px', padding: '32px', width: '400px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: '0 0 24px 0' }}>Record Payment</h3>
              <p style={{ fontSize: '14px', color: theme.textMuted, marginBottom: '20px' }}>{selectedLoan?.client_name} - Balance: {formatCurrency(selectedLoan?.balance)}</p>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textMuted, marginBottom: '6px' }}>Amount</label>
                <input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder={selectedLoan?.monthly_payment} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `1px solid ${theme.border}`, background: theme.input, color: theme.text, fontSize: '16px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textMuted, marginBottom: '6px' }}>Method</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `1px solid ${theme.border}`, background: theme.input, color: theme.text, fontSize: '14px', outline: 'none' }}>
                  {['Cash', 'Check', 'Card', 'ACH', 'Venmo', 'Zelle'].map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => { setShowPaymentModal(false); setPaymentAmount(''); }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: `1px solid ${theme.border}`, background: 'transparent', color: theme.text, fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>Cancel</button>
                <button onClick={recordPayment} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: theme.green, color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Record Payment</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}