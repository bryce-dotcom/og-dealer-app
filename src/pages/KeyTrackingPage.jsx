import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';

export default function KeyTrackingPage() {
  const { theme } = useTheme();
  const { dealer, inventory, employees } = useStore();
  const dealerId = dealer?.id;

  const [activeTab, setActiveTab] = useState('keys');
  const [keys, setKeys] = useState([]);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [showLotModal, setShowLotModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [filterLocation, setFilterLocation] = useState('all');
  const [checkoutKey, setCheckoutKey] = useState(null);
  const [keyForm, setKeyForm] = useState({ vehicle_id: '', key_count: '1', key_type: 'standard', has_spare: false, hook_number: '' });
  const [lotForm, setLotForm] = useState({ vehicle_id: '', lot_name: 'Main', row_label: '', spot_number: '', zone: 'front' });
  const [checkoutForm, setCheckoutForm] = useState({ checked_out_to: '', checked_out_reason: '' });

  const keyTypes = ['standard', 'fob', 'smart', 'proximity', 'valet', 'spare'];
  const locations = [
    { value: 'key_board', label: 'Key Board' }, { value: 'salesperson', label: 'Salesperson' },
    { value: 'service', label: 'Service' }, { value: 'customer', label: 'Customer' },
    { value: 'detail', label: 'Detail' }, { value: 'office', label: 'Office' },
    { value: 'lost', label: 'Lost' }, { value: 'other', label: 'Other' },
  ];
  const zones = ['front', 'back', 'showroom', 'service', 'overflow'];

  useEffect(() => { if (dealerId) loadData(); }, [dealerId]);

  const loadData = async () => {
    setLoading(true);
    const [kRes, pRes] = await Promise.all([
      supabase.from('key_tracking').select('*').eq('dealer_id', dealerId).order('hook_number'),
      supabase.from('lot_positions').select('*').eq('dealer_id', dealerId).order('lot_name').order('row_label').order('spot_number'),
    ]);
    setKeys(kRes.data || []);
    setPositions(pRes.data || []);
    setLoading(false);
  };

  const getVehicleTitle = (vid) => {
    const v = inventory?.find(i => i.id === vid);
    return v ? `${v.year} ${v.make} ${v.model}` : vid;
  };

  const handleSaveKey = async () => {
    if (!keyForm.vehicle_id) return;
    const payload = {
      dealer_id: dealerId, vehicle_id: keyForm.vehicle_id,
      key_count: parseInt(keyForm.key_count) || 1, key_type: keyForm.key_type,
      has_spare: keyForm.has_spare, hook_number: keyForm.hook_number || null,
      current_location: 'key_board',
    };
    if (editingKey) {
      await supabase.from('key_tracking').update(payload).eq('id', editingKey.id);
    } else {
      await supabase.from('key_tracking').insert(payload);
    }
    setShowKeyModal(false); setEditingKey(null);
    setKeyForm({ vehicle_id: '', key_count: '1', key_type: 'standard', has_spare: false, hook_number: '' });
    loadData();
  };

  const handleCheckout = async () => {
    if (!checkoutKey || !checkoutForm.checked_out_to) return;
    const emp = employees?.find(e => e.id === parseInt(checkoutForm.checked_out_to));
    await supabase.from('key_tracking').update({
      current_location: 'salesperson',
      checked_out_to: parseInt(checkoutForm.checked_out_to),
      checked_out_name: emp?.name || null,
      checked_out_at: new Date().toISOString(),
      checked_out_reason: checkoutForm.checked_out_reason || null,
    }).eq('id', checkoutKey.id);
    setShowCheckoutModal(false); setCheckoutKey(null);
    setCheckoutForm({ checked_out_to: '', checked_out_reason: '' });
    loadData();
  };

  const handleReturn = async (key) => {
    await supabase.from('key_tracking').update({
      current_location: 'key_board',
      checked_out_to: null, checked_out_name: null, checked_out_at: null, checked_out_reason: null,
      last_verified_at: new Date().toISOString(),
    }).eq('id', key.id);
    loadData();
  };

  const handleSaveLot = async () => {
    if (!lotForm.row_label || !lotForm.spot_number) return;
    await supabase.from('lot_positions').insert({
      dealer_id: dealerId, vehicle_id: lotForm.vehicle_id || null,
      lot_name: lotForm.lot_name, row_label: lotForm.row_label.toUpperCase(),
      spot_number: lotForm.spot_number,
      position_label: `${lotForm.row_label.toUpperCase()}-${lotForm.spot_number}`,
      zone: lotForm.zone, occupied: !!lotForm.vehicle_id,
    });
    setShowLotModal(false);
    setLotForm({ vehicle_id: '', lot_name: 'Main', row_label: '', spot_number: '', zone: 'front' });
    loadData();
  };

  const handleAssignSpot = async (pos, vehicleId) => {
    await supabase.from('lot_positions').update({
      vehicle_id: vehicleId || null, occupied: !!vehicleId,
    }).eq('id', pos.id);
    loadData();
  };

  const filtered = filterLocation === 'all' ? keys : keys.filter(k => k.current_location === filterLocation);
  const checkedOut = keys.filter(k => k.current_location !== 'key_board' && k.current_location !== 'lost');
  const lost = keys.filter(k => k.current_location === 'lost');
  const noKeys = (inventory || []).filter(v => v.status === 'In Stock' && !keys.find(k => k.vehicle_id === v.id));

  const card = { backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '20px' };
  const inputStyle = { width: '100%', padding: '10px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box' };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>Loading...</div>;

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ color: theme.text, fontSize: '24px', fontWeight: '700', margin: 0 }}>Keys & Lot Map</h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', margin: '4px 0 0' }}>Track key locations and parking assignments</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowLotModal(true)} style={{ padding: '10px 16px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer', fontSize: '13px' }}>+ Lot Spot</button>
          <button onClick={() => { setEditingKey(null); setKeyForm({ vehicle_id: '', key_count: '1', key_type: 'standard', has_spare: false, hook_number: '' }); setShowKeyModal(true); }} style={{ padding: '10px 16px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>+ Track Key</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total Keys', val: keys.length, color: theme.text },
          { label: 'On Board', val: keys.filter(k => k.current_location === 'key_board').length, color: '#22c55e' },
          { label: 'Checked Out', val: checkedOut.length, color: '#eab308' },
          { label: 'Lost', val: lost.length, color: lost.length > 0 ? '#ef4444' : '#22c55e' },
          { label: 'No Key Record', val: noKeys.length, color: noKeys.length > 0 ? '#ef4444' : '#22c55e' },
        ].map((s, i) => (
          <div key={i} style={{ ...card, textAlign: 'center' }}>
            <div style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ color: s.color, fontSize: '20px', fontWeight: '700' }}>{s.val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: `1px solid ${theme.border}` }}>
        {[{ id: 'keys', label: `Key Board (${keys.length})` }, { id: 'lot', label: `Lot Map (${positions.length})` }].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '500', color: activeTab === t.id ? theme.accent : theme.textSecondary, borderBottom: activeTab === t.id ? `2px solid ${theme.accent}` : '2px solid transparent', marginBottom: '-1px' }}>{t.label}</button>
        ))}
      </div>

      {activeTab === 'keys' && (
        <>
          <div style={{ marginBottom: '16px' }}>
            <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="all">All Locations</option>
              {locations.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          {filtered.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '40px', color: theme.textMuted }}>No keys tracked</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
              {filtered.map(k => {
                const locInfo = locations.find(l => l.value === k.current_location);
                const isOut = k.current_location !== 'key_board';
                return (
                  <div key={k.id} style={{ ...card, borderColor: k.current_location === 'lost' ? '#ef4444' : isOut ? '#eab308' : theme.border }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                      <div>
                        <div style={{ color: theme.text, fontSize: '14px', fontWeight: '600' }}>{getVehicleTitle(k.vehicle_id)}</div>
                        {k.hook_number && <div style={{ color: theme.textMuted, fontSize: '12px' }}>Hook #{k.hook_number}</div>}
                      </div>
                      <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', backgroundColor: isOut ? (k.current_location === 'lost' ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)') : 'rgba(34,197,94,0.15)', color: isOut ? (k.current_location === 'lost' ? '#ef4444' : '#eab308') : '#22c55e' }}>
                        {locInfo?.label || k.current_location}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
                      <span style={{ color: theme.textMuted, fontSize: '12px' }}>Keys: {k.key_count}</span>
                      <span style={{ color: theme.textMuted, fontSize: '12px', textTransform: 'capitalize' }}>{k.key_type}</span>
                      {k.has_spare && <span style={{ color: '#22c55e', fontSize: '12px' }}>+Spare</span>}
                    </div>
                    {k.checked_out_name && (
                      <div style={{ color: theme.textSecondary, fontSize: '12px', marginBottom: '8px' }}>
                        With: {k.checked_out_name}{k.checked_out_reason && ` — ${k.checked_out_reason}`}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {k.current_location === 'key_board' ? (
                        <button onClick={() => { setCheckoutKey(k); setCheckoutForm({ checked_out_to: '', checked_out_reason: '' }); setShowCheckoutModal(true); }} style={{ padding: '4px 10px', backgroundColor: 'rgba(234,179,8,0.15)', border: 'none', borderRadius: '4px', color: '#eab308', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>Check Out</button>
                      ) : k.current_location !== 'lost' ? (
                        <button onClick={() => handleReturn(k)} style={{ padding: '4px 10px', backgroundColor: 'rgba(34,197,94,0.15)', border: 'none', borderRadius: '4px', color: '#22c55e', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>Return</button>
                      ) : null}
                      <button onClick={() => { setEditingKey(k); setKeyForm({ vehicle_id: k.vehicle_id, key_count: k.key_count?.toString() || '1', key_type: k.key_type || 'standard', has_spare: k.has_spare || false, hook_number: k.hook_number || '' }); setShowKeyModal(true); }} style={{ padding: '4px 10px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '4px', color: theme.textSecondary, cursor: 'pointer', fontSize: '11px' }}>Edit</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === 'lot' && (
        <>
          {positions.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '40px', color: theme.textMuted }}>No lot positions configured</div>
          ) : (
            (() => {
              const lotNames = [...new Set(positions.map(p => p.lot_name))];
              return lotNames.map(lotName => {
                const lotPositions = positions.filter(p => p.lot_name === lotName);
                const rows = [...new Set(lotPositions.map(p => p.row_label))].sort();
                return (
                  <div key={lotName} style={{ ...card, marginBottom: '16px' }}>
                    <h3 style={{ color: theme.text, fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>{lotName} Lot</h3>
                    {rows.map(row => {
                      const rowPositions = lotPositions.filter(p => p.row_label === row).sort((a, b) => a.spot_number.localeCompare(b.spot_number));
                      return (
                        <div key={row} style={{ marginBottom: '12px' }}>
                          <div style={{ color: theme.textMuted, fontSize: '12px', fontWeight: '600', marginBottom: '6px' }}>Row {row}</div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {rowPositions.map(p => (
                              <div key={p.id} style={{ width: '120px', padding: '10px', borderRadius: '8px', border: `1px solid ${p.occupied ? theme.accent : theme.border}`, backgroundColor: p.occupied ? theme.accentBg : 'transparent', textAlign: 'center' }}>
                                <div style={{ color: theme.textMuted, fontSize: '10px', fontWeight: '600' }}>{p.position_label}</div>
                                {p.occupied && p.vehicle_id ? (
                                  <div style={{ color: theme.text, fontSize: '11px', fontWeight: '500', marginTop: '4px' }}>{getVehicleTitle(p.vehicle_id)}</div>
                                ) : (
                                  <div style={{ color: theme.textMuted, fontSize: '11px', marginTop: '4px' }}>Empty</div>
                                )}
                                <select value={p.vehicle_id || ''} onChange={e => handleAssignSpot(p, e.target.value)} style={{ marginTop: '6px', padding: '2px', fontSize: '10px', width: '100%', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '4px', color: theme.text }}>
                                  <option value="">Empty</option>
                                  {(inventory || []).filter(v => v.status === 'In Stock').map(v => <option key={v.id} value={v.id}>{v.year} {v.make} {v.model}</option>)}
                                </select>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              });
            })()
          )}
        </>
      )}

      {showKeyModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowKeyModal(false)}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '420px', maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: theme.text, fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>{editingKey ? 'Edit Key' : 'Track Key'}</h3>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Vehicle *</label>
              <select value={keyForm.vehicle_id} onChange={e => setKeyForm(p => ({ ...p, vehicle_id: e.target.value }))} style={inputStyle} disabled={!!editingKey}>
                <option value="">Select...</option>
                {(inventory || []).filter(v => v.status === 'In Stock').map(v => <option key={v.id} value={v.id}>{v.year} {v.make} {v.model} - #{v.unit_id}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Hook #</label>
                <input type="text" value={keyForm.hook_number} onChange={e => setKeyForm(p => ({ ...p, hook_number: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Key Count</label>
                <input type="number" value={keyForm.key_count} onChange={e => setKeyForm(p => ({ ...p, key_count: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Key Type</label>
              <select value={keyForm.key_type} onChange={e => setKeyForm(p => ({ ...p, key_type: e.target.value }))} style={inputStyle}>
                {keyTypes.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: theme.textSecondary, fontSize: '13px', marginBottom: '16px', cursor: 'pointer' }}>
              <input type="checkbox" checked={keyForm.has_spare} onChange={e => setKeyForm(p => ({ ...p, has_spare: e.target.checked }))} /> Has spare key
            </label>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowKeyModal(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleSaveKey} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {showCheckoutModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowCheckoutModal(false)}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '400px', maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: theme.text, fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Check Out Key</h3>
            <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '20px' }}>{checkoutKey && getVehicleTitle(checkoutKey.vehicle_id)}</p>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>To *</label>
              <select value={checkoutForm.checked_out_to} onChange={e => setCheckoutForm(p => ({ ...p, checked_out_to: e.target.value }))} style={inputStyle}>
                <option value="">Select employee...</option>
                {(employees || []).filter(e => e.active).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Reason</label>
              <select value={checkoutForm.checked_out_reason} onChange={e => setCheckoutForm(p => ({ ...p, checked_out_reason: e.target.value }))} style={inputStyle}>
                <option value="">Select...</option>
                <option value="test_drive">Test Drive</option>
                <option value="showing">Showing</option>
                <option value="service">Service</option>
                <option value="detail">Detail</option>
                <option value="photos">Photos</option>
                <option value="moving">Moving Vehicle</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCheckoutModal(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleCheckout} style={{ padding: '10px 20px', backgroundColor: '#eab308', border: 'none', borderRadius: '8px', color: '#000', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Check Out</button>
            </div>
          </div>
        </div>
      )}

      {showLotModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowLotModal(false)}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '420px', maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: theme.text, fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Add Lot Position</h3>
            {[{ key: 'lot_name', label: 'Lot Name' }, { key: 'row_label', label: 'Row (A, B, C...) *' }, { key: 'spot_number', label: 'Spot # *' }].map(f => (
              <div key={f.key} style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>{f.label}</label>
                <input type="text" value={lotForm[f.key]} onChange={e => setLotForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Zone</label>
              <select value={lotForm.zone} onChange={e => setLotForm(p => ({ ...p, zone: e.target.value }))} style={inputStyle}>
                {zones.map(z => <option key={z} value={z}>{z.charAt(0).toUpperCase() + z.slice(1)}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Assign Vehicle</label>
              <select value={lotForm.vehicle_id} onChange={e => setLotForm(p => ({ ...p, vehicle_id: e.target.value }))} style={inputStyle}>
                <option value="">Empty</option>
                {(inventory || []).filter(v => v.status === 'In Stock').map(v => <option key={v.id} value={v.id}>{v.year} {v.make} {v.model}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowLotModal(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleSaveLot} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
