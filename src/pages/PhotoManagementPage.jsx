import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';

export default function PhotoManagementPage() {
  const { theme } = useTheme();
  const { dealer, inventory } = useStore();
  const dealerId = dealer?.id;

  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({ vehicle_id: '', photo_type: 'exterior', caption: '' });
  const [uploading, setUploading] = useState(false);
  const [viewPhoto, setViewPhoto] = useState(null);

  const photoTypes = [
    { value: 'exterior', label: 'Exterior' },
    { value: 'interior', label: 'Interior' },
    { value: 'engine', label: 'Engine' },
    { value: 'trunk', label: 'Trunk' },
    { value: 'wheel', label: 'Wheels' },
    { value: 'damage', label: 'Damage' },
    { value: 'vin_plate', label: 'VIN Plate' },
    { value: 'odometer', label: 'Odometer' },
    { value: 'document', label: 'Document' },
    { value: 'other', label: 'Other' },
  ];

  useEffect(() => { if (dealerId) loadPhotos(); }, [dealerId]);

  const loadPhotos = async () => {
    setLoading(true);
    const { data } = await supabase.from('vehicle_photos').select('*').eq('dealer_id', dealerId).order('vehicle_id').order('sort_order');
    setPhotos(data || []);
    setLoading(false);
  };

  const getVehicleTitle = (vid) => {
    const v = inventory?.find(i => i.id === vid);
    return v ? `${v.year} ${v.make} ${v.model}` : vid;
  };

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files?.length || !uploadForm.vehicle_id) return;
    setUploading(true);

    for (const file of files) {
      const ext = file.name.split('.').pop();
      const path = `${dealerId}/${uploadForm.vehicle_id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      const { data: uploadData, error } = await supabase.storage.from('vehicle-photos').upload(path, file);
      if (error) continue;

      const { data: urlData } = supabase.storage.from('vehicle-photos').getPublicUrl(path);
      const url = urlData?.publicUrl;
      if (!url) continue;

      const existingCount = photos.filter(p => p.vehicle_id === uploadForm.vehicle_id).length;

      await supabase.from('vehicle_photos').insert({
        dealer_id: dealerId,
        vehicle_id: uploadForm.vehicle_id,
        url,
        storage_path: path,
        photo_type: uploadForm.photo_type,
        caption: uploadForm.caption || null,
        sort_order: existingCount,
        is_primary: existingCount === 0,
        file_name: file.name,
        file_size: file.size,
      });
    }

    setUploading(false);
    setShowUploadModal(false);
    setUploadForm({ vehicle_id: '', photo_type: 'exterior', caption: '' });
    loadPhotos();
  };

  const handleSetPrimary = async (photo) => {
    await supabase.from('vehicle_photos').update({ is_primary: false }).eq('vehicle_id', photo.vehicle_id).eq('dealer_id', dealerId);
    await supabase.from('vehicle_photos').update({ is_primary: true }).eq('id', photo.id);
    loadPhotos();
  };

  const handleDelete = async (photo) => {
    if (photo.storage_path) {
      await supabase.storage.from('vehicle-photos').remove([photo.storage_path]);
    }
    await supabase.from('vehicle_photos').delete().eq('id', photo.id);
    loadPhotos();
  };

  const handleMoveOrder = async (photo, direction) => {
    const vehiclePhotos = photos.filter(p => p.vehicle_id === photo.vehicle_id).sort((a, b) => a.sort_order - b.sort_order);
    const idx = vehiclePhotos.findIndex(p => p.id === photo.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= vehiclePhotos.length) return;

    await Promise.all([
      supabase.from('vehicle_photos').update({ sort_order: vehiclePhotos[swapIdx].sort_order }).eq('id', photo.id),
      supabase.from('vehicle_photos').update({ sort_order: photo.sort_order }).eq('id', vehiclePhotos[swapIdx].id),
    ]);
    loadPhotos();
  };

  const filtered = photos.filter(p => {
    if (selectedVehicle !== 'all' && p.vehicle_id !== selectedVehicle) return false;
    if (selectedType !== 'all' && p.photo_type !== selectedType) return false;
    return true;
  });

  // Group by vehicle
  const vehicleIds = [...new Set(filtered.map(p => p.vehicle_id))];
  const vehiclesWithPhotos = [...new Set(photos.map(p => p.vehicle_id))];
  const totalPhotos = photos.length;
  const vehiclesNoPhotos = (inventory || []).filter(v => v.status === 'In Stock' && !vehiclesWithPhotos.includes(v.id));

  const card = { backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '20px' };
  const inputStyle = { width: '100%', padding: '10px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box' };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>Loading...</div>;

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ color: theme.text, fontSize: '24px', fontWeight: '700', margin: 0 }}>Photo Management</h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', margin: '4px 0 0' }}>Manage vehicle photos, ordering, and types</p>
        </div>
        <button onClick={() => setShowUploadModal(true)} style={{ padding: '10px 16px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
          Upload Photos
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total Photos', val: totalPhotos, color: theme.text },
          { label: 'Vehicles w/ Photos', val: vehiclesWithPhotos.length, color: '#22c55e' },
          { label: 'Avg Photos/Vehicle', val: vehiclesWithPhotos.length ? Math.round(totalPhotos / vehiclesWithPhotos.length) : 0, color: '#3b82f6' },
          { label: 'Vehicles No Photos', val: vehiclesNoPhotos.length, color: vehiclesNoPhotos.length > 0 ? '#ef4444' : '#22c55e' },
        ].map((s, i) => (
          <div key={i} style={{ ...card, textAlign: 'center' }}>
            <div style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ color: s.color, fontSize: '20px', fontWeight: '700' }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <select value={selectedVehicle} onChange={e => setSelectedVehicle(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value="all">All Vehicles</option>
          {vehiclesWithPhotos.map(vid => <option key={vid} value={vid}>{getVehicleTitle(vid)}</option>)}
        </select>
        <select value={selectedType} onChange={e => setSelectedType(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value="all">All Types</option>
          {photoTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* Vehicles needing photos alert */}
      {vehiclesNoPhotos.length > 0 && (
        <div style={{ ...card, marginBottom: '20px', borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.05)' }}>
          <div style={{ color: '#ef4444', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
            {vehiclesNoPhotos.length} vehicle{vehiclesNoPhotos.length > 1 ? 's' : ''} without photos
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {vehiclesNoPhotos.slice(0, 10).map(v => (
              <span key={v.id} style={{ padding: '4px 10px', borderRadius: '4px', fontSize: '12px', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                {v.year} {v.make} {v.model}
              </span>
            ))}
            {vehiclesNoPhotos.length > 10 && <span style={{ color: theme.textMuted, fontSize: '12px', padding: '4px' }}>+{vehiclesNoPhotos.length - 10} more</span>}
          </div>
        </div>
      )}

      {/* Photo Grid by Vehicle */}
      {vehicleIds.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '40px', color: theme.textMuted }}>No photos found</div>
      ) : (
        vehicleIds.map(vid => {
          const vehiclePhotos = filtered.filter(p => p.vehicle_id === vid).sort((a, b) => a.sort_order - b.sort_order);
          return (
            <div key={vid} style={{ ...card, marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <span style={{ color: theme.text, fontSize: '16px', fontWeight: '600' }}>{getVehicleTitle(vid)}</span>
                  <span style={{ color: theme.textMuted, fontSize: '13px', marginLeft: '12px' }}>{vehiclePhotos.length} photos</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                {vehiclePhotos.map((p, i) => (
                  <div key={p.id} style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${p.is_primary ? theme.accent : theme.border}`, aspectRatio: '4/3' }}>
                    <img src={p.url} alt={p.caption || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }} onClick={() => setViewPhoto(p)} />
                    {p.is_primary && (
                      <div style={{ position: 'absolute', top: '6px', left: '6px', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', backgroundColor: theme.accent, color: '#fff' }}>PRIMARY</div>
                    )}
                    <div style={{ position: 'absolute', top: '6px', right: '6px', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', textTransform: 'capitalize' }}>{p.photo_type}</div>
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '6px', background: 'linear-gradient(transparent, rgba(0,0,0,0.8))', display: 'flex', gap: '4px', justifyContent: 'center' }}>
                      {!p.is_primary && <button onClick={() => handleSetPrimary(p)} style={{ padding: '2px 6px', borderRadius: '3px', fontSize: '10px', backgroundColor: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', cursor: 'pointer' }}>Primary</button>}
                      <button onClick={() => handleMoveOrder(p, 'up')} style={{ padding: '2px 6px', borderRadius: '3px', fontSize: '10px', backgroundColor: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', cursor: 'pointer' }}>&#8592;</button>
                      <button onClick={() => handleMoveOrder(p, 'down')} style={{ padding: '2px 6px', borderRadius: '3px', fontSize: '10px', backgroundColor: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', cursor: 'pointer' }}>&#8594;</button>
                      <button onClick={() => handleDelete(p)} style={{ padding: '2px 6px', borderRadius: '3px', fontSize: '10px', backgroundColor: 'rgba(239,68,68,0.6)', border: 'none', color: '#fff', cursor: 'pointer' }}>Del</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowUploadModal(false)}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '420px', maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: theme.text, fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Upload Photos</h3>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Vehicle *</label>
              <select value={uploadForm.vehicle_id} onChange={e => setUploadForm(p => ({ ...p, vehicle_id: e.target.value }))} style={inputStyle}>
                <option value="">Select vehicle...</option>
                {(inventory || []).filter(v => v.status === 'In Stock').map(v => (
                  <option key={v.id} value={v.id}>{v.year} {v.make} {v.model} - #{v.unit_id}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Photo Type</label>
              <select value={uploadForm.photo_type} onChange={e => setUploadForm(p => ({ ...p, photo_type: e.target.value }))} style={inputStyle}>
                {photoTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Caption (optional)</label>
              <input type="text" value={uploadForm.caption} onChange={e => setUploadForm(p => ({ ...p, caption: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>Select Photos</label>
              <input type="file" accept="image/*" multiple onChange={handleUpload} disabled={!uploadForm.vehicle_id || uploading} style={{ color: theme.text, fontSize: '14px' }} />
              {uploading && <div style={{ color: theme.accent, fontSize: '13px', marginTop: '8px' }}>Uploading...</div>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowUploadModal(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer', fontSize: '14px' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* View Photo Modal */}
      {viewPhoto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, cursor: 'pointer' }} onClick={() => setViewPhoto(null)}>
          <img src={viewPhoto.url} alt={viewPhoto.caption || ''} style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px' }} />
          {viewPhoto.caption && (
            <div style={{ position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)', padding: '8px 16px', backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: '8px', color: '#fff', fontSize: '14px' }}>{viewPhoto.caption}</div>
          )}
        </div>
      )}
    </div>
  );
}
