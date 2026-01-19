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
    dealer_license: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    county: '',
    phone: '',
    email: '',
    website: ''
  });
  
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [exportingData, setExportingData] = useState(false);
  const [logoPreview, setLogoPreview] = useState(null);

  // Widget customization state
  const [widgetSettings, setWidgetSettings] = useState({
    accent: 'f97316',
    bg: '09090b',
    card: '18181b',
    text: 'ffffff',
    cols: '3',
    showPrice: true,
    showMiles: true,
    max: '12',
    width: '100%',
    height: '800'
  });
  const [copied, setCopied] = useState(false);

  // Load dealer data
  useEffect(() => {
    if (!dealerId) {
      navigate('/login');
      return;
    }
    if (dealer) {
      setForm({
        dealer_name: dealer.dealer_name || '',
        dealer_license: dealer.dealer_license || '',
        address: dealer.address || '',
        city: dealer.city || '',
        state: dealer.state || 'UT',
        zip: dealer.zip || '',
        county: dealer.county || '',
        phone: dealer.phone || '',
        email: dealer.email || '',
        website: dealer.website || ''
      });
      setLogoPreview(dealer.logo_url || null);
    }
  }, [dealerId, dealer, navigate]);

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 5000);
  };

  // Save dealer settings
  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('dealer_settings')
        .update({
          dealer_name: form.dealer_name,
          dealer_license: form.dealer_license,
          address: form.address,
          city: form.city,
          state: form.state,
          zip: form.zip,
          county: form.county,
          phone: form.phone,
          email: form.email,
          website: form.website
        })
        .eq('id', dealerId);
      
      if (error) throw error;
      await fetchAllData();
      showMessage('Settings saved successfully!', 'success');
    } catch (err) {
      showMessage('Error saving: ' + err.message, 'error');
    }
    setSaving(false);
  };

  // Logo upload - FIXED VERSION
  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showMessage('Please select an image file (PNG, JPG, etc.)', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showMessage('Image must be under 2MB', 'error');
      return;
    }

    setUploading(true);
    showMessage('Uploading logo...', 'success');

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `dealer-${dealerId}-logo-${Date.now()}.${fileExt}`;
      const filePath = `logos/${fileName}`;

      // Try to upload to dealer-assets bucket
      let uploadResult = await supabase.storage
        .from('dealer-assets')
        .upload(filePath, file, { upsert: true });

      // If bucket doesn't exist, try public bucket
      if (uploadResult.error && uploadResult.error.message.includes('not found')) {
        console.log('dealer-assets bucket not found, trying public bucket');
        uploadResult = await supabase.storage
          .from('public')
          .upload(filePath, file, { upsert: true });
        
        if (uploadResult.error) {
          throw new Error('Storage upload failed: ' + uploadResult.error.message);
        }

        const { data: urlData } = supabase.storage
          .from('public')
          .getPublicUrl(filePath);

        // Update database with logo URL
        const { error: updateError } = await supabase
          .from('dealer_settings')
          .update({ logo_url: urlData.publicUrl })
          .eq('id', dealerId);

        if (updateError) {
          throw new Error('Database update failed: ' + updateError.message);
        }

        setLogoPreview(urlData.publicUrl);
        await fetchAllData();
        showMessage('Logo uploaded successfully!', 'success');
        return;
      }

      if (uploadResult.error) {
        throw new Error('Storage upload failed: ' + uploadResult.error.message);
      }

      // Get public URL from dealer-assets bucket
      const { data: urlData } = supabase.storage
        .from('dealer-assets')
        .getPublicUrl(filePath);

      console.log('Logo URL:', urlData.publicUrl);

      // Update database with logo URL
      const { data: updateData, error: updateError } = await supabase
        .from('dealer_settings')
        .update({ logo_url: urlData.publicUrl })
        .eq('id', dealerId)
        .select();

      if (updateError) {
        throw new Error('Database update failed: ' + updateError.message);
      }

      console.log('Update result:', updateData);

      setLogoPreview(urlData.publicUrl);
      
      // Force refresh dealer data
      await fetchAllData();
      
      showMessage('Logo uploaded and saved!', 'success');
    } catch (err) {
      console.error('Logo upload error:', err);
      showMessage('Upload failed: ' + err.message, 'error');
    }
    setUploading(false);
  };

  // Remove logo
  const handleRemoveLogo = async () => {
    if (!window.confirm('Remove your dealership logo?')) return;
    
    try {
      const { error } = await supabase
        .from('dealer_settings')
        .update({ logo_url: null })
        .eq('id', dealerId);
      
      if (error) throw error;
      setLogoPreview(null);
      await fetchAllData();
      showMessage('Logo removed', 'success');
    } catch (err) {
      showMessage('Error: ' + err.message, 'error');
    }
  };

  // Export data as JSON
  const handleExportData = async () => {
    setExportingData(true);
    try {
      const { data: inventory } = await supabase.from('inventory').select('*').eq('dealer_id', dealerId);
      const { data: deals } = await supabase.from('deals').select('*').eq('dealer_id', dealerId);
      const { data: customers } = await supabase.from('customers').select('*').eq('dealer_id', dealerId);
      const { data: employees } = await supabase.from('employees').select('*').eq('dealer_id', dealerId);
      const { data: bhphLoans } = await supabase.from('bhph_loans').select('*').eq('dealer_id', dealerId);

      const exportData = {
        exportDate: new Date().toISOString(),
        dealer: dealer,
        inventory: inventory || [],
        deals: deals || [],
        customers: customers || [],
        employees: employees || [],
        bhphLoans: bhphLoans || []
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(dealer?.dealer_name || 'dealer').replace(/\s+/g, '_')}_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showMessage('Data exported successfully!', 'success');
    } catch (err) {
      showMessage('Export failed: ' + err.message, 'error');
    }
    setExportingData(false);
  };

  // Widget functions
  const baseUrl = window.location.origin;
  const inventoryEmbedUrl = `${baseUrl}/embed/${dealerId}?accent=${widgetSettings.accent}&bg=${widgetSettings.bg}&card=${widgetSettings.card}&text=${widgetSettings.text}&cols=${widgetSettings.cols}&price=${widgetSettings.showPrice}&miles=${widgetSettings.showMiles}&max=${widgetSettings.max}`;
  const findRigEmbedUrl = `${baseUrl}/find-rig/${dealerId}?theme=${widgetSettings.bg === '09090b' ? 'dark' : 'light'}`;

  const inventoryIframeCode = `<iframe 
  src="${inventoryEmbedUrl}" 
  width="${widgetSettings.width}" 
  height="${widgetSettings.height}px" 
  frameborder="0" 
  style="border: none; border-radius: 12px;"
  title="${dealer?.dealer_name || 'Dealer'} Inventory"
></iframe>`;

  const findRigIframeCode = `<iframe 
  src="${findRigEmbedUrl}" 
  width="100%" 
  height="700px" 
  frameborder="0" 
  style="border: none; border-radius: 12px;"
  title="Find Me a Rig"
></iframe>`;

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!dealerId) return null;

  // Styles
  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    color: theme.text,
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s'
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

  const buttonPrimary = {
    padding: '10px 20px',
    backgroundColor: theme.accent,
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer'
  };

  const buttonSecondary = {
    padding: '10px 20px',
    backgroundColor: 'transparent',
    color: theme.textSecondary,
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer'
  };

  return (
    <div style={{ padding: '24px', backgroundColor: theme.bg, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', color: theme.text, margin: 0 }}>Settings</h1>
        <p style={{ color: theme.textMuted, margin: '4px 0 0', fontSize: '14px' }}>
          Manage your dealership profile and preferences
        </p>
      </div>

      {/* Message Alert */}
      {message.text && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '20px',
          backgroundColor: message.type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
          color: message.type === 'error' ? '#ef4444' : '#22c55e',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          {message.type === 'error' ? '✕' : '✓'} {message.text}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
        {/* Left Column */}
        <div>
          {/* Logo Section */}
          <div style={cardStyle}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
              Dealership Logo
            </h2>
            
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
              {/* Logo Preview */}
              <div style={{
                width: '100px',
                height: '100px',
                borderRadius: '12px',
                border: `2px dashed ${theme.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                backgroundColor: theme.bg,
                flexShrink: 0
              }}>
                {logoPreview ? (
                  <img 
                    src={logoPreview} 
                    alt="Dealer logo" 
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    onError={(e) => {
                      console.error('Logo failed to load:', logoPreview);
                      e.target.style.display = 'none';
                    }}
                  />
                ) : (
                  <div style={{
                    width: '100%',
                    height: '100%',
                    background: `linear-gradient(135deg, ${theme.accent}, #ea580c)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: '800',
                    fontSize: '32px'
                  }}>
                    {(dealer?.dealer_name || 'OG').charAt(0)}
                  </div>
                )}
              </div>
              
              <div style={{ flex: 1 }}>
                <p style={{ color: theme.textMuted, fontSize: '13px', margin: '0 0 12px' }}>
                  Upload your logo to display in the sidebar and on widgets. PNG or JPG, max 2MB.
                </p>
                
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <label style={{
                    ...buttonPrimary,
                    opacity: uploading ? 0.6 : 1,
                    cursor: uploading ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    {uploading ? 'Uploading...' : 'Upload Logo'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      disabled={uploading}
                      style={{ display: 'none' }}
                    />
                  </label>
                  
                  {logoPreview && (
                    <button onClick={handleRemoveLogo} style={buttonSecondary}>
                      Remove
                    </button>
                  )}
                </div>

                {/* Debug info */}
                {logoPreview && (
                  <p style={{ color: theme.textMuted, fontSize: '11px', marginTop: '12px', wordBreak: 'break-all' }}>
                    Current: {logoPreview.substring(0, 60)}...
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Business Information */}
          <div style={cardStyle}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, marginBottom: '20px' }}>
              Business Information
            </h2>
            
            <div style={{ display: 'grid', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Dealership Name *</label>
                  <input
                    type="text"
                    value={form.dealer_name}
                    onChange={e => setForm({ ...form, dealer_name: e.target.value })}
                    style={inputStyle}
                    placeholder="Your Dealership Name"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Dealer License #</label>
                  <input
                    type="text"
                    value={form.dealer_license}
                    onChange={e => setForm({ ...form, dealer_license: e.target.value })}
                    style={inputStyle}
                    placeholder="DL-12345"
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Street Address</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })}
                  style={inputStyle}
                  placeholder="123 Main St"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>City</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={e => setForm({ ...form, city: e.target.value })}
                    style={inputStyle}
                    placeholder="Salt Lake City"
                  />
                </div>
                <div>
                  <label style={labelStyle}>State</label>
                  <input
                    type="text"
                    value={form.state}
                    onChange={e => setForm({ ...form, state: e.target.value })}
                    style={inputStyle}
                    placeholder="UT"
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
                    placeholder="84101"
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>County</label>
                <input
                  type="text"
                  value={form.county}
                  onChange={e => setForm({ ...form, county: e.target.value })}
                  style={inputStyle}
                  placeholder="Salt Lake"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    style={inputStyle}
                    placeholder="801-555-1234"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    style={inputStyle}
                    placeholder="info@dealer.com"
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Website</label>
                <input
                  type="url"
                  value={form.website}
                  onChange={e => setForm({ ...form, website: e.target.value })}
                  style={inputStyle}
                  placeholder="https://yourdealer.com"
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button 
                onClick={handleSave} 
                disabled={saving}
                style={{ ...buttonPrimary, opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>

          {/* Data Export */}
          <div style={cardStyle}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>
              Data Export
            </h2>
            <p style={{ color: theme.textMuted, fontSize: '13px', margin: '0 0 16px' }}>
              Download all your dealership data as a JSON backup file.
            </p>
            <button 
              onClick={handleExportData} 
              disabled={exportingData}
              style={{ ...buttonSecondary, opacity: exportingData ? 0.6 : 1 }}
            >
              {exportingData ? 'Exporting...' : 'Export All Data'}
            </button>
          </div>
        </div>

        {/* Right Column - Widgets */}
        <div>
          {/* Inventory Widget Customization */}
          <div style={cardStyle}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>
              Live Inventory Widget
            </h2>
            <p style={{ color: theme.textMuted, fontSize: '13px', margin: '0 0 20px' }}>
              Customize colors to match your website, then copy the embed code.
            </p>

            {/* Color Pickers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Accent Color</label>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input 
                    type="color" 
                    value={`#${widgetSettings.accent}`}
                    onChange={e => setWidgetSettings({...widgetSettings, accent: e.target.value.slice(1)})}
                    style={{ width: '36px', height: '36px', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: 0 }}
                  />
                  <input 
                    type="text" 
                    value={widgetSettings.accent}
                    onChange={e => setWidgetSettings({...widgetSettings, accent: e.target.value.replace('#', '')})}
                    style={{ ...inputStyle, flex: 1 }}
                    maxLength={6}
                  />
                </div>
              </div>
              
              <div>
                <label style={labelStyle}>Background</label>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input 
                    type="color" 
                    value={`#${widgetSettings.bg}`}
                    onChange={e => setWidgetSettings({...widgetSettings, bg: e.target.value.slice(1)})}
                    style={{ width: '36px', height: '36px', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: 0 }}
                  />
                  <input 
                    type="text" 
                    value={widgetSettings.bg}
                    onChange={e => setWidgetSettings({...widgetSettings, bg: e.target.value.replace('#', '')})}
                    style={{ ...inputStyle, flex: 1 }}
                    maxLength={6}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Card Color</label>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input 
                    type="color" 
                    value={`#${widgetSettings.card}`}
                    onChange={e => setWidgetSettings({...widgetSettings, card: e.target.value.slice(1)})}
                    style={{ width: '36px', height: '36px', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: 0 }}
                  />
                  <input 
                    type="text" 
                    value={widgetSettings.card}
                    onChange={e => setWidgetSettings({...widgetSettings, card: e.target.value.replace('#', '')})}
                    style={{ ...inputStyle, flex: 1 }}
                    maxLength={6}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Text Color</label>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input 
                    type="color" 
                    value={`#${widgetSettings.text}`}
                    onChange={e => setWidgetSettings({...widgetSettings, text: e.target.value.slice(1)})}
                    style={{ width: '36px', height: '36px', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: 0 }}
                  />
                  <input 
                    type="text" 
                    value={widgetSettings.text}
                    onChange={e => setWidgetSettings({...widgetSettings, text: e.target.value.replace('#', '')})}
                    style={{ ...inputStyle, flex: 1 }}
                    maxLength={6}
                  />
                </div>
              </div>
            </div>

            {/* Layout Options */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Columns</label>
                <select 
                  value={widgetSettings.cols}
                  onChange={e => setWidgetSettings({...widgetSettings, cols: e.target.value})}
                  style={inputStyle}
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Max Items</label>
                <input 
                  type="number" 
                  value={widgetSettings.max}
                  onChange={e => setWidgetSettings({...widgetSettings, max: e.target.value})}
                  style={inputStyle}
                  min="1"
                  max="50"
                />
              </div>
              <div>
                <label style={labelStyle}>Width</label>
                <input 
                  type="text" 
                  value={widgetSettings.width}
                  onChange={e => setWidgetSettings({...widgetSettings, width: e.target.value})}
                  style={inputStyle}
                  placeholder="100%"
                />
              </div>
              <div>
                <label style={labelStyle}>Height (px)</label>
                <input 
                  type="number" 
                  value={widgetSettings.height}
                  onChange={e => setWidgetSettings({...widgetSettings, height: e.target.value})}
                  style={inputStyle}
                  placeholder="800"
                />
              </div>
            </div>

            {/* Toggle Options */}
            <div style={{ display: 'flex', gap: '24px', marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: theme.textSecondary, fontSize: '14px' }}>
                <input 
                  type="checkbox" 
                  checked={widgetSettings.showPrice}
                  onChange={e => setWidgetSettings({...widgetSettings, showPrice: e.target.checked})}
                  style={{ width: '18px', height: '18px', accentColor: theme.accent }}
                />
                Show Prices
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: theme.textSecondary, fontSize: '14px' }}>
                <input 
                  type="checkbox" 
                  checked={widgetSettings.showMiles}
                  onChange={e => setWidgetSettings({...widgetSettings, showMiles: e.target.checked})}
                  style={{ width: '18px', height: '18px', accentColor: theme.accent }}
                />
                Show Mileage
              </label>
            </div>

            {/* Embed Code */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '12px', color: theme.textSecondary, fontWeight: '600', textTransform: 'uppercase' }}>Inventory Widget Embed Code</label>
                <button 
                  onClick={() => copyCode(inventoryIframeCode)}
                  style={{ 
                    padding: '6px 14px', 
                    backgroundColor: copied ? '#22c55e' : theme.accent, 
                    border: 'none', 
                    borderRadius: '6px', 
                    color: '#fff', 
                    fontSize: '12px', 
                    fontWeight: '600', 
                    cursor: 'pointer' 
                  }}
                >
                  {copied ? 'Copied!' : 'Copy Code'}
                </button>
              </div>
              <textarea
                value={inventoryIframeCode}
                readOnly
                style={{
                  ...inputStyle,
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  minHeight: '100px',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* Preview Link */}
            <a 
              href={inventoryEmbedUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: theme.accent, fontSize: '13px', textDecoration: 'none' }}
            >
              Preview Inventory Widget →
            </a>
          </div>

          {/* Find Me a Rig Widget */}
          <div style={cardStyle}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>
              "Find Me a Rig" Widget
            </h2>
            <p style={{ color: theme.textMuted, fontSize: '13px', margin: '0 0 20px' }}>
              AI-powered vehicle finder with voice input. Customers describe what they want and get added to your "Customers Looking" list.
            </p>

            {/* Embed Code */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '12px', color: theme.textSecondary, fontWeight: '600', textTransform: 'uppercase' }}>Find Rig Widget Embed Code</label>
                <button 
                  onClick={() => copyCode(findRigIframeCode)}
                  style={{ 
                    padding: '6px 14px', 
                    backgroundColor: copied ? '#22c55e' : theme.accent, 
                    border: 'none', 
                    borderRadius: '6px', 
                    color: '#fff', 
                    fontSize: '12px', 
                    fontWeight: '600', 
                    cursor: 'pointer' 
                  }}
                >
                  {copied ? 'Copied!' : 'Copy Code'}
                </button>
              </div>
              <textarea
                value={findRigIframeCode}
                readOnly
                style={{
                  ...inputStyle,
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  minHeight: '80px',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* Preview Link */}
            <a 
              href={findRigEmbedUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: theme.accent, fontSize: '13px', textDecoration: 'none' }}
            >
              Preview Find Rig Widget →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}