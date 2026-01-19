import { useOutletContext } from 'react-router-dom';

const team = [
  { id: 1, name: 'Bryce', role: 'CEO', email: 'bryce@ogdix.com', initial: 'B', color: '#D4AF37' },
  { id: 2, name: 'Cole', role: 'Buyer', email: 'cole@ogdix.com', initial: 'C', color: '#22c55e' },
  { id: 3, name: 'Nycole', role: 'President', email: 'nycole@ogdix.com', initial: 'N', color: '#3b82f6' },
  { id: 4, name: 'Mark', role: 'VP Operations', email: 'mark@ogdix.com', initial: 'M', color: '#f59e0b' },
];

export default function Team() {
  const { darkMode } = useOutletContext();
  
  const theme = darkMode ? {
    bg: '#09090b', card: '#18181b', border: '#27272a', text: '#fafafa', textMuted: '#71717a', accent: '#D4AF37',
  } : {
    bg: '#f4f4f5', card: '#ffffff', border: '#e4e4e7', text: '#18181b', textMuted: '#71717a', accent: '#D4AF37',
  };

  return (
    <div style={{ background: theme.bg, minHeight: 'calc(100vh - 64px)', padding: '32px', transition: 'background 0.3s' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: theme.text, margin: 0 }}>Team</h1>
          <p style={{ fontSize: '14px', color: theme.textMuted, marginTop: '8px' }}>{team.length} team members</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
          {team.map((member) => (
            <div key={member.id} style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', textAlign: 'center', transition: 'all 0.3s' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: member.color + '20', color: member.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '24px', margin: '0 auto 16px' }}>{member.initial}</div>
              <p style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: 0 }}>{member.name}</p>
              <p style={{ fontSize: '14px', color: theme.accent, margin: '4px 0 8px' }}>{member.role}</p>
              <p style={{ fontSize: '13px', color: theme.textMuted, margin: 0 }}>{member.email}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}