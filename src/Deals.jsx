import { useOutletContext } from 'react-router-dom';

const deals = [
  { id: 1, date: 'Dec 23, 2025', customer: 'Nycole Westcott', vehicle: '2024 Alfa Romeo Stelvio', salesman: 'Bryce', price: 48000, balanceDue: 52282.53 },
];

export default function Deals() {
  const { darkMode } = useOutletContext();
  
  const theme = darkMode ? {
    bg: '#09090b', card: '#18181b', border: '#27272a', text: '#fafafa', textMuted: '#71717a', accent: '#D4AF37',
  } : {
    bg: '#f4f4f5', card: '#ffffff', border: '#e4e4e7', text: '#18181b', textMuted: '#71717a', accent: '#D4AF37',
  };

  const formatCurrency = (num) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(num);
  const totalSales = deals.reduce((sum, d) => sum + d.price, 0);

  return (
    <div style={{ background: theme.bg, minHeight: 'calc(100vh - 64px)', padding: '32px', transition: 'background 0.3s' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: theme.text, margin: 0 }}>Deals</h1>
          <p style={{ fontSize: '14px', color: theme.textMuted, marginTop: '8px' }}>{deals.length} deals • {formatCurrency(totalSales)} total</p>
        </div>

        <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '16px', overflow: 'hidden', transition: 'all 0.3s' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                {['Date', 'Customer', 'Vehicle', 'Salesman', 'Price', 'Balance Due'].map((h) => (
                  <th key={h} style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deals.map((deal) => (
                <tr key={deal.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '16px 20px', fontSize: '14px', color: theme.textMuted }}>{deal.date}</td>
                  <td style={{ padding: '16px 20px', fontSize: '14px', fontWeight: '600', color: theme.text }}>{deal.customer}</td>
                  <td style={{ padding: '16px 20px', fontSize: '14px', color: theme.text }}>{deal.vehicle}</td>
                  <td style={{ padding: '16px 20px', fontSize: '14px', color: theme.textMuted }}>{deal.salesman}</td>
                  <td style={{ padding: '16px 20px', fontSize: '14px', fontWeight: '600', color: theme.accent }}>{formatCurrency(deal.price)}</td>
                  <td style={{ padding: '16px 20px', fontSize: '14px', fontWeight: '600', color: '#f59e0b' }}>{formatCurrency(deal.balanceDue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}