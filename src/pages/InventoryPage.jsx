import { useState, useEffect, useRef } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useTheme } from '../components/Layout';

export default function InventoryPage() {
  const store = useStore();
  const inventory = store.inventory || [];
  const dealer = store.dealer || {};
  const dealerId = store.dealerId;
  const employees = store.employees || [];
  
  const themeContext = useTheme();
  const theme = themeContext?.theme || {
    bg: '#09090b', bgCard: '#18181b', border: '#27272a',
    text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a',
    accent: '#f97316'
  };

  useEffect(() => {
    if (dealerId && inventory.length === 0) {
      if (store.fetchAllData) store.fetchAllData();
      else if (store.refreshInventory) store.refreshInventory();
    }
  }, [dealerId]);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [valueLoading, setValueLoading] = useState(false);
  const [valueData, setValueData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const vinCameraRef = useRef(null);
  const receiptInputRef = useRef(null);
  
  // Expense & Commission state
  const [expenses, setExpenses] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [commissionRoles, setCommissionRoles] = useState([]);
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('Repair');
  const [expenseReceipt, setExpenseReceipt] = useState(null);
  const [scanningReceipt, setScanningReceipt] = useState(false);
  const [commEmployee, setCommEmployee] = useState('');
  const [commRoleId, setCommRoleId] = useState('');
  const [commOverride, setCommOverride] = useState('');
  const [loadingExpComm, setLoadingExpComm] = useState(false);
  
  const [formData, setFormData] = useState({
    year: '', make: '', model: '', trim: '', vin: '', miles: '',
    color: '', purchased_from: '', purchase_price: '', sale_price: '',
    status: 'In Stock', stock_number: '', description: ''
  });

  const statuses = ['All', 'In Stock', 'For Sale', 'Sold', 'BHPH'];
  const expenseCategories = ['Repair', 'Parts', 'Detail', 'Transport', 'Inspection', 'Fuel', 'Other'];

  // Load commission roles on mount
  useEffect(() => {
    if (dealerId) loadCommissionRoles();
  }, [dealerId]);

  // Load expenses and commissions when detail opens
  useEffect(() => {
    if (selectedVehicle && showDetailModal) {
      loadExpenses(selectedVehicle.id);
      loadCommissions(selectedVehicle.id);
    }
  }, [selectedVehicle?.id, showDetailModal]);

  const loadCommissionRoles = async () => {
    const { data } = await supabase
      .from('commission_roles')
      .select('*')
      .eq('dealer_id', dealerId)
      .order('role_name');
    setCommissionRoles(data || []);
  };

  const loadExpenses = async (inventoryId) => {
    // Load manual inventory expenses
    const { data: manualExpenses } = await supabase
      .from('inventory_expenses')
      .select('*')
      .eq('inventory_id', inventoryId)
      .eq('dealer_id', dealerId)
      .order('created_at', { ascending: false });

    // Load linked bank transactions
    const { data: bankExpenses } = await supabase
      .from('bank_transactions')
      .select('*')
      .eq('inventory_id', inventoryId)
      .eq('dealer_id', dealerId)
      .eq('status', 'booked')
      .order('transaction_date', { ascending: false });

    // Combine and normalize both expense sources
    const combined = [
      ...(manualExpenses || []).map(e => ({
        ...e,
        source: 'manual',
        date: e.created_at,
        amount: e.amount
      })),
      ...(bankExpenses || []).map(e => ({
        ...e,
        source: 'bank',
        date: e.transaction_date,
        description: e.merchant_name,
        amount: Math.abs(e.amount),
        category: 'Bank Transaction'
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    setExpenses(combined);
  };

  const loadCommissions = async (inventoryId) => {
    const { data } = await supabase
      .from('inventory_commissions')
      .select('*')
      .eq('inventory_id', inventoryId)
      .eq('dealer_id', dealerId)
      .order('created_at', { ascending: false });
    setCommissions(data || []);
  };

  // Scan receipt with AI
  const scanReceipt = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setScanningReceipt(true);
    try {
      // Convert to base64
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      
      setExpenseReceipt(base64);
      
      // Call AI to parse receipt
      const { data, error } = await supabase.functions.invoke('parse-receipt', {
        body: { image: base64 }
      });
      
      if (error) throw error;
      
      if (data && !data.error) {
        if (data.description) setExpenseDesc(data.description);
        if (data.amount) setExpenseAmount(data.amount.toString());
        if (data.category && expenseCategories.includes(data.category)) {
          setExpenseCategory(data.category);
        }
      }
    } catch (err) {
      console.error('Receipt scan failed:', err);
      alert('Could not read receipt. Please enter details manually.');
    } finally {
      setScanningReceipt(false);
    }
  };

  const addExpense = async () => {
    if (!expenseDesc || !expenseAmount || !selectedVehicle) return;
    setLoadingExpComm(true);

    let receiptUrl = null;
    if (expenseReceipt) {
      try {
        const fileName = `receipts/${selectedVehicle.id}/${Date.now()}.jpg`;
        const base64Data = expenseReceipt.replace(/^data:image\/\w+;base64,/, '');
        const { error } = await supabase.storage
          .from('vehicle-photos')
          .upload(fileName, decode(base64Data), { contentType: 'image/jpeg' });
        if (!error) {
          const { data: { publicUrl } } = supabase.storage.from('vehicle-photos').getPublicUrl(fileName);
          receiptUrl = publicUrl;
        }
      } catch (e) {
        console.error('Receipt upload failed:', e);
      }
    }

    // Save to inventory_expenses
    await supabase.from('inventory_expenses').insert({
      inventory_id: selectedVehicle.id,
      dealer_id: dealerId,
      description: expenseDesc,
      amount: parseFloat(expenseAmount),
      category: expenseCategory,
      receipt_url: receiptUrl
    });

    // Also save to manual_expenses for Books page
    // Map inventory category to expense category
    const categoryMapping = {
      'Repair': 'Reconditioning',
      'Parts': 'Reconditioning',
      'Detail': 'Reconditioning',
      'Transport': 'Reconditioning',
      'Inspection': 'Reconditioning',
      'Fuel': 'Fuel',
      'Other': 'Other'
    };

    const mappedCategoryName = categoryMapping[expenseCategory] || 'Other';

    // Get the category_id from expense_categories
    const { data: categoryData } = await supabase
      .from('expense_categories')
      .select('id')
      .eq('name', mappedCategoryName)
      .eq('type', 'expense')
      .or('dealer_id.is.null,dealer_id.eq.' + dealerId)
      .limit(1)
      .single();

    if (categoryData) {
      // Build vendor string from vehicle info
      const vehicleInfo = `${selectedVehicle.year || ''} ${selectedVehicle.make || ''} ${selectedVehicle.model || ''}`.trim() || 'Vehicle';

      await supabase.from('manual_expenses').insert({
        dealer_id: dealerId,
        description: `${expenseDesc} (${vehicleInfo})`,
        amount: parseFloat(expenseAmount),
        expense_date: new Date().toISOString().split('T')[0],
        vendor: vehicleInfo,
        category_id: categoryData.id,
        status: 'booked'
      });
    }

    setExpenseDesc('');
    setExpenseAmount('');
    setExpenseCategory('Repair');
    setExpenseReceipt(null);
    await loadExpenses(selectedVehicle.id);
    setLoadingExpComm(false);
  };

  const deleteExpense = async (id) => {
    await supabase.from('inventory_expenses').delete().eq('id', id);
    await loadExpenses(selectedVehicle.id);
  };

  const addCommission = async () => {
    if (!commEmployee || !commRoleId || !selectedVehicle) return;
    setLoadingExpComm(true);
    
    const emp = employees.find(e => e.name === commEmployee);
    const role = commissionRoles.find(r => r.id === parseInt(commRoleId));
    
    // Check if employee's role matches (is specialist)
    const empRoles = emp?.roles || [];
    const isSpecialist = empRoles.some(r => r.toLowerCase() === role?.role_name?.toLowerCase());
    
    // Determine rate: override > specialist > helper
    let rateUsed;
    if (commOverride) {
      rateUsed = parseFloat(commOverride) / 100;
    } else if (isSpecialist) {
      rateUsed = parseFloat(role?.specialist_rate || 0);
    } else {
      rateUsed = parseFloat(role?.helper_rate || 0);
    }
    
    // Calculate amount from profit
    const profit = (parseFloat(selectedVehicle.sale_price) || 0) - (parseFloat(selectedVehicle.purchase_price) || 0);
    const amount = profit * rateUsed;
    
    await supabase.from('inventory_commissions').insert({
      inventory_id: selectedVehicle.id,
      dealer_id: dealerId,
      employee_id: emp?.id || null,
      employee_name: commEmployee,
      role: role?.role_name || '',
      role_id: parseInt(commRoleId),
      is_specialist: isSpecialist,
      rate_used: rateUsed,
      override_rate: commOverride ? parseFloat(commOverride) / 100 : null,
      amount: amount
    });
    
    setCommEmployee('');
    setCommRoleId('');
    setCommOverride('');
    await loadCommissions(selectedVehicle.id);
    setLoadingExpComm(false);
  };

  const deleteCommission = async (id) => {
    await supabase.from('inventory_commissions').delete().eq('id', id);
    await loadCommissions(selectedVehicle.id);
  };

  // Calculate totals
  const totalExpenses = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  const totalCommissions = commissions.reduce((sum, c) => sum + parseFloat(c.amount || 0), 0);
  const totalCost = (parseFloat(selectedVehicle?.purchase_price || 0)) + totalExpenses;
  const grossProfit = (parseFloat(selectedVehicle?.sale_price || 0)) - totalCost;
  const netProfit = grossProfit - totalCommissions;

  const filteredInventory = inventory.filter(v => {
    const matchesSearch = searchTerm === '' || 
      `${v.year} ${v.make} ${v.model} ${v.vin || ''}`.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || v.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: inventory.length,
    forSale: inventory.filter(v => v.status === 'For Sale').length,
    inStock: inventory.filter(v => v.status === 'In Stock').length,
    sold: inventory.filter(v => v.status === 'Sold').length,
    bhph: inventory.filter(v => v.status === 'BHPH').length,
    totalValue: inventory.reduce((sum, v) => sum + (parseFloat(v.sale_price) || 0), 0)
  };

  const formatCurrency = (num) => {
    if (!num && num !== 0) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
  };

  const formatNumber = (num) => {
    if (!num && num !== 0) return '-';
    return new Intl.NumberFormat('en-US').format(num);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'For Sale': return { bg: '#16653420', color: '#4ade80' };
      case 'In Stock': return { bg: '#1e40af20', color: '#60a5fa' };
      case 'Sold': return { bg: '#6b21a820', color: '#a78bfa' };
      case 'BHPH': return { bg: '#ca8a0420', color: '#fbbf24' };
      default: return { bg: '#27272a', color: '#71717a' };
    }
  };

  const openDetail = (vehicle) => {
    setSelectedVehicle(vehicle);
    setPhotos(vehicle.photos || []);
    setShowDetailModal(true);
    setValueData(null);
    setExpenses([]);
    setCommissions([]);
    setExpenseDesc('');
    setExpenseAmount('');
    setExpenseCategory('Repair');
    setExpenseReceipt(null);
    setCommEmployee('');
    setCommRoleId('');
    setCommOverride('');
  };

  const openAddModal = (vehicle = null) => {
    if (vehicle) {
      setFormData({
        year: vehicle.year || '',
        make: vehicle.make || '',
        model: vehicle.model || '',
        trim: vehicle.trim || '',
        vin: vehicle.vin || '',
        miles: vehicle.miles || vehicle.mileage || '',
        color: vehicle.color || '',
        purchased_from: vehicle.purchased_from || '',
        purchase_price: vehicle.purchase_price || '',
        sale_price: vehicle.sale_price || '',
        status: vehicle.status || 'In Stock',
        stock_number: vehicle.stock_number || '',
        description: vehicle.description || ''
      });
      setSelectedVehicle(vehicle);
      setPhotos(vehicle.photos || []);
    } else {
      setFormData({
        year: '', make: '', model: '', trim: '', vin: '', miles: '',
        color: '', purchased_from: '', purchase_price: '', sale_price: '',
        status: 'In Stock', stock_number: '', description: ''
      });
      setSelectedVehicle(null);
      setPhotos([]);
    }
    setShowAddModal(true);
  };

  const refreshData = async () => {
    if (store.refreshInventory) await store.refreshInventory();
    else if (store.fetchAllData) await store.fetchAllData();
  };

  const capturePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadPhoto(file);
  };

  const uploadPhoto = async (file) => {
    if (!file || !selectedVehicle?.id) return;
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${selectedVehicle.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('vehicle-photos').upload(fileName, file);
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage.from('vehicle-photos').getPublicUrl(fileName);
      const newPhotos = [...photos, publicUrl];
      setPhotos(newPhotos);
      
      await supabase.from('inventory').update({ photos: newPhotos }).eq('id', selectedVehicle.id);
      await refreshData();
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const deletePhoto = async (photoUrl, index) => {
    if (!selectedVehicle?.id) return;
    try {
      const newPhotos = photos.filter((_, i) => i !== index);
      setPhotos(newPhotos);
      await supabase.from('inventory').update({ photos: newPhotos }).eq('id', selectedVehicle.id);
      await refreshData();
    } catch (err) {
      console.error('Delete photo failed:', err);
    }
  };

  const saveVehicle = async () => {
    if (!formData.year || !formData.make || !formData.model) {
      alert('Year, Make, and Model are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        year: parseInt(formData.year),
        make: formData.make,
        model: formData.model,
        trim: formData.trim || null,
        vin: formData.vin || null,
        miles: parseInt(formData.miles) || 0,
        color: formData.color || null,
        purchased_from: formData.purchased_from || null,
        purchase_price: parseFloat(formData.purchase_price) || 0,
        sale_price: parseFloat(formData.sale_price) || 0,
        status: formData.status,
        stock_number: formData.stock_number || null,
        description: formData.description || null,
        dealer_id: dealerId
      };

      if (selectedVehicle?.id) {
        await supabase.from('inventory').update(payload).eq('id', selectedVehicle.id);
      } else {
        await supabase.from('inventory').insert(payload);
      }
      
      await refreshData();
      setShowAddModal(false);
      setSelectedVehicle(null);
    } catch (err) {
      console.error('Save failed:', err);
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteVehicle = async (id) => {
    if (!confirm('Delete this vehicle?')) return;
    try {
      await supabase.from('inventory').delete().eq('id', id);
      await refreshData();
      setShowDetailModal(false);
      setSelectedVehicle(null);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const generateDescription = async () => {
    if (!formData.year || !formData.make || !formData.model) {
      alert('Fill in Year, Make, Model first');
      return;
    }
    setGeneratingDesc(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-listing', {
        body: {
          year: formData.year,
          make: formData.make,
          model: formData.model,
          trim: formData.trim,
          miles: formData.miles,
          color: formData.color,
          price: formData.sale_price,
          dealer_name: dealer?.dealer_name || 'OG DiX Motor Club'
        }
      });
      
      if (error) throw error;
      if (data?.description) {
        setFormData({ ...formData, description: data.description });
      }
    } catch (err) {
      const desc = `${formData.year} ${formData.make} ${formData.model}${formData.trim ? ' ' + formData.trim : ''}\n\n${formData.miles ? formatNumber(formData.miles) + ' miles' : ''}${formData.color ? ' • ' + formData.color : ''}\n\n${formData.sale_price ? 'Asking: ' + formatCurrency(formData.sale_price) : 'Call for price'}\n\nClean title, ready to drive! Come see it at ${dealer?.dealer_name || 'our lot'}.\n\n${dealer?.phone || ''} • ${dealer?.address || ''}`;
      setFormData({ ...formData, description: desc.trim() });
    } finally {
      setGeneratingDesc(false);
    }
  };

  const copyDescription = () => {
    if (formData.description) {
      navigator.clipboard.writeText(formData.description);
      alert('Copied to clipboard!');
    }
  };

  const getMarketValue = async (vehicle) => {
    setValueLoading(true);
    setValueData(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('vehicle-research', {
        body: {
          vin: vehicle.vin || null,
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          trim: vehicle.trim || null,
          miles: vehicle.miles || vehicle.mileage || 60000,
          condition: 'Good',
          zip: dealer?.zip || '84065'
        }
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      setValueData(data);
    } catch (err) {
      console.error('Value check failed:', err);
      setValueData({ error: err.message });
    } finally {
      setValueLoading(false);
    }
  };

  const goToFullResearch = () => {
    const params = new URLSearchParams();
    if (selectedVehicle?.vin) params.set('vin', selectedVehicle.vin);
    params.set('year', selectedVehicle?.year || '');
    params.set('make', selectedVehicle?.make || '');
    params.set('model', selectedVehicle?.model || '');
    params.set('miles', selectedVehicle?.miles || selectedVehicle?.mileage || '');
    params.set('autorun', 'true');
    window.location.href = `/research?${params.toString()}`;
  };

  const getValue = (obj, ...paths) => {
    for (const path of paths) {
      const keys = path.split('.');
      let val = obj;
      for (const key of keys) {
        val = val?.[key];
        if (val === undefined) break;
      }
      if (val !== undefined && val !== null) return val;
    }
    return null;
  };

  // Helper for base64 decode
  function decode(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  const inputStyle = {
    padding: '10px 12px', borderRadius: '6px', border: `1px solid ${theme.border}`,
    backgroundColor: theme.bg, color: theme.text, fontSize: '14px', width: '100%', outline: 'none'
  };

  const smallInputStyle = {
    padding: '8px 10px', borderRadius: '6px', border: `1px solid ${theme.border}`,
    backgroundColor: theme.bg, color: theme.text, fontSize: '13px', outline: 'none'
  };

  const btnStyle = (active = false) => ({
    padding: '8px 16px', borderRadius: '6px', border: 'none',
    backgroundColor: active ? theme.accent : theme.border,
    color: active ? '#fff' : theme.textSecondary,
    fontSize: '13px', fontWeight: '500', cursor: 'pointer'
  });

  const cardStyle = {
    backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`
  };

  const sectionStyle = {
    backgroundColor: theme.bg, padding: '12px', borderRadius: '8px', marginBottom: '16px'
  };

  const labelStyle = { 
    color: theme.textMuted, fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase', fontWeight: '600' 
  };

  return (
    <div style={{ padding: '24px', backgroundColor: theme.bg, minHeight: '100vh', color: theme.text }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: '700', margin: 0 }}>Inventory</h1>
            <p style={{ color: theme.textMuted, margin: '4px 0 0', fontSize: '14px' }}>{stats.total} vehicles</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => window.location.href = '/research'} style={btnStyle()}>Research</button>
            <button onClick={() => openAddModal()} style={btnStyle(true)}>+ Add Vehicle</button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          {[
            { label: 'Total', value: stats.total, color: theme.text },
            { label: 'For Sale', value: stats.forSale, color: '#4ade80' },
            { label: 'In Stock', value: stats.inStock, color: '#60a5fa' },
            { label: 'Sold', value: stats.sold, color: '#a78bfa' },
            { label: 'BHPH', value: stats.bhph, color: '#fbbf24' },
            { label: 'Total Value', value: formatCurrency(stats.totalValue), color: theme.accent }
          ].map((stat, i) => (
            <div key={i} style={{ ...cardStyle, textAlign: 'center', padding: '14px' }}>
              <div style={{ color: theme.textMuted, fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase' }}>{stat.label}</div>
              <div style={{ color: stat.color, fontSize: '20px', fontWeight: '700' }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ ...cardStyle, padding: '16px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ ...inputStyle, maxWidth: '250px' }} />
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {statuses.map(s => (
                <button key={s} onClick={() => setStatusFilter(s)} style={btnStyle(statusFilter === s)}>{s}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Vehicle Grid */}
        {filteredInventory.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '60px', color: theme.textMuted }}>No vehicles found</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {filteredInventory.map((v, i) => {
              const statusStyle = getStatusColor(v.status);
              const primaryPhoto = v.photos && v.photos.length > 0 ? v.photos[0] : null;
              return (
                <div key={v.id || i} onClick={() => openDetail(v)} style={{ ...cardStyle, cursor: 'pointer', overflow: 'hidden' }}>
                  <div style={{ height: '180px', backgroundColor: '#27272a', position: 'relative' }}>
                    {primaryPhoto ? (
                      <img src={primaryPhoto} alt={`${v.year} ${v.make} ${v.model}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#52525b', fontSize: '14px' }}>No Photo</div>
                    )}
                    <span style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '11px', fontWeight: '600', padding: '4px 10px', borderRadius: '6px', backgroundColor: statusStyle.bg, color: statusStyle.color }}>
                      {v.status || 'Unknown'}
                    </span>
                  </div>
                  
                  <div style={{ padding: '16px' }}>
                    <div style={{ fontSize: '17px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>{v.year} {v.make} {v.model}</div>
                    {v.trim && <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '8px' }}>{v.trim}</div>}
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: theme.textMuted }}>Mileage</div>
                        <div style={{ fontSize: '14px', color: theme.text }}>{formatNumber(v.miles || v.mileage)} mi</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: theme.textMuted }}>Stock #</div>
                        <div style={{ fontSize: '14px', color: theme.text }}>{v.stock_number || v.vin?.slice(-6) || 'N/A'}</div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${theme.border}`, paddingTop: '12px' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: theme.textMuted }}>Cost</div>
                        <div style={{ fontSize: '14px', color: theme.text }}>{formatCurrency(v.purchase_price)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '11px', color: theme.textMuted }}>Price</div>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: '#4ade80' }}>{formatCurrency(v.sale_price)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Detail Modal */}
        {showDetailModal && selectedVehicle && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setShowDetailModal(false)}>
            <div style={{ ...cardStyle, padding: '24px', maxWidth: '800px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>{selectedVehicle.year} {selectedVehicle.make} {selectedVehicle.model}</h2>
                  {selectedVehicle.trim && <p style={{ color: theme.textMuted, margin: '4px 0 0' }}>{selectedVehicle.trim}</p>}
                </div>
                <button onClick={() => setShowDetailModal(false)} style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '28px', lineHeight: 1 }}>×</button>
              </div>

              {/* Photo Section */}
              <div style={{ marginBottom: '20px' }}>
                <input type="file" ref={fileInputRef} accept="image/*" style={{ display: 'none' }} onChange={capturePhoto} />
                <input type="file" ref={cameraInputRef} accept="image/*" capture="environment" style={{ display: 'none' }} onChange={capturePhoto} />
                
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <button onClick={() => cameraInputRef.current?.click()} disabled={uploading} style={{ flex: 1, padding: '10px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>
                    {uploading ? 'Uploading...' : '📷 Camera'}
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ flex: 1, padding: '10px', backgroundColor: theme.border, color: theme.text, border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>
                    📁 Upload
                  </button>
                </div>

                {photos.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    {photos.map((photo, i) => (
                      <div key={i} style={{ position: 'relative', paddingTop: '100%', backgroundColor: '#27272a', borderRadius: '8px', overflow: 'hidden' }}>
                        <img src={photo} alt={`Photo ${i + 1}`} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button onClick={() => deletePhoto(photo, i)} style={{ position: 'absolute', top: '4px', right: '4px', width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '14px' }}>×</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '40px', textAlign: 'center', backgroundColor: theme.bg, borderRadius: '8px', color: theme.textMuted }}>No photos yet</div>
                )}
              </div>

              {/* Vehicle Info + Financials */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                <div style={{ backgroundColor: theme.bg, padding: '12px', borderRadius: '8px' }}>
                  <div style={labelStyle}>Status</div>
                  <div style={{ color: getStatusColor(selectedVehicle.status).color, fontSize: '15px', fontWeight: '600' }}>{selectedVehicle.status}</div>
                </div>
                <div style={{ backgroundColor: theme.bg, padding: '12px', borderRadius: '8px' }}>
                  <div style={labelStyle}>Miles</div>
                  <div style={{ color: theme.text, fontSize: '15px', fontWeight: '600' }}>{formatNumber(selectedVehicle.miles || selectedVehicle.mileage)}</div>
                </div>
                <div style={{ backgroundColor: theme.bg, padding: '12px', borderRadius: '8px' }}>
                  <div style={labelStyle}>Color</div>
                  <div style={{ color: theme.text, fontSize: '15px', fontWeight: '600' }}>{selectedVehicle.color || '-'}</div>
                </div>
              </div>

              {/* Financial Summary */}
              <div style={sectionStyle}>
                <div style={labelStyle}>Financial Summary</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: theme.textMuted }}>Purchase Price</span>
                    <span style={{ color: theme.text }}>{formatCurrency(selectedVehicle.purchase_price)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: theme.textMuted }}>Sale Price</span>
                    <span style={{ color: theme.accent }}>{formatCurrency(selectedVehicle.sale_price)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: theme.textMuted }}>Total Expenses</span>
                    <span style={{ color: '#f87171' }}>{formatCurrency(totalExpenses)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: theme.textMuted }}>Total Commissions</span>
                    <span style={{ color: '#fbbf24' }}>{formatCurrency(totalCommissions)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${theme.border}`, paddingTop: '8px' }}>
                    <span style={{ color: theme.textSecondary, fontWeight: '600' }}>Gross Profit</span>
                    <span style={{ color: grossProfit >= 0 ? '#4ade80' : '#f87171', fontWeight: '600' }}>{formatCurrency(grossProfit)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${theme.border}`, paddingTop: '8px' }}>
                    <span style={{ color: theme.text, fontWeight: '700' }}>Net Profit</span>
                    <span style={{ color: netProfit >= 0 ? '#4ade80' : '#f87171', fontWeight: '700', fontSize: '18px' }}>{formatCurrency(netProfit)}</span>
                  </div>
                </div>
              </div>

              {/* EXPENSES SECTION */}
              <div style={sectionStyle}>
                <div style={labelStyle}>Expenses</div>
                
                {/* Scan Receipt Button */}
                <input type="file" ref={receiptInputRef} accept="image/*" capture="environment" style={{ display: 'none' }} onChange={scanReceipt} />
                <button 
                  onClick={() => receiptInputRef.current?.click()} 
                  disabled={scanningReceipt}
                  style={{ width: '100%', padding: '10px', marginBottom: '10px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' }}
                >
                  {scanningReceipt ? '📷 Reading Receipt...' : '📷 Scan Receipt (AI Auto-Fill)'}
                </button>
                
                {/* Receipt Preview */}
                {expenseReceipt && (
                  <div style={{ marginBottom: '10px', position: 'relative', display: 'inline-block' }}>
                    <img src={expenseReceipt} alt="Receipt" style={{ height: '60px', borderRadius: '6px', border: `1px solid ${theme.border}` }} />
                    <button 
                      onClick={() => setExpenseReceipt(null)} 
                      style={{ position: 'absolute', top: '-6px', right: '-6px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '12px' }}
                    >×</button>
                  </div>
                )}
                
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <input placeholder="Description" value={expenseDesc} onChange={e => setExpenseDesc(e.target.value)} style={{ ...smallInputStyle, flex: '2 1 120px' }} />
                  <input placeholder="$" type="number" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} style={{ ...smallInputStyle, flex: '1 1 80px' }} />
                  <select value={expenseCategory} onChange={e => setExpenseCategory(e.target.value)} style={{ ...smallInputStyle, flex: '1 1 100px' }}>
                    {expenseCategories.map(c => <option key={c}>{c}</option>)}
                  </select>
                  <button onClick={addExpense} disabled={loadingExpComm} style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' }}>Add</button>
                </div>
                
                <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                  {expenses.length === 0 ? (
                    <div style={{ color: theme.textMuted, fontSize: '13px', padding: '10px 0' }}>No expenses yet</div>
                  ) : expenses.map(exp => (
                    <div key={exp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {exp.source === 'bank' && (
                          <div style={{ padding: '2px 6px', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '4px', fontSize: '10px', color: '#3b82f6', fontWeight: '600' }}>
                            💳 BANK
                          </div>
                        )}
                        {exp.receipt_url && (
                          <a href={exp.receipt_url} target="_blank" rel="noopener noreferrer">
                            <img src={exp.receipt_url} alt="receipt" style={{ width: '30px', height: '30px', objectFit: 'cover', borderRadius: '4px' }} />
                          </a>
                        )}
                        <div>
                          <div style={{ fontSize: '13px', color: theme.text }}>{exp.description}</div>
                          <div style={{ fontSize: '11px', color: theme.textMuted }}>{exp.category}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: '#f87171', fontWeight: '600' }}>{formatCurrency(exp.amount)}</span>
                        {exp.source !== 'bank' && (
                          <button onClick={() => deleteExpense(exp.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' }}>×</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* COMMISSIONS SECTION */}
              <div style={sectionStyle}>
                <div style={labelStyle}>Commissions</div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <select value={commEmployee} onChange={e => setCommEmployee(e.target.value)} style={{ ...smallInputStyle, flex: '1 1 120px' }}>
                    <option value="">Employee</option>
                    {employees.map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
                  </select>
                  <select value={commRoleId} onChange={e => setCommRoleId(e.target.value)} style={{ ...smallInputStyle, flex: '1 1 120px' }}>
                    <option value="">Role</option>
                    {commissionRoles.map(role => (
                      <option key={role.id} value={role.id}>
                        {role.role_name} ({(role.helper_rate * 100).toFixed(1)}%-{(role.specialist_rate * 100).toFixed(1)}%)
                      </option>
                    ))}
                  </select>
                  <input placeholder="Override %" type="number" value={commOverride} onChange={e => setCommOverride(e.target.value)} style={{ ...smallInputStyle, flex: '0 1 80px' }} />
                  <button onClick={addCommission} disabled={loadingExpComm} style={{ padding: '8px 16px', backgroundColor: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' }}>Add</button>
                </div>
                
                <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                  {commissions.length === 0 ? (
                    <div style={{ color: theme.textMuted, fontSize: '13px', padding: '10px 0' }}>No commissions yet</div>
                  ) : commissions.map(comm => (
                    <div key={comm.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                      <div>
                        <div style={{ fontSize: '13px', color: theme.text }}>{comm.employee_name}</div>
                        <div style={{ fontSize: '11px', color: theme.textMuted }}>
                          {comm.role} • {((comm.rate_used || 0) * 100).toFixed(1)}% {comm.is_specialist ? '(Specialist)' : '(Helper)'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: '#fbbf24', fontWeight: '600' }}>{formatCurrency(comm.amount)}</span>
                        <button onClick={() => deleteCommission(comm.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' }}>×</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
                <button onClick={() => { setShowDetailModal(false); openAddModal(selectedVehicle); }} style={btnStyle()}>Edit</button>
                <button onClick={() => getMarketValue(selectedVehicle)} disabled={valueLoading} style={{ ...btnStyle(true), opacity: valueLoading ? 0.6 : 1 }}>{valueLoading ? 'Checking...' : 'Check Value'}</button>
                <button onClick={() => deleteVehicle(selectedVehicle.id)} style={{ ...btnStyle(), backgroundColor: '#7f1d1d', color: '#fca5a5' }}>Delete</button>
              </div>

              {/* Value Data */}
              {valueLoading && <div style={{ backgroundColor: theme.bg, padding: '20px', borderRadius: '8px', textAlign: 'center', color: theme.textMuted }}>Analyzing market value...</div>}

              {valueData && valueData.error && <div style={{ backgroundColor: '#7f1d1d20', padding: '12px', borderRadius: '8px', color: '#fca5a5', fontSize: '14px' }}>{valueData.error}</div>}

              {valueData && !valueData.error && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ backgroundColor: theme.bg, padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ color: theme.textMuted, fontSize: '10px', marginBottom: '4px' }}>MARKET PRICE</div>
                      <div style={{ color: theme.accent, fontSize: '22px', fontWeight: '700' }}>
                        {formatCurrency(getValue(valueData, 'valuations.marketcheck', 'valuations.comp_average', 'valuations.kbb_retail'))}
                      </div>
                    </div>
                    <div style={{ backgroundColor: theme.bg, padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ color: theme.textMuted, fontSize: '10px', marginBottom: '4px' }}>BUY MAX</div>
                      <div style={{ color: '#60a5fa', fontSize: '22px', fontWeight: '700' }}>
                        {formatCurrency(getValue(valueData, 'pricing_recommendation.dealer_buy_max'))}
                      </div>
                    </div>
                  </div>
                  
                  <button onClick={goToFullResearch} style={{ padding: '10px 16px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', width: '100%' }}>Full Research</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Add/Edit Modal */}
        {showAddModal && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setShowAddModal(false)}>
            <div style={{ ...cardStyle, padding: '24px', maxWidth: '650px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>{selectedVehicle ? 'Edit Vehicle' : 'Add Vehicle'}</h2>
                <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '24px' }}>×</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                <div><label style={{ display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '6px' }}>Year *</label><input type="number" value={formData.year} onChange={e => setFormData({...formData, year: e.target.value})} style={inputStyle} placeholder="2020" /></div>
                <div><label style={{ display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '6px' }}>Make *</label><input type="text" value={formData.make} onChange={e => setFormData({...formData, make: e.target.value})} style={inputStyle} placeholder="Toyota" /></div>
                <div><label style={{ display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '6px' }}>Model *</label><input type="text" value={formData.model} onChange={e => setFormData({...formData, model: e.target.value})} style={inputStyle} placeholder="Camry" /></div>
                <div><label style={{ display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '6px' }}>Trim</label><input type="text" value={formData.trim} onChange={e => setFormData({...formData, trim: e.target.value})} style={inputStyle} placeholder="SE" /></div>
                
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '6px' }}>VIN</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="text" value={formData.vin} onChange={e => setFormData({...formData, vin: e.target.value.toUpperCase()})} style={{ ...inputStyle, fontFamily: 'monospace', flex: 1 }} placeholder="1HGBH41JXMN109186" maxLength={17} />
                    <input type="file" ref={vinCameraRef} accept="image/*" capture="environment" style={{ display: 'none' }} />
                    <button onClick={() => vinCameraRef.current?.click()} style={{ padding: '10px 14px', backgroundColor: theme.border, border: 'none', borderRadius: '6px', color: theme.text, cursor: 'pointer', fontSize: '16px' }} title="Scan VIN">📷</button>
                  </div>
                </div>
                
                <div><label style={{ display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '6px' }}>Miles</label><input type="number" value={formData.miles} onChange={e => setFormData({...formData, miles: e.target.value})} style={inputStyle} placeholder="60000" /></div>
                <div><label style={{ display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '6px' }}>Color</label><input type="text" value={formData.color} onChange={e => setFormData({...formData, color: e.target.value})} style={inputStyle} placeholder="Silver" /></div>
                <div><label style={{ display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '6px' }}>Stock #</label><input type="text" value={formData.stock_number} onChange={e => setFormData({...formData, stock_number: e.target.value})} style={inputStyle} placeholder="STK001" /></div>
                <div><label style={{ display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '6px' }}>Status</label><select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} style={inputStyle}><option value="In Stock">In Stock</option><option value="For Sale">For Sale</option><option value="Sold">Sold</option><option value="BHPH">BHPH</option></select></div>
                <div><label style={{ display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '6px' }}>Purchase Price</label><input type="number" value={formData.purchase_price} onChange={e => setFormData({...formData, purchase_price: e.target.value})} style={inputStyle} placeholder="8000" /></div>
                <div><label style={{ display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '6px' }}>Sale Price</label><input type="number" value={formData.sale_price} onChange={e => setFormData({...formData, sale_price: e.target.value})} style={inputStyle} placeholder="12000" /></div>
                <div style={{ gridColumn: 'span 2' }}><label style={{ display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '6px' }}>Purchased From</label><input type="text" value={formData.purchased_from} onChange={e => setFormData({...formData, purchased_from: e.target.value})} style={inputStyle} placeholder="Auction, Trade-in" /></div>
                
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '12px', color: theme.textSecondary }}>Listing Description</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={generateDescription} disabled={generatingDesc} style={{ padding: '4px 10px', backgroundColor: theme.accent, border: 'none', borderRadius: '4px', color: '#fff', fontSize: '11px', fontWeight: '600', cursor: 'pointer', opacity: generatingDesc ? 0.6 : 1 }}>
                        {generatingDesc ? 'Generating...' : 'AI Generate'}
                      </button>
                      {formData.description && (
                        <button onClick={copyDescription} style={{ padding: '4px 10px', backgroundColor: theme.border, border: 'none', borderRadius: '4px', color: theme.textSecondary, fontSize: '11px', cursor: 'pointer' }}>
                          Copy
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea 
                    value={formData.description} 
                    onChange={e => setFormData({...formData, description: e.target.value})} 
                    style={{ ...inputStyle, minHeight: '120px', resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.5' }} 
                    placeholder="Describe the vehicle for FB Marketplace, Craigslist, KSL, etc..."
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button onClick={() => setShowAddModal(false)} style={{ ...btnStyle(), flex: 1 }}>Cancel</button>
                <button onClick={saveVehicle} disabled={saving} style={{ ...btnStyle(true), flex: 1, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving...' : (selectedVehicle ? 'Update' : 'Add Vehicle')}</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}