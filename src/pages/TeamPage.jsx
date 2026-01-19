import { useEffect } from 'react';
import { useStore } from '../lib/store';

export default function TeamPage() {
  const { dealerId, employees, fetchAllData } = useStore();
  
  useEffect(() => {
    if (dealerId && (!employees || employees.length === 0)) {
      fetchAllData();
    }
  }, [dealerId]);

  const activeEmployees = employees.filter(e => e.active);
  
  const roleColor = (role) => {
    switch(role?.toLowerCase()) {
      case 'ceo': return { bg: '#7c3aed', text: '#c4b5fd' };
      case 'president': return { bg: '#2563eb', text: '#93c5fd' };
      case 'vp operations': return { bg: '#0891b2', text: '#67e8f9' };
      case 'buyer': return { bg: '#059669', text: '#6ee7b7' };
      case 'sales': return { bg: '#d97706', text: '#fcd34d' };
      default: return { bg: '#3f3f46', text: '#a1a1aa' };
    }
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#09090b', minHeight: '100vh' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', margin: 0 }}>Team</h1>
        <p style={{ color: '#71717a', margin: '4px 0 0', fontSize: '14px' }}>{activeEmployees.length} active members</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
        {employees.map((emp, i) => {
          const roles = emp.roles || [];
          const primaryRole = roles[0] || 'Team Member';
          const rc = roleColor(primaryRole);
          
          return (
            <div key={emp.id || i} style={{ backgroundColor: '#18181b', borderRadius: '12px', padding: '20px', border: '1px solid #27272a' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: rc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: rc.text, fontSize: '20px', fontWeight: '700' }}>
                  {emp.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'}
                </div>
                <div>
                  <div style={{ color: '#fff', fontSize: '18px', fontWeight: '600' }}>{emp.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: emp.active ? '#4ade80' : '#71717a' }}></span>
                    <span style={{ color: emp.active ? '#4ade80' : '#71717a', fontSize: '13px' }}>{emp.active ? 'Active' : 'Inactive'}</span>
                  </div>
                </div>
              </div>
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {roles.map((role, j) => {
                  const c = roleColor(role);
                  return (
                    <span key={j} style={{ padding: '4px 12px', borderRadius: '12px', backgroundColor: c.bg, color: c.text, fontSize: '12px', fontWeight: '500' }}>{role}</span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {employees.length === 0 && (
        <div style={{ padding: '60px', textAlign: 'center', color: '#71717a', backgroundColor: '#18181b', borderRadius: '12px' }}>
          No team members found
        </div>
      )}
    </div>
  );
}