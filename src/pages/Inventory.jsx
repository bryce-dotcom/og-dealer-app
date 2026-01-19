import { useOutletContext } from 'react-router-dom';

const inventory = [
  { id: 1, year: 2017, make: 'Ford', model: 'F250', stock: '2022-94', miles: 105311, cost: 28000, price: 32000, status: 'For Sale' },
  { id: 2, year: 2018, make: 'Helix', model: 'HX243', stock: '2022-90', miles: 0, cost: 85000, price: 95000, status: 'For Sale' },
  { id: 3, year: 2007, make: 'Interstate', model: '8x27', stock: '2007-4', miles: 1, cost: 5000, price: 8000, status: 'For Sale' },
  { id: 4, year: 1997, make: 'Jeep', model: 'Cherokee', stock: '1J4FJ78S2VL576601', miles: 0, cost: 2500, price: 3500, status: 'For Sale' },
  { id: 5, year: 2016, make: 'BMW', model: 'Mega World', stock: '2022-74', miles: 63070, cost: 15000, price: 20000, status: 'In Prep' },
  { id: 6, year: 2025, make: 'Ram', model: '1500', stock: '2022-127', miles: 7683, cost: 38000, price: 42800, status: 'In Stock' },
];

export default function Inventory() {
  const { darkMode } = useOutletContext();
  
  const theme = darkMode ? {
    bg: '#09090b', card: '#18181b', cardInner: '#0c0c0e', border: '#27272a', text: '#fafafa', textMuted: '#71717a', accent: '#D4AF37',
  } : {
    bg: '#f4f4f5', card: '#ffffff', cardInner: '#f9f9f9', border: '#e4e4e7', text: '#18181b', textMuted: '#71717a', accent: '#D4AF37',
  };

  const formatCurrency = (num) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
  const totalValue = inventory.reduce((sum, v) => sum + v.price, 0);

  const getStatusStyle = (status) => {
    switch(status) {
      case 'For Sale': return { bg: '#D4AF3715', color: '#D4AF37' };
      case 'In Stock': return { bg: '#22c55e15', color: '#22c55e' };
      case 'In Prep': return { bg: '#a855f715', color: '#a855f7' };
      default: return { bg: '#71717a20', color: '#71717a' };
    }
  };

  return (
    <div style={{ background: theme.bg, minHeight: 'calc(100vh - 64px)', padding: '32px', transition: 'background 0.3s' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: theme.text, margin: 0 }}>Inventory</h1>
          <p style={{ fontSize: '14px', color: theme.textMuted, marginTop: '8px' }}>{inventory.length} vehicles • {formatCurrency(totalValue)} total value</p>
        </div>

        <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '16px', overflow: 'hidden', transition: 'all 0.3s' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                {['Vehicle', 'Stock #', 'Miles', 'Cost', 'Price', 'Profit', 'Status'].map((h) => (
                  <th key={h} style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inventory.map((item) => {
                const status = getStatusStyle(item.status);
                const profit = item.price - item.cost;
                return (
                  <tr key={item.id} style={{ borderBottom: `1px solid ${theme.border}`, cursor: 'pointer' }}>
                    <td style={{ padding: '16px 20px' }}>
                      <p style={{ fontSize: '14px', fontWeight: '600', color: theme.text, margin: 0 }}>{item.year} {item.make} {item.model}</p>
                    </td>
                    <td style={{ padding: '16px 20px', fontSize: '14px', color: theme.textMuted }}>{item.stock}</td>
                    <td style={{ padding: '16px 20px', fontSize: '14px', color: theme.textMuted }}>{item.miles.toLocaleString()}</td>
                    <td style={{ padding: '16px 20px', fontSize: '14px', color: theme.textMuted }}>{formatCurrency(item.cost)}</td>
                    <td style={{ padding: '16px 20px', fontSize: '14px', fontWeight: '600', color: theme.accent }}>{formatCurrency(item.price)}</td>
                    <td style={{ padding: '16px 20px', fontSize: '14px', fontWeight: '600', color: profit > 0 ? '#22c55e' : '#ef4444' }}>+{formatCurrency(profit)}</td>
                    <td style={{ padding: '16px 20px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', padding: '6px 10px', borderRadius: '6px', background: status.bg, color: status.color }}>{item.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}