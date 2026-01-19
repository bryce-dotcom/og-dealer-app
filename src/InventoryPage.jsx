import { useState, useEffect, useRef } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { decodeVIN } from '../lib/vinDecoder';
import { Html5Qrcode } from 'html5-qrcode';

export default function InventoryPage() {
  const { inventory, dealerId, refreshInventory } = useStore();
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [showValue, setShowValue] = useState(null);
  const [valueData, setValueData] = useState(null);
  const [loadingValue, setLoadingValue] = useState(false);
  const [vinInput, setVinInput] = useState('');
  const [decoding, setDecoding] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const scannerRef = useRef(null);
  const photoInputRef = useRef(null);
  const [newVehicle, setNewVehicle] = useState({
    year: '', make: '', model: '', trim: '', vin: '',
    miles: '', color: '', purchase_price: '', sale_price: '', status: 'In Stock'
  });

  const statuses = ['All', 'For Sale', 'In Stock', 'Sold', 'BHPH'];

  const filtered = inventory.filter(v => {
    const matchesFilter = filter === 'All' || v.status === filter;
    const matchesSearch = search === '' || 
      `${v.year} ${v.make} ${v.model} ${v.vin}`.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getMarketValue = async (vehicle) => {
    setShowValue(vehicle);
    setLoadingValue(true);
    setValueData(null);
    try {
      const { data, error } = await supabase.functions.invoke('vehicle-value', {
        body: { year: vehicle.year, make: vehicle.make, model: vehicle.model, miles: vehicle.miles || vehicle.mileage || 60000, condition: 'good' }
      });
      if (error) throw error;
      setValueData(data);
    } catch (err) {
      setValueData({ error: 'Could not get value estimate' });
    } finally {
      setLoadingValue(false);
    }
  };

  const uploadPhoto = async (file, vehicleId) => {
    if (!file) return;
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${vehicleId}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('vehicle-photos').upload(fileName, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('vehicle-photos').getPublicUrl(fileName);
      const vehicle = inventory.find(v => v.id === vehicleId);
      const currentPhotos = vehicle?.photos || [];
      const newPhotos = [...currentPhotos, urlData.publicUrl];
      await supabase.from('inventory').update({ photos: newPhotos }).eq('id', vehicleId);
      refreshInventory();
      setShowDetail({ ...showDetail, photos: newPhotos });
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const deletePhoto = async (photoUrl, vehicleId) => {
    try {
      const path = photoUrl.split('/vehicle-photos/')[1];
      if (path) await supabase.storage.from('vehicle-photos').remove([path]);
      const vehicle = inventory.find(v => v.id === vehicleId);
      const newPhotos = (vehicle?.photos || []).filter(p => p !== photoUrl);
      await supabase.from('inventory').update({ photos: newPhotos }).eq('id', vehicleId);
      refreshInventory();
      setShowDetail({ ...showDetail, photos: newPhotos });
    } catch (err) {
      alert('Delete failed');
    }
  };

  const startScanner = async () => {
    setScanning(true);
    try {
      const html5QrCode = new Html5Qrcode("vin-scanner");
      scannerRef.current = html5QrCode;
      await html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 100 } },
        async (decodedText) => {
          const cleanVin = decodedText.replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase();
          if (cleanVin.length === 17) {
            await html5QrCode.stop();
            scannerRef.current = null;
            setScanning(false);
            setVinInput(cleanVin);
            handleVINDecodeWithVin(cleanVin);
          }
        }, () => {});
    } catch (err) {
      setScanning(false);
      alert('Could not access camera.');
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) { try { await scannerRef.current.stop(); } catch (e) {} scannerRef.current = null; }
    setScanning(false);
  };

  useEffect(() => { return () => { if (scannerRef.current) scannerRef.current.stop().catch(() => {}); }; }, []);

  const handleVINDecodeWithVin = async (vin) => {
    setDecoding(true);
    const result = await decodeVIN(vin);
    if (result.success) {
      setNewVehicle(prev => ({ ...prev, vin: result.data.vin, year: result.data.year, make: result.data.make, model: result.data.model, trim: result.data.trim }));
      setVinInput('');
    } else { alert(result.error || 'Could not decode VIN'); }
    setDecoding(false);
  };

  const handleVINDecode = async () => { if (!vinInput.trim()) return; await handleVINDecodeWithVin(vinInput.trim()); };

  const handleAddVehicle = async () => {
    if (!newVehicle.year || !newVehicle.make || !newVehicle.model) { alert('Year, Make, and Model are required'); return; }
    const { error } = await supabase.from('inventory').insert({
      ...newVehicle, dealer_id: dealerId, miles: parseInt(newVehicle.miles) || 0,
      purchase_price: parseFloat(newVehicle.purchase_price) || 0, sale_price: parseFloat(newVehicle.sale_price) || 0,
      profit: (parseFloat(newVehicle.sale_price) || 0) - (parseFloat(newVehicle.purchase_price) || 0), photos: []
    });
    if (error) { alert('Error: ' + error.message); } 
    else { setShowAdd(false); setNewVehicle({ year: '', make: '', model: '', trim: '', vin: '', miles: '', color: '', purchase_price: '', sale_price: '', status: 'In Stock' }); refreshInventory(); }
  };

  const statusColor = (status) => {
    switch(status) {
      case 'For Sale': return { bg: '#166534', text: '#4ade80' };
      case 'Sold': return { bg: '#1e40af', text: '#60a5fa' };
      case 'BHPH': return { bg: '#9a3412', text: '#fb923c' };
      default: return { bg: '#3f3f46', text: '#a1a1aa' };
    }
  };

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #3f3f46', backgroundColor: '#09090b', color: '#fff', fontSize: '14px', outline: 'none' };
  const labelStyle = { display: 'block', marginBottom: '6px', fontSize: '13px', color: '#a1a1aa', fontWeight: '500' };

  return (
    <div style={{ padding: '24px', backgroundColor: '#09090b', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', margin: 0 }}>Inventory</h1>
          <p style={{ color: '#71717a', margin: '4px 0 0', fontSize: '14px' }}>{filtered.length} of {inventory.length} vehicles</p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ padding: '10px 20px', backgroundColor: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>+ Add Vehicle</button>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="Search year, make, model, VIN..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid #27272a', backgroundColor: '#18181b', color: '#fff', fontSize: '14px', width: '280px', outline: 'none' }} />
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {statuses.map(s => (<button key={s} onClick={() => setFilter(s)} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: filter === s ? '#f97316' : '#27272a', color: filter === s ? '#fff' : '#a1a1aa', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>{s}</button>))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
        {filtered.map((v, i) => {
          const sc = statusColor(v.status);
          const profit = (v.sale_price || 0) - (v.purchase_price || 0);
          const mainPhoto = v.photos?.[0];
          return (
            <div key={v.id || i} onClick={() => setShowDetail(v)} style={{ backgroundColor: '#18181b', borderRadius: '12px', overflow: 'hidden', border: '1px solid #27272a', cursor: 'pointer', transition: 'transform 0.2s' }}>
              <div style={{ height: '160px', backgroundColor: '#27272a', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {mainPhoto ? <img src={mainPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: '#71717a' }}>No Photo</span>}
              </div>
              <div style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                  <div style={{ color: '#fff', fontWeight: '600', fontSize: '16px' }}>{v.year} {v.make} {v.model}</div>
                  <span style={{ padding: '4px 10px', borderRadius: '12px', backgroundColor: sc.bg, color: sc.text, fontSize: '11px', fontWeight: '500' }}>{v.status}</span>
                </div>
                <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '12px' }}>{(v.miles || v.mileage || 0).toLocaleString()} miles</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ color: '#fff', fontSize: '18px', fontWeight: '700' }}>${(v.sale_price || 0).toLocaleString()}</div>
                  <div style={{ color: profit >= 0 ? '#4ade80' : '#f87171', fontSize: '14px', fontWeight: '600' }}>{profit >= 0 ? '+' : ''}${profit.toLocaleString()}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && <div style={{ padding: '60px', textAlign: 'center', color: '#71717a', backgroundColor: '#18181b', borderRadius: '12px', marginTop: '20px' }}>No vehicles found</div>}

      {/* Vehicle Detail Modal */}
      {showDetail && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ backgroundColor: '#18181b', borderRadius: '16px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', border: '1px solid #27272a' }}>
            <div style={{ position: 'relative' }}>
              {showDetail.photos?.[0] ? (
                <img src={showDetail.photos[0]} alt="" style={{ width: '100%', height: '250px', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '250px', backgroundColor: '#27272a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717a' }}>No Photos</div>
              )}
              <button onClick={() => setShowDetail(null)} style={{ position: 'absolute', top: '12px', right: '12px', width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '20px' }}>×</button>
            </div>

            <div style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                <div>
                  <h2 style={{ color: '#fff', margin: 0, fontSize: '22px', fontWeight: '700' }}>{showDetail.year} {showDetail.make} {showDetail.model}</h2>
                  {showDetail.trim && <div style={{ color: '#a1a1aa', fontSize: '14px' }}>{showDetail.trim}</div>}
                </div>
                <span style={{ padding: '6px 14px', borderRadius: '12px', backgroundColor: statusColor(showDetail.status).bg, color: statusColor(showDetail.status).text, fontSize: '13px', fontWeight: '500' }}>{showDetail.status}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <div style={{ backgroundColor: '#27272a', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ color: '#71717a', fontSize: '12px' }}>Mileage</div>
                  <div style={{ color: '#fff', fontWeight: '600' }}>{(showDetail.miles || showDetail.mileage || 0).toLocaleString()}</div>
                </div>
                <div style={{ backgroundColor: '#27272a', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ color: '#71717a', fontSize: '12px' }}>VIN</div>
                  <div style={{ color: '#fff', fontWeight: '600', fontSize: '11px', fontFamily: 'monospace' }}>{showDetail.vin || 'N/A'}</div>
                </div>
                <div style={{ backgroundColor: '#27272a', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ color: '#71717a', fontSize: '12px' }}>Cost</div>
                  <div style={{ color: '#fff', fontWeight: '600' }}>${(showDetail.purchase_price || 0).toLocaleString()}</div>
                </div>
                <div style={{ backgroundColor: '#27272a', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ color: '#71717a', fontSize: '12px' }}>Price</div>
                  <div style={{ color: '#fff', fontWeight: '600' }}>${(showDetail.sale_price || 0).toLocaleString()}</div>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <div style={{ color: '#a1a1aa', fontSize: '12px', fontWeight: '600', marginBottom: '12px' }}>PHOTOS ({showDetail.photos?.length || 0})</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
                  {(showDetail.photos || []).map((photo, i) => (
                    <div key={i} style={{ position: 'relative', paddingTop: '100%', backgroundColor: '#27272a', borderRadius: '8px', overflow: 'hidden' }}>
                      <img src={photo} alt="" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button onClick={(e) => { e.stopPropagation(); deletePhoto(photo, showDetail.id); }} style={{ position: 'absolute', top: '4px', right: '4px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '12px' }}>×</button>
                    </div>
                  ))}
                </div>
                <input ref={photoInputRef} type="file" accept="image/*" capture="environment" onChange={(e) => { if (e.target.files?.[0]) uploadPhoto(e.target.files[0], showDetail.id); }} style={{ display: 'none' }} />
                <button onClick={() => photoInputRef.current?.click()} disabled={uploading} style={{ width: '100%', padding: '12px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  {uploading ? 'Uploading...' : 'Add Photo'}
                </button>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => { setShowDetail(null); getMarketValue(showDetail); }} style={{ flex: 1, padding: '12px', backgroundColor: '#27272a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Check Value</button>
                <button onClick={() => setShowDetail(null)} style={{ flex: 1, padding: '12px', backgroundColor: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Market Value Modal */}
      {showValue && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ backgroundColor: '#18181b', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '400px', border: '1px solid #27272a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>Market Value</h2>
              <button onClick={() => setShowValue(null)} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#27272a', borderRadius: '8px' }}>
              <div style={{ color: '#fff', fontWeight: '600' }}>{showValue.year} {showValue.make} {showValue.model}</div>
              <div style={{ color: '#71717a', fontSize: '13px' }}>{(showValue.miles || showValue.mileage || 0).toLocaleString()} miles</div>
            </div>
            {loadingValue ? (<div style={{ textAlign: 'center', padding: '20px', color: '#71717a' }}>Getting value...</div>
            ) : valueData?.error ? (<div style={{ textAlign: 'center', padding: '20px', color: '#f87171' }}>{valueData.error}</div>
            ) : valueData?.values ? (
              <div>
                <div style={{ display: 'grid', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: '#27272a', borderRadius: '8px' }}><span style={{ color: '#a1a1aa' }}>Trade-In</span><span style={{ color: '#fff', fontWeight: '600' }}>${valueData.values.trade_in.toLocaleString()}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: '#27272a', borderRadius: '8px' }}><span style={{ color: '#a1a1aa' }}>Private Party</span><span style={{ color: '#fff', fontWeight: '600' }}>${valueData.values.private_party.toLocaleString()}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: '#166534', borderRadius: '8px' }}><span style={{ color: '#4ade80' }}>Retail Value</span><span style={{ color: '#4ade80', fontWeight: '700' }}>${valueData.values.retail.toLocaleString()}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: '#1e3a5f', borderRadius: '8px' }}><span style={{ color: '#60a5fa' }}>Dealer Buy Target</span><span style={{ color: '#60a5fa', fontWeight: '600' }}>${valueData.values.dealer_buy.toLocaleString()}</span></div>
                </div>
                <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#27272a', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#71717a' }}>Your Cost:</span><span style={{ color: '#fff' }}>${(showValue.purchase_price || 0).toLocaleString()}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#71717a' }}>Your Price:</span><span style={{ color: '#fff' }}>${(showValue.sale_price || 0).toLocaleString()}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #3f3f46' }}><span style={{ color: '#71717a' }}>vs Retail:</span><span style={{ color: (showValue.sale_price || 0) <= valueData.values.retail ? '#4ade80' : '#f87171', fontWeight: '600' }}>{(showValue.sale_price || 0) <= valueData.values.retail ? 'GOOD PRICE' : 'ABOVE MARKET'}</span></div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Add Vehicle Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ backgroundColor: '#18181b', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto', border: '1px solid #27272a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '20px' }}>Add Vehicle</h2>
              <button onClick={() => { setShowAdd(false); stopScanner(); }} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ backgroundColor: '#27272a', padding: '16px', borderRadius: '10px', marginBottom: '20px' }}>
              <label style={labelStyle}>Quick Add with VIN</label>
              {scanning ? (
                <div>
                  <div id="vin-scanner" style={{ width: '100%', marginBottom: '12px', borderRadius: '8px', overflow: 'hidden' }}></div>
                  <button onClick={stopScanner} style={{ width: '100%', padding: '10px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Stop Scanning</button>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <input type="text" placeholder="Enter 17-digit VIN" value={vinInput} onChange={(e) => setVinInput(e.target.value.toUpperCase())} maxLength={17} style={{ ...inputStyle, flex: 1, fontFamily: 'monospace', letterSpacing: '1px' }} />
                    <button onClick={handleVINDecode} disabled={decoding || vinInput.length !== 17} style={{ padding: '10px 20px', backgroundColor: vinInput.length === 17 ? '#f97316' : '#3f3f46', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: vinInput.length === 17 ? 'pointer' : 'not-allowed', fontSize: '14px' }}>{decoding ? '...' : 'Decode'}</button>
                  </div>
                  <button onClick={startScanner} style={{ width: '100%', padding: '12px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    Scan VIN Barcode
                  </button>
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div><label style={labelStyle}>Year *</label><input type="text" value={newVehicle.year} onChange={(e) => setNewVehicle(prev => ({ ...prev, year: e.target.value }))} style={inputStyle} /></div>
              <div><label style={labelStyle}>Make *</label><input type="text" value={newVehicle.make} onChange={(e) => setNewVehicle(prev => ({ ...prev, make: e.target.value }))} style={inputStyle} /></div>
              <div><label style={labelStyle}>Model *</label><input type="text" value={newVehicle.model} onChange={(e) => setNewVehicle(prev => ({ ...prev, model: e.target.value }))} style={inputStyle} /></div>
              <div><label style={labelStyle}>Trim</label><input type="text" value={newVehicle.trim} onChange={(e) => setNewVehicle(prev => ({ ...prev, trim: e.target.value }))} style={inputStyle} /></div>
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>VIN</label><input type="text" value={newVehicle.vin} onChange={(e) => setNewVehicle(prev => ({ ...prev, vin: e.target.value.toUpperCase() }))} maxLength={17} style={{ ...inputStyle, fontFamily: 'monospace', letterSpacing: '1px' }} /></div>
              <div><label style={labelStyle}>Miles</label><input type="number" value={newVehicle.miles} onChange={(e) => setNewVehicle(prev => ({ ...prev, miles: e.target.value }))} style={inputStyle} /></div>
              <div><label style={labelStyle}>Color</label><input type="text" value={newVehicle.color} onChange={(e) => setNewVehicle(prev => ({ ...prev, color: e.target.value }))} style={inputStyle} /></div>
              <div><label style={labelStyle}>Purchase Price</label><input type="number" value={newVehicle.purchase_price} onChange={(e) => setNewVehicle(prev => ({ ...prev, purchase_price: e.target.value }))} style={inputStyle} placeholder="$" /></div>
              <div><label style={labelStyle}>Sale Price</label><input type="number" value={newVehicle.sale_price} onChange={(e) => setNewVehicle(prev => ({ ...prev, sale_price: e.target.value }))} style={inputStyle} placeholder="$" /></div>
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Status</label><select value={newVehicle.status} onChange={(e) => setNewVehicle(prev => ({ ...prev, status: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}><option value="In Stock">In Stock</option><option value="For Sale">For Sale</option><option value="Sold">Sold</option><option value="BHPH">BHPH</option></select></div>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => { setShowAdd(false); stopScanner(); }} style={{ flex: 1, padding: '12px', backgroundColor: '#27272a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAddVehicle} style={{ flex: 1, padding: '12px', backgroundColor: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Add Vehicle</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}