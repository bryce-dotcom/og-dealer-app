import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useTheme } from '../components/Layout';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { dealerId, dealer, fetchAllData } = useStore();
  const themeContext = useTheme();
  const theme = themeContext?.theme || {
    bg: '#09090b', bgCard: '#18181b', border: '#27272a',
    text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a',
    accent: '#f97316', accentBg: 'rgba(249,115,22,0.15)'
  };

  const [form, setForm] = useState({
    dealer_name: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    phone: '',
    email: '',
    dealer_license: ''
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!dealerId) {
      navigate('/login');
      return;
    }
    if (dealer) {
      setForm({
        dealer_name: dealer.dealer_name || '',
        address: dealer.address || '',
        city: dealer.city || '',
        state: dealer.state || '',
        zip: dealer.zip || '',
        phone: dealer.phone || '',
        email: dealer.email || '',
        dealer_license: dealer.dealer_license || ''
      });
    }
  }, [dealerId, dealer]);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const { error } = await supabase
        .from('dealer_settings')
        .update(form)
        .eq('id', dealerId);
      
      if (error) throw error;
      await fetchAllData();
      setMessage('Settings saved!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
    setSaving(false);
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      setMessage('Please select an image file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage('Image must be under 2MB');
      return;
    }

    setUploading(true);
    setMessage('');

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `dealer-${dealerId}-logo.${fileExt}`;
      const filePath = `logos/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('dealer-assets')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('dealer-assets')
        .getPublicUrl(filePath);

      // Update dealer record
      const { error: updateError } = await supabase
        .from('dealer_settings')
        .update({ logo_url: publicUrl })
        .eq('id', dealerId);

      if (updateError) throw updateError;

      await fetchAllData();
      setMessage('Logo uploaded!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage('Upload error: ' + err.message);
    }
    setUploading(false);
  };

  const handleRemoveLogo = async () => {
    if (!confirm('Remove your logo?')) return;
    
    try {
      const { error } = await supabase
        .from('dealer_settings')
        .update({ logo_url: null })
        .eq('id', dealerId);
      
      if (error) throw error;
      await fetchAllData();
      setMessage('Logo removed');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
  };

  if (!dealerId) return null;

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    color: theme.text,
    fontSize: '14px'
  };

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '500',
    color: theme.textSecondary,
    marginBottom: '6px'
  };

  const cardStyle = {
    backgroundColor: theme.bgCard,
    border: `1px solid ${theme.border}`,
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '20px'
  };

  return (
    <div style={{ padding: '24px', backgroundColor: theme.bg, minHeight: '100vh' }}>
      <h1 style={{ fontSize: '28px', fontWeight: '700', color: theme.text, marginBottom: '24px' }}>Settings</h1>

      {message && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '20px',
          backgroundColor: message.includes('Error') ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
          color: message.includes('Error') ? '#ef4444' : '#22c55e',
          fontSize: '14px'
        }}>
          {message}
        </div>
      )}

      {/* Logo Section */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>Dealer Logo</h2>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/* Current Logo Preview */}
          <div style={{
            width: '100px',
            height: '100px',
            borderRadius: '12px',
            backgroundColor: theme.border,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            border: `2px dashed ${theme.border}`
          }}>
            {dealer?.logo_url ? (
              <img src={dealer.logo_url} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ textAlign: 'center', color: theme.textMuted }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 4px' }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                <div style={{ fontSize: '11px' }}>No logo</div>
              </div>
            )}
          </div>

          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '13px', color: theme.textSecondary, marginBottom: '12px' }}>
              Upload your dealership logo. It will appear in the sidebar and on documents. Recommended: 200x200px, PNG or JPG, under 2MB.
            </p>
            
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <label style={{
                padding: '8px 16px',
                backgroundColor: theme.accent,
                color: '#fff',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: uploading ? 'not-allowed' : 'pointer',
                opacity: uploading ? 0.6 : 1
              }}>
                {uploading ? 'Uploading...' : 'Upload Logo'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  disabled={uploading}
                  style={{ display: 'none' }}
                />
              </label>
              
              {dealer?.logo_url && (
                <button
                  onClick={handleRemoveLogo}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'transparent',
                    border: `1px solid ${theme.border}`,
                    color: theme.textSecondary,
                    borderRadius: '8px',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Dealer Info */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>Dealership Information</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Dealer Name</label>
            <input
              type="text"
              value={form.dealer_name}
              onChange={e => setForm({ ...form, dealer_name: e.target.value })}
              style={inputStyle}
            />
          </div>
          
          <div>
            <label style={labelStyle}>Dealer License #</label>
            <input
              type="text"
              value={form.dealer_license}
              onChange={e => setForm({ ...form, dealer_license: e.target.value })}
              style={inputStyle}
            />
          </div>
          
          <div>
            <label style={labelStyle}>Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              style={inputStyle}
            />
          </div>
          
          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              style={inputStyle}
            />
          </div>
          
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>Street Address</label>
            <input
              type="text"
              value={form.address}
              onChange={e => setForm({ ...form, address: e.target.value })}
              style={inputStyle}
            />
          </div>
          
          <div>
            <label style={labelStyle}>City</label>
            <input
              type="text"
              value={form.city}
              onChange={e => setForm({ ...form, city: e.target.value })}
              style={inputStyle}
            />
          </div>
          
          <div>
            <label style={labelStyle}>State</label>
            <input
              type="text"
              value={form.state}
              onChange={e => setForm({ ...form, state: e.target.value })}
              style={inputStyle}
              maxLength={2}
            />
          </div>
          
          <div>
            <label style={labelStyle}>ZIP</label>
            <input
              type="text"
              value={form.zip}
              onChange={e => setForm({ ...form, zip: e.target.value })}
              style={inputStyle}
            />
          </div>
        </div>
        
        <div style={{ marginTop: '20px' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '10px 24px',
              backgroundColor: theme.accent,
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1
            }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* App Info */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>About</h2>
        <div style={{ fontSize: '14px', color: theme.textSecondary }}>
          <p style={{ marginBottom: '8px' }}><strong style={{ color: theme.text }}>OG Dealer</strong> v1.0</p>
          <p style={{ marginBottom: '8px' }}>Built for independent dealers who want to move fast.</p>
          <p style={{ color: theme.textMuted }}>© 2026 OG DiX Motor Club</p>
        </div>
      </div>
    </div>
  );
}