import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { Building2, ChevronRight, Plus, Loader2 } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { dealerId, setDealer, fetchAllData } = useStore();
  const [dealers, setDealers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(null);

  useEffect(() => {
    if (dealerId) {
      navigate('/dashboard');
      return;
    }
    loadDealers();
  }, [dealerId]);

  const loadDealers = async () => {
    const { data, error } = await supabase
      .from('dealer_settings')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setDealers(data || []);
    setLoading(false);
  };

  const selectDealer = async (dealer) => {
    setSelecting(dealer.id);
    setDealer(dealer);
    await fetchAllData();
    navigate('/dashboard');
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <img src="/OGDiXDealerApp.png" alt="OG DiX" style={{ height: '120px', marginBottom: '40px' }} />
      
      <div style={{ width: '100%', maxWidth: '500px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: '8px' }}>Welcome Back</h1>
        <p style={{ fontSize: '16px', color: '#a1a1aa', textAlign: 'center', marginBottom: '32px' }}>Select your dealership to continue</p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}><Loader2 className="animate-spin" size={32} color="#f97316" /></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {dealers.map((dealer) => (
              <div
                key={dealer.id}
                onClick={() => !selecting && selectDealer(dealer)}
                style={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '16px', padding: '20px', cursor: selecting ? 'wait' : 'pointer', opacity: selecting && selecting !== dealer.id ? 0.5 : 1 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '48px', height: '48px', backgroundColor: '#27272a', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Building2 size={24} color="#f97316" />
                    </div>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: '600', color: '#fff' }}>{dealer.dealer_name}</div>
                      <div style={{ fontSize: '14px', color: '#71717a' }}>{dealer.city}{dealer.city && dealer.state ? ', ' : ''}{dealer.state}</div>
                    </div>
                  </div>
                  {selecting === dealer.id ? <Loader2 className="animate-spin" size={20} color="#f97316" /> : <ChevronRight size={20} color="#71717a" />}
                </div>
              </div>
            ))}

            <div
              onClick={() => navigate('/onboarding')}
              style={{ backgroundColor: 'transparent', border: '2px dashed #3f3f46', borderRadius: '16px', padding: '20px', cursor: 'pointer', marginTop: '8px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                <Plus size={20} color="#f97316" />
                <span style={{ fontSize: '16px', fontWeight: '500', color: '#f97316' }}>Add New Dealership</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}