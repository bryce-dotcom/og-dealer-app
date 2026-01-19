import { useOutletContext } from 'react-router-dom';

const loans = [
  { id: 1, customer: 'HHH Services', vehicle: '2014 Dodge Ram 1500', payment: 584.18, balance: 8450, status: 'Active' },
  { id: 2, customer: 'Meryn Westcott', vehicle: '2018 Jeep Renegade Trailhawk', payment: 256.78, balance: 1798, status: 'Active' },
];

export default function BHPH() {
  const { darkMode } = useOutletContext();
  
  const theme = darkMode ? {
    bg: '#09090b', card: '#18181b', border: '#27272a', text: '#fafafa', textMuted: '#71717a', accent: '#D4AF37',
  } : {
    bg: '#f4f4f5', card: '#ffffff', border: '#e4e4e7', text: '#18181b', textMuted: '#71717a', accent: '#D4AF37',
  };

  const formatCurrency = (num) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(num);
  const totalBalance = loans.reduce((sum, l) => sum + l.balance, 0);
  const monthlyIncome = loans.reduce((sum, l) => sum + l.payment, 0);

  return (
    <div style={{ background: theme.bg, minHeight: 'calc(100vh - 64px)', padding: '32px', transition: 'background 0.3s' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: theme.text, margin: 0 }}>BHPH Loans</h1>
          <p style={{ fontSize: '14px', color: theme.textMuted, marginTop: '8px' }}>Buy Here Pay Here Portfolio</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', transition: 'all 0.3s' }}>
            <p style={{ fontSize: '12px', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>Active Loans</p>
            <p style={{ fontSize: '36px', fontWeight: '700', color: theme.text, margin: 0 }}>{loans.length}</p>
          </div>
          <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', transition: 'all 0.3s' }}>
            <p style={{ fontSize: '12px', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>Portfolio Value</p>
            <p style={{ fontSize: '36px', fontWeight: '700', color: '#22c55e', margin: 0 }}>{formatCurrency(totalBalance)}</p>
          </div>
          <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', transition: 'all 0.3s' }}>
            <p style={{ fontSize: '12px', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>Monthly Income</p>
            <p style={{ fontSize: '36px', fontWeight: '700', color: theme.accent, margin: 0 }}>{formatCurrency(monthlyIncome)}</p>
          </div>
        </div>

        <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '16px', overflow: 'hidden', transition: 'all 0.3s' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                {['Customer', 'Vehicle', 'Payment', 'Balance', 'Status'].map((h) => (
                  <th key={h} style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loans.map((loan) => (
                <tr key={loan.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '16px 20px', fontSize: '14px', fontWeight: '600', color: theme.text }}>{loan.customer}</td>
                  <td style={{ padding: '16px 20px', fontSize: '14px', color: theme.textMuted }}>{loan.vehicle}</td>
                  <td style={{ padding: '16px 20px', fontSize: '14px', fontWeight: '600', color: '#22c55e' }}>{formatCurrency(loan.payment)}/mo</td>
                  <td style={{ padding: '16px 20px', fontSize: '14px', fontWeight: '600', color: theme.accent }}>{formatCurrency(loan.balance)}</td>
                  <td style={{ padding: '16px 20px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '600', padding: '6px 10px', borderRadius: '6px', background: '#22c55e15', color: '#22c55e' }}>{loan.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}