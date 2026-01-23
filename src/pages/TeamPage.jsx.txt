import { useState, useEffect, useRef } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useTheme } from '../components/Layout';

export default function TeamPage() {
  const { dealerId, employees, refreshEmployees } = useStore();
  const themeContext = useTheme();
  const theme = themeContext?.theme || {
    bg: '#09090b', bgCard: '#18181b', border: '#27272a',
    text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a',
    accent: '#f97316'
  };

  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('info');
  const [documents, setDocuments] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [selectedDocType, setSelectedDocType] = useState('');
  const [currentUserId, setCurrentUserId] = useState(null);
  const [ptoRequests, setPtoRequests] = useState([]);
  const [paystubs, setPaystubs] = useState([]);
  const [selectedPaystub, setSelectedPaystub] = useState(null);
  const [showPTOModal, setShowPTOModal] = useState(false);
  const [ptoForm, setPtoForm] = useState({ start_date: '', end_date: '', request_type: 'pto', reason: '' });
  const [submittingPTO, setSubmittingPTO] = useState(false);
  
  const [newEmployee, setNewEmployee] = useState({ name: '', email: '', phone: '', roles: [], pay_type: ['hourly'], hourly_rate: 0, salary: 0, pto_days_per_year: 10, active: true });

  const isAdmin = !currentUserId;
  const currentEmployee = currentUserId ? employees.find(e => e.id === currentUserId) : null;
  const hasHRAccess = isAdmin;

  useEffect(() => {
    if (selectedEmployee) { fetchDocuments(selectedEmployee.id); fetchPaystubs(selectedEmployee.id); }
  }, [selectedEmployee]);

  useEffect(() => { if (dealerId) fetchPTORequests(); }, [dealerId]);

  useEffect(() => {
    if (currentEmployee && !selectedEmployee) setSelectedEmployee({ ...currentEmployee });
  }, [currentEmployee]);

  const fetchDocuments = async (empId) => {
    const { data } = await supabase.from('employee_documents').select('*').eq('employee_id', empId).order('created_at', { ascending: false });
    if (data) setDocuments(data);
  };

  const fetchPaystubs = async (empId) => {
    const { data } = await supabase.from('paystubs').select('*').eq('employee_id', empId).order('pay_date', { ascending: false });
    if (data) setPaystubs(data);
  };

  const fetchPTORequests = async () => {
    const { data } = await supabase.from('time_off_requests').select('*, employees(name)').eq('dealer_id', dealerId).order('created_at', { ascending: false });
    if (data) setPtoRequests(data);
  };

  const getRequiredDocs = (payTypes) => {
    const types = Array.isArray(payTypes) ? payTypes : [payTypes || 'hourly'];
    if (types.includes('contractor')) {
      return [{ type: 'w9', name: 'W-9', required: true, url: 'https://www.irs.gov/pub/irs-pdf/fw9.pdf' },
        { type: '1099_agreement', name: 'Contractor Agreement', required: true },
        { type: 'direct_deposit', name: 'Direct Deposit', required: false },
        { type: 'id_copy', name: 'ID Copy', required: true }];
    }
    return [{ type: 'w4', name: 'W-4', required: true, url: 'https://www.irs.gov/pub/irs-pdf/fw4.pdf' },
      { type: 'i9', name: 'I-9', required: true, url: 'https://www.uscis.gov/sites/default/files/document/forms/i-9.pdf' },
      { type: 'state_w4', name: 'Utah TC-40W', required: true, url: 'https://tax.utah.gov/forms/current/tc-40w.pdf' },
      { type: 'direct_deposit', name: 'Direct Deposit', required: false },
      { type: 'id_copy', name: 'ID Copy', required: true },
      { type: 'ssn_card', name: 'SSN Card', required: true }];
  };

  const handleSave = async () => {
    if (!selectedEmployee) return;
    setSaving(true);
    const payTypes = Array.isArray(selectedEmployee.pay_type) ? selectedEmployee.pay_type : [selectedEmployee.pay_type || 'hourly'];
    await supabase.from('employees').update({
      name: selectedEmployee.name, email: selectedEmployee.email, phone: selectedEmployee.phone,
      address: selectedEmployee.address, city: selectedEmployee.city, state: selectedEmployee.state, zip: selectedEmployee.zip,
      ssn_last4: selectedEmployee.ssn_last4, date_of_birth: selectedEmployee.date_of_birth, hire_date: selectedEmployee.hire_date,
      roles: selectedEmployee.roles, active: selectedEmployee.active, pay_type: payTypes,
      hourly_rate: selectedEmployee.hourly_rate, salary: selectedEmployee.salary,
      tax_filing_status: selectedEmployee.tax_filing_status, federal_allowances: selectedEmployee.federal_allowances,
      direct_deposit_account: selectedEmployee.direct_deposit_account, direct_deposit_routing: selectedEmployee.direct_deposit_routing,
      emergency_contact_name: selectedEmployee.emergency_contact_name, emergency_contact_phone: selectedEmployee.emergency_contact_phone,
      pto_days_per_year: selectedEmployee.pto_days_per_year, pto_accrued: selectedEmployee.pto_accrued, pto_used: selectedEmployee.pto_used
    }).eq('id', selectedEmployee.id);
    await refreshEmployees();
    setEditMode(false);
    setSaving(false);
  };

  const handleAddEmployee = async () => {
    if (!newEmployee.name.trim()) return;
    setSaving(true);
    await supabase.from('employees').insert({
      ...newEmployee, pay_type: newEmployee.pay_type || ['hourly'],
      pto_days_per_year: newEmployee.pto_days_per_year || 10, pto_accrued: 0, pto_used: 0,
      pto_accrual_start: new Date().toISOString().split('T')[0], dealer_id: dealerId
    });
    await refreshEmployees();
    setShowAddModal(false);
    setNewEmployee({ name: '', email: '', phone: '', roles: [], pay_type: ['hourly'], hourly_rate: 0, salary: 0, pto_days_per_year: 10, active: true });
    setSaving(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedEmployee || !selectedDocType) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `${dealerId}/${selectedEmployee.id}/${selectedDocType}_${Date.now()}.${ext}`;
      await supabase.storage.from('employee-documents').upload(fileName, file);
      const { data: urlData } = supabase.storage.from('employee-documents').getPublicUrl(fileName);
      await supabase.from('employee_documents').insert({
        employee_id: selectedEmployee.id, document_type: selectedDocType, document_name: file.name,
        file_url: urlData.publicUrl, status: 'pending', submitted_at: new Date().toISOString(), dealer_id: dealerId
      });
      await fetchDocuments(selectedEmployee.id);
      setSelectedDocType('');
    } catch (err) { alert('Upload failed: ' + err.message); }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const togglePayType = (type, isNew = false) => {
    const target = isNew ? newEmployee : selectedEmployee;
    const setTarget = isNew ? setNewEmployee : setSelectedEmployee;
    const current = Array.isArray(target.pay_type) ? target.pay_type : [target.pay_type || 'hourly'];
    if (current.includes(type)) { if (current.length > 1) setTarget({ ...target, pay_type: current.filter(t => t !== type) }); }
    else setTarget({ ...target, pay_type: [...current, type] });
  };

  function calcBusinessDays(s, e) {
    if (!s || !e) return 0;
    let days = 0;
    for (let d = new Date(s); d <= new Date(e); d.setDate(d.getDate() + 1)) if (d.getDay() !== 0 && d.getDay() !== 6) days++;
    return days;
  }

  async function submitPTORequest() {
    if (!currentUserId || !ptoForm.start_date || !ptoForm.end_date) return;
    setSubmittingPTO(true);
    const days = calcBusinessDays(ptoForm.start_date, ptoForm.end_date);
    await supabase.from('time_off_requests').insert({
      employee_id: currentUserId, start_date: ptoForm.start_date, end_date: ptoForm.end_date,
      days_requested: days, request_type: ptoForm.request_type, reason: ptoForm.reason, dealer_id: dealerId
    });
    setShowPTOModal(false);
    setPtoForm({ start_date: '', end_date: '', request_type: 'pto', reason: '' });
    fetchPTORequests();
    setSubmittingPTO(false);
  }

  const getPTOBalance = (emp) => Math.max(0, (emp?.pto_accrued || 0) - (emp?.pto_used || 0));
  const formatCurrency = (amt) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amt || 0);
  const formatPayType = (pt) => { if (!pt) return 'Hourly'; const t = Array.isArray(pt) ? pt : [pt]; return t.map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(' + '); };
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
  const formatDateShort = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-';

  const roleOptions = ['CEO', 'President', 'VP Operations', 'HR', 'Buyer', 'Sales', 'Finance', 'Admin', 'Mechanic', 'Detailer'];
  const payTypeOptions = [{ value: 'hourly', label: 'Hourly' }, { value: 'salary', label: 'Salary' }, { value: 'commission', label: 'Commission' }, { value: 'contractor', label: '1099' }];
  const roleColor = (role) => ({ ceo: '#7c3aed', president: '#2563eb', 'vp operations': '#0891b2', hr: '#be185d', buyer: '#059669', sales: '#d97706', finance: '#7c3aed' })[role?.toLowerCase()] || '#3f3f46';

  const inputStyle = { width: '100%', padding: '10px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' };
  const labelStyle = { display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '4px', fontWeight: '500' };
  const buttonStyle = { padding: '10px 20px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' };
  const tabStyle = (active) => ({ padding: '10px 16px', backgroundColor: active ? theme.accent : 'transparent', color: active ? '#fff' : theme.textSecondary, border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' });
  const checkboxStyle = (checked) => ({ padding: '8px 16px', backgroundColor: checked ? 'rgba(249,115,22,0.2)' : theme.bg, border: `2px solid ${checked ? theme.accent : theme.border}`, borderRadius: '8px', color: checked ? theme.accent : theme.textSecondary, fontSize: '13px', fontWeight: '500', cursor: 'pointer' });

  const requiredDocs = selectedEmployee ? getRequiredDocs(selectedEmployee.pay_type) : [];
  const completedRequired = requiredDocs.filter(doc => doc.required && documents.some(d => d.document_type === doc.type)).length;
  const requiredCount = requiredDocs.filter(d => d.required).length;
  const displayEmployees = isAdmin ? employees : employees.filter(e => e.id === currentUserId);
  const myRequests = ptoRequests.filter(r => r.employee_id === (selectedEmployee?.id || currentUserId));

  return (
    <div style={{ padding: '24px', backgroundColor: theme.bg, minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>Team</h1>
          <p style={{ color: theme.textMuted, margin: '4px 0 0', fontSize: '14px' }}>{isAdmin ? `${employees.filter(e => e.active).length} active` : 'My Profile'}</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select value={currentUserId || ''} onChange={(e) => { setCurrentUserId(e.target.value ? parseInt(e.target.value) : null); setSelectedEmployee(null); setSelectedPaystub(null); }} style={{ ...inputStyle, width: '180px', backgroundColor: theme.bgCard }}>
            <option value="">👑 Admin View</option>
            {employees.filter(e => e.active).map(emp => <option key={emp.id} value={emp.id}>👤 {emp.name}</option>)}
          </select>
          {isAdmin && <button onClick={() => setShowAddModal(true)} style={buttonStyle}>+ Add</button>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isAdmin && selectedEmployee ? '1fr 2fr' : '1fr', gap: '24px' }}>
        {/* List */}
        {isAdmin && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {displayEmployees.map(emp => {
              const ptoBalance = getPTOBalance(emp);
              const isSelected = selectedEmployee?.id === emp.id;
              return (
                <div key={emp.id} onClick={() => { setSelectedEmployee({...emp}); setEditMode(false); setActiveTab('info'); setSelectedPaystub(null); }}
                  style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '16px', border: `2px solid ${isSelected ? theme.accent : theme.border}`, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: roleColor(emp.roles?.[0]), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '16px', fontWeight: '700' }}>
                      {emp.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: theme.text, fontSize: '16px', fontWeight: '600' }}>{emp.name}</div>
                      <div style={{ color: theme.textMuted, fontSize: '13px' }}>{emp.roles?.[0] || 'Team Member'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: theme.text, fontSize: '13px', fontWeight: '500' }}>{formatPayType(emp.pay_type)}</div>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.15)', padding: '2px 6px', borderRadius: '4px' }}>{ptoBalance.toFixed(1)} PTO</span>
                        <span style={{ fontSize: '11px', color: emp.active ? '#4ade80' : '#71717a' }}>{emp.active ? '●' : '○'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Detail */}
        {(selectedEmployee || currentEmployee) && (
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
            <div style={{ padding: '20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: roleColor((selectedEmployee || currentEmployee).roles?.[0]), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '24px', fontWeight: '700' }}>
                  {(selectedEmployee || currentEmployee).name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2)}
                </div>
                <div>
                  <h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '600', margin: 0 }}>{(selectedEmployee || currentEmployee).name}</h2>
                  <p style={{ color: theme.textMuted, fontSize: '14px', margin: '4px 0 0' }}>{(selectedEmployee || currentEmployee).roles?.join(', ') || 'No roles'}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {!isAdmin && <button onClick={() => setShowPTOModal(true)} style={{ ...buttonStyle, background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)' }}>🏖️ Request Time Off</button>}
                {editMode ? (
                  <><button onClick={() => setEditMode(false)} style={{ ...buttonStyle, backgroundColor: theme.border, color: theme.text }}>Cancel</button>
                  <button onClick={handleSave} disabled={saving} style={{ ...buttonStyle, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving...' : 'Save'}</button></>
                ) : <button onClick={() => setEditMode(true)} style={buttonStyle}>Edit</button>}
              </div>
            </div>

            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={() => { setActiveTab('info'); setSelectedPaystub(null); }} style={tabStyle(activeTab === 'info')}>Info</button>
              <button onClick={() => { setActiveTab('pay'); setSelectedPaystub(null); }} style={tabStyle(activeTab === 'pay')}>Pay & PTO</button>
              <button onClick={() => { setActiveTab('paystubs'); setSelectedPaystub(null); }} style={tabStyle(activeTab === 'paystubs')}>Paystubs {paystubs.length > 0 && <span style={{ marginLeft: '4px', padding: '2px 6px', backgroundColor: '#22c55e', borderRadius: '10px', fontSize: '10px' }}>{paystubs.length}</span>}</button>
              <button onClick={() => { setActiveTab('timeoff'); setSelectedPaystub(null); }} style={tabStyle(activeTab === 'timeoff')}>Time Off</button>
              {hasHRAccess && <button onClick={() => { setActiveTab('tax'); setSelectedPaystub(null); }} style={tabStyle(activeTab === 'tax')}>Tax</button>}
              {hasHRAccess && <button onClick={() => { setActiveTab('bank'); setSelectedPaystub(null); }} style={tabStyle(activeTab === 'bank')}>Bank</button>}
              <button onClick={() => { setActiveTab('documents'); setSelectedPaystub(null); }} style={tabStyle(activeTab === 'documents')}>Docs {completedRequired < requiredCount && <span style={{ color: '#ef4444' }}>({completedRequired}/{requiredCount})</span>}</button>
            </div>

            <div style={{ padding: '20px', maxHeight: '550px', overflowY: 'auto' }}>
              {activeTab === 'info' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div><label style={labelStyle}>Name</label><input type="text" value={(selectedEmployee || currentEmployee).name || ''} onChange={(e) => setSelectedEmployee({ ...(selectedEmployee || currentEmployee), name: e.target.value })} disabled={!editMode} style={{ ...inputStyle, opacity: editMode ? 1 : 0.7 }} /></div>
                  <div><label style={labelStyle}>Email</label><input type="email" value={(selectedEmployee || currentEmployee).email || ''} onChange={(e) => setSelectedEmployee({ ...(selectedEmployee || currentEmployee), email: e.target.value })} disabled={!editMode} style={{ ...inputStyle, opacity: editMode ? 1 : 0.7 }} /></div>
                  <div><label style={labelStyle}>Phone</label><input type="tel" value={(selectedEmployee || currentEmployee).phone || ''} onChange={(e) => setSelectedEmployee({ ...(selectedEmployee || currentEmployee), phone: e.target.value })} disabled={!editMode} style={{ ...inputStyle, opacity: editMode ? 1 : 0.7 }} /></div>
                  <div><label style={labelStyle}>Hire Date</label><input type="date" value={(selectedEmployee || currentEmployee).hire_date || ''} onChange={(e) => setSelectedEmployee({ ...(selectedEmployee || currentEmployee), hire_date: e.target.value })} disabled={!editMode} style={{ ...inputStyle, opacity: editMode ? 1 : 0.7 }} /></div>
                  <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Address</label><input type="text" value={(selectedEmployee || currentEmployee).address || ''} onChange={(e) => setSelectedEmployee({ ...(selectedEmployee || currentEmployee), address: e.target.value })} disabled={!editMode} style={{ ...inputStyle, opacity: editMode ? 1 : 0.7 }} /></div>
                  <div><label style={labelStyle}>City</label><input type="text" value={(selectedEmployee || currentEmployee).city || ''} onChange={(e) => setSelectedEmployee({ ...(selectedEmployee || currentEmployee), city: e.target.value })} disabled={!editMode} style={{ ...inputStyle, opacity: editMode ? 1 : 0.7 }} /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div><label style={labelStyle}>State</label><input type="text" value={(selectedEmployee || currentEmployee).state || ''} onChange={(e) => setSelectedEmployee({ ...(selectedEmployee || currentEmployee), state: e.target.value })} disabled={!editMode} style={{ ...inputStyle, opacity: editMode ? 1 : 0.7 }} /></div>
                    <div><label style={labelStyle}>ZIP</label><input type="text" value={(selectedEmployee || currentEmployee).zip || ''} onChange={(e) => setSelectedEmployee({ ...(selectedEmployee || currentEmployee), zip: e.target.value })} disabled={!editMode} style={{ ...inputStyle, opacity: editMode ? 1 : 0.7 }} /></div>
                  </div>
                  {hasHRAccess && <div><label style={labelStyle}>Status</label><select value={(selectedEmployee || currentEmployee).active ? 'active' : 'inactive'} onChange={(e) => setSelectedEmployee({ ...(selectedEmployee || currentEmployee), active: e.target.value === 'active' })} disabled={!editMode} style={{ ...inputStyle, opacity: editMode ? 1 : 0.7 }}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>}
                  {hasHRAccess && <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Roles</label><div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>{roleOptions.map(role => {
                    const isSel = (selectedEmployee || currentEmployee).roles?.includes(role);
                    return <button key={role} type="button" onClick={() => { if (!editMode) return; const cur = (selectedEmployee || currentEmployee).roles || []; setSelectedEmployee({ ...(selectedEmployee || currentEmployee), roles: isSel ? cur.filter(r => r !== role) : [...cur, role] }); }} style={checkboxStyle(isSel)}>{role}</button>;
                  })}</div></div>}
                </div>
              )}

              {activeTab === 'pay' && (
                <div style={{ display: 'grid', gap: '20px' }}>
                  {hasHRAccess && <div><label style={labelStyle}>Pay Type</label><div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>{payTypeOptions.map(opt => {
                    const payTypes = Array.isArray((selectedEmployee || currentEmployee).pay_type) ? (selectedEmployee || currentEmployee).pay_type : [];
                    const isSel = payTypes.includes(opt.value);
                    return <button key={opt.value} type="button" onClick={() => editMode && togglePayType(opt.value)} style={checkboxStyle(isSel)}>{isSel && '✓ '}{opt.label}</button>;
                  })}</div></div>}
                  <div style={{ padding: '16px', backgroundColor: theme.bg, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
                    <h3 style={{ color: theme.text, fontSize: '14px', fontWeight: '600', marginBottom: '16px' }}>🏖️ PTO Summary</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                      <div style={{ textAlign: 'center', padding: '12px', backgroundColor: theme.bgCard, borderRadius: '8px' }}><div style={{ fontSize: '24px', fontWeight: '700', color: '#3b82f6' }}>{getPTOBalance(selectedEmployee || currentEmployee).toFixed(1)}</div><div style={{ fontSize: '10px', color: theme.textMuted }}>AVAILABLE</div></div>
                      <div style={{ textAlign: 'center', padding: '12px', backgroundColor: theme.bgCard, borderRadius: '8px' }}><div style={{ fontSize: '24px', fontWeight: '700', color: '#22c55e' }}>{((selectedEmployee || currentEmployee).pto_accrued || 0).toFixed(1)}</div><div style={{ fontSize: '10px', color: theme.textMuted }}>ACCRUED</div></div>
                      <div style={{ textAlign: 'center', padding: '12px', backgroundColor: theme.bgCard, borderRadius: '8px' }}><div style={{ fontSize: '24px', fontWeight: '700', color: '#ef4444' }}>{((selectedEmployee || currentEmployee).pto_used || 0).toFixed(1)}</div><div style={{ fontSize: '10px', color: theme.textMuted }}>USED</div></div>
                      <div style={{ textAlign: 'center', padding: '12px', backgroundColor: theme.bgCard, borderRadius: '8px' }}><div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>{(selectedEmployee || currentEmployee).pto_days_per_year || 10}</div><div style={{ fontSize: '10px', color: theme.textMuted }}>PER YEAR</div></div>
                    </div>
                    {hasHRAccess && editMode && (
                      <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                        <div><label style={labelStyle}>Days/Year</label><input type="number" step="0.5" value={(selectedEmployee || currentEmployee).pto_days_per_year || 10} onChange={(e) => setSelectedEmployee({ ...(selectedEmployee || currentEmployee), pto_days_per_year: parseFloat(e.target.value) || 0 })} style={inputStyle} /></div>
                        <div><label style={labelStyle}>Accrued</label><input type="number" step="0.01" value={(selectedEmployee || currentEmployee).pto_accrued || 0} onChange={(e) => setSelectedEmployee({ ...(selectedEmployee || currentEmployee), pto_accrued: parseFloat(e.target.value) || 0 })} style={inputStyle} /></div>
                        <div><label style={labelStyle}>Used</label><input type="number" step="0.01" value={(selectedEmployee || currentEmployee).pto_used || 0} onChange={(e) => setSelectedEmployee({ ...(selectedEmployee || currentEmployee), pto_used: parseFloat(e.target.value) || 0 })} style={inputStyle} /></div>
                      </div>
                    )}
                  </div>
                  {hasHRAccess && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      {(Array.isArray((selectedEmployee || currentEmployee).pay_type) ? (selectedEmployee || currentEmployee).pay_type : []).includes('hourly') && <div><label style={labelStyle}>Hourly Rate</label><input type="number" step="0.01" value={(selectedEmployee || currentEmployee).hourly_rate || ''} onChange={(e) => setSelectedEmployee({ ...(selectedEmployee || currentEmployee), hourly_rate: parseFloat(e.target.value) || 0 })} disabled={!editMode} style={{ ...inputStyle, opacity: editMode ? 1 : 0.7 }} /></div>}
                      {(Array.isArray((selectedEmployee || currentEmployee).pay_type) ? (selectedEmployee || currentEmployee).pay_type : []).includes('salary') && <div><label style={labelStyle}>Annual Salary</label><input type="number" step="1000" value={(selectedEmployee || currentEmployee).salary || ''} onChange={(e) => setSelectedEmployee({ ...(selectedEmployee || currentEmployee), salary: parseFloat(e.target.value) || 0 })} disabled={!editMode} style={{ ...inputStyle, opacity: editMode ? 1 : 0.7 }} /></div>}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'paystubs' && (
                <div>
                  {selectedPaystub ? (
                    <div>
                      <button onClick={() => setSelectedPaystub(null)} style={{ marginBottom: '16px', padding: '8px 16px', backgroundColor: theme.border, color: theme.text, border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>← Back to List</button>
                      <div style={{ padding: '24px', backgroundColor: theme.bg, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                          <div>
                            <h3 style={{ color: theme.text, fontSize: '20px', fontWeight: '700', margin: 0 }}>Pay Stub</h3>
                            <p style={{ color: theme.textMuted, fontSize: '14px', marginTop: '4px' }}>{formatDate(selectedPaystub.pay_period_start)} - {formatDate(selectedPaystub.pay_period_end)}</p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '12px', color: theme.textMuted }}>PAY DATE</div>
                            <div style={{ fontSize: '18px', color: theme.text, fontWeight: '600' }}>{formatDate(selectedPaystub.pay_date)}</div>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                          <div style={{ padding: '16px', backgroundColor: theme.bgCard, borderRadius: '10px' }}>
                            <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>REGULAR HOURS</div>
                            <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>{(selectedPaystub.regular_hours || 0).toFixed(2)}</div>
                          </div>
                          <div style={{ padding: '16px', backgroundColor: theme.bgCard, borderRadius: '10px' }}>
                            <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>OVERTIME HOURS</div>
                            <div style={{ fontSize: '24px', fontWeight: '700', color: selectedPaystub.overtime_hours > 0 ? '#ef4444' : theme.text }}>{(selectedPaystub.overtime_hours || 0).toFixed(2)}</div>
                          </div>
                        </div>
                        <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '16px', marginBottom: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}><span style={{ color: theme.textSecondary }}>Gross Pay</span><span style={{ color: theme.text, fontWeight: '600' }}>{formatCurrency(selectedPaystub.gross_pay)}</span></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}><span style={{ color: theme.textMuted }}>Federal Tax</span><span style={{ color: '#ef4444' }}>-{formatCurrency(selectedPaystub.federal_tax)}</span></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}><span style={{ color: theme.textMuted }}>State Tax (UT)</span><span style={{ color: '#ef4444' }}>-{formatCurrency(selectedPaystub.state_tax)}</span></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}><span style={{ color: theme.textMuted }}>Social Security</span><span style={{ color: '#ef4444' }}>-{formatCurrency(selectedPaystub.social_security)}</span></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}><span style={{ color: theme.textMuted }}>Medicare</span><span style={{ color: '#ef4444' }}>-{formatCurrency(selectedPaystub.medicare)}</span></div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: '10px', border: '1px solid rgba(34,197,94,0.3)' }}>
                          <span style={{ color: '#22c55e', fontSize: '18px', fontWeight: '600' }}>NET PAY</span>
                          <span style={{ color: '#22c55e', fontSize: '28px', fontWeight: '700' }}>{formatCurrency(selectedPaystub.net_pay)}</span>
                        </div>
                      </div>
                    </div>
                  ) : paystubs.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>No paystubs yet. Paystubs are generated when admin runs payroll.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {paystubs.map(stub => (
                        <div key={stub.id} onClick={() => setSelectedPaystub(stub)} style={{ padding: '16px', backgroundColor: theme.bg, borderRadius: '10px', border: `1px solid ${theme.border}`, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ color: theme.text, fontWeight: '600' }}>Pay Date: {formatDate(stub.pay_date)}</div>
                            <div style={{ color: theme.textMuted, fontSize: '12px', marginTop: '4px' }}>{formatDateShort(stub.pay_period_start)} - {formatDateShort(stub.pay_period_end)} · {(stub.regular_hours || 0).toFixed(1)} hrs{stub.overtime_hours > 0 && ` + ${stub.overtime_hours.toFixed(1)} OT`}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '18px', fontWeight: '700', color: '#22c55e' }}>{formatCurrency(stub.net_pay)}</div>
                            <div style={{ fontSize: '11px', color: theme.textMuted }}>NET</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'timeoff' && (
                <div>
                  <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ color: theme.text, fontSize: '16px', fontWeight: '600', margin: 0 }}>Time Off History</h3>
                    {!isAdmin && <button onClick={() => setShowPTOModal(true)} style={{ ...buttonStyle, padding: '8px 16px', fontSize: '13px', background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)' }}>🏖️ Request</button>}
                  </div>
                  {myRequests.length === 0 ? <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>No requests</div> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {myRequests.map(req => (
                        <div key={req.id} style={{ padding: '12px 16px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div><div style={{ color: theme.text, fontWeight: '500' }}>{formatDateShort(req.start_date)} - {formatDateShort(req.end_date)}</div><div style={{ color: theme.textMuted, fontSize: '12px', marginTop: '4px' }}>{req.days_requested} days · {req.request_type.toUpperCase()}{req.reason && ` · "${req.reason}"`}</div></div>
                          <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', backgroundColor: req.status === 'approved' ? 'rgba(34,197,94,0.2)' : req.status === 'denied' ? 'rgba(239,68,68,0.2)' : 'rgba(234,179,8,0.2)', color: req.status === 'approved' ? '#22c55e' : req.status === 'denied' ? '#ef4444' : '#eab308' }}>{req.status.toUpperCase()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'tax' && hasHRAccess && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div><label style={labelStyle}>SSN (Last 4)</label><input type="text" maxLength={4} value={(selectedEmployee || currentEmployee).ssn_last4 || ''} onChange={(e) => setSelectedEmployee({ ...(selectedEmployee || currentEmployee), ssn_last4: e.target.value.replace(/\D/g, '') })} disabled={!editMode} style={{ ...inputStyle, opacity: editMode ? 1 : 0.7 }} /></div>
                  <div><label style={labelStyle}>Date of Birth</label><input type="date" value={(selectedEmployee || currentEmployee).date_of_birth || ''} onChange={(e) => setSelectedEmployee({ ...(selectedEmployee || currentEmployee), date_of_birth: e.target.value })} disabled={!editMode} style={{ ...inputStyle, opacity: editMode ? 1 : 0.7 }} /></div>
                  <div><label style={labelStyle}>Filing Status</label><select value={(selectedEmployee || currentEmployee).tax_filing_status || ''} onChange={(e) => setSelectedEmployee({ ...(selectedEmployee || currentEmployee), tax_filing_status: e.target.value })} disabled={!editMode} style={{ ...inputStyle, opacity: editMode ? 1 : 0.7 }}><option value="">Select...</option><option value="single">Single</option><option value="married_joint">Married Joint</option><option value="married_separate">Married Separate</option><option value="head_household">Head of Household</option></select></div>
                  <div><label style={labelStyle}>Federal Allowances</label><input type="number" min="0" value={(selectedEmployee || currentEmployee).federal_allowances || 0} onChange={(e) => setSelectedEmployee({ ...(selectedEmployee || currentEmployee), federal_allowances: parseInt(e.target.value) || 0 })} disabled={!editMode} style={{ ...inputStyle, opacity: editMode ? 1 : 0.7 }} /></div>
                </div>
              )}

              {activeTab === 'bank' && hasHRAccess && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div><label style={labelStyle}>Routing Number</label><input type="text" value={(selectedEmployee || currentEmployee).direct_deposit_routing || ''} onChange={(e) => setSelectedEmployee({ ...(selectedEmployee || currentEmployee), direct_deposit_routing: e.target.value })} disabled={!editMode} style={{ ...inputStyle, opacity: editMode ? 1 : 0.7 }} /></div>
                  <div><label style={labelStyle}>Account Number</label><input type="text" value={(selectedEmployee || currentEmployee).direct_deposit_account || ''} onChange={(e) => setSelectedEmployee({ ...(selectedEmployee || currentEmployee), direct_deposit_account: e.target.value })} disabled={!editMode} style={{ ...inputStyle, opacity: editMode ? 1 : 0.7 }} /></div>
                </div>
              )}

              {activeTab === 'documents' && (
                <div>
                  <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: completedRequired === requiredCount ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', borderRadius: '8px', border: `1px solid ${completedRequired === requiredCount ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                    <span style={{ color: completedRequired === requiredCount ? '#22c55e' : '#ef4444', fontWeight: '600' }}>{completedRequired === requiredCount ? '✓ All docs complete' : `${completedRequired}/${requiredCount} required`}</span>
                  </div>
                  <div style={{ display: 'grid', gap: '8px', marginBottom: '16px' }}>
                    {requiredDocs.map(doc => {
                      const uploaded = documents.find(d => d.document_type === doc.type);
                      return (
                        <div key={doc.type} style={{ padding: '12px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${uploaded ? 'rgba(34,197,94,0.5)' : doc.required ? 'rgba(239,68,68,0.3)' : theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: uploaded ? '#22c55e' : doc.required ? '#ef4444' : theme.textMuted }}>{uploaded ? '✓' : doc.required ? '!' : '○'}</span>
                            <span style={{ color: theme.text, fontSize: '14px' }}>{doc.name}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {doc.url && <a href={doc.url} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', fontSize: '12px', textDecoration: 'none', padding: '4px 10px', backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: '4px' }}>Form</a>}
                            {uploaded && <a href={uploaded.file_url} target="_blank" rel="noopener noreferrer" style={{ color: '#22c55e', fontSize: '12px', textDecoration: 'none', padding: '4px 10px', backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: '4px' }}>View</a>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ padding: '12px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px dashed ${theme.border}`, display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}><label style={labelStyle}>Upload</label><select value={selectedDocType} onChange={(e) => setSelectedDocType(e.target.value)} style={inputStyle}><option value="">Select...</option>{requiredDocs.map(doc => <option key={doc.type} value={doc.type}>{doc.name}</option>)}</select></div>
                    <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileUpload} style={{ display: 'none' }} />
                    <button onClick={() => selectedDocType && fileInputRef.current?.click()} disabled={!selectedDocType || uploading} style={{ ...buttonStyle, opacity: !selectedDocType || uploading ? 0.5 : 1 }}>{uploading ? '...' : 'Upload'}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {!isAdmin && !currentEmployee && <div style={{ padding: '60px', textAlign: 'center', backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}` }}><p style={{ color: theme.textMuted }}>Select yourself above</p></div>}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, maxWidth: '500px', width: '100%', padding: '24px', margin: '16px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '600', marginBottom: '20px' }}>Add Employee</h2>
            <div style={{ display: 'grid', gap: '16px' }}>
              <div><label style={labelStyle}>Name *</label><input type="text" value={newEmployee.name} onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Email</label><input type="email" value={newEmployee.email} onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Phone</label><input type="tel" value={newEmployee.phone} onChange={(e) => setNewEmployee({ ...newEmployee, phone: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Pay Type</label><div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>{payTypeOptions.map(opt => {
                const isSel = (newEmployee.pay_type || []).includes(opt.value);
                return <button key={opt.value} type="button" onClick={() => togglePayType(opt.value, true)} style={checkboxStyle(isSel)}>{isSel && '✓ '}{opt.label}</button>;
              })}</div></div>
              <div><label style={labelStyle}>PTO Days/Year</label><input type="number" step="0.5" value={newEmployee.pto_days_per_year || 10} onChange={(e) => setNewEmployee({ ...newEmployee, pto_days_per_year: parseFloat(e.target.value) || 10 })} style={inputStyle} /></div>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setShowAddModal(false)} style={{ ...buttonStyle, flex: 1, backgroundColor: theme.border, color: theme.text }}>Cancel</button>
              <button onClick={handleAddEmployee} disabled={saving || !newEmployee.name.trim()} style={{ ...buttonStyle, flex: 1, opacity: saving || !newEmployee.name.trim() ? 0.6 : 1 }}>{saving ? 'Adding...' : 'Add'}</button>
            </div>
          </div>
        </div>
      )}

      {/* PTO Modal */}
      {showPTOModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, maxWidth: '450px', width: '100%', padding: '24px', margin: '16px' }}>
            <h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '700', marginBottom: '20px' }}>🏖️ Request Time Off</h2>
            {currentEmployee && <div style={{ padding: '12px', backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: '8px', marginBottom: '20px', border: '1px solid rgba(59,130,246,0.3)', display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textSecondary }}>Available PTO</span><span style={{ color: '#3b82f6', fontWeight: '700', fontSize: '18px' }}>{getPTOBalance(currentEmployee).toFixed(1)} days</span></div>}
            <div style={{ display: 'grid', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div><label style={labelStyle}>Start</label><input type="date" value={ptoForm.start_date} onChange={(e) => setPtoForm({ ...ptoForm, start_date: e.target.value })} style={inputStyle} /></div>
                <div><label style={labelStyle}>End</label><input type="date" value={ptoForm.end_date} onChange={(e) => setPtoForm({ ...ptoForm, end_date: e.target.value })} style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>Type</label><select value={ptoForm.request_type} onChange={(e) => setPtoForm({ ...ptoForm, request_type: e.target.value })} style={inputStyle}><option value="pto">🏖️ PTO</option><option value="sick">🤒 Sick</option><option value="personal">👤 Personal</option><option value="unpaid">💰 Unpaid</option></select></div>
              <div><label style={labelStyle}>Reason</label><textarea value={ptoForm.reason} onChange={(e) => setPtoForm({ ...ptoForm, reason: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Optional" /></div>
              {ptoForm.start_date && ptoForm.end_date && <div style={{ padding: '12px', backgroundColor: theme.bg, borderRadius: '8px', textAlign: 'center' }}><span style={{ color: theme.text, fontSize: '18px', fontWeight: '700' }}>{calcBusinessDays(ptoForm.start_date, ptoForm.end_date)} business days</span></div>}
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setShowPTOModal(false)} style={{ ...buttonStyle, flex: 1, backgroundColor: theme.border, color: theme.text }}>Cancel</button>
              <button onClick={submitPTORequest} disabled={submittingPTO || !ptoForm.start_date || !ptoForm.end_date} style={{ ...buttonStyle, flex: 1, background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', opacity: submittingPTO || !ptoForm.start_date || !ptoForm.end_date ? 0.6 : 1 }}>{submittingPTO ? 'Submitting...' : 'Submit'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}