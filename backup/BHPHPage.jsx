import { useState } from 'react';
import { useStore } from '../lib/store';

export default function BHPHPage() {
  const { bhphLoans, inventory } = useStore();
  const [showDetail, setShowDetail] = useState(null);

  const activeLoans = bhphLoans.filter(l => l.status === 'Active');
  const totalOutstanding = activeLoans.reduce((sum, l) => sum + (l.current_balance || 0), 0);
  const monthlyExpected = activeLoans.reduce((sum, l) => sum + (l.monthly_payment || 0), 0);

  const getVehicle = (vehicleId) => inventory.find(v => v.id == vehicleId);

  const statusColor = (status) => {
    switch(status) {
      case 'Active': return { bg: '#166534', text: '#4ade80' };
      case 'Paid Off': return { bg: '#1e40af', text: '#60a5fa' };
      case 'Default': return { bg: '#7f1d1d', text: '#fca5a5' };
      default: return { bg: '#3f3f46', text: '#a1a1aa' };
    }
  };

  const calculateAmortization = (loan) => {
    const schedule = [];
    let balance = loan.current_balance || 0;
    const monthlyPayment = loan.monthly_payment || 0;
    const monthlyRate = (loan.interest_rate || 18) / 100 / 12;
    let month = 1;

    while (balance > 0 && month <= (loan.term_months || 36)) {
      const interest = balance * monthlyRate;
      const principal = Math.min(monthlyPayment - interest, balance);
      balance = Math.max(0, balance - principal);
      schedule.push({ month, payment: monthlyPayment, principal, interest, balance });
      month++;
    }
    return schedule;
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#09090b', minHeight: '100vh' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', margin: 0 }}>BHPH Loans</h1>
        <p style={{ color: '#71717a', margin: '4px 0 0', fontSize: '14px' }}>{activeLoans.length} active loans</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ backgroundColor: '#18181b', borderRadius: '12px', padding: '20px', border: '1px solid #27272a' }}>
          <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '4px' }}>Active Loans</div>
          <div style={{ color: '#fff', fontSize: '28px', fontWeight: '700' }}>{activeLoans.length}</div>
        </div>
        <div style={{ backgroundColor: '#18181b', borderRadius: '12px', padding: '20px', border: '1px solid #27272a' }}>
          <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '4px' }}>Outstanding Balance</div>
          <div style={{ color: '#f97316', fontSize: '28px', fontWeight: '700' }}>${totalOutstanding.toLocaleString()}</div>
        </div>
        <div style={{ backgroundColor: '#18181b', borderRadius: '12px', padding: '20px', border: '1px solid #27272a' }}>
          <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '4px' }}>Monthly Expected</div>
          <div style={{ color: '#4ade80', fontSize: '28px', fontWeight: '700' }}>${monthlyExpected.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ backgroundColor: '#18181b', borderRadius: '12px', overflow: 'hidden', border: '1px solid #27272a' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#27272a' }}>
              {['Customer', 'Vehicle', 'Balance', 'Payment', 'Rate', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '14px 16px', textAlign: 'left', color: '#a1a1aa', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bhphLoans.map((loan, i) => {
              const vehicle = getVehicle(loan.vehicle_id);
              const sc = statusColor(loan.status);
              return (
                <tr key={loan.id || i} style={{ borderBottom: '1px solid #27272a' }}>
                  <td style={{ padding: '14px 16px', color: '#fff', fontWeight: '500' }}>{loan.customer_name || 'Unknown'}</td>
                  <td style={{ padding: '14px 16px', color: '#a1a1aa' }}>{vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'N/A'}</td>
                  <td style={{ padding: '14px 16px', color: '#f97316', fontWeight: '600' }}>${(loan.current_balance || 0).toLocaleString()}</td>
                  <td style={{ padding: '14px 16px', color: '#4ade80', fontWeight: '500' }}>${(loan.monthly_payment || 0).toLocaleString()}/mo</td>
                  <td style={{ padding: '14px 16px', color: '#a1a1aa' }}>{loan.interest_rate || 18}%</td>
                  <td style={{ padding: '14px 16px' }}><span style={{ padding: '4px 10px', borderRadius: '12px', backgroundColor: sc.bg, color: sc.text, fontSize: '12px', fontWeight: '500' }}>{loan.status}</span></td>
                  <td style={{ padding: '14px 16px' }}>
                    <button onClick={() => setShowDetail(loan)} style={{ padding: '6px 12px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}>Details</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {bhphLoans.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: '#71717a' }}>No BHPH loans</div>}
      </div>

      {showDetail && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ backgroundColor: '#18181b', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto', border: '1px solid #27272a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>Loan Details</h2>
              <button onClick={() => setShowDetail(null)} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ color: '#fff', fontSize: '18px', fontWeight: '600', marginBottom: '4px' }}>{showDetail.customer_name}</div>
              <div style={{ color: '#71717a', fontSize: '14px' }}>{(() => { const v = getVehicle(showDetail.vehicle_id); return v ? `${v.year} ${v.make} ${v.model}` : 'N/A'; })()}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              <div style={{ backgroundColor: '#27272a', padding: '12px', borderRadius: '8px' }}>
                <div style={{ color: '#71717a', fontSize: '12px' }}>Purchase Price</div>
                <div style={{ color: '#fff', fontWeight: '600' }}>${(showDetail.purchase_price || 0).toLocaleString()}</div>
              </div>
              <div style={{ backgroundColor: '#27272a', padding: '12px', borderRadius: '8px' }}>
                <div style={{ color: '#71717a', fontSize: '12px' }}>Down Payment</div>
                <div style={{ color: '#fff', fontWeight: '600' }}>${(showDetail.down_payment || 0).toLocaleString()}</div>
              </div>
              <div style={{ backgroundColor: '#27272a', padding: '12px', borderRadius: '8px' }}>
                <div style={{ color: '#71717a', fontSize: '12px' }}>Current Balance</div>
                <div style={{ color: '#f97316', fontWeight: '600' }}>${(showDetail.current_balance || 0).toLocaleString()}</div>
              </div>
              <div style={{ backgroundColor: '#27272a', padding: '12px', borderRadius: '8px' }}>
                <div style={{ color: '#71717a', fontSize: '12px' }}>Monthly Payment</div>
                <div style={{ color: '#4ade80', fontWeight: '600' }}>${(showDetail.monthly_payment || 0).toLocaleString()}</div>
              </div>
              <div style={{ backgroundColor: '#27272a', padding: '12px', borderRadius: '8px' }}>
                <div style={{ color: '#71717a', fontSize: '12px' }}>Interest Rate</div>
                <div style={{ color: '#fff', fontWeight: '600' }}>{showDetail.interest_rate || 18}%</div>
              </div>
              <div style={{ backgroundColor: '#27272a', padding: '12px', borderRadius: '8px' }}>
                <div style={{ color: '#71717a', fontSize: '12px' }}>Term</div>
                <div style={{ color: '#fff', fontWeight: '600' }}>{showDetail.term_months || 36} months</div>
              </div>
            </div>

            <div>
              <div style={{ color: '#a1a1aa', fontSize: '12px', fontWeight: '600', marginBottom: '12px' }}>AMORTIZATION SCHEDULE</div>
              <div style={{ maxHeight: '200px', overflowY: 'auto', backgroundColor: '#27272a', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ position: 'sticky', top: 0, backgroundColor: '#3f3f46' }}>
                      <th style={{ padding: '8px', textAlign: 'left', color: '#a1a1aa' }}>#</th>
                      <th style={{ padding: '8px', textAlign: 'right', color: '#a1a1aa' }}>Payment</th>
                      <th style={{ padding: '8px', textAlign: 'right', color: '#a1a1aa' }}>Principal</th>
                      <th style={{ padding: '8px', textAlign: 'right', color: '#a1a1aa' }}>Interest</th>
                      <th style={{ padding: '8px', textAlign: 'right', color: '#a1a1aa' }}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculateAmortization(showDetail).slice(0, 12).map((row) => (
                      <tr key={row.month} style={{ borderTop: '1px solid #3f3f46' }}>
                        <td style={{ padding: '8px', color: '#71717a' }}>{row.month}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#fff' }}>${row.payment.toFixed(0)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#4ade80' }}>${row.principal.toFixed(0)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#f87171' }}>${row.interest.toFixed(0)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#a1a1aa' }}>${row.balance.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <button onClick={() => setShowDetail(null)} style={{ width: '100%', marginTop: '20px', padding: '12px', backgroundColor: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}