import { useStore } from '../lib/store';

export default function CommissionsPage() {
  const { employees, deals } = useStore();

  const activeEmployees = employees.filter(e => e.active);

  const cardStyle = { backgroundColor: '#18181b', borderRadius: '12px', padding: '20px', border: '1px solid #27272a' };

  return (
    <div style={{ padding: '24px', backgroundColor: '#09090b', minHeight: '100vh' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', margin: 0 }}>Commissions</h1>
        <p style={{ color: '#71717a', margin: '4px 0 0', fontSize: '14px' }}>Track sales commissions</p>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={cardStyle}>
          <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '4px' }}>Total Deals</div>
          <div style={{ color: '#fff', fontSize: '28px', fontWeight: '700' }}>{deals.length}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '4px' }}>Sales Team</div>
          <div style={{ color: '#fff', fontSize: '28px', fontWeight: '700' }}>{activeEmployees.length}</div>
        </div>
      </div>

      {/* Team List */}
      <div style={cardStyle}>
        <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Team Commissions</h2>
        
        {activeEmployees.length === 0 ? (
          <p style={{ color: '#71717a' }}>No team members</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {activeEmployees.map((emp, i) => (
              <div key={emp.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: '#27272a', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: '#f97316',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: '600'
                  }}>
                    {emp.name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <div style={{ color: '#fff', fontWeight: '500' }}>{emp.name}</div>
                    <div style={{ color: '#71717a', fontSize: '13px' }}>{emp.roles?.join(', ') || 'Staff'}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#22c55e', fontWeight: '600' }}>$0</div>
                  <div style={{ color: '#71717a', fontSize: '12px' }}>0 deals</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: '24px', padding: '20px', backgroundColor: '#18181b', borderRadius: '12px', border: '1px solid #27272a' }}>
        <p style={{ color: '#71717a', fontSize: '14px', margin: 0 }}>
          Commission tracking will be automatically calculated when deals are linked to salespeople.
        </p>
      </div>
    </div>
  );
}