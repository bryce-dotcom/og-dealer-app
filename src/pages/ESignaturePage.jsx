import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useTheme } from '../components/Layout';

// Read-only view of deal signatures. The real signing flow lives on the Deals
// page (deals.esign_token -> /sign/:token, send-esign-email edge function).
// This page only lists which deals are signed and which are still waiting.
export default function ESignaturePage() {
  const { dealerId } = useStore();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [rows, setRows] = useState([]);
  const [vehicles, setVehicles] = useState({});
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (dealerId) loadDeals();
  }, [dealerId]);

  async function loadDeals() {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from('deals')
      .select('id, purchaser_name, vehicle_id, stage, archived, signed_at, signed_by_name, signing_status, docs_generated_at, created_at')
      .eq('dealer_id', dealerId)
      .order('created_at', { ascending: false });

    if (error) {
      setLoadError(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    // Signed = the buyer signed through /sign/:token.
    // Awaiting = paperwork has been generated (or a link was sent) but nobody has signed yet.
    const relevant = (data || []).filter(d =>
      d.signed_at ||
      (!d.archived && (d.docs_generated_at || ['sent', 'pending', 'viewed'].includes(d.signing_status)))
    );
    setRows(relevant);

    const vehicleIds = [...new Set(relevant.map(d => d.vehicle_id).filter(Boolean))];
    if (vehicleIds.length > 0) {
      const { data: inv, error: invError } = await supabase
        .from('inventory')
        .select('id, year, make, model, stock_number')
        .eq('dealer_id', dealerId)
        .in('id', vehicleIds);
      if (invError) {
        setLoadError('Could not load vehicles: ' + invError.message);
      } else {
        const map = {};
        (inv || []).forEach(v => { map[v.id] = v; });
        setVehicles(map);
      }
    } else {
      setVehicles({});
    }
    setLoading(false);
  }

  const vehicleLabel = (d) => {
    const v = vehicles[d.vehicle_id];
    if (!v) return d.vehicle_id ? 'Vehicle not found' : 'No vehicle';
    const name = [v.year, v.make, v.model].filter(Boolean).join(' ');
    return v.stock_number ? `${name} (Stock #${v.stock_number})` : name;
  };

  const signed = rows.filter(d => d.signed_at);
  const awaiting = rows.filter(d => !d.signed_at);
  const visible = filter === 'signed' ? signed : filter === 'awaiting' ? awaiting : rows;

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>Signed Documents</h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', margin: '4px 0 0' }}>
            Which deals the buyer has signed, and which are still waiting for a signature.
          </p>
        </div>
        <button onClick={() => navigate('/deals')} style={{ padding: '8px 16px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
          Go to Deals
        </button>
      </div>

      {/* How-to note */}
      <div style={{ marginBottom: '20px', padding: '12px 16px', borderRadius: '8px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, fontSize: '13px', color: theme.textSecondary }}>
        To get a deal signed, open it on the Deals page and use 'Sign on this device' or 'Email signing link'.
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          { key: 'all', label: 'All', value: rows.length, color: theme.text },
          { key: 'awaiting', label: 'Awaiting Signature', value: awaiting.length, color: '#f97316' },
          { key: 'signed', label: 'Signed', value: signed.length, color: '#22c55e' },
        ].map(s => (
          <button key={s.key} onClick={() => setFilter(s.key)} style={{
            textAlign: 'left', backgroundColor: theme.bgCard, borderRadius: '12px', padding: '16px', cursor: 'pointer',
            border: `1px solid ${filter === s.key ? theme.accent : theme.border}`, color: theme.text
          }}>
            <div style={{ color: theme.textMuted, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: s.color }}>{s.value}</div>
          </button>
        ))}
      </div>

      {loadError && (
        <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '8px', backgroundColor: '#ef444415', border: '1px solid #ef444440', color: '#ef4444', fontSize: '13px' }}>
          {loadError}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: theme.textMuted }}>Loading...</div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted, backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
          <p style={{ fontSize: '16px', margin: '0 0 6px' }}>
            {filter === 'signed' ? 'No signed deals yet' : filter === 'awaiting' ? 'Nothing is waiting for a signature' : 'No deals ready for signing yet'}
          </p>
          <p style={{ fontSize: '13px', margin: 0 }}>
            Generate the paperwork for a deal on the Deals page, then have the buyer sign it there.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {visible.map(d => (
            <div key={d.id} style={{
              backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap'
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: '600', fontSize: '15px' }}>{d.purchaser_name || 'No buyer name'}</span>
                  <span style={{ color: theme.textMuted, fontSize: '12px' }}>Deal #{d.id}</span>
                  {d.signed_at ? (
                    <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', backgroundColor: '#22c55e20', color: '#22c55e' }}>Signed</span>
                  ) : (
                    <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', backgroundColor: '#f9731620', color: '#f97316' }}>Awaiting signature</span>
                  )}
                </div>
                <div style={{ color: theme.textSecondary, fontSize: '13px' }}>{vehicleLabel(d)}</div>
                <div style={{ color: theme.textMuted, fontSize: '12px', marginTop: '4px' }}>
                  {d.signed_at
                    ? `Signed ${new Date(d.signed_at).toLocaleString()}${d.signed_by_name ? ` by ${d.signed_by_name}` : ''}`
                    : 'Awaiting signature'}
                </div>
              </div>
              <button onClick={() => navigate('/deals')} style={{ padding: '8px 14px', backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                Open Deals
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
