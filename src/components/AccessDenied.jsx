export default function AccessDenied({ theme }) {
  const t = theme || {
    bg: '#09090b', bgCard: '#18181b', border: '#27272a',
    text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a',
    accent: '#f97316'
  };

  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px'
    }}>
      <div style={{
        textAlign: 'center',
        maxWidth: '400px',
        padding: '40px',
        backgroundColor: t.bgCard,
        borderRadius: '16px',
        border: `1px solid ${t.border}`
      }}>
        <div style={{
          width: '64px', height: '64px', borderRadius: '50%',
          backgroundColor: 'rgba(239,68,68,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px', fontSize: '28px'
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
        </div>
        <h2 style={{ color: t.text, fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>
          Access Restricted
        </h2>
        <p style={{ color: t.textSecondary, fontSize: '14px', lineHeight: '1.6' }}>
          You don't have permission to view this page. Contact your manager or dealer admin if you need access.
        </p>
      </div>
    </div>
  );
}
